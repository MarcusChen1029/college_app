import assert from "node:assert/strict";
import { test } from "node:test";
import { pickTab, tabHref } from "./class-tab.ts";

const IDS = ["stream", "classwork", "people"] as const;

test("pickTab: a known tab wins", () => {
  assert.equal(pickTab("classwork", IDS), "classwork");
  assert.equal(pickTab("people", IDS), "people");
});

test("pickTab: missing, empty or unknown means the first tab", () => {
  for (const raw of [null, "", "Stream", "grades", "classwork ", "__proto__", "toString"]) assert.equal(pickTab(raw, IDS), "stream", String(raw));
});

test("tabHref: sets tab and keeps the path, other query values and the hash", () => {
  assert.equal(tabHref("/counselor/class/abc", "people"), "/counselor/class/abc?tab=people");
  assert.equal(tabHref("http://localhost:3000/counselor/class/abc?tab=stream", "classwork"), "/counselor/class/abc?tab=classwork");
  assert.equal(tabHref("https://x.test/c?c=conv-1&tab=stream#top", "people"), "/c?c=conv-1&tab=people#top");
});

test("tabHref: a tab id is encoded, not injected", () => {
  assert.equal(tabHref("/p", "a&b=c"), "/p?tab=a%26b%3Dc");
});
