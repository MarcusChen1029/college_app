"""Tests for scripts/build_after_offer.py. Run: python -I -m unittest scripts/test_build_after_offer.py  (from the repo root)"""
import copy, importlib.util, json, os, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("build_after_offer", os.path.join(HERE, "build_after_offer.py"))
bao = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bao)

CA = "2026-11-04-canada-after-offer-and-permit.md"
SLUGS = {"ubc": "CA", "toronto": "CA", "mcgill": "CA", "melbourne": "AU", "ucl": "GB"}


def fact(**kw):
    f = {
        "text": "UBC deposit: CAD 3,000 when you accept the offer.",
        "link": "https://vancouver.calendar.ubc.ca/fees/policies-fees",
        "source_url": "https://vancouver.calendar.ubc.ca/fees/policies-fees",
        "verified_on": "2026-11-04",
        "research_ref": f"{CA}:26",
        "evidence": "UBC CAD 3,000 [page]",
        "only_citizenship": None,
    }
    f.update(kw)
    return f


def rec(**kw):
    r = {"country": "CA", "steps": {}, "universities": {"ubc": {"variants": {}, "steps": {"ca_deposit": [fact()]}}}}
    r.update(kw)
    return r


def errs(r, country="CA", research_dir=bao.RESEARCH_DIR):
    return bao.validate(r, country, SLUGS, research_dir)


def mutate_fact(**kw):
    return errs(rec(universities={"ubc": {"variants": {}, "steps": {"ca_deposit": [fact(**kw)]}}}))


class ValidateTest(unittest.TestCase):
    def test_valid_file_passes(self):
        self.assertEqual(errs(rec()), [])

    def test_step_key_must_belong_to_country(self):
        r = rec(steps={"uk_cas": [fact()]})
        self.assertTrue(any("not an after-offer step of CA" in e for e in errs(r)))

    def test_university_must_be_that_country(self):
        r = rec(universities={"melbourne": {"variants": {}, "steps": {}}})
        self.assertTrue(any("no CA college" in e for e in errs(r)))
        r = rec(universities={"nowhere": {"variants": {}, "steps": {}}})
        self.assertTrue(any("no CA college" in e for e in errs(r)))

    def test_research_ref_must_exist(self):
        self.assertTrue(any("does not exist" in e for e in mutate_fact(research_ref="2026-11-04-nothing-here.md:3")))
        self.assertTrue(any("outside" in e for e in mutate_fact(research_ref=f"{CA}:99999")))
        self.assertTrue(any("research_ref" in e for e in mutate_fact(research_ref="canada.md:26")))

    def test_text_length(self):
        self.assertTrue(any("text" in e for e in mutate_fact(text="")))
        self.assertTrue(any("text" in e for e in mutate_fact(text="x" * 201)))
        self.assertEqual(mutate_fact(text="x" * 200), [])

    def test_https_only(self):
        self.assertTrue(any("source_url" in e for e in mutate_fact(source_url="http://example.com")))
        self.assertTrue(any("link" in e for e in mutate_fact(link="http://example.com")))
        self.assertEqual(mutate_fact(link=None), [])

    def test_date_and_citizenship_shape(self):
        self.assertTrue(any("verified_on" in e for e in mutate_fact(verified_on="4 Nov 2026")))
        self.assertTrue(any("only_citizenship" in e for e in mutate_fact(only_citizenship=["Taiwan"])))
        self.assertTrue(any("only_citizenship" in e for e in mutate_fact(only_citizenship=[])))
        self.assertEqual(mutate_fact(only_citizenship=["TW"]), [])

    def test_variant_enum(self):
        ok = rec(universities={"mcgill": {"variants": {"ca_pal": "caq"}, "steps": {}}})
        self.assertEqual(errs(ok), [])
        for bad in ({"ca_pal": "other"}, {"ca_deposit": "caq"}):
            r = rec(universities={"mcgill": {"variants": bad, "steps": {}}})
            self.assertTrue(any("not an allowed variant" in e for e in errs(r)), bad)

    def test_snippet_fact_rejected(self):
        # canada...:26 mixes "U of T about CAD 5,000 [snippet]" with "UBC CAD 3,000 [page]"
        e = mutate_fact(text="U of T deposit: about CAD 5,000.", evidence="U of T about CAD 5,000 [snippet]")
        self.assertTrue(any("[snippet]" in x for x in e), e)

    def test_official_evidence_accepted(self):
        self.assertEqual(mutate_fact(evidence="UBC CAD 3,000 [page]"), [])

    def test_evidence_must_be_on_the_line(self):
        self.assertTrue(any("not an exact substring" in e for e in mutate_fact(evidence="UBC CAD 4,000 [page]")))

    def test_evidence_needs_an_official_tag_or_url(self):
        self.assertTrue(any("no official tag" in e for e in mutate_fact(evidence="Alberta, Waterloo")))

    def test_unconfirmed_and_not_found_rejected(self):
        e = mutate_fact(evidence="McGill CAD 2,500 [page]; Alberta, Waterloo not found")
        self.assertTrue(any("not found" in x for x in e), e)

    def test_unknown_and_missing_fields(self):
        f = fact()
        del f["evidence"]
        self.assertTrue(any("missing field evidence" in e for e in errs(rec(universities={"ubc": {"variants": {}, "steps": {"ca_deposit": [f]}}}))))
        self.assertTrue(any("unknown field extra" in e for e in mutate_fact(extra=1)))

    def test_line_is_read_from_the_given_dir(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, CA), "w", encoding="utf-8") as f:
                f.write("line one\nUBC CAD 3,000 [page]\n")
            r = rec(universities={"ubc": {"variants": {}, "steps": {"ca_deposit": [fact(research_ref=f"{CA}:2")]}}})
            self.assertEqual(errs(r, research_dir=d), [])
            self.assertTrue(errs(rec(), research_dir=d))  # real ref :26 is outside the 2-line stand-in


class BuildTest(unittest.TestCase):
    def test_output_shape_is_camel_case_and_drops_evidence(self):
        out = bao.build({"CA": rec()})
        f = out["universities"]["ubc"]["steps"]["ca_deposit"][0]
        self.assertEqual(set(f), {"text", "link", "sourceUrl", "verifiedOn", "onlyCitizenship"})
        self.assertEqual(out["CA"], {"steps": {}})

    def test_render_is_deterministic(self):
        a = bao.render(bao.build({"CA": rec()}))
        self.assertEqual(a, bao.render(copy.deepcopy(bao.build({"CA": rec()}))))
        self.assertTrue(a.endswith("}\n"))


class RealDataTest(unittest.TestCase):
    def setUp(self):
        self.slugs = bao.college_countries()
        self.records = {}
        for country, name in bao.FILES.items():
            with open(os.path.join(bao.SRC_DIR, name), encoding="utf-8") as f:
                self.records[country] = json.load(f)

    def test_real_files_are_valid(self):
        for country, r in self.records.items():
            self.assertEqual(bao.validate(r, country, self.slugs), [], country)

    def test_no_unconfirmed_au_visa_fee(self):
        # australia-after-offer-and-visa.md:264 lists the AUD 2,500 visa fee as unconfirmed
        au = self.records["AU"]
        texts = [f["text"] for fs in au["steps"].values() for f in fs]
        texts += [f["text"] for u in au["universities"].values() for fs in u["steps"].values() for f in fs]
        self.assertTrue(texts)
        self.assertFalse(any("2,500" in t for t in texts))

    def test_committed_output_is_current(self):
        self.assertEqual(bao.main(["--check"]), 0)


if __name__ == "__main__":
    unittest.main()
