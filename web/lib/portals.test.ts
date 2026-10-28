import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANY_SYSTEMS,
  campusesOf,
  campusKey,
  collegeProgressKey,
  customProgressKey,
  EMPTY_LOGIN,
  hasSavedFor,
  hiddenLoginCount,
  mainRoute,
  neededSystems,
  openUrl,
  progressCounts,
  progressNote,
  progressState,
  regionOfCollege,
  savedCount,
  SYSTEMS,
  systemShown,
  systemsForRegion,
  withoutProgress,
  withProgress,
  type ListedCollege,
  type PortalData,
} from "./portals.ts";

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

// Which systems each fake college accepts.
const ACCEPTS: Record<string, string[]> = {
  purdue: ["commonapp"],
  "ut-austin": ["commonapp", "applytexas"],
  "texas-am": ["applytexas"],
  ucla: ["uc"],
  clemson: ["commonapp", "stars"],
  illinois: ["commonapp", "stars"],
  oxford: ["ucas"],
  mit: [],
};
const systemsOf = (slug: string) => ACCEPTS[slug] ?? [];
const college = (slug: string, name = slug, custom = false): ListedCollege => ({ slug, name, ...(custom ? { custom } : {}) });

test("every application system has a kind, optional systems have none, and STARS is an add-on", () => {
  for (const s of SYSTEMS) assert.equal(s.kind !== undefined, s.group === "application", s.key);
  assert.equal(SYSTEMS.some((s) => s.key === "srar"), false);
  assert.equal(SYSTEMS.find((s) => s.key === "stars")?.kind, "addon");
  assert.equal(SYSTEMS.find((s) => s.key === "commonapp")?.kind, "route");
});

test("an add-on is needed whenever a listed college uses it, on top of its route", () => {
  const needed = neededSystems({}, [college("clemson", "Clemson"), college("illinois", "Illinois")], systemsOf);
  assert.deepEqual(needed, { stars: ["Clemson", "Illinois"], commonapp: ["Clemson", "Illinois"] });
});

test("Common App wins over ApplyTexas when a college accepts both", () => {
  assert.equal(mainRoute(["applytexas", "commonapp"]), "commonapp");
  assert.deepEqual(neededSystems({}, [college("ut-austin", "UT Austin")], systemsOf), { commonapp: ["UT Austin"] });
  // A route-only Texas college still needs ApplyTexas; Coalition comes last.
  assert.deepEqual(neededSystems({}, [college("texas-am", "Texas A&M")], systemsOf), { applytexas: ["Texas A&M"] });
  assert.equal(mainRoute(["coalition", "commonapp"]), "commonapp");
  assert.equal(mainRoute(["coalition", "applytexas"]), "applytexas");
  assert.equal(mainRoute(["stars", "coalition"]), "coalition");
  assert.equal(mainRoute(["stars"]), null);
  assert.equal(mainRoute([]), null);
});

test("a route the student already has saved also counts for the colleges that accept it", () => {
  const colleges = [college("ut-austin", "UT Austin"), college("purdue", "Purdue")];
  assert.deepEqual(neededSystems({}, colleges, systemsOf), { commonapp: ["UT Austin", "Purdue"] });
  const withLogin: PortalData = { systems: { applytexas: EMPTY_LOGIN } };
  assert.deepEqual(neededSystems(withLogin, colleges, systemsOf), { commonapp: ["UT Austin", "Purdue"], applytexas: ["UT Austin"] });
  const marked: PortalData = { progress: { applytexas: { done: true } } };
  assert.deepEqual(neededSystems(marked, colleges, systemsOf).applytexas, ["UT Austin"]);
});

test("a college that only takes its own application adds nothing, and custom colleges add nothing", () => {
  assert.deepEqual(neededSystems({}, [college("mit"), college("unknown-slug"), college("custom-1", "My college", true), college("ucla", "UCLA", true)], systemsOf), {});
  assert.deepEqual(neededSystems({}, [], systemsOf), {});
});

test("unknown system keys in the data are ignored", () => {
  assert.deepEqual(neededSystems({}, [college("x")], () => ["nope", "ucas"]), { ucas: ["x"] });
});

test("a system saved but not needed is still shown; a needed one is shown without anything saved", () => {
  const needed = neededSystems({}, [college("oxford", "Oxford")], systemsOf);
  assert.equal(systemShown({}, needed, "ucas"), true);
  assert.equal(systemShown({}, needed, "commonapp"), false);
  assert.equal(systemShown({ systems: { commonapp: EMPTY_LOGIN } }, needed, "commonapp"), true);
  assert.equal(systemShown({ progress: { commonapp: { done: false } } }, needed, "commonapp"), true);
  assert.equal(systemShown({ campuses: { [campusKey("uc", "UCLA")]: EMPTY_LOGIN } }, needed, "uc"), true);
  assert.equal(systemShown({ progress: { [campusKey("uc", "UCLA")]: { done: true } } }, needed, "uc"), true);
  assert.equal(hasSavedFor({ systems: { uc: EMPTY_LOGIN } }, "ucas"), false);
  assert.equal(hasSavedFor({}, "uc"), false);
});

test("progress states: missing is unmarked, and counts as not done", () => {
  const data: PortalData = { progress: { stars: { done: true }, uc: { done: false, note: "send transcript" } } };
  assert.equal(progressState(data, "stars"), "done");
  assert.equal(progressState(data, "uc"), "notDone");
  assert.equal(progressState(data, "commonapp"), "unmarked");
  assert.equal(progressNote(data, "uc"), "send transcript");
  assert.equal(progressNote(data, "stars"), "");
  assert.deepEqual(progressCounts(data, ["stars", "uc", "commonapp"]), { done: 1, total: 3 });
  assert.deepEqual(progressCounts({}, ["a", "b", "a"]), { done: 0, total: 2 });
  assert.deepEqual(progressCounts(data, []), { done: 0, total: 0 });
});

test("progress keys: system, campus, custom portal, submitted college", () => {
  assert.equal(customProgressKey("abc"), "custom:abc");
  assert.equal(collegeProgressKey("purdue"), "college:purdue");
  assert.equal(campusKey("uc", "UCLA"), "uc:UCLA");
});

test("withProgress sets done and note, trims, drops a blank note, keeps the note when ticked done, and does not mutate", () => {
  const start: PortalData = { systems: { uc: EMPTY_LOGIN } };
  const a = withProgress(start, "uc", { done: false, note: "  essays left " });
  assert.deepEqual(a.progress, { uc: { done: false, note: "essays left" } });
  assert.deepEqual(a.systems, start.systems);
  assert.equal(start.progress, undefined);
  const b = withProgress(a, "uc", { done: true });
  assert.deepEqual(b.progress, { uc: { done: true, note: "essays left" } });
  const c = withProgress(b, "uc", { note: "   " });
  assert.deepEqual(c.progress, { uc: { done: true } });
  assert.deepEqual(withProgress({}, "stars", { note: "x" }).progress, { stars: { done: false, note: "x" } });
});

test("withoutProgress removes only the named keys and returns the same object when nothing matches", () => {
  const data: PortalData = { progress: { stars: { done: true }, "custom:1": { done: false }, "uc:UCLA": { done: true } } };
  assert.deepEqual(withoutProgress(data, ["custom:1", "uc:UCLA"]).progress, { stars: { done: true } });
  assert.equal(withoutProgress(data, ["nothing"]), data);
  assert.equal(withoutProgress({}, ["x"]).progress, undefined);
  assert.equal(data.progress!["custom:1"].done, false);
});
