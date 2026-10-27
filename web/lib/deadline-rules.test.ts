import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { isFafsaOnly as edgeIsFafsaOnly } from "../../supabase/functions/_shared/fafsa.ts";
import { deadlineApplies, isFafsaOnly } from "./deadline-rules.ts";

const aid = (label: string | null) => ({ kind: "financial_aid", plan_key: null, label });
const intl = { plan: null, international: true };
const domestic = { plan: null, international: false };

test("FAFSA-only dates are recognised; dates that also name another form are not", () => {
  for (const l of ["FAFSA priority filing date", "FAFSA deadline - Regular Decision", "FAFSA priority deadline", "FAFSA/WASFA priority date"]) {
    assert.equal(isFafsaOnly(l), true, l);
  }
  for (const l of [
    "CSS Profile / FAFSA (RD)",
    "CSS Profile + FAFSA (ED I)",
    "FAFSA/CSS Profile - Regular Decision",
    "Financial aid priority (RD): FAFSA, CSS Profile, IDOC",
    "General Scholarship application and FAFSA deadline",
    "CSS Profile (RD)",
    "Financial aid deadline (RD)",
    "International aid application (ED)",
    "",
    null,
  ]) {
    assert.equal(isFafsaOnly(l), false, String(l));
  }
});

test("international students don't get FAFSA-only dates; CSS Profile / FAFSA stays", () => {
  assert.equal(deadlineApplies(aid("FAFSA priority filing date"), intl), false);
  assert.equal(deadlineApplies(aid("CSS Profile / FAFSA (RD)"), intl), true);
  assert.equal(deadlineApplies(aid("CSS Profile (RD)"), intl), true);
});

test("domestic students see every date, FAFSA included", () => {
  assert.equal(deadlineApplies(aid("FAFSA priority filing date"), domestic), true);
  assert.equal(deadlineApplies(aid("CSS Profile / FAFSA (RD)"), domestic), true);
});

test("once a plan is picked, only that plan's application deadline applies; other kinds always do", () => {
  const app = (plan_key: string) => ({ kind: "application", plan_key, label: null });
  assert.equal(deadlineApplies(app("ED"), { plan: "ED", international: false }), true);
  assert.equal(deadlineApplies(app("RD"), { plan: "ED", international: false }), false);
  assert.equal(deadlineApplies(app("RD"), { plan: null, international: false }), true);
  assert.equal(deadlineApplies({ kind: "deposit", plan_key: "RD", label: "Deposit" }, { plan: "ED", international: true }), true);
});

test("the reminder function's twin agrees on every deadline label in the data", () => {
  const dataDir = new URL("../../data/", import.meta.url);
  const files = [new URL("cycle_2026_27.json", dataDir), ...readdirSync(new URL("cycle_2026_27/", dataDir)).map((f) => new URL(`cycle_2026_27/${f}`, dataDir))];
  const labels = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      // Deadlines in data/ are { kind, plan, due, label, ... }.
      if (typeof r.label === "string" && typeof r.kind === "string" && "due" in r) labels.add(r.label);
      Object.values(r).forEach(walk);
    }
  };
  for (const f of files) walk(JSON.parse(readFileSync(f, "utf8")));
  assert.ok(labels.size > 500, `expected the full label set, got ${labels.size}`);
  for (const l of labels) assert.equal(edgeIsFafsaOnly(l), isFafsaOnly(l), l);
  // Positive control: the data really has FAFSA-only dates for the predicate to hide.
  assert.ok([...labels].filter(isFafsaOnly).length >= 4);
});
