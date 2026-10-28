import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DIGEST_DAYS,
  MAX_PER_SECTION,
  clampToday,
  daysBetween,
  escapeHtml,
  plainText,
  relativeDay,
  renderTeacherDigest,
  selectDigest,
  type DigestRow,
} from "../../supabase/functions/_shared/teacher-digest.ts";

test("plainText keeps student text to one short line with no clickable addresses", () => {
  assert.equal(plainText("  Ana \n Lee ", 60), "Ana Lee");
  assert.equal(plainText("x".repeat(100), 10), `${"x".repeat(9)}…`);
  const phish = plainText("Locked! verify at https://evil.example/login", 120);
  assert.ok(!phish.includes("evil.example"));
  assert.ok(!phish.includes("https://"));
  assert.equal(plainText("St. Mary's", 60), "St. Mary's"); // a dot before a space is left alone
});

test("clampToday honours only a real date within a day of now", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  assert.equal(clampToday(undefined, now), "2026-10-28");
  assert.equal(clampToday("2026-10-27", now), "2026-10-27");
  assert.equal(clampToday("2026-10-29", now), "2026-10-29");
  assert.equal(clampToday("2027-01-01", now), "2026-10-28");
  assert.equal(clampToday("2026-01-01", now), "2026-10-28");
  assert.equal(clampToday("garbage", now), "2026-10-28");
  assert.equal(clampToday(20261028, now), "2026-10-28");
});

const TODAY = "2026-10-25";
const row = (p: Partial<DigestRow>): DigestRow => ({
  student_id: "s1",
  student_name: "Ana",
  item: "task",
  title: "Finish profile",
  label: null,
  due_on: "2026-10-27",
  ...p,
});

test("daysBetween and relativeDay", () => {
  assert.equal(daysBetween(TODAY, "2026-10-25"), 0);
  assert.equal(daysBetween(TODAY, "2026-11-01"), 7);
  assert.equal(daysBetween(TODAY, "2026-10-20"), -5);
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2); // across a US DST change
  assert.deepEqual([0, 1, -1, 3, -4].map(relativeDay), ["today", "tomorrow", "yesterday", "in 3 days", "4 days ago"]);
});

test("selectDigest splits tasks into overdue / due and keeps deadlines within the window", () => {
  const out = selectDigest(
    [
      row({ title: "Due soon", due_on: "2026-10-27" }),
      row({ title: "Overdue", due_on: "2026-10-20" }),
      row({ title: "Too far", due_on: "2026-11-02" }),
      row({ item: "deadline", title: "MIT", label: "Early Action", due_on: "2026-11-01" }),
      row({ item: "deadline", title: "Past deadline", label: "RD", due_on: "2026-10-24" }),
      row({ item: "deadline", title: "Later", label: "RD", due_on: "2026-11-03" }),
      row({ item: "essay", title: "Unknown item kind" }),
      row({ due_on: "not a date" }),
    ],
    TODAY,
  );
  assert.equal(out.length, 1);
  const s = out[0];
  assert.deepEqual(s.overdue.map((e) => [e.title, e.days]), [["Overdue", -5]]);
  assert.deepEqual(s.tasksDue.map((e) => [e.title, e.days]), [["Due soon", 2]]);
  assert.deepEqual(s.deadlines.map((e) => [e.title, e.label, e.days]), [["MIT", "Early Action", DIGEST_DAYS]]);
});

test("selectDigest groups by student id (not name), sorts by name, and drops students with nothing", () => {
  const out = selectDigest(
    [
      row({ student_id: "b", student_name: "Zoe", due_on: "2026-10-26" }),
      row({ student_id: "a1", student_name: "Ana", due_on: "2026-10-28" }),
      row({ student_id: "a2", student_name: "Ana", due_on: "2026-10-26" }),
      row({ student_id: "c", student_name: "Cy", due_on: "2026-12-01" }),
      row({ student_id: "d", student_name: "  ", due_on: "2026-10-26" }),
    ],
    TODAY,
  );
  assert.deepEqual(out.map((s) => [s.studentId, s.name]), [["a1", "Ana"], ["a2", "Ana"], ["d", "Student"], ["b", "Zoe"]]);
});

test("renderTeacherDigest returns null when there is nothing to report", () => {
  assert.equal(renderTeacherDigest({ teacherName: "Ms. Lee", students: [], appUrl: "https://x.test" }), null);
  assert.equal(renderTeacherDigest({ teacherName: "Ms. Lee", students: selectDigest([row({ due_on: "2027-01-01" })], TODAY), appUrl: "https://x.test" }), null);
});

test("renderTeacherDigest escapes student and teacher text and links only to the app", () => {
  const evil = `<img src=x onerror="alert(1)">&'`;
  const students = selectDigest(
    [
      row({ student_name: evil, title: `<script>alert("t")</script>`, due_on: "2026-10-20" }),
      row({ student_name: evil, item: "deadline", title: "<b>College</b>", label: `"EA"`, due_on: "2026-10-26" }),
    ],
    TODAY,
  );
  const email = renderTeacherDigest({ teacherName: `<i>Lee</i>`, students, appUrl: "https://app.test/" })!;
  assert.ok(email);
  assert.ok(!email.html.includes("<script"), "task title not escaped");
  assert.ok(!email.html.includes("<img"), "student name not escaped");
  assert.ok(!email.html.includes("<b>College"), "college name not escaped");
  assert.ok(!email.html.includes("<i>Lee"), "teacher name not escaped");
  assert.ok(email.html.includes(escapeHtml(evil)));
  assert.ok(email.html.includes("&#60;script&#62;"));
  const hrefs = [...email.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["https://app.test/teacher/students?s=s1", "https://app.test/teacher", "https://app.test/settings#digest"]);
  assert.ok(!email.subject.includes("<"), "subject has no student text");
  assert.match(email.subject, /^1 student to check on this week \(1 with overdue tasks\)$/);
  assert.ok(email.text.includes("Turn this summary off: https://app.test/settings#digest"));
});

test("renderTeacherDigest lists sections, counts and caps long lists", () => {
  const rows: DigestRow[] = [
    ...Array.from({ length: MAX_PER_SECTION + 3 }, (_, i) => row({ title: `Task ${String(i).padStart(2, "0")}`, due_on: "2026-10-28" })),
    row({ student_id: "s2", student_name: "Ben", item: "deadline", title: "Yale", label: "Single-Choice Early Action", due_on: "2026-10-25" }),
  ];
  const email = renderTeacherDigest({ teacherName: null, students: selectDigest(rows, TODAY), appUrl: "https://app.test" })!;
  assert.equal(email.subject, "2 students to check on this week");
  assert.ok(email.html.startsWith(`<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">\n<p>Hi,</p>`));
  assert.ok(email.html.includes("and 3 more"));
  assert.ok(!email.html.includes(`Task ${String(MAX_PER_SECTION).padStart(2, "0")}`));
  assert.ok(email.text.includes("Yale — Single-Choice Early Action (Sun, Oct 25, 2026, today)"));
  assert.ok(email.text.indexOf("Ana") < email.text.indexOf("Ben"));
  assert.ok(email.text.includes("Tasks due this week:"));
  assert.ok(!email.text.includes("Overdue tasks:"));
});
