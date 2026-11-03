import assert from "node:assert/strict";
import { test } from "node:test";
import { studentAnchorOptions, type StudentRecord } from "../components/classroom/anchorOptions.ts";
import { anchorKey, validateAnchor } from "./anchors.ts";
import { makeT } from "./i18n/index.ts";

const t = makeT("en");

const entry = (slug: string, essayList: { id: string; title: string }[] = [], custom: { name: string } | null = null) => ({
  slug,
  custom,
  checklist: { essay_list: essayList.map((e) => ({ ...e, url: "", status: "drafting" as const })) },
});

const student: StudentRecord = {
  list: [
    entry("cornell", [
      { id: "e1", title: "Why Cornell" },
      { id: "e2", title: "" },
    ]),
    entry("custom-row-1", [], { name: "Local College" }),
    entry("mit"),
  ],
  profile: {
    essays: { ps: { status: "drafting" }, uc: { picks: [3, 5] } },
    activities: {
      version: 2,
      commonApp: { activities: [{ id: "a1", organization: "Debate team" }, { id: "a2", organization: "", position: "", leadership: null }, { organization: "No stored id" }], honors: [{ id: "h1", title: "State finalist" }] },
      uc: [{ id: "u1", category: "extracurricular", name: "Robotics club" }],
    },
  },
};
const names = new Map([["cornell", "Cornell"]]);

const labelOf = (list: ReturnType<typeof studentAnchorOptions>, key: string) => list.find((o) => anchorKey(o.anchor) === key)?.label;

test("studentAnchorOptions with essays shared: general, sections, colleges, essays, activities, profile cards", () => {
  const list = studentAnchorOptions(student, true, t, names);
  const keys = list.map((o) => anchorKey(o.anchor));
  assert.equal(keys[0], "general");
  assert.equal(new Set(keys).size, keys.length, "no duplicate anchors");
  assert.ok(list.every((o) => validateAnchor(o.anchor)), "every option is a valid anchor");
  assert.ok(list.every((o) => o.label.trim() !== "" && [...o.label].length <= 120));
  for (const k of ["section:colleges", "section:essays", "section:activities", "section:profile"]) assert.ok(keys.includes(k), k);
  assert.deepEqual(keys.filter((k) => k.startsWith("college:")), ["college:cornell", "college:custom-row-1", "college:mit"]);
  assert.deepEqual(keys.filter((k) => k.startsWith("profile:")), ["profile:gpa", "profile:test", "profile:english", "profile:regions"]);
  assert.deepEqual(keys.filter((k) => k.startsWith("essay:")), ["essay:ps", "essay:uc:3", "essay:uc:5", "essay:supp:cornell:e1", "essay:supp:cornell:e2"]);
  assert.deepEqual(keys.filter((k) => k.startsWith("activity:")), ["activity:a1", "activity:a2", "activity:h1", "activity:u1"]);
});

test("studentAnchorOptions labels: names, custom names and fallbacks", () => {
  const list = studentAnchorOptions(student, true, t, names);
  assert.equal(labelOf(list, "general"), "General");
  assert.equal(labelOf(list, "section:colleges"), "Your college list");
  assert.equal(labelOf(list, "college:cornell"), "Cornell");
  assert.equal(labelOf(list, "college:custom-row-1"), "Local College");
  assert.equal(labelOf(list, "college:mit"), "mit"); // no name known: the slug
  assert.equal(labelOf(list, "essay:ps"), t("writing.psName"));
  assert.equal(labelOf(list, "essay:uc:3"), t("writing.ucName", { n: 3 }));
  assert.equal(labelOf(list, "essay:supp:cornell:e1"), "Cornell: Why Cornell");
  assert.equal(labelOf(list, "essay:supp:cornell:e2"), `Cornell: ${t("classroom.opt.untitledEssay")}`);
  assert.equal(labelOf(list, "activity:a1"), "Debate team");
  assert.equal(labelOf(list, "activity:a2"), t("classroom.opt.untitledActivity"));
  assert.equal(labelOf(list, "activity:h1"), "State finalist");
  assert.equal(labelOf(list, "activity:u1"), "Robotics club");
});

test("studentAnchorOptions without essay sharing offers nothing about essays", () => {
  const keys = studentAnchorOptions(student, false, t, names).map((o) => anchorKey(o.anchor));
  assert.ok(!keys.includes("section:essays"));
  assert.deepEqual(keys.filter((k) => k.startsWith("essay:")), []);
  assert.ok(keys.includes("section:colleges") && keys.includes("college:cornell") && keys.includes("activity:a1"));
});

test("studentAnchorOptions skips activities with a made-up legacy id and copes with an empty record", () => {
  const keys = studentAnchorOptions(student, true, t, names).map((o) => anchorKey(o.anchor));
  assert.ok(!keys.some((k) => k.startsWith("activity:legacy-")));
  const bare = studentAnchorOptions({ list: [], profile: {} }, true, t);
  assert.deepEqual(bare.map((o) => anchorKey(o.anchor)), [
    "general",
    "section:colleges",
    "section:essays",
    "section:activities",
    "section:profile",
    "essay:ps",
    "profile:gpa",
    "profile:test",
    "profile:english",
    "profile:regions",
  ]);
});
