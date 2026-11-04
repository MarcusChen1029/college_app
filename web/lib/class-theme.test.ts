import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASS_THEMES, THEME_STYLE, isClassTheme, themeFor } from "./class-theme.ts";

test("CLASS_THEMES lists exactly the six site colors", () => {
  assert.deepEqual([...CLASS_THEMES], ["ink", "coral", "mint", "lilac", "sun", "sky"]);
});

test("isClassTheme accepts only the six themes", () => {
  for (const t of CLASS_THEMES) assert.equal(isClassTheme(t), true);
  for (const v of ["pink", "", "Ink", null, undefined, 3, {}]) assert.equal(isClassTheme(v), false);
});

test("themeFor: a valid theme wins", () => {
  assert.equal(themeFor("x", "coral"), "coral");
  assert.equal(themeFor("anything", "sky"), "sky");
});

test("themeFor: an invalid or missing theme falls back to a stable pick from the id", () => {
  for (const theme of ["pink", null, undefined, ""] as const) {
    const first = themeFor("x", theme);
    assert.ok((CLASS_THEMES as readonly string[]).includes(first));
    for (let n = 0; n < 5; n++) assert.equal(themeFor("x", theme), first);
  }
  // the fallback does not depend on which invalid value came in
  assert.equal(themeFor("x", "pink"), themeFor("x", null));
});

test("themeFor: different ids spread over more than one theme", () => {
  const seen = new Set<string>();
  for (let n = 0; n < 20; n++) seen.add(themeFor(`3f2a9c1e-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, null));
  assert.ok(seen.size > 1, `only saw ${[...seen].join(",")}`);
});

test("themeFor: an empty id still returns a theme", () => {
  assert.ok((CLASS_THEMES as readonly string[]).includes(themeFor("", null)));
});

test("THEME_STYLE covers every theme; sun, sky and mint use ink text on their banner", () => {
  for (const t of CLASS_THEMES) {
    const s = THEME_STYLE[t];
    assert.ok(s.bg && s.fg && s.avatarBg && s.avatarFg, `style for ${t} is incomplete`);
  }
  for (const t of ["sun", "sky", "mint"] as const) assert.equal(THEME_STYLE[t].fg, "var(--color-ink)");
  for (const t of ["ink", "coral", "lilac"] as const) assert.equal(THEME_STYLE[t].fg, "#fff");
  for (const t of CLASS_THEMES) assert.equal(THEME_STYLE[t].bg, `var(--color-${t})`);
});
