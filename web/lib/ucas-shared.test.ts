import assert from "node:assert/strict";
import { test } from "node:test";
import { ucasSharedPatches, ucasSharedValues, UCAS_PS_ANCHOR, UCAS_REFERENCE_ANCHOR } from "./ucas-shared.ts";
import type { Checklist } from "./checklist.ts";

const e = (slug: string, checklist: Checklist = {}, custom?: object) =>
  ({ slug, checklist, custom: custom ?? null }) as never;

test("anchors", () => {
  assert.equal(UCAS_PS_ANCHOR, "ucas-ps");
  assert.equal(UCAS_REFERENCE_ANCHOR, "ucas-reference");
});

test("values", () => {
  assert.deepEqual(ucasSharedValues({ ucas: { status: "final" } }), { ucas_ps: true, ucas_reference: false });
  assert.deepEqual(ucasSharedValues({ ucas: { status: "revising", reference: true } }), { ucas_ps: false, ucas_reference: true });
  assert.deepEqual(ucasSharedValues(undefined), { ucas_ps: false, ucas_reference: false });
});

test("only GB entries", () => {
  const list = [e("ucl"), e("harvard"), e("melbourne"), e("ucl", {}, { name: "My UK school" })];
  const out = ucasSharedPatches(list.slice(0, 3), { ucas: { status: "final", reference: true } });
  assert.deepEqual(out, [{ slug: "ucl", checklist: { ucas_ps: true, ucas_reference: true } }]);
  const custom = ucasSharedPatches([e("ucl", {}, { name: "My UK school" })], { ucas: { status: "final" } });
  assert.deepEqual(custom, []);
});

test("un-ticks when the source goes back", () => {
  const out = ucasSharedPatches([e("ucl", { ucas_ps: true })], { ucas: { status: "drafting" } });
  assert.equal(out.length, 1);
  assert.equal(out[0].checklist.ucas_ps, false);
});

test("idempotent", () => {
  assert.deepEqual(ucasSharedPatches([e("ucl", { ucas_ps: true, ucas_reference: true })], { ucas: { status: "final", reference: true } }), []);
});

test("missing keys equal false", () => {
  assert.deepEqual(ucasSharedPatches([e("ucl")], undefined), []);
});

test("keeps other keys", () => {
  const out = ucasSharedPatches([e("ucl", { english_plan: "ielts", extra_steps: { a: true } } as Checklist)], { ucas: { status: "final" } });
  assert.equal(out[0].checklist.english_plan, "ielts");
  assert.deepEqual(out[0].checklist.extra_steps, { a: true });
});
