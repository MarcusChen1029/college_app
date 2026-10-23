import assert from "node:assert/strict";
import { test } from "node:test";
import { PS_PROMPTS, sharedEssaysFor, togglePick, UC_PIQS } from "./personal-essays.ts";

test("one Common App school adds the personal statement; a UC school adds the UC questions", () => {
  assert.deepEqual(sharedEssaysFor([]), { commonApp: false, uc: false });
  assert.deepEqual(sharedEssaysFor([["own"], ["common_app", "coalition"]]), { commonApp: true, uc: false });
  assert.deepEqual(sharedEssaysFor([["uc_app"], undefined]), { commonApp: false, uc: true });
});

test("UC picks stop at four and can be undone", () => {
  let picks: number[] = [];
  for (const id of [5, 1, 3, 8]) picks = togglePick(picks, id)!;
  assert.deepEqual(picks, [1, 3, 5, 8]);
  assert.equal(togglePick(picks, 2), null);
  assert.deepEqual(togglePick(picks, 3), [1, 5, 8]);
});

test("prompt counts: 7 Common App, 8 UC", () => {
  assert.equal(PS_PROMPTS.length, 7);
  assert.equal(UC_PIQS.length, 8);
});
