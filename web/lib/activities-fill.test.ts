import assert from "node:assert/strict";
import { test } from "node:test";
import { CA_PAGE_LIMIT, buildCaPagePlan, itemLabel, keepRoom, readBackMismatches, replacedNote, type CaAnswer } from "./activities-fill.ts";
import { newCaActivity, newCaHonor, type ActivityData, type CaActivity, type CaHonor } from "./activities.ts";

const robotics = (over: Partial<CaActivity> = {}): CaActivity => ({
  ...newCaActivity(),
  id: "r1",
  type: "Robotics",
  description: "Built and drove a competition robot.",
  organization: "Team 1234",
  leadership: false,
  grades: ["10", "11"],
  timing: "school",
  hoursPerWeek: 10,
  weeksPerYear: 30,
  continueInCollege: "yes",
  ...over,
});

const data = (activities: CaActivity[] = [], honors: CaHonor[] = []): ActivityData => ({ version: 2, commonApp: { activities, honors }, uc: [] });
const answerOf = (answers: CaAnswer[], question: string) => answers.find((a) => a.question === question)!;

test("a Robotics activity: every question in reveal order, hidden ones cleared with null", () => {
  const plan = buildCaPagePlan(data([robotics()]), "activities");
  assert.equal(plan.blocked.length, 0);
  assert.equal(plan.blanks.length, 0);
  assert.equal(plan.slots.length, 1);
  const slot = plan.slots[0]!;
  assert.equal(slot.sourceId, "r1");
  assert.equal(slot.label, "Team 1234");
  assert.deepEqual(
    slot.answers.map((a) => a.question),
    [
      "Activity or experience type",
      "Sport/team",
      "Describe this activity",
      "Organization or group",
      "specific position or leadership role",
      "What was your role?",
      "When did you participate?",
      "Time of year",
      "Start date",
      "still participating",
      "End date",
      "Hours spent per week",
      "Weeks spent per year",
      "participating in this activity in college",
    ],
  );
  const a = (q: string) => answerOf(slot.answers, q);
  assert.deepEqual(a("Activity or experience type"), { question: "Activity or experience type", kind: "select", value: "Robotics" });
  assert.equal(a("Sport/team").value, null);
  assert.equal(a("What was your role?").value, null);
  assert.equal(a("Start date").value, null);
  assert.equal(a("still participating").value, null);
  assert.equal(a("End date").value, null);
  assert.deepEqual(a("specific position or leadership role"), { question: "specific position or leadership role", kind: "radio", value: "No" });
  assert.deepEqual(a("When did you participate?"), { question: "When did you participate?", kind: "checks", value: ["10th grade", "11th grade"] });
  assert.deepEqual(a("Time of year"), { question: "Time of year", kind: "radio", value: "During the school year" });
  assert.equal(a("Hours spent per week").value, "10");
  assert.equal(a("Weeks spent per year").value, "30");
  assert.deepEqual(a("participating in this activity in college"), { question: "participating in this activity in college", kind: "radio", value: "Yes" });
});

test("athletics sends the sport; leadership yes sends the role", () => {
  const soccer = robotics({ type: "Athletics (JV or varsity)", sport: "Soccer", leadership: true, position: "Captain" });
  const slot = buildCaPagePlan(data([soccer]), "activities").slots[0]!;
  assert.equal(answerOf(slot.answers, "Sport/team").value, "Soccer");
  assert.equal(answerOf(slot.answers, "Sport/team").kind, "select");
  assert.equal(answerOf(slot.answers, "What was your role?").value, "Captain");
  assert.equal(answerOf(slot.answers, "specific position or leadership role").value, "Yes");
});

test("stale answers on hidden questions are cleared, never sent", () => {
  const stale = robotics({ sport: "Soccer", position: "Captain", afterStart: "2025-09", afterEnd: "2026-01", stillParticipating: true });
  const slot = buildCaPagePlan(data([stale]), "activities").slots[0]!;
  for (const q of ["Sport/team", "What was your role?", "Start date", "still participating", "End date"]) assert.equal(answerOf(slot.answers, q).value, null, q);
});

test("after graduating: dates as Month YYYY, still-participating and end date follow the rules", () => {
  const pg = robotics({ grades: ["PG"], timing: null, afterStart: "2025-09", stillParticipating: false, afterEnd: "2026-01" });
  const slot = buildCaPagePlan(data([pg]), "activities").slots[0]!;
  assert.deepEqual(answerOf(slot.answers, "When did you participate?").value, ["After graduating high school"]);
  assert.equal(answerOf(slot.answers, "Time of year").value, null);
  assert.deepEqual(answerOf(slot.answers, "Start date"), { question: "Start date", kind: "date", value: "September 2025" });
  assert.equal(answerOf(slot.answers, "still participating").value, "No");
  assert.equal(answerOf(slot.answers, "End date").value, "January 2026");

  const still = robotics({ grades: ["9", "PG"], afterStart: "2025-09", stillParticipating: true });
  const s2 = buildCaPagePlan(data([still]), "activities").slots[0]!;
  assert.deepEqual(answerOf(s2.answers, "When did you participate?").value, ["9th grade", "After graduating high school"]);
  assert.equal(answerOf(s2.answers, "still participating").value, "Yes");
  assert.equal(answerOf(s2.answers, "End date").value, null);
});

test("continue in college maps to the portal's radios", () => {
  const slot = buildCaPagePlan(data([robotics({ continueInCollege: "not_sure" })]), "activities").slots[0]!;
  assert.equal(answerOf(slot.answers, "participating in this activity in college").value, "Not sure");
  const no = buildCaPagePlan(data([robotics({ continueInCollege: "no" })]), "activities").slots[0]!;
  assert.equal(answerOf(no.answers, "participating in this activity in college").value, "No");
});

test("hours and weeks are typed without trailing zeros", () => {
  const slot = buildCaPagePlan(data([robotics({ hoursPerWeek: 5.5, weeksPerYear: 12.0 })]), "activities").slots[0]!;
  assert.equal(answerOf(slot.answers, "Hours spent per week").value, "5.5");
  assert.equal(answerOf(slot.answers, "Weeks spent per year").value, "12");
});

test("an item whose hours or weeks would be longer than 5 typed characters is blocked", () => {
  const plan = buildCaPagePlan(data([robotics({ hoursPerWeek: 10.1234 })]), "activities");
  assert.equal(plan.slots.length, 0);
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.blocked[0]!.label, "Team 1234");
  assert.ok(plan.blocked[0]!.reasons.some((r) => r.includes("Hours spent per week") && r.includes("5 characters")), plan.blocked[0]!.reasons.join("|"));
  const weeks = buildCaPagePlan(data([robotics({ weeksPerYear: 1 / 3 + 1 })]), "activities");
  assert.equal(weeks.slots.length, 0);
  assert.ok(weeks.blocked[0]!.reasons.some((r) => r.includes("Weeks spent per year") && r.includes("5 characters")));
});

test("a 151-character description is blocked (names the 150 limit), not planned", () => {
  const plan = buildCaPagePlan(data([robotics({ description: "x".repeat(151) })]), "activities");
  assert.equal(plan.slots.length, 0);
  assert.equal(plan.blanks.length, 0);
  assert.equal(plan.blocked.length, 1);
  assert.ok(plan.blocked[0]!.reasons.some((r) => r.includes("150")));
  assert.equal(buildCaPagePlan(data([robotics({ description: "x".repeat(150) })]), "activities").slots.length, 1);
});

test("an item missing hours is planned with hours null and listed in blanks", () => {
  const plan = buildCaPagePlan(data([robotics({ hoursPerWeek: null })]), "activities");
  assert.equal(plan.blocked.length, 0);
  assert.equal(plan.slots.length, 1);
  assert.equal(answerOf(plan.slots[0]!.answers, "Hours spent per week").value, null);
  assert.equal(plan.blanks.length, 1);
  assert.equal(plan.blanks[0]!.label, "Team 1234");
  assert.deepEqual(plan.blanks[0]!.reasons, ["Hours spent per week: needs an answer"]);
});

test("an empty optional organization is a null answer, not a blank", () => {
  const plan = buildCaPagePlan(data([robotics({ organization: "" })]), "activities");
  assert.equal(plan.blanks.length, 0);
  assert.equal(answerOf(plan.slots[0]!.answers, "Organization or group").value, null);
  assert.equal(plan.slots[0]!.label, "Robotics");
});

test("the legacy note never reaches an answer", () => {
  const plan = buildCaPagePlan(data([robotics({ legacy: "From your earlier version: SECRET-NOTE" })]), "activities");
  const text = JSON.stringify(plan.slots[0]!.answers);
  assert.ok(!text.includes("SECRET-NOTE"));
  assert.ok(!text.includes("r1"));
});

test("pickIds limits and orders the slots; unknown ids are ignored", () => {
  const items = [robotics({ id: "a", organization: "A" }), robotics({ id: "b", organization: "B" }), robotics({ id: "c", organization: "C" })];
  const plan = buildCaPagePlan(data(items), "activities", ["c", "zzz", "a"]);
  assert.deepEqual(plan.slots.map((s) => s.sourceId), ["c", "a"]);
  assert.deepEqual(buildCaPagePlan(data(items), "activities").slots.map((s) => s.sourceId), ["a", "b", "c"]);
  assert.deepEqual(buildCaPagePlan(data(items), "activities", []).slots, []);
});

test("honors: title, grade level and level(s) of recognition in the portal's words", () => {
  const honor: CaHonor = { ...newCaHonor(), id: "h1", title: "National Merit", grades: ["11", "12", "PG"], levels: ["national", "school"] };
  const plan = buildCaPagePlan(data([], [honor]), "honors");
  assert.equal(plan.blocked.length + plan.blanks.length, 0);
  const slot = plan.slots[0]!;
  assert.equal(slot.label, "National Merit");
  assert.deepEqual(slot.answers, [
    { question: "title", kind: "text", value: "National Merit" },
    { question: "Grade level", kind: "checks", value: ["11", "12", "Post-graduate"] },
    { question: "Level(s) of recognition", kind: "checks", value: ["School", "National"] },
  ]);
});

test("honors: a missing level is a blank; a 101-character title is blocked", () => {
  const noLevel: CaHonor = { ...newCaHonor(), id: "h2", title: "Dean list", grades: ["9"], levels: [] };
  const p1 = buildCaPagePlan(data([], [noLevel]), "honors");
  assert.equal(p1.slots.length, 1);
  assert.equal(answerOf(p1.slots[0]!.answers, "Level(s) of recognition").value, null);
  assert.equal(p1.blanks.length, 1);
  const longTitle: CaHonor = { ...newCaHonor(), id: "h3", title: "t".repeat(101), grades: ["9"], levels: ["school"] };
  const p2 = buildCaPagePlan(data([], [longTitle]), "honors");
  assert.equal(p2.slots.length, 0);
  assert.ok(p2.blocked[0]!.reasons.some((r) => r.includes("100")));
});

test("itemLabel: organization, else type; honors use the title", () => {
  assert.equal(itemLabel("activities", robotics()), "Team 1234");
  assert.equal(itemLabel("activities", robotics({ organization: "  " })), "Robotics");
  assert.equal(itemLabel("activities", newCaActivity()), "Untitled activity");
  assert.equal(itemLabel("honors", { ...newCaHonor(), title: "Gold medal" }), "Gold medal");
  assert.equal(itemLabel("honors", newCaHonor()), "Untitled honor");
});

test("page limits and room", () => {
  assert.deepEqual(CA_PAGE_LIMIT, { activities: 10, honors: 5 });
  assert.equal(keepRoom("activities", 10), 0);
  assert.equal(keepRoom("activities", 12), 0);
  assert.equal(keepRoom("activities", 4), 6);
  assert.equal(keepRoom("honors", 2), 3);
});

test("replacedNote text", () => {
  assert.equal(replacedNote("Common App", "activities", ["A", "B"]), "Replaced the 2 activities that were already on Common App: A, B.");
  assert.equal(replacedNote("UC", "entries", ["X"]), "Replaced the 1 entries that were already on UC: X.");
});

test("readBackMismatches reports what the portal shows against what was sent", () => {
  const plan = buildCaPagePlan(data([robotics({ id: "a" }), robotics({ id: "b" })]), "activities");
  const shownOf = (slot: (typeof plan.slots)[number]): Record<string, string | string[]> => {
    const out: Record<string, string | string[]> = {};
    for (const a of slot.answers) if (a.value !== null) out[a.question] = a.value;
    return out;
  };
  const good = plan.slots.map(shownOf);
  assert.deepEqual(readBackMismatches(plan, good), []);

  const bad = plan.slots.map(shownOf);
  bad[1] = { ...bad[1]!, "Hours spent per week": "" };
  assert.deepEqual(readBackMismatches(plan, bad), ['Activity 2: Hours spent per week shows "" (sent "10")']);

  const checks = plan.slots.map(shownOf);
  checks[0] = { ...checks[0]!, "When did you participate?": ["10th grade"] };
  assert.deepEqual(readBackMismatches(plan, checks), ['Activity 1: When did you participate? shows "10th grade" (sent "10th grade, 11th grade")']);

  const stale = plan.slots.map(shownOf);
  stale[0] = { ...stale[0]!, "Sport/team": "Soccer" };
  assert.deepEqual(readBackMismatches(plan, stale), ['Activity 1: Sport/team shows "Soccer" (sent nothing)']);

  assert.deepEqual(readBackMismatches(plan, [good[0]!]), ["Activity 2: not found on the page"]);
});

test("readBackMismatches: dates match as Month YYYY or MM/YYYY; honors say Honors N", () => {
  const pg = robotics({ grades: ["PG"], timing: null, afterStart: "2025-09", stillParticipating: true });
  const plan = buildCaPagePlan(data([pg]), "activities");
  const shown: Record<string, string | string[]> = {};
  for (const a of plan.slots[0]!.answers) if (a.value !== null) shown[a.question] = a.value;
  shown["Start date"] = "09/2025";
  assert.deepEqual(readBackMismatches(plan, [shown]), []);

  const hp = buildCaPagePlan(data([], [{ ...newCaHonor(), id: "h", title: "Award", grades: ["9"], levels: ["school"] }]), "honors");
  assert.deepEqual(readBackMismatches(hp, [{ title: "Awar", "Grade level": ["9"], "Level(s) of recognition": ["School"] }]), ['Honors 1: title shows "Awar" (sent "Award")']);
});
