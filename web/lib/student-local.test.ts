import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_LOCAL, fillMissingProfile, hasLocalData, localWrites, parseLegacy, parseLocal, parseMove, profileHasData, serializeLocal, serializeMove, type LocalData } from "./student-local.ts";

const INST = "33333333-3333-4333-8333-333333333333";

// A copy shaped like what an older build stored, passwords included.
const OLD_COPY = JSON.stringify({
  profile: {
    sat: 1400,
    portals: {
      systems: { commonapp: { url: "", username: "me@x.com", password: "ca-secret" } },
      campuses: { "uc:UCLA": { url: "", username: "bruin", password: "ucla-secret" } },
      custom: [{ id: "abc-1", name: "Housing", url: "", username: "", password: "custom-secret" }],
    },
  },
  list: [
    { slug: "purdue", institutionId: INST, plan: null, status: "in_progress", notes: "", checklist: {}, portal: { url: "u", username: "kid", password: "college-secret" }, addedAt: "2026-10-01" },
    { slug: "old-v1" }, // v1 entry: no institutionId, checklist or portal yet
  ],
  recommenders: [{ id: "r1" }],
});

test("parseLocal hands back old passwords separately and leaves none in the data", () => {
  const { data, passwords } = parseLocal(OLD_COPY);
  assert.deepEqual(passwords, [
    { slot: "system:commonapp", password: "ca-secret" },
    { slot: "campus:uc:UCLA", password: "ucla-secret" },
    { slot: "custom:abc-1", password: "custom-secret" },
    { slot: `college:${INST}`, password: "college-secret" },
  ]);
  assert.ok(!JSON.stringify(data).includes("secret"));
  assert.ok(!JSON.stringify(data).includes("password"));
  assert.equal(data.profile.sat, 1400);
  assert.equal(data.profile.portals?.systems?.commonapp.username, "me@x.com");
  assert.deepEqual(data.list[0].portal, { url: "u", username: "kid" });
  assert.deepEqual(data.list[1], { slug: "old-v1", checklist: {}, institutionId: "", portal: { url: "", username: "" } });
  assert.deepEqual(data.recommenders, [{ id: "r1" }]);
});

test("the localStorage writer never contains a password, even when the state in memory still has one", () => {
  const leaky = {
    ...EMPTY_LOCAL,
    profile: { portals: { systems: { commonapp: { url: "", username: "me", password: "ca-secret" } }, custom: [{ id: "c", name: "", url: "", username: "", password: "custom-secret" }] } },
    list: [{ slug: "purdue", institutionId: INST, plan: null, status: "in_progress", notes: "", checklist: {}, portal: { url: "", username: "kid", password: "college-secret" }, addedAt: "" }],
  } as unknown as LocalData;
  const json = serializeLocal(leaky);
  assert.ok(!json.includes("secret"));
  assert.ok(!json.includes("password"));
  // What was written reads back with nothing to import, and stays stable once normalized (so an unchanged state isn't rewritten).
  const back = parseLocal(json);
  assert.deepEqual(back.passwords, []);
  const once = serializeLocal(back.data);
  assert.equal(serializeLocal(parseLocal(once).data), once);
  // An old copy, once re-serialized, holds no password either.
  assert.ok(!serializeLocal(parseLocal(OLD_COPY).data).includes("secret"));
});

test("unreadable or empty copies give empty data", () => {
  assert.deepEqual(parseLocal(null), { data: EMPTY_LOCAL, passwords: [], inCopy: false });
  assert.deepEqual(parseLocal("{not json"), { data: EMPTY_LOCAL, passwords: [], inCopy: false });
  assert.deepEqual(parseLocal('{"profile":[1],"list":"x"}').data.profile, {});
});

test("what counts as data worth offering to an account at sign-in", () => {
  assert.equal(hasLocalData(EMPTY_LOCAL, []), false);
  assert.equal(hasLocalData({ ...EMPTY_LOCAL, profile: { targetRegions: [], tests: {}, international: false, sat: null } }, []), false);
  assert.equal(hasLocalData(EMPTY_LOCAL, [{ slot: "system:uc", password: "x" }]), true);
  assert.equal(hasLocalData(parseLocal(OLD_COPY).data, []), true);
  assert.equal(profileHasData({ sat: 1300 }), true);
  assert.equal(profileHasData({ portals: {} }), false);
});

test("saving keeps an older build's passwords in the browser (under their own key) and never adds a new one", () => {
  // Load an old copy, then the student changes something while signed out (here: removes a college).
  const first = parseLocal(OLD_COPY);
  assert.equal(first.inCopy, true, "the copy still embeds them: the store rewrites it on the next save");
  const changed = { ...first.data, list: first.data.list.slice(1) };
  // A stale in-memory login with a password the browser never stored must not be written either.
  (changed.profile.portals!.systems!.commonapp as Record<string, unknown>).password = "TYPED-IN-MEMORY";
  const w = localWrites(changed, first.passwords);
  assert.ok(!w.copy.includes("secret") && !w.copy.includes("password") && !w.copy.includes("TYPED"));
  assert.ok(w.legacy && !w.legacy.includes("TYPED"));
  // Reload (as after the Google sign-in redirect): every old password is still there, by slot.
  const after = parseLocal(w.copy, w.legacy);
  assert.deepEqual(after.passwords, first.passwords);
  assert.equal(after.inCopy, false);
  assert.equal(after.data.list.length, 1);
  // Once imported or removed, the store writes none, and the key goes.
  assert.equal(localWrites(changed, []).legacy, null);
});

test("passwords under the legacy key and inside the copy are merged by slot; malformed entries are dropped", () => {
  const legacy = JSON.stringify([
    { slot: "system:commonapp", password: "dup-ignored" },
    { slot: "custom:zz", password: "only-in-key" },
    { slot: "bad slot", password: "x" },
    { slot: "custom:empty", password: "" },
  ]);
  const { passwords } = parseLocal(OLD_COPY, legacy);
  assert.deepEqual(passwords.map((p) => p.slot), ["system:commonapp", "campus:uc:UCLA", "custom:abc-1", `college:${INST}`, "custom:zz"]);
  assert.equal(passwords[0].password, "ca-secret", "the copy's value comes first");
  assert.deepEqual(parseLegacy("not json"), []);
  assert.deepEqual(parseLocal(null, legacy).passwords.map((p) => p.slot), ["system:commonapp", "custom:zz"]);
});

test("the agreement to move passwords is stored by slot only and read back defensively", () => {
  const raw = serializeMove({ userId: "u-1", slots: ["system:uc", "custom:abc-1"] });
  assert.ok(raw && !raw.includes("password"));
  assert.deepEqual(parseMove(raw), { userId: "u-1", slots: ["system:uc", "custom:abc-1"] });
  assert.equal(serializeMove(null), null);
  assert.equal(serializeMove({ userId: "u-1", slots: [] }), null);
  // invalid and repeated slots are dropped; nothing valid left = no agreement
  assert.deepEqual(parseMove(JSON.stringify({ userId: "u-1", slots: ["system:uc", "bad slot", 7, "system:uc", null] })), { userId: "u-1", slots: ["system:uc"] });
  assert.equal(parseMove(JSON.stringify({ userId: "u-1", slots: ["bad slot"] })), null);
  for (const bad of [null, "", "not json", "[]", "null", "7", JSON.stringify({ slots: ["system:uc"] }), JSON.stringify({ userId: "", slots: ["system:uc"] }), JSON.stringify({ userId: "u-1", slots: "system:uc" }), JSON.stringify({ userId: 5, slots: ["system:uc"] })])
    assert.equal(parseMove(bad), null, String(bad));
});

test("adding a browser's profile to an existing account fills only what the account lacks", () => {
  const account = { sat: 1400, act: null, gpa: 3.9, interested: [], tests: {}, international: false, portals: { systems: {} } };
  const local = { sat: 1200, act: 30, gpa: 3.5, interested: ["mit"], tests: { toefl: { total: 100 } }, international: true, studyFields: ["cs"], portals: { custom: [] } };
  assert.deepEqual(fillMissingProfile(account as never, local as never), {
    sat: 1400,
    act: 30,
    gpa: 3.9,
    interested: ["mit"],
    tests: { toefl: { total: 100 } },
    international: false,
    portals: { systems: {} },
    studyFields: ["cs"],
  });
});
