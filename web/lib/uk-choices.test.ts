import assert from "node:assert/strict";
import { test } from "node:test";
import { OXBRIDGE_RULE_SOURCE, UCAS_MAX_CHOICES, ukChoiceWarnings } from "./uk-choices.ts";
import type { Status } from "./student-rows.ts";

const gb = (slug: string, status: Status = "planning", custom: object | null = null) => ({ slug, status, custom }) as never;
const UK = (slug: string) => (slug.startsWith("us-") ? "US" : "GB") as never;
const lookup = { countryOf: UK };
const uk = (n: number, status: Status = "planning") => Array.from({ length: n }, (_, i) => gb(`uk-${i}`, status));

test("limit is 5", () => {
  assert.equal(UCAS_MAX_CHOICES, 5);
});

test("five active UK choices is fine, six warns", () => {
  assert.deepEqual(ukChoiceWarnings(uk(5), lookup), []);
  assert.deepEqual(ukChoiceWarnings(uk(6), lookup), [{ kind: "too_many", count: 6 }]);
});

test("researching, withdrawn, custom and US entries don't count", () => {
  const list = [
    ...uk(5),
    gb("uk-r", "researching"),
    gb("uk-w", "withdrawn"),
    gb("uk-c", "planning", { name: "Mine" }),
    gb("us-1", "in_progress"),
  ];
  assert.deepEqual(ukChoiceWarnings(list, lookup), []);
});

test("rejected counts", () => {
  assert.deepEqual(ukChoiceWarnings([...uk(5), gb("uk-x", "rejected")], lookup), [{ kind: "too_many", count: 6 }]);
});

test("oxbridge", { skip: OXBRIDGE_RULE_SOURCE === null }, () => {
  assert.deepEqual(ukChoiceWarnings([gb("oxford"), gb("cambridge", "in_progress")], lookup), [{ kind: "oxbridge" }]);
  assert.deepEqual(ukChoiceWarnings([gb("oxford"), gb("cambridge", "withdrawn")], lookup), []);
  assert.deepEqual(ukChoiceWarnings([gb("oxford"), gb("cambridge", "researching")], lookup), []);
  assert.deepEqual(ukChoiceWarnings([gb("oxford"), gb("cambridge")], lookup).length, 1);
  assert.deepEqual(ukChoiceWarnings([gb("oxford")], lookup), []);
});

test("both warnings can show together", { skip: OXBRIDGE_RULE_SOURCE === null }, () => {
  assert.deepEqual(ukChoiceWarnings([...uk(5), gb("oxford"), gb("cambridge")], lookup), [{ kind: "too_many", count: 7 }, { kind: "oxbridge" }]);
});
