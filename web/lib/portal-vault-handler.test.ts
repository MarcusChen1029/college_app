import assert from "node:assert/strict";
import { test } from "node:test";
import { handleVault, type KeyStatus, type VaultDeps } from "./portal-vault-handler.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const jwt = (claims: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const WEBSITE = jwt({ sub: USER, role: "authenticated" });
const AI = jwt({ sub: USER, role: "authenticated", client_id: "some-ai" });

// Fake database work that records every call, so a test can prove nothing was touched.
function fakeDeps(key: KeyStatus) {
  const calls: string[] = [];
  const track = <T>(name: string, value: T) => {
    calls.push(name);
    return value;
  };
  const deps: VaultDeps = {
    verifyUser: async (t) => track("verifyUser", t === WEBSITE || t === AI ? USER : null),
    keyStatus: async () => track("keyStatus", key),
    list: async () => track("list", ["system:uc"]),
    reveal: async () => track("reveal", { password: "pw" }),
    set: async () => track<"ok">("set", "ok"),
    remove: async () => track("remove", undefined),
    importPasswords: async () => track("import", { imported: 1, kept: 0, failed: [] as string[] }),
    migrate: async () => track("migrate", { migrated: 1, kept: 0, failed: 0 }),
  };
  return { deps, calls };
}

const BODIES = [
  { action: "list" },
  { action: "reveal", slot: "system:uc" },
  { action: "set", slot: "system:uc", password: "pw" },
  { action: "delete", slot: "system:uc" },
  { action: "import", entries: [{ slot: "system:uc", password: "pw" }] },
  { action: "migrate" },
];

test("a deployment whose key isn't the store's touches nothing, for every action (503 key_mismatch)", async () => {
  for (const body of BODIES) {
    const { deps, calls } = fakeDeps("mismatch");
    const r = await handleVault(WEBSITE, body, deps);
    assert.deepEqual(r, { status: 503, body: { error: "key_mismatch" } }, body.action);
    assert.deepEqual(calls, ["verifyUser", "keyStatus"], `${body.action}: no store or plaintext call`);
  }
});

test("an unclaimed store (a preview or laptop before production claimed it) touches nothing either", async () => {
  for (const body of BODIES) {
    const { deps, calls } = fakeDeps("unclaimed");
    assert.deepEqual(await handleVault(WEBSITE, body, deps), { status: 503, body: { error: "key_unclaimed" } });
    assert.deepEqual(calls, ["verifyUser", "keyStatus"]);
  }
});

test("with the store's key, each action runs once", async () => {
  const expected = ["list", "reveal", "set", "remove", "import", "migrate"];
  for (const [i, body] of BODIES.entries()) {
    const { deps, calls } = fakeDeps("ok");
    const r = await handleVault(WEBSITE, body, deps);
    assert.equal(r.status, 200, body.action);
    assert.deepEqual(calls, ["verifyUser", "keyStatus", expected[i]]);
  }
});

test("checks come before the key check: no token, an AI token, a dead session or a bad body never reach it", async () => {
  let f = fakeDeps("ok");
  assert.equal((await handleVault(null, { action: "list" }, f.deps)).status, 401);
  assert.deepEqual(f.calls, []);
  f = fakeDeps("ok");
  assert.deepEqual(await handleVault(AI, { action: "migrate" }, f.deps), { status: 403, body: { error: "forbidden" } });
  assert.deepEqual(f.calls, [], "an AI token is refused before anything is asked of Supabase");
  f = fakeDeps("ok");
  assert.equal((await handleVault(jwt({ sub: "someone" }), { action: "list" }, f.deps)).status, 401);
  assert.deepEqual(f.calls, ["verifyUser"]);
  f = fakeDeps("ok");
  assert.deepEqual(await handleVault(WEBSITE, { action: "drop" }, f.deps), { status: 400, body: { error: "bad_request" } });
  assert.deepEqual(f.calls, ["verifyUser"]);
});

test("a failing dependency answers 500 with a code only", async () => {
  const { deps } = fakeDeps("ok");
  deps.keyStatus = async () => {
    throw new Error("portal_vault_meta read failed");
  };
  assert.deepEqual(await handleVault(WEBSITE, { action: "list" }, deps), { status: 500, body: { error: "server_error" } });
});
