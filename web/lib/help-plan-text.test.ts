import assert from "node:assert/strict";
import { test } from "node:test";
import { planLimitsText } from "../components/help/plan-text.ts";
import { HTML_LANG, makeT } from "./i18n/index.ts";
import { PLANS } from "./plans.ts";

test("help's plan sentence names every plan with its own limit, whatever the plan set", () => {
  const en = makeT("en");
  assert.equal(planLimitsText([{ key: "free", limit: 5 }, { key: "senior", limit: null }], en, "en"), "5 colleges on Free and any number on Admission-year pass");
  assert.equal(planLimitsText([{ key: "free", limit: 3 }], en, "en"), "3 colleges on Free");
  for (const locale of ["en", "zh-TW"] as const) {
    const t = makeT(locale);
    const text = planLimitsText(PLANS, t, HTML_LANG[locale]);
    for (const p of PLANS) {
      const name = t(`payments.planName.${p.key}`);
      assert.ok(text.includes(name), `${locale}: ${name} missing from "${text}"`);
    }
    for (const p of PLANS) if (p.limit != null) assert.ok(text.includes(String(p.limit)), `${locale}: limit ${p.limit} missing from "${text}"`);
    assert.doesNotMatch(text, /\{|\}|\s{2}/, `${locale}: unfilled or doubled space in "${text}"`);
  }
  // zh-TW names the plans in Chinese (no English plan name leaks in) and never doubles 方案 around a name.
  const zh = planLimitsText(PLANS, makeT("zh-TW"), HTML_LANG["zh-TW"]);
  assert.doesNotMatch(zh, /Free|Admission|方案\s*方案/, zh);
});
