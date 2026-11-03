import assert from "node:assert/strict";
import { test } from "node:test";
import { isHttpUrl, splitLinks, type Piece } from "./linkify.ts";

const text = (t: string): Piece => ({ kind: "text", text: t });
const link = (href: string, t = href): Piece => ({ kind: "link", href, text: t });

test("splitLinks leaves a trailing full stop outside the link", () => {
  assert.deepEqual(splitLinks("see https://a.org/x."), [text("see "), link("https://a.org/x"), text(".")]);
});

test("splitLinks moves trailing punctuation and an unbalanced bracket out", () => {
  assert.deepEqual(splitLinks("(https://a.org/x)"), [text("("), link("https://a.org/x"), text(")")]);
  assert.deepEqual(splitLinks("Is it https://a.org/x?!"), [text("Is it "), link("https://a.org/x"), text("?!")]);
  assert.deepEqual(splitLinks("(see https://a.org/x)."), [text("(see "), link("https://a.org/x"), text(").")]);
  assert.deepEqual(splitLinks("a https://a.org/x, b"), [text("a "), link("https://a.org/x"), text(", b")]);
});

test("splitLinks keeps a balanced bracket inside the link", () => {
  assert.deepEqual(splitLinks("https://en.wikipedia.org/wiki/Foo_(bar)"), [link("https://en.wikipedia.org/wiki/Foo_(bar)")]);
  assert.deepEqual(splitLinks("(https://en.wikipedia.org/wiki/Foo_(bar))"), [text("("), link("https://en.wikipedia.org/wiki/Foo_(bar)"), text(")")]);
});

test("splitLinks finds several links and keeps the text between them", () => {
  assert.deepEqual(splitLinks("a https://a.org b http://b.org/c d"), [text("a "), link("https://a.org"), text(" b "), link("http://b.org/c"), text(" d")]);
  assert.deepEqual(splitLinks("https://a.org\nhttps://b.org"), [link("https://a.org"), text("\n"), link("https://b.org")]);
});

test("splitLinks never links other schemes", () => {
  assert.deepEqual(splitLinks("javascript:alert(1) data:text/html,x"), [text("javascript:alert(1) data:text/html,x")]);
  assert.deepEqual(splitLinks("ftp://a.org"), [text("ftp://a.org")]);
  assert.deepEqual(splitLinks("mailto:a@b.org"), [text("mailto:a@b.org")]);
});

test("splitLinks matches the scheme case-insensitively", () => {
  assert.deepEqual(splitLinks("HTTP://A.ORG"), [link("HTTP://A.ORG")]);
});

test("splitLinks does not link a bare scheme", () => {
  assert.deepEqual(splitLinks("https://."), [text("https://.")]);
  assert.deepEqual(splitLinks("go to https:// now"), [text("go to https:// now")]);
});

test("splitLinks of nothing and of plain text", () => {
  assert.deepEqual(splitLinks(""), []);
  assert.deepEqual(splitLinks("no links here"), [text("no links here")]);
});

test("splitLinks stops a link at angle brackets and quotes", () => {
  assert.deepEqual(splitLinks('<a href="https://a.org">x</a>'), [text('<a href="'), link("https://a.org"), text('">x</a>')]);
});

test("isHttpUrl accepts only whole http(s) URLs", () => {
  assert.equal(isHttpUrl("https://x.org/a"), true);
  assert.equal(isHttpUrl("http://x.org"), true);
  assert.equal(isHttpUrl("HTTPS://X.ORG"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("ftp://x.org"), false);
  assert.equal(isHttpUrl("https://"), false);
  assert.equal(isHttpUrl("https://x.org with space"), false);
  assert.equal(isHttpUrl("see https://x.org"), false);
  assert.equal(isHttpUrl(""), false);
});
