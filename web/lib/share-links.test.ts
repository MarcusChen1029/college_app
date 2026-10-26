import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResume, resumeText } from "./resume.ts";
import {
  isShareToken,
  lastViewedText,
  normalizeParentView,
  normalizePortfolioView,
  parentDeadlines,
  parentSummary,
  shareUrl,
} from "./share-links.ts";

const TOKEN = "A".repeat(20) + "b-_" + "9".repeat(20); // 43 chars

test("isShareToken accepts exactly 43 base64url characters", () => {
  assert.equal(TOKEN.length, 43);
  assert.equal(isShareToken(TOKEN), true);
  assert.equal(isShareToken("abc"), false);
  assert.equal(isShareToken(TOKEN + "x"), false);
  assert.equal(isShareToken(TOKEN.slice(1) + "="), false);
  assert.equal(isShareToken(TOKEN.slice(1) + "+"), false);
  assert.equal(isShareToken(null), false);
});

test("shareUrl builds /share/<kind>/<token> on the origin only", () => {
  assert.equal(shareUrl("https://www.track-ur-college.com", "parent", TOKEN), `https://www.track-ur-college.com/share/parent/${TOKEN}`);
  assert.equal(shareUrl("http://localhost:3000/settings?x=1#y", "portfolio", TOKEN), `http://localhost:3000/share/portfolio/${TOKEN}`);
  assert.equal(shareUrl("https://a.example", "parent", "short"), null);
  assert.equal(shareUrl("javascript:alert(1)", "parent", TOKEN), null);
  assert.equal(shareUrl("not a url", "parent", TOKEN), null);
  // @ts-expect-error: unknown kind
  assert.equal(shareUrl("https://a.example", "teacher", TOKEN), null);
});

test("lastViewedText", () => {
  assert.equal(lastViewedText(null), "Never opened");
  assert.equal(lastViewedText("2026-10-27T13:00:00Z"), "Last opened Oct 27, 2026");
});

const RAW_PARENT = {
  kind: "parent",
  email: "kid@example.com", // not part of the contract: must be dropped
  portals: { commonApp: { password: "pw" } },
  student: { name: "Ann Lee", school: "Lee High", grad_year: "2027", email: "kid@example.com" },
  updated_at: "2026-10-26T10:00:00Z",
  colleges: [
    {
      name: "Purdue University",
      custom: false,
      status: "submitted",
      plan: "EA",
      notes: "secret",
      portal_password: "pw",
      checklist: {
        transcript: true,
        recommendations: true,
        test_plan: "optional",
        essay_list: [{ status: "final", title: "Why Purdue", url: "https://docs.example/1" }],
      },
      deadlines: [
        { due_date: "2026-11-01", kind: "application", label: "Early Action", plan: "EA" },
        { due_date: "2026-10-01", kind: "priority", label: "Old", plan: null },
      ],
    },
    { name: "Dream U", custom: true, status: "admitted", plan: null, checklist: {}, deadlines: [{ due_date: "nope" }] },
    { name: "Old U", status: "interview", checklist: null, deadlines: null },
    "junk",
  ],
  recommenders: { total: 3, submitted: 1 },
  scholarships: null,
};

test("normalizeParentView keeps only documented fields", () => {
  const v = normalizeParentView(RAW_PARENT)!;
  assert.ok(v);
  assert.deepEqual(v.student, { name: "Ann Lee", school: "Lee High", gradYear: "2027" });
  assert.equal(v.colleges.length, 3);
  const text = JSON.stringify(v);
  for (const leak of ["kid@example.com", "pw", "secret", "Why Purdue", "docs.example", "portal"]) assert.ok(!text.includes(leak), `leaked ${leak}`);
  assert.deepEqual(v.colleges[0].checklist.essay_list?.map((e) => e.status), ["final"]);
  assert.deepEqual(v.colleges[1].deadlines, []);
  assert.equal(v.colleges[2].status, "interview");
  assert.deepEqual(v.recommenders, { total: 3, submitted: 1 });
  assert.equal(v.scholarships, null);
});

test("normalizeParentView returns null for an inactive link or the wrong kind", () => {
  assert.equal(normalizeParentView(null), null);
  assert.equal(normalizeParentView({ kind: "portfolio" }), null);
  assert.equal(normalizeParentView("x"), null);
});

test("parentSummary and parentDeadlines", () => {
  const v = normalizeParentView(RAW_PARENT)!;
  const s = parentSummary(v);
  assert.equal(s.colleges, 3);
  assert.equal(s.submitted, 3); // submitted, admitted, interview
  assert.equal(s.admitted, 1);
  assert.equal(s.decisions, 1);
  assert.equal(s.checklistTotal, 15);
  // Purdue: essays (all final), recommendations, transcript, test scores (optional) = 4; others 0.
  assert.equal(s.checklistDone, 4);
  const d = parentDeadlines(v, "2026-10-27");
  assert.deepEqual(d.map((x) => [x.college, x.dueDate]), [["Purdue University", "2026-11-01"]]);
});

const RAW_PORTFOLIO = {
  kind: "portfolio",
  header: { fullName: "Ann Lee", school: "Lee High", gradYear: "2027", email: "kid@example.com", phone: "555", location: "Town" },
  options: { source: "both", showHours: false, showScores: true },
  activities: {
    commonApp: {
      activities: [
        { type: "Robotics", position: "Captain", organization: "Robo Club", description: "Built robots", grades: ["11", "12", "13"], timing: ["school"], hoursPerWeek: 6, weeksPerYear: 30, password: "x" },
      ],
      honors: [{ title: "National Merit", grades: ["12"], levels: ["national", "galactic"] }],
    },
    uc: [
      { category: "work", name: "Cashier", organization: "Shop", description: "Rang up sales", grades: ["12"], fromCommonApp: false, hoursPerWeek: 10 },
      { category: "extracurricular", name: "Robo Club", fromCommonApp: true },
      { category: "nonsense", name: "Dropped" },
    ],
  },
  scores: { gpa: 3.9, sat: 1450, act: null, satSections: { rw: 720, math: 730 }, english: { TOEFL_IBT: { total: 110, sections: {} }, EVIL: { total: 1 } } },
};

test("normalizePortfolioView keeps resume fields and never any contact detail", () => {
  const p = normalizePortfolioView(RAW_PORTFOLIO)!;
  assert.ok(p);
  assert.equal(p.header.fullName, "Ann Lee");
  assert.equal(p.header.email, "");
  assert.equal(p.header.phone, "");
  assert.equal(p.header.location, "");
  assert.deepEqual(p.activities.commonApp.activities[0].grades, ["11", "12"]);
  assert.equal(p.activities.commonApp.activities[0].hoursPerWeek, null); // showHours off
  assert.deepEqual(p.activities.commonApp.honors[0].levels, ["national"]);
  assert.equal(p.activities.uc.length, 2);
  assert.equal(p.activities.uc[1].fromId, "common-app");
  assert.equal(p.profile.sat, 1450);
  assert.ok(p.profile.tests?.english && !("EVIL" in p.profile.tests.english));
  const text = JSON.stringify(p);
  for (const leak of ["kid@example.com", "555", "Town", "password"]) assert.ok(!text.includes(leak), `leaked ${leak}`);
});

test("portfolio renders through the resume builder like the student's own resume", () => {
  const p = normalizePortfolioView(RAW_PORTFOLIO)!;
  const r = buildResume({ ...p.profile, activities: p.activities }, p.header, p.options);
  const text = resumeText(p.header, r);
  assert.match(text, /^ANN LEE\n\nEDUCATION\nLee High · Class of 2027/);
  assert.match(text, /Captain · Robo Club/);
  assert.match(text, /Cashier · Shop/);
  assert.doesNotMatch(text, /^- Robo Club/m, "UC copy of a Common App item is not listed twice");
  assert.match(text, /SAT 1450/);
  assert.ok(!text.includes("hr/wk"));
});

test("portfolio without scores when the resume hides them", () => {
  const p = normalizePortfolioView({ ...RAW_PORTFOLIO, options: { source: "common", showHours: true, showScores: false } })!;
  assert.deepEqual(p.profile, {});
  assert.equal(p.activities.commonApp.activities[0].hoursPerWeek, 6);
  assert.equal(normalizePortfolioView({ kind: "parent" }), null);
  assert.equal(normalizePortfolioView(null), null);
});
