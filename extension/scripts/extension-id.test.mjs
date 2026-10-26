import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deriveExtensionId } from "./extension-id.mjs";

test("deriveExtensionId maps sha256(DER) hex digits 0-f to a-p, 32 chars", () => {
  // Fixed fake DER bytes; the expected value is computed independently from the spec.
  const b64 = Buffer.from("fixed-test-der-bytes").toString("base64");
  const hex = createHash("sha256").update(Buffer.from("fixed-test-der-bytes")).digest("hex").slice(0, 32);
  const expected = hex.replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"["0123456789abcdef".indexOf(c)]);
  assert.equal(deriveExtensionId(b64), expected);
  assert.match(deriveExtensionId(b64), /^[a-p]{32}$/);
});

test("deriveExtensionId matches a known vector (sha256 of empty input = e3b0c442...)", () => {
  // e3b0c44298fc1c149afbf4c8996fb924 (first 32 hex chars) mapped digit-by-digit
  assert.equal(deriveExtensionId(""), "odlameecjipmbmbejkplpemijjgpljce");
});

test("manifest.json key derives the pinned id in web/.env.example", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const env = readFileSync(new URL("../../web/.env.example", import.meta.url), "utf8");
  const pinned = /^NEXT_PUBLIC_EXTENSION_ID=(.*)$/m.exec(env)?.[1].trim();
  assert.equal(deriveExtensionId(manifest.key), pinned);
});
