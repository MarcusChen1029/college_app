import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCustom, customDeadline, customSlug, isCustomSlug } from "./custom-college.ts";

test("a custom college needs a name; fields are trimmed", () => {
  assert.equal(cleanCustom({ name: "  " }).ok, false);
  const r = cleanCustom({ name: " Foo College ", city: " Rome ", region: "" });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { name: "Foo College", city: "Rome", region: undefined, country: undefined, website: undefined, deadline: undefined });
});

test("website gets https:// when missing, and junk is rejected", () => {
  const ok = cleanCustom({ name: "A", website: "foo.edu/apply" });
  assert.ok(ok.ok);
  assert.equal(ok.value.website, "https://foo.edu/apply");
  assert.equal(cleanCustom({ name: "A", website: "http://" }).ok, false);
});

test("deadline must be yyyy-mm-dd and becomes an upcoming date", () => {
  assert.equal(cleanCustom({ name: "A", deadline: "Jan 1" }).ok, false);
  assert.equal(customDeadline("r1", { name: "A" }), null);
  const d = customDeadline("r1", { name: "A", deadline: "2027-01-05" });
  assert.equal(d?.due_date, "2027-01-05");
  assert.equal(d?.institution_id, "r1");
});

test("custom slugs are recognisable", () => {
  assert.ok(isCustomSlug(customSlug("abc")));
  assert.ok(!isCustomSlug("harvard"));
});
