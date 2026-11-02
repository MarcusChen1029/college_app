import assert from "node:assert/strict";
import { test } from "node:test";
import { lastChecked, lastCheckedLine } from "./freshness.ts";

test("lastChecked is the latest source access date", () => {
  assert.equal(lastChecked([{ accessed_on: "2026-10-21" }, { accessed_on: "2026-10-27" }, { accessed_on: null }]), "2026-10-27");
  assert.equal(lastChecked([{ accessed_on: "2026-10-27" }, { accessed_on: "2026-10-21" }]), "2026-10-27");
  assert.equal(lastChecked([{ accessed_on: "2026-10-20" }]), "2026-10-20");
});

test("lastChecked is null when no source has a usable date", () => {
  assert.equal(lastChecked([]), null);
  assert.equal(lastChecked([{ accessed_on: null }, { accessed_on: undefined }]), null);
  // Anything that is not an ISO calendar date is ignored, never shown.
  assert.equal(lastChecked([{ accessed_on: "" }, { accessed_on: "yesterday" }, { accessed_on: "10/27/2026" }]), null);
  assert.equal(lastChecked([{ accessed_on: "soon" }, { accessed_on: "2026-10-21" }]), "2026-10-21");
});

test("lastCheckedLine is the header line for the AI tools, or null when there is no date", () => {
  assert.equal(lastCheckedLine("2026-10-27"), "Last checked: 2026-10-27 (latest source access date).");
  assert.equal(lastCheckedLine(null), null);
});
