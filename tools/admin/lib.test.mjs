import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkEdit,
  codeStatus,
  expiryFromDate,
  generateCode,
  guardRequest,
  normalizeCode,
  parseEdit,
  parseEnv,
  parseNewCode,
  passLabel,
  summarizeAccounts,
  taipeiDate,
} from "./lib.mjs";

const TODAY = "2026-11-06";
const NOW = new Date("2026-11-06T04:00:00Z");
const LONG = "abcdefghjkmn2345";

test("normalizeCode lowercases and strips spaces and dashes, as redeem_coupon does", () => {
  assert.equal(normalizeCode(" AB-cd 12 "), "abcd12");
});

test("generateCode makes 16 characters the coupons table accepts, without look-alikes", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.match(code, /^[a-z0-9]{16}$/);
    assert.doesNotMatch(code, /[01ilo]/);
  }
});

test("generateCode does not repeat", () => {
  const codes = new Set(Array.from({ length: 200 }, generateCode));
  assert.equal(codes.size, 200);
});

test("expiryFromDate means the end of that day in Taipei", () => {
  assert.equal(expiryFromDate("2026-12-31"), "2026-12-31T23:59:59+08:00");
});

test("taipeiDate reads a stored time on the Taipei calendar", () => {
  assert.equal(taipeiDate("2026-12-31T15:59:59+00:00"), "2026-12-31");
  assert.equal(taipeiDate("2026-12-31T16:00:00+00:00"), "2027-01-01");
  assert.equal(taipeiDate(null), null);
});

test("parseNewCode generates a code when none is typed", () => {
  const result = parseNewCode({ maxUses: 5, expiresOn: "2026-12-31", note: " Class A " }, TODAY);
  assert.equal(result.ok, true);
  assert.match(result.row.code, /^[a-z0-9]{16}$/);
  assert.equal(result.row.max_redemptions, 5);
  assert.equal(result.row.expires_at, "2026-12-31T23:59:59+08:00");
  assert.equal(result.row.note, "Class A");
});

test("parseNewCode keeps a typed code in its stored form", () => {
  const result = parseNewCode({ code: "SPRING-2027-CLASS-A", maxUses: 1, expiresOn: TODAY }, TODAY);
  assert.equal(result.row.code, "spring2027classa");
});

test("parseNewCode stores an empty note as null", () => {
  const result = parseNewCode({ maxUses: 1, expiresOn: TODAY, note: "  " }, TODAY);
  assert.equal(result.row.note, null);
});

for (const [name, body, message] of [
  ["a short typed code", { code: "freetest", maxUses: 1, expiresOn: TODAY }, /at least 12/],
  ["a code with symbols", { code: "abcdefghjkmn!!", maxUses: 1, expiresOn: TODAY }, /letters and numbers/],
  ["a code over 32 characters", { code: "a".repeat(33), maxUses: 1, expiresOn: TODAY }, /at most 32/],
  ["a missing usage limit", { expiresOn: TODAY }, /usage limit/i],
  ["a zero usage limit", { maxUses: 0, expiresOn: TODAY }, /usage limit/i],
  ["a fractional usage limit", { maxUses: 1.5, expiresOn: TODAY }, /usage limit/i],
  ["a huge usage limit", { maxUses: 10001, expiresOn: TODAY }, /usage limit/i],
  ["a missing expiry", { maxUses: 1 }, /expiry/i],
  ["a past expiry", { maxUses: 1, expiresOn: "2026-11-05" }, /past/],
  ["an impossible date", { maxUses: 1, expiresOn: "2026-02-31" }, /expiry/i],
  ["a very long note", { maxUses: 1, expiresOn: TODAY, note: "x".repeat(201) }, /200/],
]) {
  test(`parseNewCode refuses ${name}`, () => {
    const result = parseNewCode(body, TODAY);
    assert.equal(result.ok, false);
    assert.match(result.error, message);
  });
}

test("parseEdit keeps only the fields that were sent", () => {
  assert.deepEqual(parseEdit({ active: false }, TODAY), { ok: true, patch: { active: false } });
  assert.deepEqual(parseEdit({ note: "" }, TODAY), { ok: true, patch: { note: null } });
  assert.deepEqual(parseEdit({ maxUses: 9, expiresOn: "2027-01-01" }, TODAY), {
    ok: true,
    patch: { max_redemptions: 9, expires_at: "2027-01-01T23:59:59+08:00" },
  });
});

test("parseEdit never lets the code or kind change", () => {
  assert.deepEqual(parseEdit({ code: "other", kind: "x", note: "n" }, TODAY), { ok: true, patch: { note: "n" } });
});

test("parseEdit refuses an empty change, a bad limit and a past expiry", () => {
  assert.equal(parseEdit({}, TODAY).ok, false);
  assert.equal(parseEdit({ active: "yes" }, TODAY).ok, false);
  assert.equal(parseEdit({ maxUses: 0 }, TODAY).ok, false);
  assert.equal(parseEdit({ expiresOn: "2026-01-01" }, TODAY).ok, false);
});

const row = (over = {}) => ({
  code: LONG,
  active: true,
  max_redemptions: 5,
  expires_at: "2026-12-31T15:59:59+00:00",
  note: null,
  ...over,
});

test("checkEdit allows a change that leaves a safe code on", () => {
  assert.equal(checkEdit(row(), { max_redemptions: 8 }, 2, NOW), null);
});

test("checkEdit refuses a limit below the uses already made", () => {
  assert.match(checkEdit(row(), { max_redemptions: 2 }, 3, NOW), /already been used 3/);
});

test("checkEdit refuses to switch on a short code such as the old freetest", () => {
  const old = row({ code: "freetest", active: false, max_redemptions: null, expires_at: null });
  assert.match(checkEdit(old, { active: true }, 1, NOW), /new code/);
});

test("checkEdit refuses to switch on a code with no limit or no expiry", () => {
  assert.match(checkEdit(row({ active: false, max_redemptions: null }), { active: true }, 0, NOW), /usage limit/);
  assert.match(checkEdit(row({ active: false, expires_at: null }), { active: true }, 0, NOW), /expiry/);
});

test("checkEdit refuses to switch on an expired code unless the date moves too", () => {
  const expired = row({ active: false, expires_at: "2026-01-01T00:00:00+00:00" });
  assert.match(checkEdit(expired, { active: true }, 0, NOW), /expiry/);
  assert.equal(checkEdit(expired, { active: true, expires_at: "2026-12-31T23:59:59+08:00" }, 0, NOW), null);
});

test("checkEdit lets the note change on any code", () => {
  const old = row({ code: "freetest", max_redemptions: null, expires_at: null });
  assert.equal(checkEdit(old, { note: "old" }, 1, NOW), null);
});

test("checkEdit always allows switching a code off", () => {
  const old = row({ code: "freetest", max_redemptions: null, expires_at: null });
  assert.equal(checkEdit(old, { active: false }, 1, NOW), null);
});

test("codeStatus says why a code does or does not work", () => {
  assert.equal(codeStatus(row(), 4, NOW), "on");
  assert.equal(codeStatus(row(), 5, NOW), "used up");
  assert.equal(codeStatus(row({ expires_at: "2026-11-06T03:59:59+00:00" }), 0, NOW), "expired");
  assert.equal(codeStatus(row({ active: false }), 0, NOW), "off");
  assert.equal(codeStatus(row({ max_redemptions: null, expires_at: null }), 900, NOW), "on");
});

test("passLabel reports the pass covering today, then the next one, then Free", () => {
  const windows = [
    { entry_year: 2027, from: "2026-01-01", until: "2027-07-31" },
    { entry_year: 2028, from: "2027-01-01", until: "2028-07-31" },
  ];
  assert.equal(passLabel(windows, TODAY), "Pass until 2027-07-31");
  assert.equal(passLabel(windows.slice(1), TODAY), "Pass starts 2027-01-01");
  assert.equal(passLabel([{ entry_year: 2026, from: "2025-01-01", until: "2026-07-31" }], TODAY), "Free");
  assert.equal(passLabel(null, TODAY), "Free");
});

test("summarizeAccounts joins each user to name, role, pass and list size, newest first", () => {
  const accounts = summarizeAccounts({
    users: [
      { id: "s", email: "s@x.test", created_at: "2026-10-01T00:00:00Z", last_sign_in_at: "2026-11-01T00:00:00Z" },
      { id: "t", email: "t@x.test", created_at: "2026-11-01T00:00:00Z", last_sign_in_at: null },
      { id: "n", email: "n@x.test", created_at: "2026-09-01T00:00:00Z" },
    ],
    roles: [
      { user_id: "s", role: "student" },
      { user_id: "t", role: "teacher" },
    ],
    profiles: [{ user_id: "s", display_name: "Sam", plan_windows: [{ entry_year: 2027, from: "2026-01-01", until: "2027-07-31" }] }],
    teachers: [{ user_id: "t", display_name: "Tess", school: "North High" }],
    colleges: [{ user_id: "s" }, { user_id: "s" }],
    today: TODAY,
  });
  assert.deepEqual(accounts, [
    { id: "t", email: "t@x.test", name: "Tess", school: "North High", role: "teacher", plan: "Free", colleges: 0, joined: "2026-11-01", lastSignIn: null },
    { id: "s", email: "s@x.test", name: "Sam", school: null, role: "student", plan: "Pass until 2027-07-31", colleges: 2, joined: "2026-10-01", lastSignIn: "2026-11-01" },
    { id: "n", email: "n@x.test", name: null, school: null, role: null, plan: "Free", colleges: 0, joined: "2026-09-01", lastSignIn: null },
  ]);
});

const allowed = { port: 4177, token: "secret-token" };
const headers = (over = {}) => ({ host: "127.0.0.1:4177", "x-admin-token": "secret-token", ...over });

test("guardRequest lets the page and its own API calls through", () => {
  assert.equal(guardRequest({ method: "GET", path: "/", headers: { host: "127.0.0.1:4177" } }, allowed), null);
  assert.equal(guardRequest({ method: "GET", path: "/", headers: { host: "localhost:4177" } }, allowed), null);
  assert.equal(guardRequest({ method: "GET", path: "/api/codes", headers: headers() }, allowed), null);
  assert.equal(
    guardRequest(
      {
        method: "POST",
        path: "/api/codes",
        headers: headers({ origin: "http://127.0.0.1:4177", "content-type": "application/json", "sec-fetch-site": "same-origin" }),
      },
      allowed,
    ),
    null,
  );
});

test("guardRequest refuses another host name, which stops DNS rebinding", () => {
  assert.equal(guardRequest({ method: "GET", path: "/", headers: { host: "evil.example:4177" } }, allowed).status, 403);
  assert.equal(guardRequest({ method: "GET", path: "/", headers: {} }, allowed).status, 403);
});

test("guardRequest refuses an API call with a missing or wrong token", () => {
  assert.equal(guardRequest({ method: "GET", path: "/api/codes", headers: { host: "127.0.0.1:4177" } }, allowed).status, 403);
  assert.equal(guardRequest({ method: "GET", path: "/api/codes", headers: headers({ "x-admin-token": "nope" }) }, allowed).status, 403);
});

test("guardRequest refuses a call sent from another website", () => {
  const evil = headers({ origin: "https://evil.example", "content-type": "application/json" });
  assert.equal(guardRequest({ method: "POST", path: "/api/codes", headers: evil }, allowed).status, 403);
  const crossSite = headers({ "sec-fetch-site": "cross-site", "content-type": "application/json" });
  assert.equal(guardRequest({ method: "POST", path: "/api/codes", headers: crossSite }, allowed).status, 403);
});

test("guardRequest refuses a write that is not JSON", () => {
  const form = headers({ "content-type": "text/plain" });
  assert.equal(guardRequest({ method: "POST", path: "/api/codes", headers: form }, allowed).status, 415);
});

test("parseEnv reads KEY=value lines and ignores comments and blanks", () => {
  assert.deepEqual(parseEnv('# note\n\nA=1\r\nB="two"\nC = three \n'), { A: "1", B: "two", C: "three" });
});
