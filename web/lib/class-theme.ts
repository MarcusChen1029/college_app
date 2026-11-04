// Banner themes for classes (migration 0053 stores one per class). Exactly six, one per site color token in
// globals.css. A class without a valid theme gets a stable pick from a hash of its id, so it never changes colour.

export const CLASS_THEMES = ["ink", "coral", "mint", "lilac", "sun", "sky"] as const;
export type ClassTheme = (typeof CLASS_THEMES)[number];

export function isClassTheme(v: unknown): v is ClassTheme {
  return typeof v === "string" && (CLASS_THEMES as readonly string[]).includes(v);
}

/** 32-bit FNV-1a: tiny, no dependencies, and the same result on server and client. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A valid stored theme wins; otherwise a stable pick from the class id. */
export function themeFor(id: string, theme?: string | null): ClassTheme {
  if (isClassTheme(theme)) return theme;
  return CLASS_THEMES[hash(id) % CLASS_THEMES.length];
}

/**
 * Colours for a banner and the avatar that sits on it. The values are literal hex copied from the `--color-*` tokens in
 * web/app/globals.css (the source of truth; class-theme.test.ts fails if they drift apart). They are not `var(--color-x)`
 * because Tailwind 4 only emits a @theme variable that some utility uses, so `--color-lilac` can be missing from the
 * built CSS and the banner would render transparent. Only ink takes white text (white on coral or lilac is under
 * 3:1); the other five take ink text. The avatar flips the pair so it stands out from its banner.
 */
export const THEME_STYLE: Record<ClassTheme, { bg: string; fg: string; avatarBg: string; avatarFg: string }> = {
  ink: { bg: "#12304a", fg: "#fff", avatarBg: "#fff", avatarFg: "#12304a" },
  coral: { bg: "#ff7a66", fg: "#12304a", avatarBg: "#12304a", avatarFg: "#fff" },
  mint: { bg: "#6fd9b3", fg: "#12304a", avatarBg: "#12304a", avatarFg: "#fff" },
  lilac: { bg: "#b9a8ff", fg: "#12304a", avatarBg: "#12304a", avatarFg: "#fff" },
  sun: { bg: "#ffd84d", fg: "#12304a", avatarBg: "#12304a", avatarFg: "#fff" },
  sky: { bg: "#cdeafc", fg: "#12304a", avatarBg: "#12304a", avatarFg: "#fff" },
};
