// Builds the extension against the live site and zips it into web/public/downloads/common-app-filler.zip
// (the file the Tools page offers). Builds into a temp dir, so extension/dist (local dev) is left untouched.
// Usage: cd extension && npm run package   (TRACKER_URL overrides the live URL)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TRACKER_URL_PATTERN } from "./tracker-url.mjs";
import { makeZip, readZip } from "./zip.mjs";

export const LIVE_TRACKER_URL = "https://www.track-ur-college.com";
export const REQUIRED_FILES = ["manifest.json", "background.js", "content.js", "panel.js", "panel.html", "panel.css"];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUT = join(ROOT, "..", "web", "public", "downloads", "common-app-filler.zip");

/** All files under `dir` as zip entries (forward-slash names relative to `dir`). */
export function collectFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ name: relative(dir, full).split(sep).join("/"), data: readFileSync(full) });
    }
  };
  walk(dir);
  return out;
}

/** Returns a list of problems with the zip's entries (empty = fine). `sourceManifest` is the text of extension/manifest.json. */
export function checkPackage(entries, sourceManifest, trackerUrl = LIVE_TRACKER_URL) {
  const problems = [];
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  for (const f of REQUIRED_FILES) if (!byName.has(f)) problems.push(`missing ${f} at the zip root`);
  const manifestData = byName.get("manifest.json");
  if (manifestData) {
    const packed = JSON.parse(manifestData.toString("utf8"));
    const source = JSON.parse(sourceManifest);
    if (!source.key) problems.push("source manifest.json has no key");
    else if (packed.key !== source.key) problems.push("manifest.json key differs from extension/manifest.json (the extension id would change)");
  }
  const bg = byName.get("background.js");
  if (bg && !bg.toString("utf8").includes(trackerUrl)) problems.push(`background.js does not contain ${trackerUrl}`);
  // What students install must trust only an https tracker: the local dev address belongs to development builds (EXT-11).
  if (!TRACKER_URL_PATTERN.test(trackerUrl)) problems.push(`a package must be built for an https tracker, not ${trackerUrl}`);
  for (const e of entries) if (e.data.includes("localhost:3000")) problems.push(`${e.name} mentions the dev address localhost:3000`);
  return problems;
}

export function packageExtension({ trackerUrl = LIVE_TRACKER_URL, outFile = DEFAULT_OUT } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "caf-package-"));
  try {
    const built = join(tmp, "dist");
    const r = spawnSync(process.execPath, ["build.mjs"], {
      cwd: ROOT,
      env: { ...process.env, TRACKER_URL: trackerUrl, OUT_DIR: built },
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`build failed (exit ${r.status})`);
    const zip = makeZip(collectFiles(built));
    const entries = readZip(zip);
    const problems = checkPackage(entries, readFileSync(join(ROOT, "manifest.json"), "utf8"), trackerUrl);
    if (problems.length) throw new Error(`package check failed:\n- ${problems.join("\n- ")}`);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, zip);
    return { outFile, bytes: zip.length, files: entries.map((e) => e.name) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = packageExtension({ trackerUrl: process.env.TRACKER_URL || LIVE_TRACKER_URL });
  console.log(`wrote ${res.outFile} (${res.bytes} bytes): ${res.files.join(", ")}`);
}
