import assert from "node:assert/strict";
import { test } from "node:test";
import { planImport, planMigration, plaintextIn, sealOnce, verifiedCopies, withoutPasswordsAt, type PlainValue, type VaultReader } from "./portal-migrate.ts";
import { PASSWORD_MAX } from "./portal-slots.ts";
import { openPassword, sealedWithKey, sealPassword } from "./portal-vault.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const INST = "33333333-3333-4333-8333-333333333333";
const ROW = "44444444-4444-4444-8444-444444444444";
const CUSTOM_ROW = "55555555-5555-4555-8555-555555555555";
const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);
const reader: VaultReader = { open: (slot, sealed) => openPassword(key, USER, slot, sealed), ours: (sealed) => sealedWithKey(key, sealed) };
const seal = (slot: string, value: string, k = key) => sealPassword(k, USER, slot, value);
// One of ours whose body was changed: names our key id but no longer opens.
const tampered = (slot: string, value: string) => {
  const s = seal(slot, value);
  const cut = s.lastIndexOf(".") + 1;
  const b = Buffer.from(s.slice(cut), "base64url");
  b[b.length - 1] ^= 1;
  return s.slice(0, cut) + b.toString("base64url");
};

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

test("planMigration keeps a row only when it opens to the SAME value; a different value fails (F5)", () => {
  const plain = plaintextIn(colleges, portals);
  const vault = [
    { slot: "system:commonapp", sealed: seal("system:commonapp", "ca-pw") }, // same value: keep, plaintext may go
    { slot: `college:${INST}`, sealed: seal(`college:${INST}`, "a different value") }, // differs: no silent choice
  ];
  const plan = planMigration(plain, vault, reader);
  assert.deepEqual(plan.keep.map((v) => v.slot), ["system:commonapp"]);
  assert.ok(plan.failed.some((v) => v.slot === `college:${INST}`), "a differing stored value leaves the plaintext alone");
  assert.ok(!plan.seal.some((v) => v.slot === `college:${INST}`), "and is not overwritten");
  assert.deepEqual(plan.seal.map((v) => v.slot), [`college:${CUSTOM_ROW}`, "campus:uc:UCLA", "custom:abc-1"]);
});

test("a row sealed under another key is never kept, overwritten or used to strip; one of ours that doesn't open is replaced", () => {
  const plain = plaintextIn([], { systems: { commonapp: { password: "ca-pw" }, ucas: { password: "uk-pw" } } });
  const vault = [
    { slot: "system:commonapp", sealed: seal("system:commonapp", "ca-pw", otherKey) }, // foreign (another deployment's key)
    { slot: "system:ucas", sealed: tampered("system:ucas", "uk-pw") }, // ours but broken
  ];
  const plan = planMigration(plain, vault, reader);
  assert.deepEqual(plan.failed.map((v) => v.slot), ["system:commonapp"]);
  assert.deepEqual(plan.seal.map((v) => v.slot), ["system:ucas"]);
  assert.deepEqual(plan.keep, []);
});

test("the cap: an unreadable row of ours needs no room; new slots past it fail", () => {
  const plain = plaintextIn(colleges, { campuses: { "uc:UCLA": { password: "ucla-pw" } }, custom: [{ id: "abc-1", password: "c-pw" }] });
  const vault = [{ slot: "campus:uc:UCLA", sealed: tampered("campus:uc:UCLA", "ucla-pw") }];
  const tight = planMigration(plain, vault, reader, 1);
  assert.deepEqual(tight.seal.map((v) => v.slot), [`college:${INST}`, "campus:uc:UCLA"]);
  assert.deepEqual(tight.failed.map((v) => v.slot), [`college:${CUSTOM_ROW}`, "custom:abc-1"]);
});

test("two different values for one slot are both left alone; the same value twice is one copy", () => {
  const at = { table: "college", id: ROW } as const;
  const same: PlainValue[] = [
    { slot: "system:uc", password: "a", at },
    { slot: "system:uc", password: "a", at: { table: "profile", group: "systems", key: "uc" } },
  ];
  assert.equal(planMigration(same, [], reader).seal.length, 2);
  assert.deepEqual(sealOnce(planMigration(same, [], reader).seal), [{ slot: "system:uc", password: "a" }]);
  const clash: PlainValue[] = [same[0], { ...same[1], password: "b" }];
  const plan = planMigration(clash, [], reader);
  assert.deepEqual([plan.seal.length, plan.failed.length], [1, 1]);
});

test("only a read-back row that opens to the same value counts as copied", () => {
  const plan = planMigration(plaintextIn(colleges, {}), [], reader);
  const readBack = new Map([
    [`college:${INST}`, seal(`college:${INST}`, "college-pw")],
    [`college:${CUSTOM_ROW}`, seal(`college:${CUSTOM_ROW}`, "something else")], // wrong value
  ]);
  assert.deepEqual(verifiedCopies(plan.seal, readBack, reader.open).map((v) => v.password), ["college-pw"]);
  assert.deepEqual(verifiedCopies(plan.seal, new Map(), reader.open), [], "nothing read back = nothing removed");
  assert.deepEqual(verifiedCopies(plan.seal, new Map([[`college:${INST}`, seal(`college:${INST}`, "college-pw", otherKey)]]), reader.open), []);
});

test("withoutPasswordsAt removes a password only where it was copied and still equals the copied value (F7)", () => {
  const out = withoutPasswordsAt(portals, [
    { at: { table: "profile", group: "systems", key: "commonapp" }, password: "ca-pw" },
    { at: { table: "profile", group: "campuses", key: "uc:UCLA" }, password: "not what is stored" },
    { at: { table: "profile", group: "custom", id: "abc-1" }, password: "c-pw" },
    { at: { table: "college", id: ROW }, password: "college-pw" },
  ]) as typeof portals;
  assert.deepEqual(out.systems.commonapp, { url: "", username: "ca" });
  assert.deepEqual(out.systems["Bad Key"], { password: "x" }, "an uncopied one stays");
  assert.deepEqual(out.campuses["uc:UCLA"], { username: "b", password: "ucla-pw" }, "a value that changed since stays");
  assert.deepEqual(out.custom[0], { id: "abc-1", name: "Housing" });
  assert.deepEqual(out.custom[1], { name: "no id", password: "lost" });
  assert.deepEqual(out.progress, portals.progress);
  assert.equal(portals.systems.commonapp.password, "ca-pw", "the input is not changed");
  assert.equal(withoutPasswordsAt(null, []), null);

  // Two custom entries sharing an id: only the copied value goes; the other one stays for a person.
  const dup = { custom: [{ id: "c", password: "first" }, { id: "c", password: "second" }] };
  const plan = planMigration(plaintextIn([], dup), [], reader);
  assert.deepEqual([plan.seal.length, plan.failed.length], [1, 1]);
  assert.deepEqual(withoutPasswordsAt(dup, plan.seal), { custom: [{ id: "c" }, { id: "c", password: "second" }] });
});

test("import: the account's row wins only if it holds the same value; a different or foreign row keeps the browser's copy; past the cap fails", () => {
  const vault = [
    { slot: "system:commonapp", sealed: seal("system:commonapp", "same") },
    { slot: "system:uc", sealed: seal("system:uc", "account-value") },
    { slot: "system:ucas", sealed: tampered("system:ucas", "x") },
    { slot: "system:act", sealed: seal("system:act", "x", otherKey) },
  ];
  const entries = [
    { slot: "system:commonapp", password: "same" },
    { slot: "system:uc", password: "local-value" },
    { slot: "system:ucas", password: "local-ucas" },
    { slot: "system:act", password: "local-act" },
    { slot: "custom:a", password: "1" },
    { slot: "custom:b", password: "2" },
  ];
  const plan = planImport(entries, vault, reader, 1);
  assert.deepEqual(plan.keep.map((e) => e.slot), ["system:commonapp"]);
  assert.deepEqual(plan.seal.map((e) => e.slot), ["system:ucas", "custom:a"]);
  assert.deepEqual(plan.failed.map((e) => e.slot), ["system:uc", "system:act", "custom:b"], "the browser keeps these");
  assert.deepEqual(planImport(entries, vault, reader, 0).failed.map((e) => e.slot), ["system:uc", "system:act", "custom:a", "custom:b"]);
});
