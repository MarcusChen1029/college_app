import assert from "node:assert/strict";
import { test } from "node:test";
import { planImport, planMigration, plaintextIn, sealOnce, verifiedCopies, withoutPasswordsAt, type Opener, type PlainValue } from "./portal-migrate.ts";
import { PASSWORD_MAX } from "./portal-slots.ts";
import { openPassword, sealPassword } from "./portal-vault.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const INST = "33333333-3333-4333-8333-333333333333";
const ROW = "44444444-4444-4444-8444-444444444444";
const CUSTOM_ROW = "55555555-5555-4555-8555-555555555555";
const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);
const open: Opener = (slot, sealed) => openPassword(key, USER, slot, sealed);

const colleges = [
  { id: ROW, institution_id: INST, custom: null, portal_password: "college-pw" },
  { id: CUSTOM_ROW, institution_id: null, custom: { name: "Mine" }, portal_password: "custom-college-pw" },
  { id: "66666666-6666-4666-8666-666666666666", institution_id: INST, custom: null, portal_password: "" },
];
const portals = {
  systems: { commonapp: { url: "", username: "ca", password: "ca-pw" }, uc: { username: "u", password: "" }, "Bad Key": { password: "x" } },
  campuses: { "uc:UCLA": { username: "b", password: "ucla-pw" } },
  custom: [{ id: "abc-1", name: "Housing", password: "c-pw" }, { name: "no id", password: "lost" }, { id: "big", password: "y".repeat(PASSWORD_MAX + 1) }],
  progress: { commonapp: { done: true } },
};

test("plaintextIn finds every non-empty plaintext password and where it sits; unplaceable ones get no slot", () => {
  const found = plaintextIn(colleges, portals);
  assert.deepEqual(
    found.map((v) => [v.slot, v.password.length > 20 ? "long" : v.password, v.at]),
    [
      [`college:${INST}`, "college-pw", { table: "college", id: ROW }],
      [`college:${CUSTOM_ROW}`, "custom-college-pw", { table: "college", id: CUSTOM_ROW }],
      ["system:commonapp", "ca-pw", { table: "profile", group: "systems", key: "commonapp" }],
      [null, "x", { table: "profile", group: "systems", key: "Bad Key" }],
      ["campus:uc:UCLA", "ucla-pw", { table: "profile", group: "campuses", key: "uc:UCLA" }],
      ["custom:abc-1", "c-pw", { table: "profile", group: "custom", id: "abc-1" }],
      [null, "lost", { table: "profile", group: "custom", id: "" }],
      [null, "long", { table: "profile", group: "custom", id: "big" }],
    ],
  );
  assert.deepEqual(plaintextIn([], null), []);
  assert.deepEqual(plaintextIn([], { systems: { x: { password: 1234 } } }).map((v) => v.slot), [null], "a non-text password is never removed");
});

test("planMigration: keep a row that opens, seal a missing or unreadable one, fail what can't be placed or would pass the cap", () => {
  const plain = plaintextIn(colleges, portals);
  const vault = [
    { slot: "system:commonapp", sealed: sealPassword(key, USER, "system:commonapp", "newer-value") }, // opens: the store wins
    { slot: "campus:uc:UCLA", sealed: sealPassword(otherKey, USER, "campus:uc:UCLA", "ucla-pw") }, // another key: unreadable
  ];
  const plan = planMigration(plain, vault, open);
  assert.deepEqual(plan.keep.map((v) => v.slot), ["system:commonapp"]);
  assert.deepEqual(plan.seal.map((v) => v.slot), [`college:${INST}`, `college:${CUSTOM_ROW}`, "campus:uc:UCLA", "custom:abc-1"]);
  assert.deepEqual(plan.failed.map((v) => v.password.slice(0, 4)), ["x", "lost", "yyyy"]);

  // Room for one new slot: the unreadable UCLA row doesn't need room (it is replaced), later new slots fail.
  const tight = planMigration(plain, vault, open, 1);
  assert.deepEqual(tight.seal.map((v) => v.slot), [`college:${INST}`, "campus:uc:UCLA"]);
  assert.deepEqual(tight.failed.filter((v) => v.slot).map((v) => v.slot), [`college:${CUSTOM_ROW}`, "custom:abc-1"]);
});

test("two different values for one slot are both left alone; the same value twice is one copy", () => {
  const at = { table: "college", id: ROW } as const;
  const same: PlainValue[] = [
    { slot: "system:uc", password: "a", at },
    { slot: "system:uc", password: "a", at: { table: "profile", group: "systems", key: "uc" } },
  ];
  assert.equal(planMigration(same, [], open).seal.length, 2);
  assert.deepEqual(sealOnce(planMigration(same, [], open).seal), [{ slot: "system:uc", password: "a" }]);
  const clash: PlainValue[] = [same[0], { ...same[1], password: "b" }];
  const plan = planMigration(clash, [], open);
  assert.deepEqual([plan.seal.length, plan.failed.length], [1, 1]);
});

test("only a read-back row that opens to the same value counts as copied", () => {
  const plan = planMigration(plaintextIn(colleges, {}), [], open);
  const good = sealPassword(key, USER, `college:${INST}`, "college-pw");
  const readBack = new Map([
    [`college:${INST}`, good],
    [`college:${CUSTOM_ROW}`, sealPassword(key, USER, `college:${CUSTOM_ROW}`, "something else")], // wrong value
  ]);
  assert.deepEqual(verifiedCopies(plan.seal, readBack, open).map((v) => v.password), ["college-pw"]);
  assert.deepEqual(verifiedCopies(plan.seal, new Map(), open), [], "nothing read back = nothing removed");
  assert.deepEqual(verifiedCopies(plan.seal, new Map([[`college:${INST}`, sealPassword(otherKey, USER, `college:${INST}`, "college-pw")]]), open), []);
});

test("withoutPasswordsAt removes passwords exactly where they were copied, nothing else", () => {
  const out = withoutPasswordsAt(portals, [
    { table: "profile", group: "systems", key: "commonapp" },
    { table: "profile", group: "custom", id: "abc-1" },
    { table: "college", id: ROW },
  ]) as typeof portals;
  assert.deepEqual(out.systems.commonapp, { url: "", username: "ca" });
  assert.deepEqual(out.systems["Bad Key"], { password: "x" }, "an uncopied one stays");
  assert.deepEqual(out.campuses["uc:UCLA"], { username: "b", password: "ucla-pw" });
  assert.deepEqual(out.custom[0], { id: "abc-1", name: "Housing" });
  assert.deepEqual(out.custom[1], { name: "no id", password: "lost" });
  assert.deepEqual(out.progress, portals.progress);
  assert.equal(portals.systems.commonapp.password, "ca-pw", "the input is not changed");
  assert.equal(withoutPasswordsAt(null, []), null);
});

test("import: account rows that open win, unreadable rows are replaced, entries past the cap come back as failed", () => {
  const vault = [
    { slot: "system:commonapp", sealed: sealPassword(key, USER, "system:commonapp", "account-value") },
    { slot: "system:ucas", sealed: "v1.garbage" },
  ];
  const entries = [
    { slot: "system:commonapp", password: "local" },
    { slot: "system:ucas", password: "local-ucas" },
    { slot: "custom:a", password: "1" },
    { slot: "custom:b", password: "2" },
  ];
  const plan = planImport(entries, vault, open, 1);
  assert.deepEqual(plan.keep.map((e) => e.slot), ["system:commonapp"]);
  assert.deepEqual(plan.seal.map((e) => e.slot), ["system:ucas", "custom:a"]);
  assert.deepEqual(plan.failed.map((e) => e.slot), ["custom:b"], "past the cap: reported, so the browser keeps it");
  assert.deepEqual(planImport(entries, vault, open, 0).failed.map((e) => e.slot), ["custom:a", "custom:b"]);
});
