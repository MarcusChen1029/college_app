"""Tests for scripts/build_application_steps.py. Run: python -I scripts/test_build_application_steps.py"""
import copy, importlib.util, json, os, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("build_application_steps", os.path.join(HERE, "build_application_steps.py"))
bas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bas)

PROGRAMS = [
    {"slug": "cs", "name": "Computer Science BSc", "ucas_code": "G400", "a_level_offer": "A*AA", "ib_offer": None,
     "atar": None, "admissions_test": "TARA", "application_deadline": "2027-01-13"},
    {"slug": "econ", "name": "Economics BSc", "a_level_offer": "AAA"},
]
INDEX = {
    "gbu": {"country": "GB", "programs": PROGRAMS, "labels": {"UCAS deadline", "Oxbridge deadline"}},
    "cau": {"country": "CA", "programs": PROGRAMS, "labels": {"Application"}},
    "auu": {"country": "AU", "programs": PROGRAMS, "labels": set()},
    "usu": {"country": "US", "programs": [], "labels": set()},
}
STEP = {"id": "my_form", "kind": "university_form", "name": "My Form", "courses": "all", "deadline": "UCAS deadline",
        "source_url": "https://example.ac.uk/form", "verified_on": "2026-11-05"}
VALID = {"slug": "gbu", "researched": True, "checked_on": "2026-11-05", "admissions_url": "https://example.ac.uk/apply",
         "steps": [STEP]}


def errors_for(mutate, fname="gbu", base=VALID):
    rec = copy.deepcopy(base)
    mutate(rec)
    return bas.validate(rec, fname, INDEX)


def step(rec, **kw):
    rec["steps"][0].update(kw)


class ValidateTest(unittest.TestCase):
    def assertOne(self, errors, text):
        self.assertTrue(any(text in e for e in errors), f"{text!r} not in {errors}")
        self.assertTrue(all("gbu.json" in e for e in errors), errors)  # every message names the file

    def test_valid_file_passes(self):
        self.assertEqual(bas.validate(copy.deepcopy(VALID), "gbu", INDEX), [])

    def test_rejects_us_college(self):
        errs = errors_for(lambda r: r.update(slug="usu"), fname="usu")
        self.assertTrue(any("only GB, CA and AU" in e and "usu.json" in e for e in errs), errs)

    def test_unknown_slug_and_name_mismatch(self):
        self.assertTrue(any("not a data/colleges slug" in e for e in errors_for(lambda r: r.update(slug="nope"), fname="nope")))
        self.assertOne(errors_for(lambda r: r.update(slug="cau")), "does not match the file name")

    def test_unknown_or_missing_top_level_field(self):
        self.assertOne(errors_for(lambda r: r.update(extra=1)), "unknown field")
        self.assertOne(errors_for(lambda r: r.pop("steps")), "missing field")

    def test_missing_file_for_non_us_college(self):
        with tempfile.TemporaryDirectory() as d:
            records, errs = bas.load_all(d, INDEX)
        self.assertEqual(records, {})
        self.assertEqual(sorted(e.split(":")[0] for e in errs),
                         ["application_steps_2026_27/auu.json", "application_steps_2026_27/cau.json", "application_steps_2026_27/gbu.json"])
        self.assertTrue(all("missing" in e for e in errs))

    def test_researched_true_needs_checked_on_date(self):
        self.assertOne(errors_for(lambda r: r.update(checked_on=None)), "checked_on")
        self.assertOne(errors_for(lambda r: r.update(checked_on="5 Nov 2026")), "checked_on")
        self.assertOne(errors_for(lambda r: r.update(checked_on="2026-13-40")), "checked_on")

    def test_unresearched_must_have_no_steps(self):
        self.assertOne(errors_for(lambda r: r.update(researched=False)), "researched: false")  # steps and date still set
        self.assertOne(errors_for(lambda r: r.update(researched=False, steps=[])), "researched: false")  # date still set
        self.assertEqual(errors_for(lambda r: r.update(researched=False, steps=[], checked_on=None)), [])

    def test_researched_must_be_boolean(self):
        self.assertOne(errors_for(lambda r: r.update(researched="yes")), "researched must be")

    def test_admissions_url_must_be_https(self):
        self.assertOne(errors_for(lambda r: r.update(admissions_url="http://example.ac.uk")), "admissions_url")
        self.assertOne(errors_for(lambda r: r.update(admissions_url="https://")), "admissions_url")

    def test_step_id_format_and_uniqueness(self):
        for bad in ("My Form", "UPPER", "", "a" * 41, "dash-ed"):
            self.assertOne(errors_for(lambda r: step(r, id=bad)), "id", )
        def dup(r):
            r["steps"].append(copy.deepcopy(r["steps"][0]))
        self.assertOne(errors_for(dup), "duplicate id")

    def test_step_kind_enum(self):
        self.assertOne(errors_for(lambda r: step(r, kind="essay")), "kind")
        for kind in bas.STEP_KINDS:
            if kind != "test":
                self.assertEqual(errors_for(lambda r: step(r, kind=kind)), [], kind)

    def test_step_kinds_mirror_the_typescript_list(self):
        with open(os.path.join(HERE, "..", "web/lib/checklist.ts"), encoding="utf-8") as f:
            ts = f.read()
        line = next(l for l in ts.splitlines() if l.startswith("export const STEP_KINDS"))
        self.assertEqual([k.strip('" ') for k in line.split("[", 1)[1].split("]")[0].split(",")], bas.STEP_KINDS)

    def test_step_name_length(self):
        self.assertOne(errors_for(lambda r: step(r, name="")), "name")
        self.assertOne(errors_for(lambda r: step(r, name="x" * 121)), "name")
        self.assertEqual(errors_for(lambda r: step(r, name="x" * 120)), [])

    def test_course_slug_must_exist(self):
        self.assertOne(errors_for(lambda r: step(r, courses=["cs", "medicine"])), "'medicine'")
        self.assertOne(errors_for(lambda r: step(r, courses=[])), "courses")
        self.assertOne(errors_for(lambda r: step(r, courses="cs")), "courses")
        self.assertEqual(errors_for(lambda r: step(r, courses=["cs", "econ"])), [])

    def test_deadline_label_must_exist(self):
        self.assertOne(errors_for(lambda r: step(r, deadline="Made up deadline")), "deadline")
        self.assertEqual(errors_for(lambda r: step(r, deadline=None)), [])
        self.assertEqual(errors_for(lambda r: step(r, deadline="Oxbridge deadline")), [])

    def test_step_source_url_and_verified_on(self):
        self.assertOne(errors_for(lambda r: step(r, source_url="ftp://x")), "source_url")
        self.assertOne(errors_for(lambda r: step(r, verified_on="yesterday")), "verified_on")
        self.assertOne(errors_for(lambda r: step(r, verified_on="2026-02-30")), "verified_on")

    def test_step_fields_must_be_exact(self):
        self.assertOne(errors_for(lambda r: r["steps"][0].pop("name")), "fields must be exactly")
        self.assertOne(errors_for(lambda r: step(r, extra=1)), "fields must be exactly")

    def test_gb_test_kind_refused(self):
        self.assertOne(errors_for(lambda r: step(r, kind="test")), "UK admissions tests come from programs.admissions_test")

    def test_ca_allows_one_test_step_but_not_two(self):
        ca = {**VALID, "slug": "cau", "steps": [{**STEP, "kind": "test", "deadline": "Application"}]}
        self.assertEqual(bas.validate(copy.deepcopy(ca), "cau", INDEX), [])
        ca["steps"].append({**ca["steps"][0], "id": "second_test"})
        errs = bas.validate(ca, "cau", INDEX)
        self.assertTrue(any("at most one step of kind \"test\"" in e and "cau.json" in e for e in errs), errs)

    def test_au_allows_test_steps(self):
        au = {**VALID, "slug": "auu", "steps": [{**STEP, "kind": "test", "deadline": None}, {**STEP, "kind": "test", "id": "t2", "deadline": None}]}
        self.assertEqual(bas.validate(au, "auu", INDEX), [])


class BuildTest(unittest.TestCase):
    def test_output_shape(self):
        out = bas.build({"gbu": VALID}, INDEX)
        self.assertEqual(list(out), ["gbu"])
        g = out["gbu"]
        self.assertEqual(list(g), ["country", "researched", "admissionsUrl", "steps", "courses"])
        self.assertEqual(g["country"], "GB")
        self.assertEqual(list(g["steps"][0]), ["id", "kind", "name", "courses", "deadlineLabel", "sourceUrl", "verifiedOn"])
        self.assertEqual(g["steps"][0]["deadlineLabel"], "UCAS deadline")
        self.assertEqual(list(g["courses"][0]), ["id", "slug", "name", "ucasCode", "aLevelOffer", "ibOffer", "apOffer", "atar",
                                                  "admissionsTest", "applicationDeadline"])
        self.assertEqual(g["courses"][0]["ucasCode"], "G400")
        self.assertIsNone(g["courses"][1]["ucasCode"])  # missing columns become null
        self.assertEqual(g["courses"][1]["name"], "Economics BSc")

    def test_output_keys_are_sorted_and_render_is_json(self):
        recs = {"cau": {**VALID, "slug": "cau", "steps": [], "researched": False, "checked_on": None}, "auu": {**VALID, "slug": "auu", "steps": [], "researched": False, "checked_on": None}}
        text = bas.render(bas.build(recs, INDEX))
        self.assertEqual(list(json.loads(text)), ["auu", "cau"])
        self.assertTrue(text.endswith("}\n"))

    def test_load_all_reads_files_and_reports_bad_json(self):
        with tempfile.TemporaryDirectory() as d:
            for slug in ("cau", "auu"):
                with open(os.path.join(d, f"{slug}.json"), "w", encoding="utf-8") as f:
                    json.dump({**VALID, "slug": slug, "researched": False, "checked_on": None, "steps": []}, f)
            with open(os.path.join(d, "gbu.json"), "w", encoding="utf-8") as f:
                f.write("{not json")
            records, errs = bas.load_all(d, INDEX)
        self.assertEqual(sorted(records), ["auu", "cau"])
        self.assertTrue(any("gbu.json" in e and "not valid JSON" in e for e in errs), errs)


class RealDataTest(unittest.TestCase):
    def test_program_id_matches_build_seed(self):
        index = bas.college_index()
        recs = {"ucl": {**VALID, "slug": "ucl", "researched": False, "checked_on": None, "steps": []}}
        first = bas.build(recs, index)["ucl"]["courses"][0]
        self.assertEqual(first["id"], bas.build_seed.uid("prog", "ucl", index["ucl"]["programs"][0]["slug"]))

    def test_every_non_us_college_has_a_valid_file(self):
        records, errs = bas.load_all()
        self.assertEqual(errs, [])
        self.assertEqual(len(records), 38)


if __name__ == "__main__":
    unittest.main()
