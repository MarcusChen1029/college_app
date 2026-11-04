import assert from "node:assert/strict";
import { test } from "node:test";
import { makeT } from "./i18n/index.ts";
import { BRIEF_HIGHLIGHT_KEY, briefColleges, briefText, buildTeacherBrief, type BriefCollege, type BriefInput } from "./teacher-brief.ts";
import type { Resume } from "./resume.ts";
import { courseFor } from "./application-steps.ts";

const T = makeT("en");
const Z = makeT("zh-TW");

const resume: Resume = {
  education: { school: "", gradYear: "", lines: [] },
  sections: [
    { key: "honors", title: "Honors & Awards", items: [{ title: "Math Olympiad finalist", organization: "", meta: "Grade 11", description: "" }] },
    { key: "leadership", title: "Activities & Leadership", items: [{ title: "Captain", organization: "Chess Club", meta: "Grades 10–12", description: "Led 20 members." }] },
  ],
};
const us: BriefCollege = { name: "Harvard", country: "US", course: null, deadline: "2027-01-01" };
const uk: BriefCollege = { name: "UCL", country: "GB", course: "Economics BSc", deadline: "2027-01-13" };
const base: BriefInput = { studentName: "Mei Lin", fields: ["Economics"], resume, colleges: [us], highlight: "" };
const headings = (s: { heading: string }[]) => s.map((x) => x.heading);

test("UCAS section only with a UK college", () => {
  const withUk = buildTeacherBrief({ ...base, colleges: [us, uk] }, T);
  const last = withUk[withUk.length - 1];
  assert.equal(last.heading, T("recommenders.brief.ucas"));
  assert.equal(last.lines.length, 4);
  const usOnly = buildTeacherBrief(base, T);
  assert.ok(!headings(usOnly).includes(T("recommenders.brief.ucas")));
  // The reference goes to every choice, so the brief says so and never names a university.
  assert.match(last.lines.join(" "), /every/i);
  assert.match(last.lines.join(" "), /3,800/);
  assert.match(last.lines.join(" "), /English/);
  assert.match(last.lines.join(" "), /unable to provide any predicted grades/);
});

test("highlight section omitted when empty", () => {
  assert.ok(!headings(buildTeacherBrief(base, T)).includes(T("recommenders.brief.highlight")));
  assert.ok(!headings(buildTeacherBrief({ ...base, highlight: "   " }, T)).includes(T("recommenders.brief.highlight")));
  const s = buildTeacherBrief({ ...base, highlight: "Her research project" }, T);
  const h = s.find((x) => x.heading === T("recommenders.brief.highlight"));
  assert.deepEqual(h?.lines, ["Her research project"]);
});

test("section order: about, activities, applying, highlight, UCAS", () => {
  const s = buildTeacherBrief({ ...base, colleges: [uk], highlight: "x" }, T);
  assert.deepEqual(headings(s), ["about", "activities", "applying", "highlight", "ucas"].map((k) => T(`recommenders.brief.${k}` as never)));
  const about = s[0].lines.join("\n");
  assert.match(about, /Mei Lin/);
  assert.match(about, /Economics/);
  // Resume order is kept: honors first.
  const act = s[1].lines.join("\n");
  assert.ok(act.indexOf("Math Olympiad finalist") < act.indexOf("Chess Club"));
  assert.match(act, /Led 20 members\./);
});

test("colleges sorted by deadline, nulls last", () => {
  const none: BriefCollege = { name: "Zed", country: "US", course: null, deadline: null };
  const s = buildTeacherBrief({ ...base, colleges: [none, uk, us] }, T);
  const where = s.find((x) => x.heading === T("recommenders.brief.applying"))!;
  assert.deepEqual(where.lines, ["Harvard · 2027-01-01", "UCL · Economics BSc · 2027-01-13", "Zed"]);
});

test("zh-TW headings differ and leak no keys", () => {
  const input = { ...base, colleges: [us, uk], highlight: "x" };
  const en = buildTeacherBrief(input, T);
  const zh = buildTeacherBrief(input, Z);
  assert.equal(zh.length, en.length);
  zh.forEach((sec, i) => {
    assert.notEqual(sec.heading, en[i].heading);
    for (const text of [sec.heading, ...sec.lines]) assert.ok(!text.includes("recommenders."), `leaked key in: ${text}`);
  });
  assert.notEqual(zh[zh.length - 1].lines[0], en[en.length - 1].lines[0]);
});

test("briefText contains every line", () => {
  const sections = buildTeacherBrief({ ...base, colleges: [us, uk], highlight: "x" }, T);
  const text = briefText(sections, "Brief for my recommender");
  // A UTF-8 byte order mark first (Notepad / Excel then read the zh brief correctly), then the title.
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.ok(text.startsWith("﻿Brief for my recommender"));
  assert.equal(text.indexOf("﻿", 1), -1);
  for (const s of sections) {
    assert.ok(text.includes(s.heading));
    for (const l of s.lines) assert.ok(text.includes(l), l);
  }
});

test("highlight key", () => assert.equal(BRIEF_HIGHLIGHT_KEY, "teacher-brief-highlight-v1"));

test("briefColleges: course name, earliest upcoming application date, custom college", () => {
  const econ = courseFor("ucl", "economics-bsc-econ");
  assert.ok(econ, "ucl economics course exists in the data");
  const colleges = [
    { slug: "ucl", id: "i-ucl", name: "UCL" },
    { slug: "harvard", id: "i-h", name: "Harvard" },
  ];
  const row = (id: string, inst: string, due: string, extra: object = {}) => ({
    id, institution_id: inst, kind: "application", plan_key: null, label: null, due_date: due, program_id: null, intake: null, ...extra,
  });
  const deadlines = [
    row("a", "i-ucl", "2026-10-15"), // already past
    row("b", "i-ucl", "2027-01-13"), // the university's row
    row("c", "i-ucl", "2027-01-20", { program_id: econ.id }), // the course's own row replaces it
    row("d", "i-h", "2027-01-01", { plan_key: "rd" }),
    row("e", "i-h", "2026-11-01", { plan_key: "ed" }),
    { ...row("f", "i-h", "2026-12-01"), kind: "financial_aid" },
  ];
  const checklist = (c: object) => ({ course: null, ...c }) as never;
  const list = [
    { slug: "ucl", plan: null, custom: null, checklist: checklist({ course: "economics-bsc-econ" }) },
    { slug: "harvard", plan: "rd", custom: null, checklist: checklist({}) },
    { slug: "custom-1", plan: null, custom: { name: "My Uni", deadline: "2027-02-01" }, checklist: checklist({}) },
  ];
  const out = briefColleges(list, colleges, deadlines, { international: true, today: "2026-11-04" });
  assert.deepEqual(out, [
    { name: "UCL", country: "GB", course: econ.name, deadline: "2027-01-20" },
    { name: "Harvard", country: "US", course: null, deadline: "2027-01-01" },
    { name: "My Uni", country: "US", course: null, deadline: "2027-02-01" },
  ]);
});
