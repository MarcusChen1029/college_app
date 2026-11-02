import assert from "node:assert/strict";
import { test } from "node:test";
import { lastChecked, lastCheckedLine, listedSources } from "./freshness.ts";

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

test("listedSources is the college's database sources plus its supplement sources, the items its Sources list shows", () => {
  const db = [{ accessed_on: "2026-10-21" }, { accessed_on: "2026-10-21" }];
  const supp = [{ accessed: "2026-10-27" }];
  const listed = listedSources(db, supp);
  assert.equal(listed.length, 3);
  assert.equal(lastChecked(listed), "2026-10-27");
  // A supplement's `accessed` is read as `accessed_on`; the inputs are not changed.
  assert.deepEqual(listed, [{ accessed_on: "2026-10-21" }, { accessed_on: "2026-10-21" }, { accessed_on: "2026-10-27" }]);
  assert.equal(db.length, 2);
});

test("listedSources without supplements is the database sources only", () => {
  const db = [{ accessed_on: "2026-10-21" }, { accessed_on: "2026-10-20" }];
  for (const none of [undefined, null, []]) {
    const listed = listedSources(db, none);
    assert.equal(listed.length, 2);
    assert.equal(lastChecked(listed), "2026-10-21");
  }
  assert.deepEqual(listedSources([], undefined), []);
});

test("listedSources counts every listed item, even one without a usable date, but only dated ones set the date", () => {
  const listed = listedSources([{ accessed_on: "2026-10-21" }], [{ accessed: "" }, { accessed: "2026-10-23" }]);
  assert.equal(listed.length, 3);
  assert.equal(lastChecked(listed), "2026-10-23");
  assert.equal(lastChecked(listedSources([], [{ accessed: "2026-10-27" }])), "2026-10-27");
});

test("lastCheckedLine is the header line for the AI tools, or null when there is no date", () => {
  assert.equal(lastCheckedLine("2026-10-27"), "Last checked: 2026-10-27 (latest source access date).");
  assert.equal(lastCheckedLine(null), null);
});
