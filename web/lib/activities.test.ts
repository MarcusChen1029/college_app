import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_ACTIVITIES, move, newCaActivity, newCaHonor, ucDraftsFromCommonApp, type ActivityData } from "./activities.ts";

const data = (): ActivityData => ({
  commonApp: {
    activities: [
      { ...newCaActivity(), type: "Robotics", position: "Captain", organization: "FRC Team 1234", description: "Led 30 students.", grades: ["10", "11"], hoursPerWeek: 10, weeksPerYear: 30 },
      { ...newCaActivity(), type: "Work (Paid)", position: "Cashier", organization: "Corner Cafe", description: "Weekend shifts." },
      newCaActivity(), // blank slot: not copied
    ],
    honors: [{ ...newCaHonor(), title: "AIME Qualifier", grades: ["11"], levels: ["school", "national"] }],
  },
  uc: [],
});

test("Common App items become UC drafts in the matching category", () => {
  const drafts = ucDraftsFromCommonApp(data());
  assert.deepEqual(
    drafts.map((d) => [d.category, d.name]),
    [
      ["extracurricular", "FRC Team 1234"],
      ["work", "Cashier"],
      ["award", "AIME Qualifier"],
    ],
  );
  assert.equal(drafts[0].description, "Captain — Led 30 students.");
  assert.equal(drafts[1].organization, "Corner Cafe");
  assert.equal(drafts[2].awardLevel, "national"); // highest level ticked
});

test("already-copied items are not copied again", () => {
  const d = data();
  d.uc = ucDraftsFromCommonApp(d);
  assert.equal(ucDraftsFromCommonApp(d).length, 0);
  assert.equal(ucDraftsFromCommonApp(EMPTY_ACTIVITIES).length, 0);
});

test("move swaps neighbours and stops at the ends", () => {
  assert.deepEqual(move([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(move([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(move([1, 2, 3], 2, 1), [1, 2, 3]);
});
