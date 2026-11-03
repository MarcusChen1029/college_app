// Turns plain text into text and link pieces. Only http(s) addresses become links; everything else (javascript:,
// data:, ftp:, mailto: ...) stays text. The caller renders text pieces as plain React text and link pieces as
// <a href target="_blank" rel="noopener noreferrer nofollow">, so user text never reaches the DOM as markup.

export type Piece = { kind: "text"; text: string } | { kind: "link"; href: string; text: string };

// An address stops at whitespace, <, > and ", and at CJK punctuation (U+3000-303F, e.g. 。、「」) and full-width forms
// (U+FF00-FFEF, e.g. ，：）), which end a sentence in Chinese text and are never part of a real address.
const URL_CHARS = String.raw`[^\s<>"　-〿＀-￯]`;
const URL_RE = new RegExp(`https?:\\/\\/${URL_CHARS}+`, "gi");
const WHOLE_URL_RE = new RegExp(`^https?:\\/\\/${URL_CHARS}+$`, "i");
const TRAILING_PUNCTUATION = ".,;:!?";

/** True when the whole string is one http(s) address with a host. */
export function isHttpUrl(s: string): boolean {
  if (!WHOLE_URL_RE.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "";
  } catch {
    return false;
  }
}

const count = (s: string, ch: string): number => s.split(ch).length - 1;

/** Cuts trailing sentence punctuation and a closing bracket that has no opening one off a matched address. */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    const head = url.slice(0, end);
    if (TRAILING_PUNCTUATION.includes(last) || (last === ")" && count(head, ")") > count(head, "("))) end--;
    else break;
  }
  return url.slice(0, end);
}

/** Splits text into text and link pieces, in order. Adjacent text is never split into two pieces. */
export function splitLinks(text: string): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0; // start of text not yet emitted
  for (const m of text.matchAll(URL_RE)) {
    const url = trimTrailing(m[0]);
    if (!isHttpUrl(url)) continue; // e.g. "https://." stays text
    const start = m.index;
    if (start > cursor) pieces.push({ kind: "text", text: text.slice(cursor, start) });
    pieces.push({ kind: "link", href: url, text: url });
    cursor = start + url.length;
  }
  if (cursor < text.length) pieces.push({ kind: "text", text: text.slice(cursor) });
  return pieces;
}
