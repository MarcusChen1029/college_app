import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkPackage, DEFAULT_OUT, LIVE_TRACKER_URL, REQUIRED_FILES } from "./package.mjs";
import { crc32, makeZip, readZip } from "./zip.mjs";

const manifestText = readFileSync(fileURLToPath(new URL("../manifest.json", import.meta.url)), "utf8");
const buf = (s) => Buffer.from(s, "utf8");

test("crc32 matches the known check value", () => {
  assert.equal(crc32(buf("123456789")), 0xcbf43926);
});

test("makeZip/readZip round-trip, sorted and deterministic", () => {
  const entries = [
    { name: "b.txt", data: buf("hello ".repeat(100)) },
    { name: "a/c.bin", data: Buffer.from([1, 2, 3]) },
    { name: "u-ü.txt", data: buf("unicode name") },
  ];
  const zip = makeZip(entries);
  assert.deepEqual(makeZip([...entries].reverse()), zip);
  const back = readZip(zip);
  assert.deepEqual(back.map((e) => e.name), ["a/c.bin", "b.txt", "u-ü.txt"]);
  assert.deepEqual(back.find((e) => e.name === "b.txt").data, entries[0].data);
  assert.deepEqual(back.find((e) => e.name === "a/c.bin").data, Buffer.from([1, 2, 3]));
});

test("readZip rejects a corrupted entry; makeZip rejects unsafe names", () => {
  const zip = makeZip([{ name: "x.txt", data: buf("some content that is long enough to stay deflated ".repeat(5)) }]);
  const bad = Buffer.from(zip);
  bad[40] ^= 0xff;
  assert.throws(() => readZip(bad));
  for (const name of ["", "/abs", "a/../b", "a\\b"]) assert.throws(() => makeZip([{ name, data: buf("x") }]), /bad zip entry name/);
});

function fakeEntries(overrides = {}) {
  const key = JSON.parse(manifestText).key;
  const files = {
    "manifest.json": JSON.stringify({ name: "x", key }),
    "background.js": `const u = "${LIVE_TRACKER_URL}";`,
    "content.js": "1",
    "panel.js": "2",
    "panel.html": "<html>",
    "panel.css": "a{}",
    ...overrides,
  };
  return Object.entries(files)
    .filter(([, v]) => v !== null)
    .map(([name, v]) => ({ name, data: buf(v) }));
}

test("checkPackage: a complete package has no problems", () => {
  assert.deepEqual(checkPackage(fakeEntries(), manifestText), []);
});

test("checkPackage: flags missing files, a changed key and a build that is not pointed at the live site", () => {
  assert.match(checkPackage(fakeEntries({ "panel.html": null }), manifestText).join(), /missing panel\.html/);
  assert.match(checkPackage(fakeEntries({ "manifest.json": JSON.stringify({ key: "other" }) }), manifestText).join(), /key differs/);
  assert.match(checkPackage(fakeEntries({ "background.js": 'fetch("http://localhost:3000")' }), manifestText).join(), /does not contain https:\/\/www\.track-ur-college\.com/);
});

test("the committed download zip is complete, keeps the pinned key and points at the live site", () => {
  const zip = readFileSync(DEFAULT_OUT);
  assert.ok(zip.length < 1024 * 1024, "zip should be under 1 MB");
  const entries = readZip(zip);
  assert.deepEqual(checkPackage(entries, manifestText), []);
  const names = entries.map((e) => e.name);
  for (const f of REQUIRED_FILES) assert.ok(names.includes(f), `${f} at the zip root`);
});
