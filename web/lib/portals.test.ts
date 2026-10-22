import assert from "node:assert/strict";
import { test } from "node:test";
import { ANY_SYSTEMS, campusesOf, campusKey, EMPTY_LOGIN, hiddenLoginCount, openUrl, regionOfCollege, savedCount, SYSTEMS, systemsForRegion } from "./portals.ts";

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

test("every system has a region", () => {
  for (const s of SYSTEMS) assert.ok(["US", "GB", "CA", "AU", "ANY"].includes(s.region), `${s.key} has region ${String(s.region)}`);
});

test("the original system keys still exist with their original region", () => {
  const us = ["commonapp", "uc", "applytexas", "calstate", "coalition", "stars", "collegeboard", "act", "css", "fafsa"];
  const any = ["toefl", "ielts", "duolingo"];
  for (const key of us) assert.equal(SYSTEMS.find((s) => s.key === key)?.region, "US", key);
  for (const key of any) assert.equal(SYSTEMS.find((s) => s.key === key)?.region, "ANY", key);
});

test("every country has systems, and the application ones are always listed", () => {
  for (const r of ["US", "GB", "CA", "AU"] as const) {
    assert.ok(systemsForRegion(r).length > 0, r);
    assert.ok(systemsForRegion(r).some((s) => s.group === "application"), `${r} application`);
  }
  assert.deepEqual(ANY_SYSTEMS.map((s) => s.key).sort(), systemsForRegion("ANY").map((s) => s.key).sort());
  assert.ok(["toefl", "ielts", "duolingo"].every((k) => ANY_SYSTEMS.some((s) => s.key === k)));
});

test("every link is https", () => {
  for (const s of SYSTEMS) if (s.url !== null) assert.ok(s.url.startsWith("https://"), s.key);
});

test("a college with no country_code is a US college", () => {
  assert.equal(regionOfCollege({}), "US");
  assert.equal(regionOfCollege({ country_code: null }), "US");
  assert.equal(regionOfCollege({ country_code: "GB" }), "GB");
});

test("hidden logins count only saved logins for countries not being applied to", () => {
  const login = { ...EMPTY_LOGIN, username: "me@x.com" };
  const data = {
    systems: { commonapp: login, ucas: login, ouac: EMPTY_LOGIN, toefl: login, unknown: login },
    campuses: { [campusKey("uc", "UCLA")]: login },
    custom: [
      { ...EMPTY_LOGIN, id: "1", name: "Old", username: "a" },
      { ...EMPTY_LOGIN, id: "2", name: "UK housing", username: "b", region: "GB" as const },
      { ...EMPTY_LOGIN, id: "3", name: "Blank", region: "GB" as const },
    ],
  };
  assert.equal(hiddenLoginCount(data, ["US", "GB", "CA", "AU"]), 0);
  // Applying to the UK only: Common App and the UC campus are hidden; UCAS, TOEFL, unregioned and unknown are not.
  assert.equal(hiddenLoginCount(data, ["GB"]), 2);
  // Applying to the US only: UCAS and the UK custom portal are hidden.
  assert.equal(hiddenLoginCount(data, ["US"]), 2);
  assert.equal(hiddenLoginCount({}, ["US"]), 0);
});
