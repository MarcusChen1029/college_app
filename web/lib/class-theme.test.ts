import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const INK = "#12304a";
const WHITE = "#fff";

test("THEME_STYLE covers every theme with literal hex colors (no var() that Tailwind may not emit)", () => {
  for (const t of CLASS_THEMES) {
    const s = THEME_STYLE[t];
    for (const v of [s.bg, s.fg, s.avatarBg, s.avatarFg]) assert.match(v, /^#[0-9a-f]{3}([0-9a-f]{3})?$/, `${t}: ${v}`);
  }
});

test("THEME_STYLE banner colors match the --color-* tokens in globals.css", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const t of CLASS_THEMES) {
    const m = new RegExp(`--color-${t}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
    assert.ok(m, `globals.css has no --color-${t}`);
    assert.equal(THEME_STYLE[t].bg.toLowerCase(), m[1].toLowerCase(), `${t} banner color drifted from globals.css`);
  }
});

test("THEME_STYLE text: only ink takes white; the other five banners take ink text", () => {
  assert.equal(THEME_STYLE.ink.fg, WHITE);
  for (const t of ["coral", "mint", "lilac", "sun", "sky"] as const) assert.equal(THEME_STYLE[t].fg, INK, t);
});

test("THEME_STYLE: every fg/bg pair is an allowed pair, and the avatar flips the banner's text color", () => {
  for (const t of CLASS_THEMES) {
    const s = THEME_STYLE[t];
    const allowed = t === "ink" ? [[WHITE, INK]] : [[INK, s.bg]];
    assert.ok(allowed.some(([fg, bg]) => s.fg === fg && s.bg === bg), `${t}: ${s.fg} on ${s.bg} is not allowed`);
    // avatar sits on the banner: ink with a white letter, or on the ink banner white with an ink letter
    const avatar = t === "ink" ? [WHITE, INK] : [INK, WHITE];
    assert.deepEqual([s.avatarBg, s.avatarFg], avatar, `${t} avatar`);
  }
});

function luminance(hex: string): number {
  const h = hex === "#fff" ? "#ffffff" : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("THEME_STYLE text and avatar pairs meet WCAG AA (4.5:1)", () => {
  for (const t of CLASS_THEMES) {
    const s = THEME_STYLE[t];
    assert.ok(contrast(s.fg, s.bg) >= 4.5, `${t} banner text ${contrast(s.fg, s.bg).toFixed(2)}`);
    assert.ok(contrast(s.avatarFg, s.avatarBg) >= 4.5, `${t} avatar ${contrast(s.avatarFg, s.avatarBg).toFixed(2)}`);
  }
});
