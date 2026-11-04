import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMyTeacher, type MyTeacherRow } from "./my-teacher.ts";

const base: MyTeacherRow = {
  teacher_id: "t1",
  display_name: "Ms. Lee",
  school: null,
  linked_at: "2026-10-01T00:00:00Z",
  share_essays: false,
  class_names: ["Seminar", "Writing"],
};

test("parseMyTeacher keeps class themes, years and archived flags aligned with class_ids (0053)", () => {
  const t = parseMyTeacher({
    ...base,
    class_ids: ["c1", "c2"],
    class_themes: ["mint", null],
    class_years: [null, "2026-27"],
    class_archived: [false, true],
  });
  assert.deepEqual(t.classIds, ["c1", "c2"]);
  assert.deepEqual(t.classThemes, ["mint", null]);
  assert.deepEqual(t.classYears, [null, "2026-27"]);
  assert.deepEqual(t.classArchived, [false, true]);
  assert.equal(t.teacherId, "t1");
  assert.deepEqual(t.classNames, ["Seminar", "Writing"]);
});

test("parseMyTeacher: a database without the 0053 columns gets null / false for every class", () => {
  const t = parseMyTeacher({ ...base, class_ids: ["c1", "c2"] });
  assert.deepEqual(t.classThemes, [null, null]);
  assert.deepEqual(t.classYears, [null, null]);
  assert.deepEqual(t.classArchived, [false, false]);
  // Null columns, and no class ids at all (a database that predates 0052 too).
  assert.deepEqual(parseMyTeacher({ ...base, class_ids: ["c1"], class_themes: null, class_years: null, class_archived: null }).classThemes, [null]);
  const old = parseMyTeacher(base);
  assert.deepEqual([old.classIds, old.classThemes, old.classYears, old.classArchived], [[], [], [], []]);
});

test("parseMyTeacher: short, long or malformed arrays still come out as long as class_ids", () => {
  const short = parseMyTeacher({ ...base, class_ids: ["c1", "c2", "c3"], class_themes: ["sun"], class_archived: [true] });
  assert.deepEqual(short.classThemes, ["sun", null, null]);
  assert.deepEqual(short.classArchived, [true, false, false]);
  const long = parseMyTeacher({ ...base, class_ids: ["c1"], class_themes: ["sun", "ink", "sky"], class_years: ["2026-27", "x"] });
  assert.deepEqual(long.classThemes, ["sun"]);
  assert.deepEqual(long.classYears, ["2026-27"]);
  const junk = parseMyTeacher({ ...base, class_ids: ["c1", "c2"], class_themes: [5, ""], class_years: "2026", class_archived: ["true", 1] } as unknown as MyTeacherRow);
  assert.deepEqual(junk.classThemes, [null, null]);
  assert.deepEqual(junk.classYears, [null, null]);
  assert.deepEqual(junk.classArchived, [false, false]); // only a real true counts
});
