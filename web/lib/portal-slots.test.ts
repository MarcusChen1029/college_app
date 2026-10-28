import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collegeSlot,
  IMPORT_MAX,
  importFailures,
  isPortalSlot,
  keepStoredPasswords,
  loginCount,
  pairWithAccount,
  parseVaultRequest,
  PASSWORD_MAX,
  passwordsIn,
  portalSlot,
  portalWithoutPassword,
  withoutPasswords,
} from "./portal-slots.ts";
import { campusKey, type PortalData } from "./portals.ts";
import { COLLEGE_COLUMNS, fromEntry, fromProfile, portalColumns, PROFILE_COLUMNS, toEntry, toProfile, type CollegeRow, type ProfileRow } from "./student-rows.ts";

const INST = "33333333-3333-4333-8333-333333333333";
const ROW = "44444444-4444-4444-8444-444444444444";

test("slots: one stable string per login", () => {
  assert.equal(portalSlot("system", "commonapp"), "system:commonapp");
  assert.equal(portalSlot("campus", campusKey("applytexas", "UT Austin (MyStatus)")), "campus:applytexas:UT Austin (MyStatus)");
  assert.equal(portalSlot("custom", "abc-1"), "custom:abc-1");
  // A listed college is found by the same value rowKey uses: its institution, or the row id for a typed-in college.
  assert.equal(collegeSlot({ institutionId: INST }), `college:${INST}`);
  assert.equal(collegeSlot({ institutionId: "", custom: { name: "Mine" }, rowId: ROW }), `college:${ROW}`);
  assert.equal(collegeSlot({ institutionId: "" }), null, "an old entry with no institution id yet");
  assert.equal(collegeSlot({ institutionId: INST, custom: { name: "Mine" } }), null, "a custom college needs its row id");
});

test("slot format check", () => {
  for (const ok of ["system:commonapp", "system:educationplannerbc", "campus:uc:UCLA", "campus:applytexas:Texas A&M", "campus:applytexas:UT Austin (MyStatus)", "custom:1730000000000-abc123", `custom:${ROW}`, `college:${INST}`])
    assert.ok(isPortalSlot(ok), ok);
  for (const bad of [
    "",
    "commonapp",
    ":x",
    "system:",
    "system:Common App",
    "campus:uc",
    "campus:uc:",
    "campus:uc:bad\nname",
    "custom:has space",
    "custom:a/b",
    "college:not-a-uuid",
    "college:../../x",
    "toString:x",
    "__proto__:x",
    `campus:uc:${"x".repeat(200)}`,
    42,
    null,
  ])
    assert.equal(isPortalSlot(bad), false, String(bad));
});

const legacy = {
  systems: { commonapp: { url: "https://apply.commonapp.org", username: "me@x.com", password: "ca-secret" }, uc: { url: "", username: "", password: "" } },
  campuses: { "uc:UCLA": { url: "", username: "bruin", password: "ucla-secret" } },
  custom: [{ id: "abc-1", name: "Housing", url: "", username: "h", password: "custom-secret", region: "GB" }],
  progress: { commonapp: { done: true } },
} as unknown as PortalData;

test("withoutPasswords removes every password and keeps everything else", () => {
  const out = withoutPasswords(legacy);
  assert.ok(!JSON.stringify(out).includes("password"));
  assert.ok(!JSON.stringify(out).includes("secret"));
  assert.deepEqual(out, {
    systems: { commonapp: { url: "https://apply.commonapp.org", username: "me@x.com" }, uc: { url: "", username: "" } },
    campuses: { "uc:UCLA": { url: "", username: "bruin" } },
    custom: [{ id: "abc-1", name: "Housing", url: "", username: "h", region: "GB" }],
    progress: { commonapp: { done: true } },
  });
  assert.ok(JSON.stringify(legacy).includes("ca-secret"), "the input is not changed");
  assert.deepEqual(withoutPasswords(null), {});
  assert.deepEqual(withoutPasswords(undefined), {});
  assert.deepEqual(withoutPasswords(["x"] as never), {});
  assert.deepEqual(withoutPasswords({ systems: { a: "junk" }, custom: [null, 3] } as never), { systems: { a: "junk" }, custom: [null, 3] });
  assert.deepEqual(portalWithoutPassword({ url: "u", username: "n", password: "p" }), { url: "u", username: "n" });
  assert.deepEqual(portalWithoutPassword(undefined), { url: "", username: "" });
});

test("passwordsIn finds the passwords of old-shaped data by slot; loginCount counts the logins", () => {
  const list = [
    { institutionId: INST, portal: { url: "", username: "kid", password: "college-secret" } },
    { institutionId: "", custom: { name: "Mine" }, rowId: ROW, portal: { url: "", username: "", password: "mine-secret" } },
    { institutionId: "", portal: { url: "", username: "lost", password: "unplaceable" } }, // old entry, no id yet
    { institutionId: INST, portal: { url: "", username: "", password: "duplicate-slot" } },
  ];
  assert.deepEqual(passwordsIn(legacy, list), [
    { slot: "system:commonapp", password: "ca-secret" },
    { slot: "campus:uc:UCLA", password: "ucla-secret" },
    { slot: "custom:abc-1", password: "custom-secret" },
    { slot: `college:${INST}`, password: "college-secret" },
    { slot: `college:${ROW}`, password: "mine-secret" },
  ]);
  assert.deepEqual(passwordsIn({ systems: { x: { password: "y".repeat(PASSWORD_MAX + 1) }, "Bad Key": { password: "z" } } }), [], "over-long or unplaceable");
  assert.deepEqual(passwordsIn(null), []);
  // Logins with a username or a password: commonapp, UCLA, Housing, the listed college, the custom college, plus one unplaceable username.
  assert.equal(loginCount(legacy, list, passwordsIn(legacy, list)), 6);
  assert.equal(loginCount({}, [], []), 0);
});

test("parseVaultRequest checks every action", () => {
  assert.deepEqual(parseVaultRequest({ action: "list" }), { ok: true, req: { action: "list" } });
  assert.deepEqual(parseVaultRequest({ action: "reveal", slot: "system:uc" }), { ok: true, req: { action: "reveal", slot: "system:uc" } });
  assert.deepEqual(parseVaultRequest({ action: "delete", slot: "custom:a" }), { ok: true, req: { action: "delete", slot: "custom:a" } });
  assert.deepEqual(parseVaultRequest({ action: "set", slot: "system:uc", password: "pw" }), { ok: true, req: { action: "set", slot: "system:uc", password: "pw" } });
  assert.deepEqual(parseVaultRequest({ action: "set", slot: "system:uc", password: "" }), { ok: true, req: { action: "set", slot: "system:uc", password: "" } }, "empty deletes");
  assert.deepEqual(parseVaultRequest({ action: "set", slot: "system:uc", password: "x".repeat(PASSWORD_MAX) }).ok, true);
  assert.deepEqual(parseVaultRequest({ action: "set", slot: "system:uc", password: "x".repeat(PASSWORD_MAX + 1) }), { ok: false, error: "bad_password" });
  assert.deepEqual(parseVaultRequest({ action: "set", slot: "system:uc", password: 5 }), { ok: false, error: "bad_password" });
  assert.deepEqual(parseVaultRequest({ action: "set", slot: "nope", password: "pw" }), { ok: false, error: "bad_slot" });
  assert.deepEqual(parseVaultRequest({ action: "reveal" }), { ok: false, error: "bad_slot" });
  assert.deepEqual(parseVaultRequest({ action: "drop" }), { ok: false, error: "bad_request" });
  assert.deepEqual(parseVaultRequest(null), { ok: false, error: "bad_request" });
  assert.deepEqual(parseVaultRequest([]), { ok: false, error: "bad_request" });

  const entries = [
    { slot: "system:uc", password: "a" },
    { slot: "system:uc", password: "second wins nothing" },
    { slot: "custom:x", password: "b" },
  ];
  assert.deepEqual(parseVaultRequest({ action: "import", entries }), { ok: true, req: { action: "import", entries: [entries[0], entries[2]] } });
  assert.deepEqual(parseVaultRequest({ action: "import", entries: [{ slot: "system:uc", password: "" }] }), { ok: false, error: "bad_password" });
  assert.deepEqual(parseVaultRequest({ action: "import", entries: [{ slot: "bad", password: "a" }] }), { ok: false, error: "bad_slot" });
  assert.deepEqual(parseVaultRequest({ action: "import", entries: "x" }), { ok: false, error: "bad_request" });
  const many = Array.from({ length: IMPORT_MAX + 1 }, (_, i) => ({ slot: `custom:c${i}`, password: "p" }));
  assert.deepEqual(parseVaultRequest({ action: "import", entries: many }), { ok: false, error: "too_many" });
  assert.equal(parseVaultRequest({ action: "import", entries: many.slice(0, IMPORT_MAX) }).ok, true);
});

test("the profile and list rows never read or write a password", () => {
  assert.ok(!COLLEGE_COLUMNS.includes("password"));
  assert.ok(!PROFILE_COLUMNS.includes("password"));
  assert.ok(!("portal_password" in portalColumns({ url: "u", username: "n", password: "p" } as never)));

  // The portals jsonb is stripped before every profile write, even if a stale copy in memory still had passwords.
  const written = fromProfile("u1", { portals: legacy });
  assert.ok(!JSON.stringify(written).includes("password"));
  assert.ok(!JSON.stringify(written).includes("secret"));
  assert.equal(written.portals.systems?.commonapp.username, "me@x.com");

  // An old profile row still holding passwords is stripped as it is read.
  const read = toProfile({ portals: legacy } as unknown as ProfileRow);
  assert.ok(!JSON.stringify(read.portals).includes("secret"));

  const entry = toEntry({ id: ROW, institution_id: INST, custom: null, plan_key: null, status: "in_progress", notes: null, checklist: null, portal_url: "u", portal_username: "n", portal_password: "p", created_at: "", institutions: { slug: "x" } } as CollegeRow);
  assert.deepEqual(entry.portal, { url: "u", username: "n" });
  assert.ok(!JSON.stringify(fromEntry("u1", { ...entry, portal: { url: "u", username: "n", password: "p" } as never })).includes("password"));
});

test("migrate is an action with no arguments", () => {
  assert.deepEqual(parseVaultRequest({ action: "migrate" }), { ok: true, req: { action: "migrate" } });
});

test("profile saves keep the password keys the database still holds (until the server migrates them)", () => {
  const stored = {
    systems: { commonapp: { url: "", username: "ca", password: "OLD" }, uc: { url: "", username: "u", password: "" } },
    campuses: { "uc:UCLA": { url: "", username: "b", password: "UCLA" } },
    custom: [{ id: "c1", name: "H", url: "", username: "", password: "C1" }, { id: "gone", name: "", url: "", username: "", password: "G" }],
  };
  // What the page writes: no passwords, a username changed, one custom portal removed by the student.
  const next: PortalData = {
    systems: { commonapp: { url: "", username: "ca-new" }, uc: { url: "", username: "u" } },
    campuses: { "uc:UCLA": { url: "", username: "b" } },
    custom: [{ id: "c1", name: "H", url: "", username: "" }],
    progress: { commonapp: { done: true } },
  };
  assert.deepEqual(keepStoredPasswords(next, stored), {
    systems: { commonapp: { url: "", username: "ca-new", password: "OLD" }, uc: { url: "", username: "u" } },
    campuses: { "uc:UCLA": { url: "", username: "b", password: "UCLA" } },
    custom: [{ id: "c1", name: "H", url: "", username: "", password: "C1" }],
    progress: { commonapp: { done: true } },
  });
  assert.deepEqual(keepStoredPasswords(next, null), next, "nothing stored: nothing added");
  assert.deepEqual(keepStoredPasswords(next, withoutPasswords(stored as never)), next, "after migration the save carries none");
  // fromProfile does the same with the value last read.
  const row = fromProfile("u1", { portals: next }, stored);
  assert.equal(row.portals.systems?.commonapp && (row.portals.systems.commonapp as Record<string, unknown>).password, "OLD");
});

test("an import reply: failed slots are kept, the rest confirmed; a failed request keeps everything", () => {
  const entries = [
    { slot: "system:uc", password: "a" },
    { slot: "custom:x", password: "b" },
  ];
  assert.deepEqual(importFailures(entries, { status: 200, data: { imported: 1, kept: 0, failed: ["custom:x"] } }), [entries[1]]);
  assert.deepEqual(importFailures(entries, { status: 200, data: { imported: 2, kept: 0, failed: [] } }), []);
  assert.deepEqual(importFailures(entries, { status: 503, data: { configured: false } }), entries);
  assert.deepEqual(importFailures(entries, { status: 0, data: { error: "network" } }), entries);
  assert.deepEqual(importFailures(entries, { status: 200, data: {} }), entries, "an unexpected reply confirms nothing");
});

test("a local password joins the account's login only when the account has no username there, or the same one", () => {
  const INST2 = "77777777-7777-4777-8777-777777777777";
  const passwords = [
    { slot: "system:commonapp", password: "legacy-pw" },
    { slot: "system:ucas", password: "ucas-pw" },
    { slot: "system:uc", password: "uc-pw" },
    { slot: `college:${INST}`, password: "college-pw" },
    { slot: `college:${INST2}`, password: "college2-pw" },
  ];
  const account = {
    portals: { systems: { commonapp: { url: "", username: "ca_student" }, uc: { url: "", username: "same" } } },
    list: [{ institutionId: INST, portal: { url: "", username: "" } }],
  };
  const local = {
    portals: { systems: { commonapp: { url: "", username: "legacy_ca" }, ucas: { url: "", username: "uk" }, uc: { url: "", username: " same " } } },
    list: [
      { institutionId: INST, portal: { url: "", username: "kid" } },
      { institutionId: INST2, portal: { url: "", username: "kid2" } },
    ],
  };
  const { send, hold } = pairWithAccount(passwords, account, local);
  // Common App: the account has ca_student, the browser saved the password with legacy_ca -> stays in the browser.
  assert.deepEqual(hold.map((p) => p.slot), ["system:commonapp"]);
  assert.deepEqual(send.map((p) => p.slot), ["system:ucas", "system:uc", `college:${INST}`, `college:${INST2}`]);
});
