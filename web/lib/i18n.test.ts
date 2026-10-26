import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { computeFit } from "./fit.ts";
import { interpolate, parseLocale } from "./i18n/core.ts";
import { en } from "./i18n/en.ts";
import { fitReasonText } from "./i18n/fit-text.ts";
import { DICTIONARIES, makeT, navLabel, translate } from "./i18n/index.ts";
import { NAV_LABEL_KEYS } from "./i18n/messages/common.ts";
import { SECTIONS } from "./i18n/sections.ts";
import { zhTW } from "./i18n/zh-TW.ts";
import { accountMenuFor, navFor } from "./roles.ts";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("both dictionaries have exactly the same keys, all non-empty", () => {
  assert.deepEqual(Object.keys(zhTW).sort(), Object.keys(en).sort());
  for (const [locale, dict] of Object.entries(DICTIONARIES)) {
    for (const [k, v] of Object.entries(dict)) assert.ok(typeof v === "string" && v.trim() !== "", `${locale} ${k} is empty`);
  }
});

test("each translation keeps the English placeholders", () => {
  for (const k of Object.keys(en) as (keyof typeof en)[]) assert.deepEqual(placeholders(zhTW[k]), placeholders(en[k]), k);
});

test("no key is defined by two sections (a spread would silently overwrite it)", () => {
  const total = Object.values(SECTIONS).reduce((n, s) => n + Object.keys(s.en).length, 0);
  assert.equal(Object.keys(en).length, total);
  for (const [name, s] of Object.entries(SECTIONS)) {
    if (name === "common") continue; // site chrome: several prefixes (nav., account., …)
    for (const k of Object.keys(s.en)) assert.ok(k.startsWith(`${name}.`), `${k} should start with ${name}.`);
  }
});

test("interpolate fills {vars} and leaves unknown ones visible", () => {
  assert.equal(interpolate("剩 {n} 天", { n: 3 }), "剩 3 天");
  assert.equal(interpolate("{a} and {a}", { a: "x" }), "x and x");
  assert.equal(interpolate("Hi {name}", {}), "Hi {name}");
  assert.equal(interpolate("plain"), "plain");
  assert.equal(translate("en", "status.deadline.days", { n: 9 }), "9 days");
  assert.equal(translate("zh-TW", "status.deadline.days", { n: 9 }), "剩 9 天");
});

test("parseLocale defaults to English", () => {
  assert.equal(parseLocale("zh-TW"), "zh-TW");
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("fr"), "en");
  assert.equal(parseLocale(undefined), "en");
});

test("every nav and menu label in roles.ts has a translation", () => {
  const items = [
    ...navFor("student", { signedIn: true, started: true }),
    ...navFor("teacher", { signedIn: true, started: true }),
    ...navFor(null, { signedIn: false, started: false }),
    ...accountMenuFor("student"),
    ...accountMenuFor("teacher"),
  ];
  const zh = makeT("zh-TW");
  const enT = makeT("en");
  for (const [, label] of items) {
    assert.ok(label in NAV_LABEL_KEYS, `missing NAV_LABEL_KEYS["${label}"]`);
    assert.equal(navLabel(enT, label), label);
    assert.notEqual(navLabel(zh, label), label);
  }
  assert.equal(navLabel(zh, "Something new"), "Something new");
});

test("the English fit reason equals lib/fit.ts reason", () => {
  const college = { admit_rate: 25, intl_admit_rate: 12, sat_p25: 1300, sat_p75: 1500, act_p25: 29, act_p75: 34, test_policy: "required" };
  const t = makeT("en");
  for (const student of [{ sat: 1550 }, { sat: 1400 }, { sat: 1100 }, {}, { sat: 1400, international: true }, { act: 35 }]) {
    for (const c of [college, { ...college, admit_rate: 8 }, { ...college, admit_rate: 13 }, { ...college, admit_rate: 45 }, { ...college, admit_rate: 70, test_policy: "blind" }]) {
      const r = computeFit(student, c);
      assert.ok(r);
      assert.equal(fitReasonText(t, r), r.reason);
      assert.notEqual(fitReasonText(makeT("zh-TW"), r), r.reason);
    }
  }
});

test("every key is used somewhere in the app (literally, or under a `prefix.${…}` / \"prefix.\" + … key)", () => {
  const root = join(import.meta.dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && !p.includes(join("i18n", "messages"))) files.push(p);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(join(root, d));
  let source = files.map((f) => readFileSync(f, "utf8")).join("\n");
  // The nav label map lives in a messages file; count the keys it points at.
  source += JSON.stringify(Object.values(NAV_LABEL_KEYS));
  const dynamicPrefixes = [
    ...[...source.matchAll(/`([a-zA-Z]+(?:\.[\w-]+)*\.)\$\{/g)].map((m) => m[1]),
    ...[...source.matchAll(/"([a-zA-Z]+(?:\.[\w-]+)*\.)"\s*\+/g)].map((m) => m[1]),
  ];
  const unused = Object.keys(en).filter((k) => !source.includes(`"${k}"`) && !source.includes(`'${k}'`) && !dynamicPrefixes.some((p) => k.startsWith(p)));
  assert.deepEqual(unused, []);
});
