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
 * Colours for a banner and the avatar that sits on it, as CSS values from the site tokens. ink, coral and lilac take
 * white text; sun, sky and mint take ink text. The avatar flips the pair so it stands out from its banner.
 */
export const THEME_STYLE: Record<ClassTheme, { bg: string; fg: string; avatarBg: string; avatarFg: string }> = {
  ink: { bg: "var(--color-ink)", fg: "#fff", avatarBg: "#fff", avatarFg: "var(--color-ink)" },
  coral: { bg: "var(--color-coral)", fg: "#fff", avatarBg: "#fff", avatarFg: "var(--color-ink)" },
  mint: { bg: "var(--color-mint)", fg: "var(--color-ink)", avatarBg: "var(--color-ink)", avatarFg: "#fff" },
  lilac: { bg: "var(--color-lilac)", fg: "#fff", avatarBg: "#fff", avatarFg: "var(--color-ink)" },
  sun: { bg: "var(--color-sun)", fg: "var(--color-ink)", avatarBg: "var(--color-ink)", avatarFg: "#fff" },
  sky: { bg: "var(--color-sky)", fg: "var(--color-ink)", avatarBg: "var(--color-ink)", avatarFg: "#fff" },
};
