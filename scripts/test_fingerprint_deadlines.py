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
       "source_id": "bbbbbbbb-0000-0000-0000-000000000002", "notification_date": "2027-03-31",
       "notification_note": "by end of March", "cycle": "2026-27", "institution_id": "cccccccc-0000-0000-0000-000000000003"}
TAIL = "|2027-03-31|by end of March|2026-27|cccccccc-0000-0000-0000-000000000003"


class CanonicalTest(unittest.TestCase):
    def test_canonical_none_is_empty(self):
        row = {"id": ID, "kind": "other", "plan_key": None, "label": None, "due_date": None, "notes": None,
               "intake": None, "program_id": None, "source_id": None, "notification_date": None,
               "notification_note": None, "cycle": None, "institution_id": None}
        self.assertEqual(fp.canonical(row), f"{ID}|other" + "|" * 11)
        self.assertEqual(fp.canonical(row, pre_migration=True), f"{ID}|other" + "|" * 9)

    def test_canonical_literal(self):
        self.assertEqual(fp.canonical(ROW),
                         "11111111-2222-3333-4444-555555555555|application||UCAS deadline|2027-01-13|18:00 UK time.|"
                         "|aaaaaaaa-0000-0000-0000-000000000001|bbbbbbbb-0000-0000-0000-000000000002" + TAIL)
        self.assertEqual(fp.canonical(dict(ROW, intake="s1"), pre_migration=True),
                         "11111111-2222-3333-4444-555555555555|application||UCAS deadline|2027-01-13|18:00 UK time.|"
                         "bbbbbbbb-0000-0000-0000-000000000002" + TAIL)
        self.assertEqual(fp.md5(ROW), hashlib.md5(fp.canonical(ROW).encode("utf-8")).hexdigest())

    def test_every_patched_column_changes_the_hash(self):
        """The --deadlines-only patch sets every column, so a live edit to any of them must show as a mismatch."""
        changed = {"notification_date": "2027-04-01", "notification_note": "mid-April", "cycle": "2027-28",
                   "institution_id": "dddddddd-0000-0000-0000-000000000004", "label": "Other", "source_id": None}
        for k, v in changed.items():
            for pre in (False, True):
                self.assertNotEqual(fp.md5(dict(ROW, **{k: v}), pre), fp.md5(ROW, pre), (k, pre))

    def test_hash_covers_every_patch_column(self):
        spec_bs = importlib.util.spec_from_file_location("build_seed", os.path.join(HERE, "build_seed.py"))
        bs = importlib.util.module_from_spec(spec_bs)
        spec_bs.loader.exec_module(bs)
        self.assertEqual(sorted(["id"] + fp.COLS), sorted(bs.DEADLINE_COLS))
        self.assertEqual(sorted(["id"] + fp.cols(pre_migration=True) + ["intake", "program_id"]), sorted(bs.DEADLINE_COLS))

    def test_sql_text_lists_the_python_columns_in_order(self):
        """The SQL concat_ws and canonical() take the same columns in the same order."""
        for pre in (False, True):
            sql = fp.query([ROW], ["ucl"], pre_migration=pre)
            expr = "concat_ws('|', d.id::text, " + ", ".join(fp.SQL_PART[k] for k in fp.cols(pre)) + ")"
            self.assertIn(expr, sql)
            for k in fp.cols(pre):
                self.assertIn(f"d.{k}", fp.SQL_PART[k])
            self.assertIn(f"{1 + len(fp.cols(pre))} fields", sql)


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
