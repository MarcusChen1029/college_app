import assert from "node:assert/strict";
import { test } from "node:test";
import { IMPORT_MAX } from "./portal-slots.ts";
import { handleVault, slotKind, type SlotState, type VaultDeps } from "./portal-vault-handler.ts";
import { sealE1, type Secret } from "./vault-crypto.ts";
import {
  changePassphrase as rawChangePassphrase,
  commitRecoveryCode as rawCommitRecoveryCode,
  commitVault as rawCommitVault,
  fetchVault,
  importAll as rawImportAll,
  listSlots,
  prepareRecoveryCode as rawPrepareRecoveryCode,
  prepareVault as rawPrepareVault,
  resetAll,
  revealOne,
  saveOne as rawSaveOne,
  unlockWith as rawUnlockWith,
  type Call,
  type FlowError,
  type Prepared,
  type ServerVault,
} from "./vault-flows.ts";
import { formatRecoveryCode, normalizeRecoveryCode, parseVaultRecord, recoveryGroup, type VaultRecord } from "./vault-format.ts";

// Every flow runs against the real handleVault (and so the real request parser) over an in-memory store that follows
// migration 0047. Each call goes through a JSON round trip both ways, like the HTTP route would.
//
// Secrets: every passphrase, recovery code and plaintext password a test hands to a flow is noted by the wrappers below,
// and flowTest checks after EVERY test that none of them appears in any request body that test sent (replies from the
// server to the browser are not requests and are not checked). Notes shorter than 8 characters are
// refused, because a short secret would match inside base64 by chance and make the check flaky or meaningless.

const USER = "11111111-1111-4111-8111-111111111111";
const jwt = (claims: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const WEBSITE = jwt({ sub: USER, role: "authenticated" });
const MAX_SLOTS = 500; // MAX_SLOTS_PER_USER in portal-vault-server.ts, 500 in portal_vault_put

let sentBodies: string[] = []; // every request body any tab sent during the running test
let secrets = new Set<string>();

function known(...values: string[]) {
  for (const v of values) {
    if (v === "") continue;
    assert.ok(v.length >= 8, `a secret shorter than 8 characters would match by chance: "${v}"`);
    secrets.add(v);
    secrets.add(JSON.stringify(v).slice(1, -1)); // and as JSON writes it
  }
}

function knownCode(code: string) {
  known(code);
  const plain = normalizeRecoveryCode(code);
  if (plain) known(plain, formatRecoveryCode(plain));
}

function knownSecret(s: Secret) {
  if ("recovery" in s) knownCode(s.recovery);
  else known(s.passphrase);
}

function flowTest(name: string, fn: () => Promise<void>) {
  test(name, async () => {
    sentBodies = [];
    secrets = new Set();
    await fn();
    for (const body of sentBodies)
      for (const s of secrets) assert.ok(!body.includes(s), `a request body contains the secret "${s.slice(0, 12)}...": ${body.slice(0, 100)}`);
  });
}

type Row = { sealed: string; updated_at: string };
type StoredVault = VaultRecord & { updated_at: string };
type Reply = { status: number; data: Record<string, unknown> };

class MemoryServer {
  vault: StoredVault | null = null;
  rows = new Map<string, Row>();
  created = 0; // vault rows actually inserted
  updates = 0; // vault_update writes that took effect
  private tick = 0;

  /** Strictly increasing, microsecond-looking timestamps, so compare-and-set has something real to compare. */
  stamp(): string {
    return `2026-10-29T08:00:00.${String(++this.tick).padStart(6, "0")}+00:00`;
  }

  private mine(userId: string) {
    assert.equal(userId, USER);
  }

  deps: VaultDeps = {
    verifyUser: async (token) => (token === WEBSITE ? USER : null),
    vault: async (userId) => {
      this.mine(userId);
      if (!this.vault) return null;
      // Like readVault in portal-vault-server.ts: a stored row that doesn't parse is a server error, never a reply.
      const { updated_at, ...rest } = this.vault;
      const record = parseVaultRecord(rest);
      if (!record) throw new Error("portal_vaults row malformed");
      return { ...record, updated_at };
    },
    createVault: async (userId, r) => {
      this.mine(userId);
      if (this.vault) return "exists";
      if ([...this.rows.values()].some((row) => row.sealed.startsWith("e1."))) return "orphans";
      this.vault = { ...r, updated_at: this.stamp() };
      this.created++;
      return "ok";
    },
    updateVault: async (userId, r, expected) => {
      this.mine(userId);
      if (!this.vault) return "no_vault";
      if (this.vault.key_id !== r.key_id) return "wrong_vault";
      if (this.vault.updated_at !== expected) return "changed";
      const updated_at = this.stamp();
      this.vault = { ...r, updated_at };
      this.updates++;
      return { updated_at };
    },
    list: async (userId) => {
      this.mine(userId);
      const keyId = this.vault?.key_id ?? null;
      return [...this.rows].map(([slot, row]) => ({ slot, kind: slotKind(row.sealed, keyId), updated_at: row.updated_at }));
    },
    get: async (userId, slot) => {
      this.mine(userId);
      return this.rows.get(slot)?.sealed ?? null;
    },
    put: async (userId, e, expected, insertOnly) => {
      this.mine(userId);
      if (!this.vault) return "no_vault";
      if (!e.sealed.startsWith("e1.") || e.sealed.split(".")[1] !== this.vault.key_id) return "wrong_vault";
      const row = this.rows.get(e.slot);
      if (expected !== null) {
        if (!row || row.updated_at !== expected) return "changed";
        this.rows.set(e.slot, { sealed: e.sealed, updated_at: this.stamp() });
        return "ok";
      }
      if (!row && this.rows.size >= MAX_SLOTS) return "too_many";
      if (insertOnly && row) return "occupied";
      this.rows.set(e.slot, { sealed: e.sealed, updated_at: this.stamp() });
      return "ok";
    },
    remove: async (userId, slot) => {
      this.mine(userId);
      this.rows.delete(slot);
    },
    reset: async (userId) => {
      this.mine(userId);
      this.vault = null; // the vault row first, then the passwords, like portal_vault_reset
      this.rows.clear();
    },
  };
}

/** One browser tab: a `call` into the real handler, with every request body kept for inspection. */
function tab(server: MemoryServer) {
  const bodies: string[] = [];
  const record = (body: Record<string, unknown>) => {
    const json = JSON.stringify(body);
    bodies.push(json);
    sentBodies.push(json);
    return json;
  };
  const call: Call = async (body) => {
    const json = record(body);
    const r = await handleVault(WEBSITE, JSON.parse(json), server.deps);
    return { status: r.status, data: JSON.parse(JSON.stringify(r.body)) as Record<string, unknown> };
  };
  const actions = () => bodies.map((b) => (JSON.parse(b) as { action: string }).action);
  return { call, bodies, actions, record };
}
type Tab = ReturnType<typeof tab>;

/** `t.call`, except that the reply to every `action` request is replaced by `lost`. `reaches`: the request still arrives and takes effect; otherwise it never does. */
function losing(t: Tab, action: string, lost: Reply, reaches: boolean): Call {
  return async (body) => {
    if (body.action !== action) return t.call(body);
    if (reaches) await t.call(body);
    else t.record(body);
    return lost;
  };
}

// The ways a reply goes missing without the server saying anything usable.
const LOST: [string, Reply][] = [
  ["the connection dropped", { status: 0, data: {} }],
  ["a proxy answered 502", { status: 502, data: {} }],
  ["a 200 with no body", { status: 200, data: {} }],
];

// A fault on the vault_update request: the call the flow should use, and how to mend it again.
type Via = (t: Tab, s: MemoryServer) => { call: Call; heal: () => void };

const viaLost =
  (reply: Reply, reaches: boolean): Via =>
  (t) => ({ call: losing(t, "vault_update", reply, reaches), heal: () => {} });

// At the database: the write committed and then the handler's own work failed (it can only answer 500), or it never happened.
const viaDatabase =
  (reaches: boolean): Via =>
  (t, s) => {
    const real = s.deps.updateVault;
    s.deps.updateVault = async (...a) => {
      if (reaches) await real(...a);
      throw new Error(reaches ? "connection dropped after the commit" : "database unreachable");
    };
    return { call: t.call, heal: () => void (s.deps.updateVault = real) };
  };

/** Every fault, for a request that does (`reaches`) or does not reach the database. */
const faults = (reaches: boolean): [string, Via][] => [
  ...LOST.map(([why, reply]): [string, Via] => [why, viaLost(reply, reaches)]),
  [reaches ? "the database dropped after the commit" : "the database was unreachable", viaDatabase(reaches)],
];

// A real 600,000-round derivation costs a noticeable moment, so vaults are made once and committed to many stores.
const PASS_1 = "correct horse battery staple";
const PASS_2 = "a different long passphrase";
const PASS_3 = "third passphrase for the tab";
let first: Promise<Prepared> | undefined;
let second: Promise<Prepared> | undefined;
const passphraseOf = new WeakMap<Prepared, string>(); // the tests' own copy: a Prepared doesn't carry its passphrase
async function prepared(passphrase: string): Promise<Prepared> {
  const p = await rawPrepareVault(USER, passphrase);
  passphraseOf.set(p, passphrase);
  return p;
}
function registered(p: Prepared): Prepared {
  const passphrase = passphraseOf.get(p);
  if (passphrase !== undefined) known(passphrase);
  knownCode(p.recoveryCode);
  return p;
}
const vault1 = async () => registered(await (first ??= prepared(PASS_1)));
const vault2 = async () => registered(await (second ??= prepared(PASS_2)));
const groupOf = (p: Prepared) => recoveryGroup(p.recoveryCode, p.confirmGroup);

// The flows that take a secret, noted for the scan in flowTest.
const commitVault: typeof rawCommitVault = (call, userId, p, typed) => {
  registered(p);
  return rawCommitVault(call, userId, p, typed);
};
const saveOne: typeof rawSaveOne = (call, u, slot, password) => {
  known(password);
  return rawSaveOne(call, u, slot, password);
};
const importAll: typeof rawImportAll = (call, u, entries) => {
  known(...entries.map((e) => e.password));
  return rawImportAll(call, u, entries);
};
const unlockWith: typeof rawUnlockWith = (call, userId, secret, newPassphrase) => {
  knownSecret(secret);
  if (newPassphrase !== undefined) known(newPassphrase);
  return rawUnlockWith(call, userId, secret, newPassphrase);
};
const changePassphrase: typeof rawChangePassphrase = (call, userId, secret, newPassphrase) => {
  knownSecret(secret);
  known(newPassphrase);
  return rawChangePassphrase(call, userId, secret, newPassphrase);
};
const prepareRecoveryCode: typeof rawPrepareRecoveryCode = async (call, userId, passphrase) => {
  known(passphrase);
  const r = await rawPrepareRecoveryCode(call, userId, passphrase);
  if (typeof r === "object") knownCode(r.recoveryCode);
  return r;
};
const commitRecoveryCode: typeof rawCommitRecoveryCode = (call, p, typed) => {
  knownCode(p.recoveryCode);
  return rawCommitRecoveryCode(call, p, typed);
};

function ok<T extends object>(r: T | string, what = "result"): T {
  if (typeof r === "string") assert.fail(`${what}: expected success, got "${r}"`);
  return r;
}

async function vaultOf(call: Call): Promise<ServerVault> {
  const r = await fetchVault(call);
  if (r === null || "error" in r) assert.fail(`fetchVault: ${JSON.stringify(r)}`);
  return r;
}

async function slotsOf(call: Call): Promise<SlotState[]> {
  const r = await listSlots(call);
  if (!Array.isArray(r)) assert.fail(`listSlots: ${JSON.stringify(r)}`);
  return r;
}

/** A store with the vault created in a first tab (by typing `typed`, the right group unless a test says otherwise). */
async function setUp(p: Prepared, server = new MemoryServer(), typed = groupOf(p)) {
  const t = tab(server);
  const u = ok(await commitVault(t.call, USER, p, typed), `commitVault with "${typed}"`);
  return { server, t, u };
}

flowTest("prepareVault hands over a vault that opens by passphrase and by recovery code", async () => {
  const p = await vault1();
  assert.ok(!("passphrase" in p) && !Object.values(p).includes(PASS_1), "the prepared vault doesn't keep the passphrase");
  assert.ok(Number.isInteger(p.confirmGroup) && p.confirmGroup >= 1 && p.confirmGroup <= 7, `group ${p.confirmGroup}`);
  assert.equal(p.recoveryCode.length, 28);
  assert.equal(groupOf(p).length, 4);
  assert.equal(p.record.version, "e1");
});

flowTest("setup then unlock in a new tab", async () => {
  const p = await vault1();
  const server = new MemoryServer();
  const a = tab(server);
  assert.equal(await fetchVault(a.call), null, "no vault yet");

  const uA = ok(await commitVault(a.call, USER, p, groupOf(p)));
  assert.equal(uA.userId, USER);
  assert.equal(uA.keyId, p.record.key_id);
  assert.equal(await saveOne(a.call, uA, "system:commonapp", "Common-App pw 1!"), null);

  // A new tab shares nothing with the first but the server.
  const b = tab(server);
  const uB = ok(await unlockWith(b.call, USER, { passphrase: PASS_1 }));
  assert.equal(uB.keyId, uA.keyId);
  assert.deepEqual(await revealOne(b.call, uB, "system:commonapp"), { password: "Common-App pw 1!" });
  assert.deepEqual(await revealOne(b.call, uB, "system:uc"), { error: "not_found" });
  assert.deepEqual(await slotsOf(b.call), [{ slot: "system:commonapp", kind: "e1", updated_at: server.rows.get("system:commonapp")!.updated_at }]);

  const stored = await vaultOf(b.call);
  assert.deepEqual(stored.record, p.record, "the record comes back as it was made, without updated_at");
  assert.equal(stored.updatedAt, server.vault!.updated_at);

  // A recovery code that is wrong, or not a code at all, is "wrong" and changes nothing.
  assert.equal(await unlockWith(b.call, USER, { recovery: "0".repeat(28) }), "wrong");
  assert.equal(await unlockWith(b.call, USER, { recovery: "not a code" }), "wrong");
  assert.equal(await unlockWith(tab(new MemoryServer()).call, USER, { passphrase: PASS_1 }), "no_vault");
});

flowTest("group mismatch creates nothing", async () => {
  const p = await vault1();
  const server = new MemoryServer();
  const t = tab(server);
  const right = groupOf(p);
  const wrong = ["0000", "1111"].find((g) => g !== right)!;
  const another = recoveryGroup(p.recoveryCode, (p.confirmGroup % 7) + 1); // a real group of the code, but not the asked one
  for (const typed of [wrong, "", right.slice(0, 3), `${right}A`, p.recoveryCode, ...(another === right ? [] : [another])])
    assert.equal(await commitVault(t.call, USER, p, typed), "group_mismatch", `typed "${typed}"`);
  assert.deepEqual(t.bodies, [], "nothing was sent");
  assert.equal(server.vault, null);
  assert.equal(server.created, 0);
});

flowTest("a typed group is read like a recovery code", async () => {
  const p = await vault1();
  const right = groupOf(p);
  const lookalikes = right.toLowerCase().replace(/0/g, "o").replace(/1/g, "l"); // o for 0, l for 1, lower case
  for (const typed of [right, lookalikes, ` ${lookalikes.slice(0, 2)} - ${lookalikes.slice(2)} `]) {
    const { u, server } = await setUp(p, new MemoryServer(), typed);
    assert.equal(u.keyId, p.record.key_id, typed);
    assert.equal(server.created, 1, typed);
  }
});

flowTest("double commit is one vault", async () => {
  const p = await vault1();
  const server = new MemoryServer();
  const a = tab(server);
  const b = tab(server);
  const [x, y] = await Promise.all([commitVault(a.call, USER, p, groupOf(p)), commitVault(b.call, USER, p, groupOf(p))]);
  assert.equal(ok(x).keyId, p.record.key_id);
  assert.equal(ok(y).keyId, p.record.key_id);
  assert.equal(server.created, 1, "one vault row was inserted");
  assert.equal([...a.actions(), ...b.actions()].filter((x) => x === "vault_create").length, 2, "both really asked");
  assert.equal((await vaultOf(a.call)).record.key_id, p.record.key_id);
});

flowTest("a commit that meets another vault is told it exists", async () => {
  const [p, other] = [await vault1(), await vault2()];
  const { server } = await setUp(other);
  assert.equal(await commitVault(tab(server).call, USER, p, groupOf(p)), "exists");
  assert.equal(server.vault!.key_id, other.record.key_id, "the existing vault is untouched");
  assert.equal(server.created, 1);

  // A lost reply is only forgiven when the stored vault is this one.
  const t = tab(server);
  assert.equal(await commitVault(losing(t, "vault_create", LOST[0][1], false), USER, p, groupOf(p)), "failed");
});

flowTest("a lost reply to setup: if the vault was stored it is a success, if not it is an error and a retry works", async () => {
  const p = await vault1();
  for (const [why, reply] of LOST) {
    const server = new MemoryServer();
    const t = tab(server);
    const u = ok(await commitVault(losing(t, "vault_create", reply, true), USER, p, groupOf(p)), `${why}, after the write`);
    assert.equal(u.keyId, p.record.key_id, why);
    assert.equal(server.created, 1, why);

    const before = new MemoryServer();
    const t2 = tab(before);
    assert.equal(await commitVault(losing(t2, "vault_create", reply, false), USER, p, groupOf(p)), "failed", `${why}, before the write`);
    assert.equal(before.vault, null, why);
    ok(await commitVault(t2.call, USER, p, groupOf(p)), "the retry");
    assert.equal(before.created, 1, why);
  }
});

flowTest("stale tab save is refused", async () => {
  const [p, next] = [await vault1(), await vault2()];
  const { server, t: a, u: uA } = await setUp(p);
  assert.equal(await saveOne(a.call, uA, "system:uc", "uc-pw-from-vault-1"), null);

  // Tab B unlocks the first vault, then tab A starts over and makes a second one.
  const b = tab(server);
  const uB = ok(await unlockWith(b.call, USER, { recovery: p.recoveryCode }));
  assert.equal(await resetAll(a.call), null);
  assert.equal(await saveOne(b.call, uB, "system:commonapp", "late write"), "no_vault", "no vault at all");
  assert.equal(server.rows.size, 0);

  const uA2 = ok(await commitVault(a.call, USER, next, groupOf(next)));
  assert.equal(await saveOne(b.call, uB, "system:commonapp", "late write"), "wrong_vault", "another vault now");
  assert.equal(server.rows.size, 0, "nothing was stored");
  assert.deepEqual(await slotsOf(a.call), []);

  // The new vault's own values are not B's to open either.
  assert.equal(await saveOne(a.call, uA2, "system:uc", "uc-pw-from-vault-2"), null);
  assert.deepEqual(await revealOne(b.call, uB, "system:uc"), { error: "other_vault" });
  assert.equal(await saveOne(a.call, uA2, "system:uc", "uc-pw-replaced"), null, "an own save replaces: a plain upsert");
  assert.deepEqual(await revealOne(a.call, uA2, "system:uc"), { password: "uc-pw-replaced" });
});

flowTest("reveal refuses what does not open", async () => {
  const p = await vault1();
  const { server, t, u } = await setUp(p);
  assert.equal(await saveOne(t.call, u, "system:commonapp", "only-for-commonapp"), null);
  server.rows.set("system:uc", server.rows.get("system:commonapp")!); // a ciphertext moved to another slot
  assert.deepEqual(await revealOne(t.call, u, "system:uc"), { error: "other_vault" });

  // A value that is not an e1 value at all (an old server-sealed one): nothing here can open it.
  server.rows.set("custom:old", { sealed: "v1.abcdefghijklmnop.c2VhbGVk", updated_at: server.stamp() });
  assert.deepEqual(await revealOne(t.call, u, "custom:old"), { error: "other_vault" });
  assert.equal((await slotsOf(t.call)).find((s) => s.slot === "custom:old")?.kind, "other");

  // Damaged or unreadable e1 values are other_vault too.
  server.rows.set("custom:bad", { sealed: `e1.${p.record.key_id}.${"A".repeat(60)}`, updated_at: server.stamp() });
  assert.deepEqual(await revealOne(t.call, u, "custom:bad"), { error: "other_vault" });
  assert.deepEqual(await revealOne(t.call, u, "system:commonapp"), { password: "only-for-commonapp" });
});

flowTest("saveOne refuses a password it cannot seal, and sends nothing", async () => {
  const p = await vault1();
  const { t, u } = await setUp(p);
  const sent = t.bodies.length;
  assert.equal(await saveOne(t.call, u, "system:uc", ""), "failed");
  assert.equal(await saveOne(t.call, u, "system:uc", "half a pair \ud83d"), "failed");
  assert.equal(t.bodies.length, sent, "no request");
  assert.equal(await saveOne(tab(new MemoryServer()).call, u, "system:uc", "fine-pw-with-no-vault"), "no_vault");
});

flowTest("orphans block setup until reset", async () => {
  const [p, gone] = [await vault1(), await vault2()];
  const server = new MemoryServer();
  // A value of a vault that no longer exists.
  server.rows.set("system:uc", { sealed: await sealE1(gone.key, gone.record.key_id, USER, "system:uc", "orphan"), updated_at: server.stamp() });
  const t = tab(server);
  assert.equal(await commitVault(t.call, USER, p, groupOf(p)), "orphans");
  assert.equal(server.vault, null);
  assert.deepEqual((await slotsOf(t.call)).map((s) => s.kind), ["other"], "nobody can open it");

  assert.equal(await resetAll(t.call), null);
  assert.deepEqual(await slotsOf(t.call), []);
  const u = ok(await commitVault(t.call, USER, p, groupOf(p)));
  assert.equal(u.keyId, p.record.key_id);
});

flowTest("recovery resets the passphrase", async () => {
  const p = await vault1();
  const { server, t, u } = await setUp(p);
  assert.equal(await saveOne(t.call, u, "system:commonapp", "kept through the reset"), null);
  const before = server.vault!.updated_at;

  const b = tab(server);
  const uB = ok(await unlockWith(b.call, USER, { recovery: formatRecoveryCode(p.recoveryCode).toLowerCase() }, PASS_3));
  assert.notEqual(server.vault!.updated_at, before, "the record was replaced");
  assert.equal(server.vault!.key_id, p.record.key_id, "same vault, same key id");
  assert.deepEqual(await revealOne(b.call, uB, "system:commonapp"), { password: "kept through the reset" });

  assert.equal(await unlockWith(b.call, USER, { passphrase: PASS_1 }), "wrong", "the old passphrase is gone");
  const uC = ok(await unlockWith(b.call, USER, { passphrase: PASS_3 }));
  assert.deepEqual(await revealOne(b.call, uC, "system:commonapp"), { password: "kept through the reset" });
  ok(await unlockWith(b.call, USER, { recovery: p.recoveryCode }), "the recovery code is unchanged");
});

flowTest("change passphrase", async () => {
  const p = await vault1();
  const { t, u } = await setUp(p);
  assert.equal(await saveOne(t.call, u, "system:uc", "survives every change"), null);

  assert.equal(await changePassphrase(t.call, USER, { passphrase: "not the passphrase" }, PASS_3), "wrong");
  assert.equal(await changePassphrase(t.call, USER, { recovery: p.recoveryCode }, PASS_3), null);
  assert.equal(await unlockWith(t.call, USER, { passphrase: PASS_1 }), "wrong");
  const u3 = ok(await unlockWith(t.call, USER, { passphrase: PASS_3 }));
  assert.deepEqual(await revealOne(t.call, u3, "system:uc"), { password: "survives every change" });

  // No vault: nothing to change.
  const empty = tab(new MemoryServer());
  assert.equal(await changePassphrase(empty.call, USER, { passphrase: PASS_1 }, PASS_3), "no_vault");
  assert.equal(await prepareRecoveryCode(empty.call, USER, PASS_1), "no_vault");
  assert.deepEqual(empty.actions(), ["vault", "vault"]);
});

flowTest("a new recovery code is not live until its group is confirmed", async () => {
  const p = await vault1();
  const { server, t, u } = await setUp(p);
  assert.equal(await saveOne(t.call, u, "system:uc", "survives a new code"), null);
  const snapshot = structuredClone(server.vault);
  const sent = t.bodies.length;

  assert.equal(await prepareRecoveryCode(t.call, USER, "not the passphrase"), "wrong");
  const prep = ok(await prepareRecoveryCode(t.call, USER, PASS_1));
  assert.equal(prep.expected, snapshot!.updated_at, "made from the vault as it is now");
  assert.ok(prep.confirmGroup >= 1 && prep.confirmGroup <= 7);
  assert.equal(prep.recoveryCode.length, 28);
  assert.notEqual(prep.recoveryCode, p.recoveryCode);
  assert.equal(prep.record.key_id, p.record.key_id);
  assert.notEqual(prep.record.rec_check, p.record.rec_check);
  assert.deepEqual(t.actions().slice(sent), ["vault", "vault"], "preparing only reads the vault");
  assert.deepEqual(server.vault, snapshot, "nothing changed on the server");
  assert.equal(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }), "wrong", "the new code is not live yet");
  ok(await unlockWith(t.call, USER, { recovery: p.recoveryCode }), "the old code still works");

  // A group that is not the asked one sends nothing.
  const right = recoveryGroup(prep.recoveryCode, prep.confirmGroup);
  const wrong = ["0000", "1111"].find((g) => g !== right)!;
  const sentAfter = t.bodies.length;
  for (const typed of [wrong, "", right.slice(0, 3), `${right}A`, prep.recoveryCode])
    assert.equal(await commitRecoveryCode(t.call, prep, typed), "group_mismatch", `typed "${typed}"`);
  assert.equal(t.bodies.length, sentAfter, "nothing was sent");
  assert.deepEqual(server.vault, snapshot);
  assert.equal(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }), "wrong");

  // The right one, spelled any way a recovery code may be, makes it live and kills the old one.
  const spelled = ` ${right.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").slice(0, 2)}-${right.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").slice(2)} `;
  assert.equal(await commitRecoveryCode(t.call, prep, spelled), null);
  assert.equal(server.updates, 1);
  assert.equal(await unlockWith(t.call, USER, { recovery: p.recoveryCode }), "wrong", "the old code stops working");
  const uN = ok(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }));
  assert.deepEqual(await revealOne(t.call, uN, "system:uc"), { password: "survives a new code" }, "same vault key");
  ok(await unlockWith(t.call, USER, { passphrase: PASS_1 }), "the passphrase is untouched");

  // A second click on the same prepared code (its expected stamp is old now) finds its own write: still a success.
  assert.equal(await commitRecoveryCode(t.call, prep, right), null);
  assert.equal(server.updates, 1, "and it wrote nothing more");
});

flowTest("a prepared code is dropped when the vault moved on", async () => {
  const p = await vault1();
  const { server, t } = await setUp(p);
  const prep = ok(await prepareRecoveryCode(t.call, USER, PASS_1));
  // Another tab changes the passphrase in between.
  const other = tab(server);
  assert.equal(await changePassphrase(other.call, USER, { recovery: p.recoveryCode }, PASS_3), null);
  const snapshot = structuredClone(server.vault);
  assert.equal(await commitRecoveryCode(t.call, prep, recoveryGroup(prep.recoveryCode, prep.confirmGroup)), "changed");
  assert.deepEqual(server.vault, snapshot, "nothing was overwritten");
  assert.equal(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }), "wrong", "the prepared code never went live");
  ok(await unlockWith(t.call, USER, { recovery: p.recoveryCode }), "the code in use still works");
});

flowTest("a reply lost after the new recovery code was stored: the write counts and the code is live", async () => {
  const p = await vault1();
  for (const [why, via] of faults(true)) {
    const { server, t, u } = await setUp(p);
    assert.equal(await saveOne(t.call, u, "system:uc", "survives a lost reply"), null);
    const prep = ok(await prepareRecoveryCode(t.call, USER, PASS_1), why);
    assert.equal(await commitRecoveryCode(via(t, server).call, prep, recoveryGroup(prep.recoveryCode, prep.confirmGroup)), null, why);
    assert.equal(await unlockWith(t.call, USER, { recovery: p.recoveryCode }), "wrong", `${why}: the old code is dead`);
    const uN = ok(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }), `${why}: the new code`);
    assert.deepEqual(await revealOne(t.call, uN, "system:uc"), { password: "survives a lost reply" }, why);
  }
});

flowTest("a reply lost before the new recovery code was stored: an error, the old code still works, a retry works", async () => {
  const p = await vault1();
  for (const [why, via] of faults(false)) {
    const { server, t } = await setUp(p);
    const snapshot = structuredClone(server.vault);
    const prep = ok(await prepareRecoveryCode(t.call, USER, PASS_1), why);
    const typed = recoveryGroup(prep.recoveryCode, prep.confirmGroup);
    const fault = via(t, server);
    assert.equal(await commitRecoveryCode(fault.call, prep, typed), "failed", why);
    assert.deepEqual(server.vault, snapshot, `${why}: nothing was written`);
    ok(await unlockWith(t.call, USER, { recovery: p.recoveryCode }), `${why}: the old code still works`);
    assert.equal(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }), "wrong", `${why}: the new code is not live`);
    // Back online: the same prepared code can be committed.
    fault.heal();
    assert.equal(await commitRecoveryCode(t.call, prep, typed), null, `${why}: the retry`);
    ok(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }), `${why}: live after the retry`);
  }
});

flowTest("a reply lost after the new passphrase was stored: the write counts", async () => {
  const p = await vault1();
  for (const [why, via] of faults(true)) {
    const { server, t, u } = await setUp(p);
    assert.equal(await saveOne(t.call, u, "system:uc", "survives a lost reply"), null);
    assert.equal(await changePassphrase(via(t, server).call, USER, { recovery: p.recoveryCode }, PASS_3), null, why);
    assert.equal(await unlockWith(t.call, USER, { passphrase: PASS_1 }), "wrong", `${why}: the old passphrase is gone`);
    const u3 = ok(await unlockWith(t.call, USER, { passphrase: PASS_3 }), `${why}: the new passphrase`);
    assert.deepEqual(await revealOne(t.call, u3, "system:uc"), { password: "survives a lost reply" }, why);
  }
});

flowTest("a reply lost before the new passphrase was stored: an error, the old passphrase still works", async () => {
  const p = await vault1();
  const { server, t } = await setUp(p);
  const snapshot = structuredClone(server.vault);
  assert.equal(await changePassphrase(losing(t, "vault_update", LOST[0][1], false), USER, { recovery: p.recoveryCode }, PASS_3), "failed");
  assert.deepEqual(server.vault, snapshot);
  ok(await unlockWith(t.call, USER, { passphrase: PASS_1 }));
  assert.equal(await unlockWith(t.call, USER, { passphrase: PASS_3 }), "wrong");

  // The "forgot it" reset that did not get stored is an error, not a key: the student asked for a new passphrase.
  assert.equal(await unlockWith(losing(t, "vault_update", LOST[0][1], false), USER, { recovery: p.recoveryCode }, PASS_3), "failed");
  assert.deepEqual(server.vault, snapshot);
  assert.equal(await unlockWith(t.call, USER, { passphrase: PASS_3 }), "wrong");
});

flowTest("recovery with a new passphrase, reply lost after the write: unlocked, and the new passphrase is live", async () => {
  const p = await vault1();
  const { t, u } = await setUp(p);
  assert.equal(await saveOne(t.call, u, "system:uc", "survives a lost reply"), null);
  const via = losing(t, "vault_update", LOST[0][1], true);
  const uR = ok(await unlockWith(via, USER, { recovery: p.recoveryCode }, PASS_3));
  assert.deepEqual(await revealOne(t.call, uR, "system:uc"), { password: "survives a lost reply" });
  ok(await unlockWith(t.call, USER, { passphrase: PASS_3 }));
  assert.equal(await unlockWith(t.call, USER, { passphrase: PASS_1 }), "wrong");
});

flowTest("two tabs changing the passphrase at once: one wins, the other is told it changed", async () => {
  const p = await vault1();
  const { server } = await setUp(p);
  const a = tab(server);
  const b = tab(server);
  const results = await Promise.all([
    changePassphrase(a.call, USER, { recovery: p.recoveryCode }, "passphrase from tab A"),
    changePassphrase(b.call, USER, { recovery: p.recoveryCode }, "passphrase from tab B"),
  ]);
  assert.deepEqual([...results].sort(), ["changed", null]);
  const winner = results[0] === null ? "passphrase from tab A" : "passphrase from tab B";
  ok(await unlockWith(a.call, USER, { passphrase: winner }));
});

flowTest("a vault row the server cannot read never gives a key, and only reads are sent", async () => {
  const p = await vault1();
  const { server, t } = await setUp(p);
  server.rows.set("system:uc", { sealed: `e1.${p.record.key_id}.${"A".repeat(40)}`, updated_at: server.stamp() });
  server.vault = { ...server.vault!, pass_iterations: 1000 }; // planted below the floor: the server's own read refuses it (500)
  const planted = structuredClone(server.vault);
  const sent = t.bodies.length;
  assert.deepEqual(await fetchVault(t.call), { error: "failed" });
  assert.equal(await unlockWith(t.call, USER, { recovery: p.recoveryCode }), "failed");
  assert.equal(await unlockWith(t.call, USER, { recovery: p.recoveryCode }, PASS_3), "failed");
  assert.equal(await unlockWith(t.call, USER, { passphrase: PASS_1 }), "failed");
  assert.equal(await changePassphrase(t.call, USER, { recovery: p.recoveryCode }, PASS_3), "failed");
  assert.equal(await prepareRecoveryCode(t.call, USER, PASS_1), "failed");
  assert.deepEqual([...new Set(t.actions().slice(sent))], ["vault"], "nothing but reads");
  assert.equal(server.rows.size, 1, "the saved password is still there");
  assert.deepEqual(server.vault, planted, "and the vault row was not touched");
});

flowTest("import keeps occupied and locked", async () => {
  const [p, next] = [await vault1(), await vault2()];
  const { server, t, u } = await setUp(p);
  assert.equal(await saveOne(t.call, u, "system:uc", "the account's own"), null);
  assert.equal(await saveOne(t.call, u, "custom:old", "the account's second"), null);
  const old = server.rows.get("custom:old")!.sealed;

  const left = await importAll(t.call, u, [
    { slot: "system:uc", password: "local copy for uc" }, // occupied by an e1 value
    { slot: "custom:old", password: "local copy for old" }, // occupied by another e1 value
    { slot: "custom:new1", password: "local-pw-new-one" },
    { slot: "system:uc", password: "a later duplicate" }, // first one wins, the duplicate is not sent
    { slot: "custom:new2", password: "local-pw-new-two" },
    { slot: "not a slot", password: "pw-for-a-bad-slot" }, // refused before it is sent
    { slot: "custom:empty", password: "" }, // cannot be sealed
  ]);
  assert.deepEqual(left, [
    { slot: "system:uc", password: "local copy for uc" },
    { slot: "custom:old", password: "local copy for old" },
    { slot: "not a slot", password: "pw-for-a-bad-slot" },
    { slot: "custom:empty", password: "" },
  ]);
  assert.deepEqual(await revealOne(t.call, u, "system:uc"), { password: "the account's own" }, "an import never replaces");
  assert.equal(server.rows.get("custom:old")!.sealed, old);
  assert.deepEqual(await revealOne(t.call, u, "custom:new1"), { password: "local-pw-new-one" });
  assert.deepEqual(await revealOne(t.call, u, "custom:new2"), { password: "local-pw-new-two" });
  assert.ok(!t.bodies.some((b) => b.includes("not a slot") || b.includes("custom:empty")));

  // A tab whose vault was replaced (its key id is stale) stores nothing and keeps everything.
  assert.equal(await resetAll(t.call), null);
  ok(await commitVault(t.call, USER, next, groupOf(next)));
  const keep = [
    { slot: "system:uc", password: "stale-key-pw-one" },
    { slot: "custom:x", password: "stale-key-pw-two" },
  ];
  assert.deepEqual(await importAll(t.call, u, keep), keep);
  assert.equal(server.rows.size, 0);
});

flowTest("import sends nothing when there is nothing to send", async () => {
  const p = await vault1();
  const { t, u } = await setUp(p);
  const sent = t.bodies.length;
  assert.deepEqual(await importAll(t.call, u, []), []);
  assert.equal(t.bodies.length, sent);
});

flowTest("import chunks by count and by size, and returns what a failed chunk lost", async () => {
  const p = await vault1();

  // 320 short passwords: more than IMPORT_MAX, so two requests.
  const many = Array.from({ length: IMPORT_MAX + 20 }, (_, i) => ({ slot: `custom:n${i}`, password: `bulk-secret-pw-${i}` }));
  const a = await setUp(p);
  const sent = a.t.bodies.length;
  assert.deepEqual(await importAll(a.t.call, a.u, many), []);
  const sizes = a.t.bodies.slice(sent).map((b) => (JSON.parse(b) as { entries: unknown[] }).entries.length);
  assert.deepEqual(sizes, [IMPORT_MAX, 20]);
  assert.equal(a.server.rows.size, many.length);
  assert.deepEqual(await revealOne(a.t.call, a.u, "custom:n319"), { password: "bulk-secret-pw-319" });

  // 300 passwords of 512 characters: under IMPORT_MAX, but too big for one ~200 KB request.
  const big = Array.from({ length: IMPORT_MAX }, (_, i) => ({ slot: `custom:b${i}`, password: String.fromCharCode(97 + (i % 26)).repeat(512) }));
  const b = await setUp(p);
  const before = b.t.bodies.length;
  assert.deepEqual(await importAll(b.t.call, b.u, big), []);
  const requests = b.t.bodies.slice(before);
  assert.ok(requests.length >= 2, `${requests.length} requests`);
  for (const r of requests) assert.ok(Buffer.byteLength(r) <= 200_000, `${Buffer.byteLength(r)} bytes`);
  assert.equal(b.server.rows.size, big.length);

  // A chunk whose request fails comes back whole; the other chunk is still stored.
  const c = await setUp(p);
  const realPut = c.server.deps.put;
  let calls = 0;
  c.server.deps.put = async (...args) => {
    if (++calls === 1) throw new Error("connection reset"); // the handler fails this entry and the rest of its chunk
    return realPut(...args);
  };
  const lost = await importAll(c.t.call, c.u, many);
  assert.equal(lost.length, IMPORT_MAX, "the whole first chunk was not stored");
  assert.deepEqual(lost.map((e) => e.slot), many.slice(0, IMPORT_MAX).map((e) => e.slot));
  assert.equal(c.server.rows.size, 20);
});

flowTest("nothing secret crosses the wire", async () => {
  const p = await vault1();
  const server = new MemoryServer();
  const t = tab(server);
  const SAVED_PW = "saved-plaintext-Zq9-2";
  const IMPORTED_PW = "imported-plaintext-Zq9-3";
  const PASS_4 = "pässwörd ✓ four-4-four";

  const u = ok(await commitVault(t.call, USER, p, groupOf(p)));
  assert.equal(await saveOne(t.call, u, "system:commonapp", SAVED_PW), null);
  assert.deepEqual(await importAll(t.call, u, [{ slot: "system:uc", password: IMPORTED_PW }]), []);
  assert.deepEqual((await slotsOf(t.call)).map((s) => s.slot), ["system:commonapp", "system:uc"]);
  assert.deepEqual(await revealOne(t.call, u, "system:commonapp"), { password: SAVED_PW });
  assert.deepEqual(await revealOne(t.call, u, "system:uc"), { password: IMPORTED_PW });
  assert.equal(await changePassphrase(t.call, USER, { recovery: p.recoveryCode }, PASS_3), null);
  const prep = ok(await prepareRecoveryCode(t.call, USER, PASS_3));
  assert.equal(await commitRecoveryCode(t.call, prep, recoveryGroup(prep.recoveryCode, prep.confirmGroup)), null);
  ok(await unlockWith(t.call, USER, { recovery: prep.recoveryCode }, PASS_4));
  assert.equal(await resetAll(t.call), null);

  const seen = new Set(t.actions());
  for (const action of ["vault", "list", "vault_create", "set", "get", "import", "vault_update", "reset"])
    assert.ok(seen.has(action), `the scenario used ${action}`);

  // flowTest scans every test's bodies for the secrets it used; this test also names them and the forbidden field names.
  const named = [
    PASS_1, PASS_3, PASS_4, SAVED_PW, IMPORTED_PW,
    p.recoveryCode, formatRecoveryCode(p.recoveryCode), prep.recoveryCode, formatRecoveryCode(prep.recoveryCode),
  ];
  const secretKeys = new Set(["password", "passphrase", "recovery", "recoveryCode", "key", "vaultKey"]);
  const keysOf = (v: unknown): string[] =>
    v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : [];
  for (const body of t.bodies) {
    for (const s of named) assert.ok(!body.includes(s), `a request body contains "${s}": ${body.slice(0, 80)}`);
    for (const k of keysOf(JSON.parse(body))) assert.ok(!secretKeys.has(k), `a request body has a "${k}" field`);
  }
  assert.ok(secrets.has(prep.recoveryCode) && secrets.has(PASS_4) && secrets.has(SAVED_PW), "and the general scan knew about them");
});

flowTest("reply codes map to flow errors; anything unexpected is failed", async () => {
  const canned = (status: number, data: Record<string, unknown>): Call => async () => ({ status, data });
  const table: [number, Record<string, unknown>, FlowError][] = [
    [401, { error: "unauthorized" }, "unauthorized"],
    [503, { configured: false }, "unavailable"],
    [404, { error: "not_found" }, "not_found"],
    [404, { error: "no_vault" }, "no_vault"],
    [409, { error: "wrong_vault" }, "wrong_vault"],
    [409, { error: "changed" }, "changed"],
    [409, { error: "exists" }, "exists"],
    [409, { error: "orphans" }, "orphans"],
    [409, { error: "too_many" }, "too_many"],
    [400, { error: "bad_record" }, "bad_record"],
    [403, { error: "forbidden" }, "failed"],
    [500, { error: "server_error" }, "failed"],
    [409, { error: "something_new" }, "failed"],
    [0, {}, "failed"],
    [200, {}, "failed"],
    [200, { ok: false }, "failed"],
  ];
  for (const [status, data, expected] of table) assert.equal(await resetAll(canned(status, data)), expected, `${status} ${JSON.stringify(data)}`);
  assert.equal(await resetAll(canned(200, { ok: true })), null);
  assert.equal(await resetAll(async () => { throw new Error("offline"); }), "failed", "a call that throws");
  assert.equal(await resetAll((async () => undefined) as unknown as Call), "failed", "a call that returns nothing");

  const STAMP = "2026-10-29T08:00:00.000001+00:00";
  assert.deepEqual(await fetchVault(canned(503, { configured: false })), { error: "unavailable" });
  assert.deepEqual(await fetchVault(canned(200, {})), { error: "failed" });
  assert.deepEqual(await fetchVault(canned(200, { vault: null })), null);
  assert.deepEqual(await fetchVault(canned(200, { vault: { version: "e1" } })), { error: "failed" });
  assert.deepEqual(await fetchVault(canned(200, { vault: { version: "e1", updated_at: STAMP } })), { error: "bad_record" });
  assert.deepEqual(await listSlots(canned(401, { error: "unauthorized" })), { error: "unauthorized" });
  assert.deepEqual(await listSlots(canned(200, { slots: "nope" })), { error: "failed" });
  assert.deepEqual(await listSlots(canned(200, { slots: [{ slot: "system:uc", kind: "weird", updated_at: "x" }] })), { error: "failed" });
  assert.deepEqual(await listSlots(canned(200, { slots: [] })), []);

  // Only the nine record keys are read: a field the server adds later must not break every unlock.
  const p = await vault1();
  const row = { ...p.record, updated_at: STAMP, created_at: "2026-10-29T07:00:00+00:00", note: "future field" };
  assert.deepEqual(await fetchVault(canned(200, { vault: row })), { record: p.record, updatedAt: STAMP });
  const { pass_check: _dropped, ...missing } = row;
  void _dropped;
  assert.deepEqual(await fetchVault(canned(200, { vault: missing })), { error: "bad_record" }, "a missing record key still is");
  assert.deepEqual(await fetchVault(canned(200, { vault: { ...row, pass_iterations: 1000 } })), { error: "bad_record" }, "and so is a count below the floor");
});

flowTest("an import reply that does not add up is not trusted", async () => {
  const p = await vault1();
  const u = { userId: USER, keyId: p.record.key_id, key: p.key };
  const entries = [
    { slot: "custom:a", password: "canned-import-pw-a" },
    { slot: "custom:b", password: "canned-import-pw-b" },
  ];
  const canned = (status: number, data: Record<string, unknown>): Call => async () => ({ status, data });
  assert.deepEqual(await importAll(canned(200, { imported: 2, failed: [] }), u, entries), [], "a consistent reply is believed");
  assert.deepEqual(await importAll(canned(200, { imported: 1, failed: ["custom:b"] }), u, entries), [entries[1]]);
  assert.deepEqual(await importAll(canned(200, { failed: [] }), u, entries), entries, "no count: nothing is confirmed");
  assert.deepEqual(await importAll(canned(200, { imported: 2, failed: ["custom:b"] }), u, entries), entries, "2 + 1 != 2 sent");
  assert.deepEqual(await importAll(canned(200, { imported: 5, failed: [] }), u, entries), entries);
  assert.deepEqual(await importAll(canned(500, { imported: 2, failed: [] }), u, entries), entries, "not a 200");
  assert.deepEqual(await importAll(canned(401, { error: "unauthorized" }), u, entries), entries);
});
