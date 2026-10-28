import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_LOCAL, hasLocalData, parseLocal, profileHasData, serializeLocal, type LocalData } from "./student-local.ts";

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
  assert.deepEqual(parseLocal(null), { data: EMPTY_LOCAL, passwords: [] });
  assert.deepEqual(parseLocal("{not json"), { data: EMPTY_LOCAL, passwords: [] });
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
