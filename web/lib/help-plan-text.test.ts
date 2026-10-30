import assert from "node:assert/strict";
import { test } from "node:test";
import { planLimitsText } from "../components/help/plan-text.ts";
import { HTML_LANG, makeT } from "./i18n/index.ts";
import { PLANS } from "./plans.ts";

test("help's plan sentence names every plan with its own limit, whatever the plan set", () => {
  const en = makeT("en");
  assert.equal(planLimitsText([{ name: "Free", limit: 5 }, { name: "Senior", limit: null }], en, "en"), "5 colleges on Free and any number on Senior");
  assert.equal(planLimitsText([{ name: "Free", limit: 3 }], en, "en"), "3 colleges on Free");
  for (const locale of ["en", "zh-TW"] as const) {
    const text = planLimitsText(PLANS, makeT(locale), HTML_LANG[locale]);
    for (const p of PLANS) assert.ok(text.includes(p.name), `${locale}: ${p.name} missing from "${text}"`);
    for (const p of PLANS) if (p.limit != null) assert.ok(text.includes(String(p.limit)), `${locale}: limit ${p.limit} missing from "${text}"`);
    assert.doesNotMatch(text, /\{|\}|\s{2}/, `${locale}: unfilled or doubled space in "${text}"`);
  }
});
