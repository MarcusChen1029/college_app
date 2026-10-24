import assert from "node:assert/strict";
import { test } from "node:test";
import { FIT_LEVEL, buttonClass, fitClass, fitDotClass, tierClass, toneClass } from "./ui.ts";

test("toneClass", () => {
  const c = toneClass("urgent");
  assert.match(c, /text-urgent/);
  assert.match(c, /bg-urgent-bg/);
  assert.match(c, /border-urgent-line/);
});
test("tierClass collapses ++/+ to the letter", () => {
  assert.equal(tierClass("S++"), tierClass("S"));
  assert.equal(tierClass("A+"), tierClass("A"));
  assert.match(tierClass("D"), /border-dashed/);
});
test("FIT_LEVEL", () => {
  assert.equal(FIT_LEVEL.super_reach, 4);
  assert.equal(FIT_LEVEL.safety, 1);
});
test("fit classes", () => {
  assert.match(fitClass("reach"), /text-fit-reach bg-fit-reach-bg border-fit-reach-line/);
  assert.match(fitDotClass("safety"), /bg-fit-safety/);
});
test("buttonClass", () => {
  assert.match(buttonClass("primary"), /h-11/);
  assert.match(buttonClass("primary"), /bg-ink/);
  const d = buttonClass("danger", "sm");
  assert.match(d, /h-9/);
  assert.match(d, /text-urgent/);
  assert.match(buttonClass("secondary"), /bg-white/);
  const a = buttonClass("secondary", "md", true);
  assert.match(a, /bg-zinc-100/);
  assert.doesNotMatch(a, /bg-white/);
});
