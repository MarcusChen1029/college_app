"""Tests for the deadline parts of scripts/build_seed.py (intake, course rows, B3 times, --deadlines-only).
Run: python -I -m unittest discover -s scripts -p "test_build_seed_deadlines.py"
"""
import copy, importlib.util, json, os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("build_seed", os.path.join(HERE, "build_seed.py"))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

UCAS_LABEL = "UCAS deadline, 18:00 UK time (02:00 on 14 Jan, Taiwan)"
GB_COLLEGE = {"slug": "gbu", "country_code": "GB", "programs": [
    {"slug": "cs", "name": "Computer Science BSc", "application_deadline": "2027-01-13",
     "source_url": "https://gbu.ac.uk/cs", "retrieved_on": "2026-10-27"},
    {"slug": "econ", "name": "Economics BSc", "application_deadline": "2027-06-30",
     "source_url": "https://gbu.ac.uk/econ", "retrieved_on": "2026-10-28"},
    {"slug": "law", "name": "Law LLB", "source_url": "https://gbu.ac.uk/law", "retrieved_on": "2026-10-27"},
]}
GB_CYCLE = {
    "sources": {"ucas": {"kind": "admissions_site", "title": "UCAS dates", "url": "https://www.ucas.com/dates", "accessed": "2026-10-22"}},
    "deadlines": [
        {"kind": "application", "plan": "RD", "due": "2027-01-13", "label": UCAS_LABEL, "notes": "18:00 UK time. Main round.", "src": "ucas"},
    ],
}
AU_COLLEGE = {"slug": "auu", "country_code": "AU", "programs": [
    {"slug": "cs", "name": "Bachelor of Computing", "application_deadline": "2026-11-30",
     "source_url": "https://auu.edu.au/cs", "retrieved_on": "2026-10-27"},
]}
AU_CYCLE = {
    "sources": {"dates": {"kind": "admissions_site", "title": "Key dates", "url": "https://auu.edu.au/dates", "accessed": "2026-10-27"}},
    "deadlines": [
        {"kind": "application", "plan": "RD", "due": "2026-11-30", "label": "Applications close - Semester 1 2027", "src": "dates", "intake": "s1"},
    ],
}
IID = "00000000-0000-0000-0000-000000000001"


def cy_with(base, **changes):
    """A deep copy of a cycle fixture whose first deadline row gets `changes`."""
    cy = copy.deepcopy(base)
    cy["deadlines"][0].update(changes)
    return cy


def src_ids(slug, cy):
    return {k: r["id"] for k, r in bs.source_rows(slug, IID, {}, cy).items()}


class DeadlineRulesTest(unittest.TestCase):
    def setUp(self):
        bs.errors.clear()

    def rows(self, slug, country, cy):
        return bs.deadline_rows(slug, IID, country, cy, src_ids(slug, cy))

    def assertError(self, text):
        self.assertTrue(any(text in e for e in bs.errors), f"{text!r} not in {bs.errors}")

    def test_au_application_needs_intake(self):
        cy = copy.deepcopy(AU_CYCLE)
        del cy["deadlines"][0]["intake"]
        self.rows("auu", "AU", cy)
        self.assertError("intake")
        bs.errors.clear()
        rows = self.rows("auu", "AU", AU_CYCLE)
        self.assertEqual(bs.errors, [])
        self.assertEqual(rows[0]["intake"], "s1")
        # other kinds don't need one
        bs.errors.clear()
        self.rows("auu", "AU", cy_with(AU_CYCLE, kind="scholarship", intake=None))
        self.assertEqual(bs.errors, [])

    def test_intake_forbidden_outside_au(self):
        self.rows("gbu", "GB", cy_with(GB_CYCLE, intake="s1"))
        self.assertError("intake")
        bs.errors.clear()
        self.rows("usu", "US", cy_with(GB_CYCLE, intake="s2", label="RD", notes=None))
        self.assertError("intake")
        bs.errors.clear()
        self.rows("auu", "AU", cy_with(AU_CYCLE, intake="s3"))
        self.assertError("intake")

    def test_us_time_not_checked(self):
        self.rows("usu", "US", cy_with(GB_CYCLE, label="Regular Decision (11:59 p.m. ET)", notes="Due 11:59 p.m. ET."))
        self.assertEqual(bs.errors, [])

    def test_time_needs_taiwan(self):
        self.rows("gbu", "GB", cy_with(GB_CYCLE, label="UCAS deadline", notes="18:00 UK time."))
        self.assertError("Taiwan")
        bs.errors.clear()
        self.rows("cau", "CA", cy_with(GB_CYCLE, label="Supplementary form due (11:59 p.m. ET)", notes=None))
        self.assertError("Taiwan")
        bs.errors.clear()
        self.rows("auu", "AU", cy_with(AU_CYCLE, notes="Closes 23:59 AEDT."))
        self.assertError("Taiwan")
        bs.errors.clear()
        self.rows("gbu", "GB", GB_CYCLE)  # time in the notes, Taiwan time in the label: fine
        self.rows("gbu", "GB", cy_with(GB_CYCLE, label="UCAS deadline", notes="No time given."))
        self.assertEqual(bs.errors, [])

    def test_time_written_with_am_pm_noon_or_midnight_needs_taiwan(self):
        for text in ("Closes 6 pm UK time.", "Closes 5pm.", "Due 11.59pm GMT.", "Due 4 PM ET.", "Due 9 a.m. AEDT.",
                     "Closes at noon.", "Closes at Midnight UK time.", "Due 11:59 p.m. ET."):
            bs.errors.clear()
            self.rows("gbu", "GB", cy_with(GB_CYCLE, label="Scholarship closes", notes=text))
            self.assertError("Taiwan")
            bs.errors.clear()
            self.rows("gbu", "GB", cy_with(GB_CYCLE, label="Scholarship closes (Taiwan time in the label)", notes=text))
            self.assertEqual(bs.errors, [], text)
        # words and numbers that only look like times
        for text in ("Opens in the afternoon.", "2 amounts are due.", "Due 12 April 2027.", "IELTS 6.5 overall.",
                     "Semester 2, 7 June 2027.", "Applies to 3 AMS courses."):
            bs.errors.clear()
            self.rows("gbu", "GB", cy_with(GB_CYCLE, label="Scholarship closes", notes=text))
            self.assertEqual(bs.errors, [], text)

    def test_legacy_rows_skip_new_rules_and_intake(self):
        cy = cy_with(GB_CYCLE, label="UCAS deadline", notes="18:00 UK time.", intake="s1")
        rows = bs.deadline_rows("gbu", IID, "GB", cy, src_ids("gbu", cy), legacy=True)
        self.assertEqual(bs.errors, [])
        self.assertIsNone(rows[0]["intake"])
        self.assertEqual(rows[0]["id"], bs.uid("dl", "gbu", "0"))


class CourseRowsTest(unittest.TestCase):
    def setUp(self):
        bs.errors.clear()

    def course(self, slug, country, c, cy):
        return bs.course_deadline_rows(slug, IID, country, c, cy, src_ids(slug, cy))

    def test_course_row_copies_matching_label(self):
        rows, sources = self.course("gbu", "GB", GB_COLLEGE, GB_CYCLE)
        cs = next(r for r in rows if r["program_id"] == bs.uid("prog", "gbu", "cs"))
        self.assertEqual(cs["label"], f"Computer Science BSc: {UCAS_LABEL}")
        self.assertEqual(cs["notes"], "18:00 UK time. Main round.")
        self.assertEqual(cs["source_id"], bs.uid("src", "gbu", "ucas"))
        self.assertEqual((cs["kind"], cs["plan_key"], cs["due_date"], cs["intake"]), ("application", None, "2027-01-13", None))
        self.assertEqual(bs.errors, [])

    def test_course_row_label_without_match(self):
        rows, sources = self.course("gbu", "GB", GB_COLLEGE, GB_CYCLE)
        self.assertEqual(len(rows), 2)  # law has no application_deadline
        econ = next(r for r in rows if r["program_id"] == bs.uid("prog", "gbu", "econ"))
        self.assertEqual(econ["label"], "Course deadline: Economics BSc")
        self.assertIsNone(econ["notes"])
        sid = bs.uid("src", "gbu", "course", "econ")
        self.assertEqual(econ["source_id"], sid)
        self.assertEqual(list(sources), ["course/econ"])
        src = sources["course/econ"]
        self.assertEqual((src["id"], src["url"], src["accessed_on"], src["institution_id"]),
                         (sid, "https://gbu.ac.uk/econ", "2026-10-28", IID))
        self.assertIn(src["kind"], bs.ENUMS["source_kind"])
        # a non-application row on the same date is not a match
        cy = copy.deepcopy(GB_CYCLE)
        cy["deadlines"].append({"kind": "other", "due": "2027-06-30", "label": "Business school deadline", "src": "ucas"})
        rows, _ = self.course("gbu", "GB", GB_COLLEGE, cy)
        self.assertEqual(next(r for r in rows if r["program_id"] == bs.uid("prog", "gbu", "econ"))["label"], "Course deadline: Economics BSc")

    def test_course_row_ids_do_not_depend_on_position(self):
        rows, _ = self.course("gbu", "GB", GB_COLLEGE, GB_CYCLE)
        c2 = copy.deepcopy(GB_COLLEGE)
        c2["programs"].reverse()
        cy2 = copy.deepcopy(GB_CYCLE)
        cy2["deadlines"].insert(0, {"kind": "scholarship", "due": "2026-12-01", "label": "Scholarship", "src": "ucas"})
        rows2, _ = self.course("gbu", "GB", c2, cy2)
        ids = lambda rs: {r["program_id"]: r["id"] for r in rs}
        self.assertEqual(ids(rows), ids(rows2))
        self.assertEqual(ids(rows)[bs.uid("prog", "gbu", "cs")], bs.uid("dl", "gbu", "course", "cs"))

    def test_au_course_rows_are_s1_and_match_same_intake(self):
        rows, sources = self.course("auu", "AU", AU_COLLEGE, AU_CYCLE)
        self.assertEqual(rows[0]["intake"], "s1")
        self.assertEqual(rows[0]["label"], "Bachelor of Computing: Applications close - Semester 1 2027")
        self.assertEqual(sources, {})
        rows, sources = self.course("auu", "AU", AU_COLLEGE, cy_with(AU_CYCLE, intake="s2"))
        self.assertEqual(rows[0]["label"], "Course deadline: Bachelor of Computing")
        self.assertEqual(len(sources), 1)

    def test_au_course_deadline_window(self):
        for due in ("2026-08-01", "2026-11-30", "2027-02-28"):
            bs.errors.clear()
            c = copy.deepcopy(AU_COLLEGE)
            c["programs"][0]["application_deadline"] = due
            self.course("auu", "AU", c, AU_CYCLE)
            self.assertEqual(bs.errors, [], due)
        for due in ("2026-07-31", "2027-03-01", "2027-05-31"):
            bs.errors.clear()
            c = copy.deepcopy(AU_COLLEGE)
            c["programs"][0]["application_deadline"] = due
            self.course("auu", "AU", c, AU_CYCLE)
            self.assertTrue(any("AU course deadlines are Semester 1; put a Semester 2 date in the cycle file with intake s2" in e
                                for e in bs.errors), (due, bs.errors))


def dataset(slug, country, c, cy, legacy=False):
    return bs.deadline_set(slug, IID, country, c, cy, legacy=legacy)


def two_rows():
    cy = copy.deepcopy(GB_CYCLE)
    cy["deadlines"].append({"kind": "other", "due": "2027-02-01", "label": "Written work due", "notes": "Upload it.", "src": "ucas"})
    return cy


NO_PROGRAMS = {"slug": "gbu", "country_code": "GB"}
ONE_PROGRAM = {"slug": "gbu", "country_code": "GB", "programs": [GB_COLLEGE["programs"][0]]}


class DeadlinesOnlyPatchTest(unittest.TestCase):
    def setUp(self):
        bs.errors.clear()

    def baseline(self):
        return dataset("gbu", "GB", ONE_PROGRAM, two_rows(), legacy=True)

    def test_baseline_has_no_course_rows(self):
        base = self.baseline()
        self.assertEqual([r["id"] for r in base["deadlines"]], [bs.uid("dl", "gbu", "0"), bs.uid("dl", "gbu", "1")])
        self.assertEqual([s["key"] for s in base["sources"]], ["ucas"])

    def test_deadlines_only_inserts_new_ids_only(self):
        cy = two_rows()
        cy["deadlines"].append({"kind": "deposit", "due": "2027-06-30", "label": "Accept your offer", "src": "ucas"})
        sql = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", ONE_PROGRAM, cy))
        inserts = [line for line in sql.splitlines() if line.startswith("insert into")]
        self.assertEqual(len(inserts), 2, sql)
        self.assertTrue(all("on conflict (id) do nothing" in s for s in inserts), inserts)
        self.assertIn(bs.uid("dl", "gbu", "2"), sql)
        self.assertIn(bs.uid("dl", "gbu", "course", "cs"), sql)
        self.assertNotIn("update public.deadlines", sql)

    def test_deadlines_only_inserts_course_source(self):
        sql = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", GB_COLLEGE, two_rows()))
        self.assertIn("insert into public.sources", sql)
        self.assertIn(bs.uid("src", "gbu", "course", "econ"), sql)
        self.assertIn("https://gbu.ac.uk/econ", sql)

    def test_deadlines_only_updates_changed_rows(self):
        cy = two_rows()
        cy["deadlines"][1]["label"] = "Written work due, 12:00 UK time (20:00, Taiwan)"
        sql = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", NO_PROGRAMS, cy))
        self.assertEqual(sql.count("update public.deadlines"), 1, sql)
        self.assertIn(f"where id = '{bs.uid('dl', 'gbu', '1')}';", sql)
        self.assertIn("Written work due, 12:00 UK time (20:00, Taiwan)", sql)
        self.assertNotIn("insert into", sql)

    def test_deadlines_only_updates_added_intake(self):
        base = dataset("auu", "AU", {"slug": "auu"}, cy_with(AU_CYCLE, intake=None), legacy=True)
        sql = bs.deadlines_patch(base, dataset("auu", "AU", {"slug": "auu"}, AU_CYCLE))
        self.assertEqual(sql.count("update public.deadlines"), 1, sql)
        self.assertIn("intake = 's1'", sql)

    def test_deadlines_only_refuses_removed_row(self):
        cy = copy.deepcopy(GB_CYCLE)  # row 1 is gone
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "patch.sql")
            with self.assertRaises(bs.PatchError) as ctx:
                bs.write_deadlines_patch(self.baseline(), dataset("gbu", "GB", ONE_PROGRAM, cy), out)
            self.assertIn(bs.uid("dl", "gbu", "1"), str(ctx.exception))
            self.assertFalse(os.path.exists(out))

    def test_deadlines_only_refuses_moved_row(self):
        cy = two_rows()
        cy["deadlines"].insert(0, {"kind": "scholarship", "due": "2026-12-01", "label": "New scholarship", "src": "ucas"})
        with self.assertRaises(bs.PatchError) as ctx:
            bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", ONE_PROGRAM, cy))
        self.assertIn("moved", str(ctx.exception))

    def test_deadlines_only_refuses_changed_source_url(self):
        cy = two_rows()
        cy["sources"]["ucas"]["url"] = "https://www.ucas.com/other"
        with self.assertRaises(bs.PatchError) as ctx:
            bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", ONE_PROGRAM, cy))
        self.assertIn("ucas", str(ctx.exception))

    def test_refused_patch_removes_an_older_file_at_out(self):
        cy = copy.deepcopy(GB_CYCLE)  # row 1 is gone
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "patch.sql")
            with open(out, "w", encoding="utf-8") as f:
                f.write("begin; -- stale patch from an earlier run\ncommit;\n")
            with self.assertRaises(bs.PatchError):
                bs.write_deadlines_patch(self.baseline(), dataset("gbu", "GB", ONE_PROGRAM, cy), out)
            self.assertFalse(os.path.exists(out))

    def test_cli_refusal_removes_an_older_file_at_out(self):
        """The real CLI on real UCL data: a baseline row the files no longer have -> exit 1 and --out is gone."""
        ghost = {"slug": "ucl", "ref": "deadlines[99]", **{k: None for k in bs.DEADLINE_COLS}}
        ghost.update(id=bs.uid("dl", "ucl", "ghost"), kind="other", cycle=bs.CYCLE, label="A row the files no longer have")
        with tempfile.TemporaryDirectory() as tmp:
            base, out = os.path.join(tmp, "baseline.json"), os.path.join(tmp, "patch.sql")
            with open(base, "w", encoding="utf-8") as f:
                json.dump({"slugs": ["ucl"], "sources": [], "deadlines": [ghost]}, f)
            with open(out, "w", encoding="utf-8") as f:
                f.write("stale\n")
            run = subprocess.run([sys.executable, "-I", os.path.join(HERE, "build_seed.py"), "--deadlines-only",
                                  "--baseline", base, "--only", "ucl", "--out", out],
                                 capture_output=True, text=True, encoding="utf-8", timeout=120)
            self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
            self.assertIn("Refused", run.stdout)
            self.assertFalse(os.path.exists(out))

    def test_reread_source_gets_title_and_accessed_update(self):
        cy = two_rows()
        cy["sources"]["ucas"].update(title="UCAS dates (re-read)", accessed="2026-11-05")
        sql = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", NO_PROGRAMS, cy))
        sid = bs.uid("src", "gbu", "ucas")
        self.assertEqual(sql.count("update public.sources"), 1, sql)
        self.assertIn(f"update public.sources set title = 'UCAS dates (re-read)', accessed_on = '2026-11-05' where id = '{sid}';", sql)
        self.assertIn("1 source updates", sql)
        self.assertNotIn("insert into", sql)
        # an unchanged source is left alone
        same = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", NO_PROGRAMS, two_rows()))
        self.assertNotIn("update public.sources", same)
        self.assertIn("0 source updates", same)

    def test_header_states_every_precondition(self):
        cy = two_rows()
        cy["deadlines"][1]["label"] = "Written work due, 12:00 UK time (20:00, Taiwan)"
        sql = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", ONE_PROGRAM, cy),
                                 also_run=["supabase/patches/2026-11-05-calgary-course-deadlines.sql"])
        head = "\n".join(line for line in sql.splitlines() if line.startswith("--"))
        for text in ("0054_uk_ca_au_steps is applied first", "v7 is deployed only after that migration",
                     "web merge", "BEFORE this patch", "every course row",
                     "Also run: supabase/patches/2026-11-05-calgary-course-deadlines.sql", "It holds UPDATEs"):
            self.assertIn(text, head)
        plain = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", NO_PROGRAMS, two_rows()))
        self.assertNotIn("Also run", plain)
        self.assertNotIn("It holds UPDATEs", plain)  # nothing changed, so no UPDATE
        self.assertIn("BEFORE this patch", plain)

    def test_deadlines_only_patch_shape(self):
        cy = two_rows()
        cy["deadlines"][0]["notes"] = "18:00 UK time. Main round, equal consideration."
        cy["deadlines"].append({"kind": "deposit", "due": "2027-06-30", "label": "Accept your offer", "src": "ucas"})
        sql = bs.deadlines_patch(self.baseline(), dataset("gbu", "GB", GB_COLLEGE, cy))
        self.assertTrue(sql.startswith("begin;"), sql[:80])
        self.assertTrue(sql.rstrip().endswith("commit;"), sql[-80:])
        low = sql.lower()
        for bad in ("delete", "public.institutions", "public.programs", "truncate", "drop "):
            self.assertNotIn(bad, low)
        # inserts come before updates
        self.assertLess(low.rindex("insert into"), low.index("update public.deadlines"))


class RealDataTest(unittest.TestCase):
    """The real UCL files: course rows carry the UCAS label with its Taiwan time."""

    def setUp(self):
        bs.errors.clear()

    def test_ucl_course_rows(self):
        col = {}
        bs.build(["ucl"], insert_only=True, collect=col)
        self.assertEqual(bs.errors, [])
        course = [r for r in col["deadlines"] if r["program_id"]]
        self.assertEqual(len(course), 3)
        self.assertTrue(all("Taiwan" in r["label"] for r in course), [r["label"] for r in course])
        legacy = {}
        bs.build(["ucl"], insert_only=True, legacy=True, collect=legacy)
        own = len(bs.load_json(os.path.join(bs.ROOT, "data/cycle_2026_27/ucl.json"))["deadlines"])
        self.assertGreaterEqual(own, 1)
        self.assertEqual([r["program_id"] for r in legacy["deadlines"]], [None] * own)  # no course rows
        self.assertEqual([r["intake"] for r in legacy["deadlines"]], [None] * own)


if __name__ == "__main__":
    unittest.main()
