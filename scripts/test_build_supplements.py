"""Tests for scripts/build_supplements.py. Run: python -I scripts/test_build_supplements.py"""
import copy, importlib.util, json, os, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("build_supplements", os.path.join(HERE, "build_supplements.py"))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

SLUGS = {"purdue": "purdue", "uc-davis": "uc-davis", "cmu": "carnegie-mellon"}
VALID = {
    "slug": "purdue",
    "cycle": "2026-27",
    "supplements": "required",
    "shared_set": None,
    "prompts": [
        {"key": "why-major", "prompt": "Why this major?", "word_limit": 250, "char_limit": None, "required": True, "applies_to": None, "choose": None, "category": "why_major", "source": 1},
        {"key": "short-a", "prompt": "Option A", "word_limit": 100, "char_limit": None, "required": True, "applies_to": None, "choose": {"group": "A", "pick": 1}, "category": "short_answer", "source": 1},
        {"key": "short-b", "prompt": "Option B", "word_limit": 100, "char_limit": None, "required": True, "applies_to": None, "choose": {"group": "A", "pick": 1}, "category": "short_answer", "source": 1},
        {"key": "honors", "prompt": "Honors essay", "word_limit": None, "char_limit": 1000, "required": True, "applies_to": "Honors College applicants", "choose": None, "category": "other", "source": 1},
    ],
    "intl_finance": {
        "document": "Certification of Finances + bank statement",
        "when": "after_admission",
        "deadlines": [{"label": "I-20 documents", "date": "2027-05-01", "note": None}, {"label": "Deposit", "date": None, "note": "within 2 weeks of admission"}],
        "notes": None,
        "source": 2,
    },
    "sources": [
        {"n": 1, "url": "https://admissions.purdue.edu/essays", "title": "Purdue essays", "accessed": "2026-10-27"},
        {"n": 2, "url": "https://admissions.purdue.edu/intl", "title": "Purdue intl", "accessed": "2026-10-27"},
    ],
    "notes": "",
}


def broken(mutate):
    rec = copy.deepcopy(VALID)
    mutate(rec)
    return bs.validate(rec, "purdue", SLUGS)


class ValidateTest(unittest.TestCase):
    def test_valid_file_passes(self):
        self.assertEqual(bs.validate(copy.deepcopy(VALID), "purdue", SLUGS), [])

    def test_none_and_unknown_need_no_prompts(self):
        for status in ("none", "unknown"):
            self.assertEqual(broken(lambda r: (r.update(supplements=status, prompts=[]))), [])
            self.assertTrue(any("empty prompts" in e for e in broken(lambda r: r.update(supplements=status))))

    def test_required_without_published_prompt_text_is_allowed(self):
        self.assertEqual(broken(lambda r: r.update(prompts=[])), [])
        self.assertTrue(any("needs a source" in e for e in broken(lambda r: r.update(prompts=[], sources=[], intl_finance=None))))

    def test_applies_to_must_name_a_subset(self):
        for everyone in ("All first-year applicants", "All applicants (choose one of prompts 2A or 2B)", "Optional; applicants may answer one"):
            self.assertTrue(any("means every applicant" in e for e in broken(lambda r: r["prompts"][3].update(applies_to=everyone))), everyone)
        for subset in ("All applicants except Human-Centered Engineering applicants", "Honors College applicants", "International applicants"):
            self.assertEqual(broken(lambda r: r["prompts"][3].update(applies_to=subset)), [], subset)

    def test_rejects_malformed_fields(self):
        cases = {
            "unknown field": lambda r: r.update(extra=1),
            "missing field": lambda r: r.pop("notes"),
            "matches neither the file name": lambda r: r.update(slug="rice"),
            "cycle": lambda r: r.update(cycle="2027-28"),
            "is not one of": lambda r: r.update(supplements="maybe"),
            "kebab-case": lambda r: r["prompts"][0].update(key="Why Major"),
            "duplicate key": lambda r: r["prompts"][1].update(key="why-major"),
            "positive integer or null": lambda r: r["prompts"][0].update(word_limit="250"),
            "word_limit": lambda r: r["prompts"][0].update(word_limit=True),
            "source 9 is not in sources": lambda r: r["prompts"][0].update(source=9),
            "disagree on pick": lambda r: r["prompts"][2]["choose"].update(pick=2),
            "needs more than": lambda r: r["prompts"].pop(2),
            "category": lambda r: r["prompts"][0].update(category="why_college"),
            "required: true": lambda r: [p.update(required=False) for p in r["prompts"]],
            "YYYY-MM-DD": lambda r: r["intl_finance"]["deadlines"][0].update(date="May 1"),
            "needs a note": lambda r: r["intl_finance"]["deadlines"][1].update(note=None),
            "when": lambda r: r["intl_finance"].update(when="later"),
            "used twice": lambda r: r["sources"][1].update(n=1),
            "http(s) URL": lambda r: r["sources"][0].update(url="admissions.purdue.edu"),
        }
        for needle, mutate in cases.items():
            errors = broken(mutate)
            self.assertTrue(any(needle in e for e in errors), f"{needle!r} not reported; got {errors}")

    def test_file_named_like_the_college_file_accepts_either_slug(self):
        for own in ("cmu", "carnegie-mellon"):
            rec = copy.deepcopy(VALID)
            rec["slug"] = own
            self.assertEqual(bs.validate(rec, "cmu", SLUGS), [], own)
        rec = copy.deepcopy(VALID)
        rec["slug"] = "purdue"
        self.assertTrue(any("matches neither" in e for e in bs.validate(rec, "cmu", SLUGS)))

    def test_unknown_college_slug(self):
        rec = copy.deepcopy(VALID)
        rec["slug"] = "nowhere"
        self.assertTrue(any("no data/colleges/nowhere.json" in e for e in bs.validate(rec, "nowhere", SLUGS)))


class LoadAndRenderTest(unittest.TestCase):
    def test_bad_file_is_reported_and_left_out(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "purdue.json"), "w", encoding="utf-8") as f:
                json.dump(VALID, f)
            bad = copy.deepcopy(VALID)
            bad["slug"] = "uc-davis"
            bad["prompts"][0]["word_limit"] = 0
            with open(os.path.join(d, "uc-davis.json"), "w", encoding="utf-8") as f:
                json.dump(bad, f)
            with open(os.path.join(d, "broken.json"), "w", encoding="utf-8") as f:
                f.write("{not json")
            records, errors = bs.load_all(d, SLUGS)
        self.assertEqual(sorted(records), ["purdue"])
        self.assertTrue(any(e.startswith("uc-davis.json: prompts[0] (why-major).word_limit") for e in errors), errors)
        self.assertTrue(any(e.startswith("broken.json: not valid JSON") for e in errors), errors)

    def test_output_is_keyed_by_database_slug(self):
        with tempfile.TemporaryDirectory() as d:
            rec = copy.deepcopy(VALID)
            rec["slug"] = "cmu"
            with open(os.path.join(d, "cmu.json"), "w", encoding="utf-8") as f:
                json.dump(rec, f)
            records, errors = bs.load_all(d, SLUGS)
        self.assertEqual(errors, [])
        self.assertEqual(sorted(records), ["carnegie-mellon"])

    def test_real_college_files_map_file_names_to_database_slugs(self):
        slugs = bs.college_slugs()
        self.assertEqual(slugs.get("cmu"), "carnegie-mellon")
        self.assertEqual(slugs.get("gatech"), "georgia-tech")
        self.assertEqual(slugs.get("berkeley"), "uc-berkeley")
        self.assertEqual(slugs.get("purdue"), "purdue")

    def test_render_is_valid_json_one_college_per_line(self):
        text = bs.render({"purdue": VALID})
        data = json.loads(text)
        self.assertEqual(data["colleges"]["purdue"]["prompts"][0]["key"], "why-major")
        self.assertNotIn("slug", data["colleges"]["purdue"])
        self.assertEqual(sum(1 for line in text.splitlines() if line.startswith('    "purdue"')), 1)


if __name__ == "__main__":
    unittest.main()
