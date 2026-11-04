import assert from "node:assert/strict";
import { test } from "node:test";
import type { CodeResult } from "./join-codes.ts";
import {
  PENDING_JOIN_KEY,
  clearPendingCode,
  inviteStep,
  inviteUrl,
  keepPendingAfter,
  parseInviteHash,
  readPendingCode,
  savePendingCode,
} from "./join-invite.ts";

/** A minimal in-memory Storage. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

/** A Storage whose every call throws, like a blocked or full one. */
function brokenStorage(): Storage {
  const boom = () => {
    throw new Error("blocked");
  };
  return { get length(): number { return boom(); }, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

test("parseInviteHash reads a code from the fragment", () => {
  assert.equal(parseInviteHash("#abcd-2345"), "ABCD2345");
  assert.equal(parseInviteHash("#ABCD2345"), "ABCD2345");
  assert.equal(parseInviteHash("ABCD2345"), "ABCD2345");
  assert.equal(parseInviteHash("#"), null);
  assert.equal(parseInviteHash(""), null);
  assert.equal(parseInviteHash("#short"), null);
  assert.equal(parseInviteHash("#ABCD-0OIL"), null); // characters no code uses
});

test("inviteUrl puts the code in the fragment", () => {
  assert.equal(inviteUrl("https://www.track-ur-college.com", "ABCD2345"), "https://www.track-ur-college.com/join#ABCD2345");
});

test("the pending code survives a round trip and can be cleared", () => {
  const s = fakeStorage();
  assert.equal(readPendingCode(s), null);
  savePendingCode("abcd-2345", s);
  assert.equal(s.getItem(PENDING_JOIN_KEY), "ABCD2345");
  assert.equal(readPendingCode(s), "ABCD2345");
  clearPendingCode(s);
  assert.equal(readPendingCode(s), null);
});

test("a stored value that is not a code reads as nothing", () => {
  const s = fakeStorage();
  s.setItem(PENDING_JOIN_KEY, "hello");
  assert.equal(readPendingCode(s), null);
});

test("a blocked Storage never throws", () => {
  const s = brokenStorage();
  assert.doesNotThrow(() => savePendingCode("ABCD2345", s));
  assert.equal(readPendingCode(s), null);
  assert.doesNotThrow(() => clearPendingCode(s));
});

test("without a Storage argument and without sessionStorage nothing throws", () => {
  assert.doesNotThrow(() => savePendingCode("ABCD2345"));
  assert.doesNotThrow(() => readPendingCode());
  assert.doesNotThrow(() => clearPendingCode());
});

test("inviteStep walks the sign-in, role and code states", () => {
  const base = { sessionChecked: true, signedIn: true, role: "student" as const, code: "ABCD2345" };
  assert.equal(inviteStep({ ...base, sessionChecked: false }), "loading");
  assert.equal(inviteStep({ ...base, signedIn: false }), "sign_in");
  assert.equal(inviteStep({ ...base, role: undefined }), "loading");
  assert.equal(inviteStep({ ...base, role: null }), "welcome");
  assert.equal(inviteStep({ ...base, role: "teacher" }), "teacher");
  assert.equal(inviteStep({ ...base, code: null }), "no_code");
  assert.equal(inviteStep(base), "preview");
});

test("inviteStep: signed out wins over a missing code, and the unchecked session wins over everything", () => {
  assert.equal(inviteStep({ sessionChecked: true, signedIn: false, role: undefined, code: null }), "sign_in");
  assert.equal(inviteStep({ sessionChecked: false, signedIn: true, role: "teacher", code: null }), "loading");
});

test("keepPendingAfter keeps the code only after a good preview", () => {
  const ok: CodeResult = { ok: true, preview: { kind: "class", teacherName: "Ms. Lee", school: null, className: "Seniors", alreadyLinked: false } };
  assert.equal(keepPendingAfter(ok), true);
  for (const error of ["invalid", "rate_limited", "failed"] as const) assert.equal(keepPendingAfter({ ok: false, error }), false, error);
});
