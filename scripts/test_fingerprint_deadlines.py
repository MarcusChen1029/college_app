"""Tests for scripts/fingerprint_deadlines.py.
Run: python -I -m unittest discover -s scripts -p "test_fingerprint_deadlines.py"
"""
import hashlib, importlib.util, json, os, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("fingerprint_deadlines", os.path.join(HERE, "fingerprint_deadlines.py"))
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)

ID = "11111111-2222-3333-4444-555555555555"
ROW = {"id": ID, "kind": "application", "plan_key": None, "label": "UCAS deadline", "due_date": "2027-01-13",
       "notes": "18:00 UK time.", "intake": None, "program_id": "aaaaaaaa-0000-0000-0000-000000000001",
       "source_id": "bbbbbbbb-0000-0000-0000-000000000002"}


class CanonicalTest(unittest.TestCase):
    def test_canonical_none_is_empty(self):
        row = {"id": ID, "kind": "other", "plan_key": None, "label": None, "due_date": None, "notes": None,
               "intake": None, "program_id": None, "source_id": None}
        self.assertEqual(fp.canonical(row), f"{ID}|other|||||||")
        self.assertEqual(fp.canonical(row, pre_migration=True), f"{ID}|other|||||")

    def test_canonical_literal(self):
        self.assertEqual(fp.canonical(ROW),
                         "11111111-2222-3333-4444-555555555555|application||UCAS deadline|2027-01-13|18:00 UK time.|"
                         "|aaaaaaaa-0000-0000-0000-000000000001|bbbbbbbb-0000-0000-0000-000000000002")
        self.assertEqual(fp.canonical(dict(ROW, intake="s1"), pre_migration=True),
                         "11111111-2222-3333-4444-555555555555|application||UCAS deadline|2027-01-13|18:00 UK time.|"
                         "bbbbbbbb-0000-0000-0000-000000000002")
        self.assertEqual(fp.md5(ROW), hashlib.md5(fp.canonical(ROW).encode("utf-8")).hexdigest())


class QueryTest(unittest.TestCase):
    ROWS = [dict(ROW, id=f"11111111-2222-3333-4444-55555555555{i}", label=f"Row {i} - O'Brien") for i in range(3)]

    def test_query_embeds_every_id(self):
        sql = fp.query(self.ROWS, ["ucl", "anu"])
        for r in self.ROWS:
            self.assertIn(f"('{r['id']}'::uuid, '{fp.md5(r)}')", sql)
        self.assertIn("'ucl', 'anu'", sql)
        self.assertIn("full join", sql)
        self.assertIn("coalesce(d.intake,'')", sql)
        self.assertIn("coalesce(d.program_id::text,'')", sql)
        self.assertEqual(sql.count("'::uuid, '"), 3)

    def test_pre_migration_query_skips_new_columns(self):
        sql = fp.query(self.ROWS, ["ucl"], pre_migration=True)
        self.assertNotIn("intake", sql)
        self.assertNotIn("program_id", sql)
        for r in self.ROWS:
            self.assertIn(fp.md5(r, pre_migration=True), sql)

    def test_query_with_no_rows(self):
        sql = fp.query([], ["adelaide"])
        self.assertIn("where false", sql)

    def test_from_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "baseline.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"slugs": ["ucl"], "sources": [], "deadlines": self.ROWS}, f)
            rows, slugs = fp.rows_from_json(path)
        self.assertEqual(slugs, ["ucl"])
        self.assertEqual([r["id"] for r in rows], [r["id"] for r in self.ROWS])


if __name__ == "__main__":
    unittest.main()
