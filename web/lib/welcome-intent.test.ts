// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clearWelcomeIntent, readWelcomeIntent, saveWelcomeIntent, welcomeStep, WELCOME_INTENT_KEY, WELCOME_INTENT_TTL_MS } from "./welcome-intent.ts";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

test("a card click is remembered for ten minutes, then forgotten", () => {
  const store = memory();
  saveWelcomeIntent(store, "student", 1_000);
  assert.equal(readWelcomeIntent(store, 1_000), "student");
  assert.equal(readWelcomeIntent(store, 1_000 + WELCOME_INTENT_TTL_MS), "student");
  assert.equal(readWelcomeIntent(store, 1_000 + WELCOME_INTENT_TTL_MS + 1), null);
  // A clock that went backwards is not trusted either.
  assert.equal(readWelcomeIntent(store, 999), null);
});

test("it is used once: reading leaves it, clearing ends it", () => {
  const store = memory();
  saveWelcomeIntent(store, "teacher", 5);
  assert.equal(readWelcomeIntent(store, 6), "teacher");
  assert.equal(readWelcomeIntent(store, 6), "teacher");
  clearWelcomeIntent(store);
  assert.equal(readWelcomeIntent(store, 6), null);
});

test("anything else in storage, or no storage at all, is no intent", () => {
  const store = memory();
  for (const raw of ["", "student", "{}", '{"role":"admin","at":1}', '{"role":"student"}', '{"role":"student","at":"1"}', "{not json"]) {
    store.setItem(WELCOME_INTENT_KEY, raw);
    assert.equal(readWelcomeIntent(store, 1), null, raw);
  }
  assert.equal(readWelcomeIntent(null), null);
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.doesNotThrow(() => saveWelcomeIntent(throwing, "student"));
  assert.equal(readWelcomeIntent(throwing), null);
  assert.doesNotThrow(() => clearWelcomeIntent(throwing));
});

test("a planted /welcome?as=student link never saves a role: with no click in this tab, a no-role account gets the chooser", () => {
  const base = { ready: true, signedIn: true, role: null };
  // The link's ?as= is not an input anywhere: no stored intent means the plain chooser.
  assert.equal(welcomeStep({ ...base, intent: readWelcomeIntent(memory(), 1) }), "choose");
  assert.equal(welcomeStep({ ...base, intent: "student" }), "saveStudent");
  assert.equal(welcomeStep({ ...base, intent: "student", failed: true }), "choose");
  assert.equal(welcomeStep({ ...base, intent: "teacher" }), "teacherForm");
  assert.equal(welcomeStep({ ready: true, signedIn: false, role: undefined, intent: "student" }), "signIn");
  assert.equal(welcomeStep({ ready: true, signedIn: true, role: undefined, intent: "student" }), "loading");
  assert.equal(welcomeStep({ ready: true, signedIn: true, role: "teacher", intent: "student" }), "loading");
  assert.equal(welcomeStep({ ready: false, signedIn: true, role: null, intent: "student" }), "loading");
  // And the page itself reads no role from its address.
  const form = readFileSync(new URL("../components/WelcomeForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(form, /location\.search|URLSearchParams|useSearchParams|searchParams/);
  assert.doesNotMatch(form, /\?as=/);
});
