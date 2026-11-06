import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import { FAKE_KEY, sampleData, startFakeSupabase } from "./fake-supabase.mjs";
import { startAdminServer } from "./server.mjs";

let fake;
let admin;
let token;

/** Raw request, so a test controls every header (fetch would not let it set Host). */
function call(method, path, { body, headers = {}, port = admin.port, withToken = true } = {}) {
  const payload = typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(withToken ? { "x-admin-token": token } : {}),
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

const inThirtyDays = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

before(async () => {
  fake = await startFakeSupabase();
  admin = await startAdminServer({ supabaseUrl: fake.url, serviceKey: FAKE_KEY, port: 0 });
  const page = await call("GET", "/", { withToken: false });
  token = page.text.match(/name="admin-token" content="([0-9a-f]+)"/)[1];
});

beforeEach(() => {
  const fresh = sampleData();
  fake.data.users = fresh.users;
  fake.data.tables = fresh.tables;
});

after(() => {
  admin.server.close();
  fake.server.close();
  admin.server.closeAllConnections();
  fake.server.closeAllConnections();
});

test("the server only listens on this computer", () => {
  assert.equal(admin.server.address().address, "127.0.0.1");
});

test("the page is sent with a strict content policy and is never cached or framed", async () => {
  const page = await call("GET", "/", { withToken: false });
  assert.equal(page.status, 200);
  assert.match(page.headers["content-security-policy"], /default-src 'none'/);
  assert.match(page.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(page.headers["cache-control"], "no-store");
});

test("the service key never appears in the page", async () => {
  const page = await call("GET", "/", { withToken: false });
  assert.equal(page.text.includes(FAKE_KEY), false);
});

test("an API call without the token gets nothing", async () => {
  const response = await call("GET", "/api/accounts", { withToken: false });
  assert.equal(response.status, 403);
  assert.equal(response.text.includes("example.test"), false);
});

test("a request from a rebinding host name gets nothing", async () => {
  const response = await call("GET", "/", { withToken: false, headers: { host: "evil.example:4177" } });
  assert.equal(response.status, 403);
});

test("the code list shows use counts, status and who used each code", async () => {
  const { json } = await call("GET", "/api/codes");
  const [first, second] = json.codes;
  assert.equal(first.code, "classa2027spring");
  assert.equal(first.status, "on");
  assert.equal(first.used, 2);
  assert.equal(first.limit, 3);
  assert.equal(first.expiresOn, inThirtyDays());
  assert.deepEqual(first.redemptions, [
    { email: null, on: "2026-11-04", entryYear: null, orderStatus: null },
    { email: "student@example.test", on: "2026-11-03", entryYear: 2027, orderStatus: "paid" },
  ]);
  assert.equal(second.code, "freetest");
  assert.equal(second.status, "off");
  assert.equal(second.limit, null);
});

test("use counts are right past the API's 1000-row read cap", async () => {
  for (let i = 0; i < 1100; i++) {
    fake.data.tables.coupon_redemptions.push({ id: `x${i}`, coupon_code: "freetest", user_id: null, order_id: null, redeemed_at: "2026-11-05T00:00:00Z" });
  }
  const { json } = await call("GET", "/api/codes");
  assert.equal(json.codes.find((code) => code.code === "freetest").used, 1100);
});

test("creating a code stores it and returns it", async () => {
  const response = await call("POST", "/api/codes", { body: { maxUses: 30, expiresOn: inThirtyDays(), note: "Class B" } });
  assert.equal(response.status, 201);
  assert.match(response.json.code.code, /^[a-z0-9]{16}$/);
  assert.equal(response.json.code.limit, 30);
  assert.equal(response.json.code.status, "on");
  const stored = fake.data.tables.coupons.find((row) => row.code === response.json.code.code);
  assert.equal(stored.max_redemptions, 30);
  assert.equal(stored.note, "Class B");
});

test("a code with no usage limit is refused and nothing is stored", async () => {
  const before = fake.data.tables.coupons.length;
  const response = await call("POST", "/api/codes", { body: { expiresOn: inThirtyDays() } });
  assert.equal(response.status, 400);
  assert.match(response.json.error, /usage limit/i);
  assert.equal(fake.data.tables.coupons.length, before);
});

test("a typed code that already exists gets a plain message", async () => {
  const response = await call("POST", "/api/codes", { body: { code: "classa2027spring", maxUses: 1, expiresOn: inThirtyDays() } });
  assert.equal(response.status, 409);
  assert.match(response.json.error, /already exists/);
});

test("the usage limit and note can be edited", async () => {
  const response = await call("PATCH", "/api/codes/classa2027spring", { body: { maxUses: 10, note: "Bigger class" } });
  assert.equal(response.status, 200);
  assert.equal(response.json.code.limit, 10);
  assert.equal(fake.data.tables.coupons[0].note, "Bigger class");
});

test("a code can be switched off", async () => {
  const response = await call("PATCH", "/api/codes/classa2027spring", { body: { active: false } });
  assert.equal(response.json.code.status, "off");
  assert.equal(fake.data.tables.coupons[0].active, false);
});

test("the old short code can't be switched back on", async () => {
  const response = await call("PATCH", "/api/codes/freetest", { body: { active: true } });
  assert.equal(response.status, 400);
  assert.equal(fake.data.tables.coupons[1].active, false);
});

test("a limit below the uses already made is refused", async () => {
  const response = await call("PATCH", "/api/codes/classa2027spring", { body: { maxUses: 1 } });
  assert.equal(response.status, 400);
  assert.equal(fake.data.tables.coupons[0].max_redemptions, 3);
});

test("editing a code that doesn't exist says so", async () => {
  const response = await call("PATCH", "/api/codes/nosuchcodehere", { body: { active: false } });
  assert.equal(response.status, 404);
});

test("a code in the address is checked before it reaches the database", async () => {
  const response = await call("PATCH", "/api/codes/x%26code%3Dneq.y", { body: { active: false } });
  assert.equal(response.status, 404);
  assert.equal(fake.data.tables.coupons[0].active, true);
});

test("the account list shows names and emails but no portal logins or student records", async () => {
  const response = await call("GET", "/api/accounts");
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.json.accounts.map((account) => account.email),
    ["new@example.test", "teacher@example.test", "student@example.test"],
  );
  const student = response.json.accounts[2];
  assert.equal(student.name, "<b>Sam</b> Student");
  assert.equal(student.plan, "Pass until 2027-07-31");
  assert.equal(student.colleges, 2);
  assert.equal(response.text.includes("PORTAL-USERNAME-MUST-NOT-LEAK"), false);
  assert.equal(response.text.includes("sat_total"), false);
});

test("a body that is too large or not JSON is refused", async () => {
  const tooLarge = await call("POST", "/api/codes", { body: JSON.stringify({ note: "x".repeat(20000) }) });
  assert.equal(tooLarge.status, 413);
  const broken = await call("POST", "/api/codes", { body: "{not json" });
  assert.equal(broken.status, 400);
});

test("an unknown address gets a 404", async () => {
  assert.equal((await call("GET", "/api/nothing")).status, 404);
  assert.equal((await call("GET", "/other", { withToken: false })).status, 404);
});

test("a wrong key gets a clear message that doesn't repeat the key", async () => {
  const wrong = await startAdminServer({ supabaseUrl: fake.url, serviceKey: "wrong-key-value", port: 0 });
  const page = await call("GET", "/", { port: wrong.port, withToken: false });
  const wrongToken = page.text.match(/name="admin-token" content="([0-9a-f]+)"/)[1];
  const response = await call("GET", "/api/codes", { port: wrong.port, withToken: false, headers: { "x-admin-token": wrongToken } });
  wrong.server.close();
  wrong.server.closeAllConnections();
  assert.equal(response.status, 502);
  assert.match(response.json.error, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(response.text.includes("wrong-key-value"), false);
});

test("Supabase being unreachable gets a clear message", async () => {
  const down = await startAdminServer({ supabaseUrl: "http://127.0.0.1:9", serviceKey: FAKE_KEY, port: 0 });
  const page = await call("GET", "/", { port: down.port, withToken: false });
  const downToken = page.text.match(/name="admin-token" content="([0-9a-f]+)"/)[1];
  const response = await call("GET", "/api/codes", { port: down.port, withToken: false, headers: { "x-admin-token": downToken } });
  down.server.close();
  down.server.closeAllConnections();
  assert.equal(response.status, 502);
  assert.match(response.json.error, /reach Supabase/);
});
