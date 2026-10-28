import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANY_SYSTEMS,
  campusesOf,
  campusKey,
  collegeProgressKey,
  customProgressKey,
  EMPTY_LOGIN,
  groupProgress,
  hiddenLoginCount,
  openUrl,
  progressNote,
  progressState,
  regionOfCollege,
  ROUTE_ORDER,
  routeGroups,
  savedCount,
  starsPatches,
  SYSTEMS,
  systemsForRegion,
  withoutProgress,
  withProgress,
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
  const onList = ["commonapp", "ucas"];
  assert.equal(hiddenLoginCount(data, ["US", "GB", "CA", "AU"], onList), 0);
  // Applying to the UK only: the UC campus is hidden; Common App and UCAS head My list groups, so they are not.
  assert.equal(hiddenLoginCount(data, ["GB"], onList), 1);
  // Applying to the US only: the UK custom portal is hidden (UCAS heads a My list group).
  assert.equal(hiddenLoginCount(data, ["US"], onList), 1);
  assert.equal(hiddenLoginCount({}, ["US"], []), 0);
});

// The route (My list group) of each fake college.
const ROUTES: Record<string, string> = {
  purdue: "commonapp",
  "ut-austin": "commonapp",
  "texas-am": "applytexas",
  ucla: "uc",
  oxford: "ucas",
  mit: "direct",
  weird: "not-a-route",
};
const routeOf = (slug: string) => ROUTES[slug] ?? "direct";
const item = (slug: string, custom = false) => ({ slug, ...(custom ? { custom } : {}) });

test("every application system has a kind, optional systems have none, and STARS is an add-on", () => {
  for (const s of SYSTEMS) assert.equal(s.kind !== undefined, s.group === "application", s.key);
  assert.equal(SYSTEMS.some((s) => s.key === "srar"), false);
  assert.equal(SYSTEMS.find((s) => s.key === "stars")?.kind, "addon");
  assert.equal(SYSTEMS.find((s) => s.key === "commonapp")?.kind, "route");
});

test("ROUTE_ORDER is every route system, then direct", () => {
  assert.equal(ROUTE_ORDER[ROUTE_ORDER.length - 1], "direct");
  assert.deepEqual([...ROUTE_ORDER.slice(0, -1)].sort(), SYSTEMS.filter((s) => s.kind === "route").map((s) => s.key).sort());
  assert.deepEqual(ROUTE_ORDER.slice(0, 5), ["commonapp", "coalition", "uc", "calstate", "applytexas"]);
});

test("routeGroups orders by ROUTE_ORDER and keeps list order inside a group", () => {
  const groups = routeGroups([item("oxford"), item("texas-am"), item("purdue"), item("mit"), item("ucla"), item("ut-austin")], routeOf);
  assert.deepEqual(
    groups.map((g) => [g.route, g.items.map((i) => i.slug)]),
    [
      ["commonapp", ["purdue", "ut-austin"]],
      ["uc", ["ucla"]],
      ["applytexas", ["texas-am"]],
      ["ucas", ["oxford"]],
      ["direct", ["mit"]],
    ],
  );
});

test("routeGroups puts custom colleges in direct, and unknown routes or slugs too", () => {
  const groups = routeGroups([item("purdue", true), item("weird"), item("nobody"), item("ucla")], routeOf);
  assert.deepEqual(
    groups.map((g) => [g.route, g.items.map((i) => i.slug)]),
    [
      ["uc", ["ucla"]],
      ["direct", ["purdue", "weird", "nobody"]],
    ],
  );
});

test("routeGroups omits empty routes", () => {
  assert.deepEqual(routeGroups([], routeOf), []);
  assert.deepEqual(routeGroups([item("oxford")], routeOf).map((g) => g.route), ["ucas"]);
});

test("groupProgress counts decisions as submitted", () => {
  assert.deepEqual(groupProgress(["submitted", "admitted", "in_progress"]), { submitted: 2, total: 3, done: false });
  assert.deepEqual(groupProgress(["interview", "rejected", "enrolled", "waitlisted"]), { submitted: 4, total: 4, done: true });
});

test("groupProgress done when all submitted, never when empty", () => {
  assert.deepEqual(groupProgress(["submitted"]), { submitted: 1, total: 1, done: true });
  assert.deepEqual(groupProgress([]), { submitted: 0, total: 0, done: false });
  assert.equal(groupProgress(["researching", "planning"]).done, false);
});

test("starsPatches skips ticked and non-STARS colleges", () => {
  const requires = (slug: string) => slug === "clemson" || slug === "illinois";
  const entries = [
    { slug: "clemson", checklist: { transcript: true } },
    { slug: "illinois", checklist: { stars: true } },
    { slug: "purdue", checklist: {} },
  ];
  assert.deepEqual(starsPatches(entries, requires), [{ slug: "clemson", checklist: { transcript: true, stars: true } }]);
  assert.deepEqual(starsPatches([], requires), []);
  assert.equal(entries[0].checklist.hasOwnProperty("stars"), false);
});

test("hiddenLoginCount hides a route login only when neither My list nor Portals shows it", () => {
  const login = { ...EMPTY_LOGIN, username: "me@x.com" };
  const data: PortalData = { systems: { commonapp: login, toefl: login } };
  // No Common App college on the list: the login shows on Portals under its country, so it is hidden only with that country.
  assert.equal(hiddenLoginCount(data, ["US"], ["uc"]), 0);
  assert.equal(hiddenLoginCount(data, ["GB"], ["uc"]), 1);
  // A Common App group on My list shows it whatever the regions.
  assert.equal(hiddenLoginCount(data, ["GB"], ["commonapp"]), 0);
  assert.equal(hiddenLoginCount({ systems: { commonapp: EMPTY_LOGIN } }, ["US"], []), 0);
  assert.equal(hiddenLoginCount({}, ["US"], []), 0);
});

test("progress states: missing is unmarked, and counts as not done", () => {
  const data: PortalData = { progress: { stars: { done: true }, uc: { done: false, note: "send transcript" } } };
  assert.equal(progressState(data, "stars"), "done");
  assert.equal(progressState(data, "uc"), "notDone");
  assert.equal(progressState(data, "commonapp"), "unmarked");
  assert.equal(progressNote(data, "uc"), "send transcript");
  assert.equal(progressNote(data, "stars"), "");
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
