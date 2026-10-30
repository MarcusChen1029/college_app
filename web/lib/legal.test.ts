import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AREA_TAB } from "../components/settings/settings-tabs.ts";
import { en } from "./i18n/en.ts";
import { zhTW } from "./i18n/zh-TW.ts";
import { legalDate } from "./legal.ts";

test("legalDate writes the date by hand in each language", () => {
  assert.equal(legalDate("en", { year: 2026, month: 10, day: 29 }), "October 29, 2026");
  assert.equal(legalDate("zh-TW", { year: 2026, month: 1, day: 5 }), "2026 年 1 月 5 日");
});

const links = (s: string) => [...s.matchAll(/\]\((\/[^)#]*)(?:#([\w-]+))?\)/g)].map((m) => ({ route: m[1], anchor: m[2] }));

test("every [label](/path#section) link in the dictionaries opens a real page and section", () => {
  const app = join(import.meta.dirname, "..", "app");
  for (const [locale, dict] of [["en", en], ["zh-TW", zhTW]] as const) {
    for (const [k, v] of Object.entries(dict)) {
      for (const { route, anchor } of links(v)) {
        const page = ["(app)", "(explore)", ""].map((g) => join(app, g, route, "page.tsx")).find(existsSync);
        assert.ok(page, `${locale} ${k}: no page for ${route}`);
        // /settings shows one view at a time; its areas (all mounted) and the view each opens are in settings-tabs.ts.
        if (anchor && route === "/settings") assert.ok(anchor in AREA_TAB, `${locale} ${k}: /settings has no area #${anchor}`);
        else if (anchor) assert.ok(readFileSync(page, "utf8").includes(`id: "${anchor}"`), `${locale} ${k}: ${route} has no section #${anchor}`);
      }
    }
  }
});

test("no link sits inside <b>…</b> (LegalRich would print it as raw text)", () => {
  for (const [locale, dict] of [["en", en], ["zh-TW", zhTW]] as const) {
    for (const [k, v] of Object.entries(dict)) {
      for (const m of v.matchAll(/<b>(.*?)<\/b>/g)) assert.ok(!m[1].includes("]("), `${locale} ${k}: link inside <b>`);
    }
  }
});

test("both languages link to the same places", () => {
  for (const k of Object.keys(en) as (keyof typeof en)[]) {
    const where = (s: string) => links(s).map((l) => `${l.route}#${l.anchor ?? ""}`).sort();
    assert.deepEqual(where(zhTW[k]), where(en[k]), k);
  }
});
