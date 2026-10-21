import assert from "node:assert/strict";
import { test } from "node:test";
import { campusesOf, campusKey, EMPTY_LOGIN, openUrl, savedCount, SYSTEMS } from "./portals.ts";

const uc = SYSTEMS.find((s) => s.key === "uc")!;

test("campuses show only once added, in the system's order", () => {
  const data = { campuses: { [campusKey("uc", "UCLA")]: EMPTY_LOGIN, [campusKey("uc", "UC Berkeley")]: EMPTY_LOGIN, [campusKey("applytexas", "UT Dallas")]: EMPTY_LOGIN } };
  assert.deepEqual(campusesOf(data, uc), ["UC Berkeley", "UCLA"]);
  assert.deepEqual(campusesOf({}, uc), []);
});

test("open link prefers the student's own URL", () => {
  assert.equal(openUrl({ ...EMPTY_LOGIN, url: " https://my.example.edu " }, "https://official.example"), "https://my.example.edu");
  assert.equal(openUrl(undefined, "https://official.example"), "https://official.example");
  assert.equal(openUrl(EMPTY_LOGIN, null), "");
});

test("saved count counts logins with a username", () => {
  const data = {
    systems: { commonapp: { ...EMPTY_LOGIN, username: "me@x.com" }, uc: EMPTY_LOGIN },
    campuses: { [campusKey("uc", "UCLA")]: { ...EMPTY_LOGIN, username: "bruin" } },
    custom: [{ ...EMPTY_LOGIN, id: "1", name: "Scholarship", username: "  " }],
  };
  assert.equal(savedCount(data), 2);
});

test("system keys are unique", () => {
  assert.equal(new Set(SYSTEMS.map((s) => s.key)).size, SYSTEMS.length);
});
