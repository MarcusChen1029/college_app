"""Tests for scripts/build_application_systems.py. Run: python -I scripts/test_build_application_systems.py"""
import copy, importlib.util, json, os, re, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("build_application_systems", os.path.join(HERE, "build_application_systems.py"))
bas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bas)

SLUGS = {"purdue": "purdue", "ut-austin": "ut-austin", "cmu": "carnegie-mellon"}
KEYS = {"commonapp", "stars", "applytexas"}
VALID = {
    "_about": "test",
    "systems": {
        "stars": {"source": "https://stars.example.org/colleges", "checked": "2026-10-28", "members": ["purdue", "cmu"], "notes": "x"},
    },
}


def broken(mutate):
    rec = copy.deepcopy(VALID)
    mutate(rec)
    return bas.validate(rec, KEYS, SLUGS)


class ValidateTest(unittest.TestCase):
    def test_valid_file_and_empty_systems_pass(self):
        self.assertEqual(bas.validate(copy.deepcopy(VALID), KEYS, SLUGS), [])
        self.assertEqual(bas.validate({"_about": "x", "systems": {}}, KEYS, SLUGS), [])

    def test_unknown_system_key_fails(self):
        self.assertTrue(any("not a system key" in e for e in broken(lambda r: r["systems"].update(nope=r["systems"]["stars"]))))

    def test_source_and_date_are_required_and_checked(self):
        self.assertTrue(any("missing field(s) source" in e for e in broken(lambda r: r["systems"]["stars"].pop("source"))))
        self.assertTrue(any("source: must be an http" in e for e in broken(lambda r: r["systems"]["stars"].update(source="TODO"))))
        self.assertTrue(any("checked" in e for e in broken(lambda r: r["systems"]["stars"].update(checked="2026-13-40"))))

    def test_members_must_exist_and_be_unique(self):
        self.assertTrue(any("not a college" in e for e in broken(lambda r: r["systems"]["stars"].update(members=["nowhere"]))))
        self.assertTrue(any("listed twice" in e for e in broken(lambda r: r["systems"]["stars"].update(members=["cmu", "carnegie-mellon"]))))
        self.assertTrue(any("non-empty" in e for e in broken(lambda r: r["systems"]["stars"].update(members=[]))))

    def test_unknown_field_fails(self):
        self.assertTrue(any("unknown field" in e for e in broken(lambda r: r["systems"]["stars"].update(extra=1))))


class BuildTest(unittest.TestCase):
    def test_members_use_database_slugs_and_merge_with_platforms(self):
        colleges, routes, sources = bas.build(VALID, {"purdue": {"commonapp"}, "ut-austin": {"commonapp"}}, SLUGS)
        self.assertEqual(colleges, {"purdue": ["commonapp", "stars"], "ut-austin": ["commonapp"], "carnegie-mellon": ["stars"]})
        self.assertEqual(routes, {"purdue": "commonapp", "ut-austin": "commonapp", "carnegie-mellon": "direct"})
        self.assertEqual(sources, {"stars": "https://stars.example.org/colleges"})

    def test_render_is_valid_sorted_json(self):
        text = bas.render({"b": ["x"], "a": ["y", "z"]}, {"b": "direct", "a": "uc"}, {"stars": "https://s.example"})
        data = json.loads(text)
        self.assertEqual(list(data["colleges"]), ["a", "b"])
        self.assertEqual(list(data["routes"]), ["a", "b"])
        self.assertEqual(data["sources"], {"stars": "https://s.example"})
        empty = json.loads(bas.render({}, {}, {}))
        self.assertEqual((empty["colleges"], empty["routes"]), ({}, {}))


class RouteTest(unittest.TestCase):
    def test_route_prefers_common_app(self):
        self.assertEqual(bas.route_of(["applytexas", "commonapp"]), "commonapp")

    def test_route_coalition_before_uc(self):
        self.assertEqual(bas.route_of(["coalition", "uc"]), "coalition")

    def test_route_direct_when_no_route(self):
        self.assertEqual(bas.route_of(["stars"]), "direct")
        self.assertEqual(bas.route_of([]), "direct")

    def test_every_college_has_route(self):
        colleges, routes, _ = bas.build(VALID, {"purdue": {"commonapp"}}, SLUGS)
        self.assertEqual(set(routes), set(SLUGS.values()))
        self.assertEqual(routes, {"purdue": "commonapp", "ut-austin": "direct", "carnegie-mellon": "direct"})
        self.assertEqual(colleges["carnegie-mellon"], ["stars"])

    def test_render_writes_routes(self):
        data = json.loads(bas.render({"a": ["y"]}, {"a": "direct", "b": "uc"}, {"stars": "https://s.example"}))
        self.assertEqual(data["routes"], {"a": "direct", "b": "uc"})

    def test_route_order_matches_route_systems_in_portals_ts(self):
        with open(bas.PORTALS_TS, encoding="utf-8") as f:
            text = f.read()
        start = text.index("export const SYSTEMS")
        end = text.index("\n];", start)
        blocks = re.findall(r"\{\s*key:\s*\"([a-z0-9]+)\"[^}]*?kind:\s*\"route\"", text[start:end], re.S)
        self.assertEqual(sorted(blocks), sorted(bas.ROUTE_ORDER))


class PlatformsTest(unittest.TestCase):
    def write(self, folder, name, obj):
        with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
            json.dump(obj, f)

    def test_platforms_map_and_ignore_own_and_questbridge(self):
        with tempfile.TemporaryDirectory() as d:
            sub = os.path.join(d, "cycle")
            os.mkdir(sub)
            self.write(d, "main.json", {"_about": "x", "purdue": {"requirements": {"platforms": ["common_app", "coalition", "own"]}}})
            self.write(sub, "cmu.json", {"requirements": {"platforms": ["questbridge", "uc_app"]}})
            self.write(sub, "ut-austin.json", {"requirements": {"platforms": ["own"]}})
            out, errors = bas.load_platforms(SLUGS, os.path.join(d, "main.json"), sub)
        self.assertEqual(errors, [])
        # cmu.json is keyed by its database slug, carnegie-mellon; ut-austin only takes its own application.
        self.assertEqual(out, {"purdue": {"commonapp", "coalition"}, "carnegie-mellon": {"uc"}})

    def test_unknown_platform_and_unknown_college_are_errors(self):
        with tempfile.TemporaryDirectory() as d:
            sub = os.path.join(d, "cycle")
            os.mkdir(sub)
            self.write(d, "main.json", {"nowhere": {"requirements": {"platforms": ["common_app"]}}})
            self.write(sub, "purdue.json", {"requirements": {"platforms": ["mystery"]}})
            self.write(sub, "ghost.json", {"requirements": {"platforms": ["common_app"]}})
            _, errors = bas.load_platforms(SLUGS, os.path.join(d, "main.json"), sub)
        text = "\n".join(errors)
        self.assertIn("'nowhere' is not a college", text)
        self.assertIn("unknown platform 'mystery'", text)
        self.assertIn("ghost.json: no data/colleges/ghost.json", text)


class RealFilesTest(unittest.TestCase):
    def test_system_keys_come_from_portals_ts(self):
        keys = bas.system_keys()
        for k in ("commonapp", "uc", "applytexas", "calstate", "stars", "ucas", "toefl"):
            self.assertIn(k, keys)

    def test_committed_source_file_is_valid(self):
        with open(bas.SRC, encoding="utf-8") as f:
            rec = json.load(f)
        self.assertEqual(bas.validate(rec, bas.system_keys(), bas.college_slugs()), [])


if __name__ == "__main__":
    unittest.main()
