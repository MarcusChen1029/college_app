import assert from "node:assert/strict";
import { test } from "node:test";
import { handleVault, slotKind, type VaultDeps } from "./portal-vault-handler.ts";
import type { VaultRecord } from "./vault-format.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const jwt = (claims: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const WEBSITE = jwt({ sub: USER, role: "authenticated" });
const AI = jwt({ sub: USER, role: "authenticated", client_id: "some-ai" });

const KID = "kid_0123456789AB";
const b64 = (bytes: number, fill = 1) => Buffer.alloc(bytes, fill).toString("base64url");
const SEALED = `e1.${KID}.${b64(29)}`;
const RECORD: VaultRecord = {
  version: "e1",
  key_id: KID,
  pass_salt: b64(16),
  pass_iterations: 600_000,
  pass_check: b64(32),
  pass_wrapped: b64(60),
  rec_salt: b64(16),
  rec_check: b64(32),
  rec_wrapped: b64(60),
};
const STAMP = "2026-10-29T08:00:00.123456+00:00";
const NEWER = "2026-10-29T08:05:00.5+00:00";

type Results = { [K in Exclude<keyof VaultDeps, "verifyUser">]: Awaited<ReturnType<VaultDeps[K]>> };
const DEFAULTS: Results = {
  keyStatus: "ok",
  vault: { ...RECORD, updated_at: STAMP },
  createVault: "ok",
  updateVault: { updated_at: NEWER },
  list: [{ slot: "system:uc", kind: "e1", updated_at: STAMP }],
  get: SEALED,
  put: "ok",
  remove: undefined,
  handover: { password: "old-pw", updated_at: STAMP },
  reset: undefined,
};

// Fake database work that records every call (and its arguments), so a test can prove what was and wasn't touched.
function fakeDeps(over: Partial<Results> = {}) {
  const calls: string[] = [];
  const args: Record<string, unknown[]> = {};
  const r: Results = { ...DEFAULTS, ...over };
  const track =
    <K extends keyof Results>(name: K) =>
    async (...a: unknown[]): Promise<Results[K]> => {
      calls.push(name);
      args[name] = a;
      return r[name];
    };
  const deps: VaultDeps = {
    verifyUser: async (t) => {
      calls.push("verifyUser");
      return t === WEBSITE || t === AI ? USER : null;
    },
    keyStatus: track("keyStatus"),
    vault: track("vault"),
    createVault: track("createVault"),
    updateVault: track("updateVault"),
    list: track("list"),
    get: track("get"),
    put: track("put"),
    remove: track("remove"),
    handover: track("handover"),
    reset: track("reset"),
  };
  return { deps, calls, args };
}

const BODIES = {
  vault: { action: "vault" },
  vault_create: { action: "vault_create", record: RECORD },
  vault_update: { action: "vault_update", record: RECORD, expected: STAMP },
  list: { action: "list" },
  get: { action: "get", slot: "system:uc" },
  set: { action: "set", slot: "system:uc", sealed: SEALED },
  delete: { action: "delete", slot: "system:uc" },
  import: { action: "import", entries: [{ slot: "system:uc", sealed: SEALED }] },
  handover: { action: "handover", slot: "system:uc" },
  reset: { action: "reset" },
} as const;
type Action = keyof typeof BODIES;
const ACTIONS = Object.keys(BODIES) as Action[];
const RUNS: Record<Action, (keyof Results)[]> = {
  vault: ["vault"],
  vault_create: ["createVault"],
  vault_update: ["updateVault"],
  list: ["list"],
  get: ["get"],
  set: ["put"],
  delete: ["remove"],
  import: ["put"],
  handover: ["keyStatus", "handover"],
  reset: ["reset"],
};

const call = (body: unknown, deps: VaultDeps, token: string | null = WEBSITE) => handleVault(token, body, deps);

test("AI token is 403 before anything", async () => {
  for (const action of ACTIONS) {
    const f = fakeDeps();
    assert.deepEqual(await call(BODIES[action], f.deps, AI), { status: 403, body: { error: "forbidden" } }, action);
    assert.deepEqual(f.calls, [], `${action}: nothing is asked of Supabase`);
  }
});

test("the other checks come first too: no token, a dead session, a bad body", async () => {
  let f = fakeDeps();
  assert.deepEqual(await call({ action: "list" }, f.deps, null), { status: 401, body: { error: "unauthorized" } });
  assert.deepEqual(f.calls, []);
  f = fakeDeps();
  assert.deepEqual(await call({ action: "list" }, f.deps, "not-a-jwt"), { status: 401, body: { error: "unauthorized" } });
  assert.deepEqual(f.calls, []);
  f = fakeDeps();
  assert.deepEqual(await call({ action: "list" }, f.deps, jwt({ sub: "someone" })), { status: 401, body: { error: "unauthorized" } });
  assert.deepEqual(f.calls, ["verifyUser"]);
  f = fakeDeps();
  assert.deepEqual(await call({ action: "migrate" }, f.deps), { status: 400, body: { error: "bad_request" } });
  assert.deepEqual(f.calls, ["verifyUser"]);
  f = fakeDeps();
  assert.deepEqual(await call({ action: "set", slot: "system:uc", sealed: "hunter2" }, f.deps), { status: 400, body: { error: "bad_value" } });
  assert.deepEqual(f.calls, ["verifyUser"], "a plaintext password never reaches the store");
});

test("each action runs exactly one dep", async () => {
  for (const action of ACTIONS) {
    const f = fakeDeps();
    const r = await call(BODIES[action], f.deps);
    assert.equal(r.status, 200, action);
    assert.deepEqual(f.calls, ["verifyUser", ...RUNS[action]], action);
  }
});

test("success replies", async () => {
  const replies: Record<Action, Record<string, unknown>> = {
    vault: { vault: { ...RECORD, updated_at: STAMP } },
    vault_create: { ok: true },
    vault_update: { ok: true, updated_at: NEWER },
    list: { slots: [{ slot: "system:uc", kind: "e1", updated_at: STAMP }] },
    get: { sealed: SEALED },
    set: { ok: true },
    delete: { ok: true },
    import: { imported: 1, failed: [] },
    handover: { password: "old-pw", updated_at: STAMP },
    reset: { ok: true },
  };
  for (const action of ACTIONS) assert.deepEqual(await call(BODIES[action], fakeDeps().deps), { status: 200, body: replies[action] }, action);
  assert.deepEqual(await call({ action: "vault" }, fakeDeps({ vault: null }).deps), { status: 200, body: { vault: null } });
});

test("key mismatch blocks only handover", async () => {
  for (const [status, error] of [
    ["mismatch", "key_mismatch"],
    ["unclaimed", "key_unclaimed"],
  ] as const) {
    for (const action of ACTIONS) {
      const f = fakeDeps({ keyStatus: status });
      const r = await call(BODIES[action], f.deps);
      if (action === "handover") {
        assert.deepEqual(r, { status: 503, body: { error } });
        assert.deepEqual(f.calls, ["verifyUser", "keyStatus"], "nothing is opened");
      } else {
        assert.equal(r.status, 200, `${status}: ${action}`);
        assert.ok(!f.calls.includes("keyStatus"), `${action} never asks about the server key`);
      }
    }
  }
});

test("no_key answers 503 for handover", async () => {
  const f = fakeDeps({ keyStatus: "no_key" });
  assert.deepEqual(await call(BODIES.handover, f.deps), { status: 503, body: { error: "no_key" } });
  assert.deepEqual(f.calls, ["verifyUser", "keyStatus"]);
  assert.equal((await call(BODIES.list, fakeDeps({ keyStatus: "no_key" }).deps)).status, 200, "everything else works without the server key");
});

test("get never opens", async () => {
  const f = fakeDeps();
  assert.deepEqual(await call(BODIES.get, f.deps), { status: 200, body: { sealed: SEALED } });
  assert.deepEqual(f.calls, ["verifyUser", "get"], "no key check, no handover");
  assert.deepEqual(f.args.get, [USER, "system:uc"]);
  // A stored v1 value goes back as the same opaque string (the browser asks for handover separately).
  const v1 = "v1.abcdefghijklmnop.c2VhbGVk";
  assert.deepEqual(await call(BODIES.get, fakeDeps({ get: v1 }).deps), { status: 200, body: { sealed: v1 } });
  assert.deepEqual(await call(BODIES.get, fakeDeps({ get: null }).deps), { status: 404, body: { error: "not_found" } });
});

test("import reports non-ok puts as failed", async () => {
  const f = fakeDeps();
  const seen: unknown[][] = [];
  const results: Record<string, Awaited<ReturnType<VaultDeps["put"]>>> = { "custom:a": "ok", "custom:b": "occupied", "custom:c": "wrong_vault", "custom:d": "too_many", "custom:e": "ok", "custom:f": "no_vault", "custom:g": "changed" };
  f.deps.put = async (...a) => {
    seen.push(a);
    return results[a[1].slot];
  };
  const entries = Object.keys(results).map((slot) => ({ slot, sealed: SEALED }));
  assert.deepEqual(await call({ action: "import", entries }, f.deps), { status: 200, body: { imported: 2, failed: ["custom:b", "custom:c", "custom:d", "custom:f", "custom:g"] } });
  assert.equal(seen.length, entries.length, "one put per entry, in order");
  for (const [i, a] of seen.entries()) assert.deepEqual(a, [USER, entries[i], null, true], "insert only: an import never overwrites the account's value");
});

test("an import stops at the first put that throws; it and the rest are failed, the earlier ones confirmed", async () => {
  const f = fakeDeps();
  let n = 0;
  f.deps.put = async (_u, e) => {
    n++;
    if (e.slot === "custom:b") throw new Error("connection reset");
    return "ok";
  };
  const entries = ["custom:a", "custom:b", "custom:c"].map((slot) => ({ slot, sealed: SEALED }));
  assert.deepEqual(await call({ action: "import", entries }, f.deps), { status: 200, body: { imported: 1, failed: ["custom:b", "custom:c"] } });
  assert.equal(n, 2);
});

test("set: compare-and-set passes the exact timestamp; codes map to statuses", async () => {
  let f = fakeDeps();
  await call({ action: "set", slot: "system:uc", sealed: SEALED, expected: STAMP }, f.deps);
  assert.deepEqual(f.args.put, [USER, { slot: "system:uc", sealed: SEALED }, STAMP, false]);
  f = fakeDeps();
  await call(BODIES.set, f.deps);
  assert.deepEqual(f.args.put, [USER, { slot: "system:uc", sealed: SEALED }, null, false], "no expected = plain upsert");
  assert.deepEqual(await call(BODIES.set, fakeDeps({ put: "no_vault" }).deps), { status: 404, body: { error: "no_vault" } });
  for (const code of ["wrong_vault", "changed", "too_many"] as const)
    assert.deepEqual(await call(BODIES.set, fakeDeps({ put: code }).deps), { status: 409, body: { error: code } }, code);
});

test("vault_create and vault_update codes", async () => {
  for (const code of ["exists", "orphans"] as const)
    assert.deepEqual(await call(BODIES.vault_create, fakeDeps({ createVault: code }).deps), { status: 409, body: { error: code } }, code);
  const f = fakeDeps();
  await call(BODIES.vault_create, f.deps);
  assert.deepEqual(f.args.createVault, [USER, RECORD]);

  const u = fakeDeps();
  assert.deepEqual(await call(BODIES.vault_update, u.deps), { status: 200, body: { ok: true, updated_at: NEWER } });
  assert.deepEqual(u.args.updateVault, [USER, RECORD, STAMP], "the exact string, never through Date");
  assert.deepEqual(await call(BODIES.vault_update, fakeDeps({ updateVault: "changed" }).deps), { status: 409, body: { error: "changed" } });
  assert.deepEqual(await call(BODIES.vault_update, fakeDeps({ updateVault: "no_vault" }).deps), { status: 404, body: { error: "no_vault" } });
  assert.deepEqual(await call(BODIES.vault_update, fakeDeps({ updateVault: "wrong_vault" }).deps), { status: 409, body: { error: "wrong_vault" } });
});

test("handover codes", async () => {
  const f = fakeDeps();
  await call(BODIES.handover, f.deps);
  assert.deepEqual(f.args.handover, [USER, "system:uc"]);
  assert.deepEqual(await call(BODIES.handover, fakeDeps({ handover: "missing" }).deps), { status: 404, body: { error: "not_found" } });
  assert.deepEqual(await call(BODIES.handover, fakeDeps({ handover: "not_legacy" }).deps), { status: 409, body: { error: "not_legacy" } });
  assert.deepEqual(await call(BODIES.handover, fakeDeps({ handover: "unreadable" }).deps), { status: 409, body: { error: "unreadable" } });
});

test("list kinds: e1 only under the account's own vault key id", () => {
  assert.equal(slotKind(SEALED, KID), "e1");
  assert.equal(slotKind(SEALED, "another_key_id_0"), "other", "sealed under a vault that was replaced");
  assert.equal(slotKind(SEALED, null), "other", "no vault: an orphan");
  assert.equal(slotKind("v1.abcdefghijklmnop.c2VhbGVk", KID), "v1");
  assert.equal(slotKind("v1.abcdefghijklmnop.c2VhbGVk", null), "v1", "old rows are v1 with or without a vault");
  assert.equal(slotKind("hunter2", KID), "other");
  assert.equal(slotKind(`e1.${KID}.AAAA`, KID), "other", "a malformed e1 value can't be opened either");
});

test("failures answer 500 with a code only", async () => {
  for (const action of ACTIONS) {
    if (action === "import") continue; // a throwing put is a failed entry (previous test)
    const f = fakeDeps();
    for (const name of RUNS[action])
      (f.deps as Record<string, unknown>)[name] = async () => {
        throw new Error(`read failed for ${USER}: ${SEALED}`);
      };
    assert.deepEqual(await call(BODIES[action], f.deps), { status: 500, body: { error: "server_error" } }, action);
  }
  const f = fakeDeps();
  f.deps.verifyUser = async () => {
    throw new Error("auth down");
  };
  assert.deepEqual(await call(BODIES.list, f.deps), { status: 500, body: { error: "server_error" } });
});
