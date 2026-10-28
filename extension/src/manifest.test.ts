import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SITE_ORIGINS } from "./sites.ts";

type Manifest = {
  permissions: string[];
  host_permissions: string[];
  content_scripts: { matches: string[]; js: string[]; world?: string }[];
};
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")) as Manifest;

test("permissions are the least the extension needs: no \"tabs\" (EXT-4)", () => {
  assert.deepEqual([...manifest.permissions].sort(), ["identity", "sidePanel", "storage"]);
});

test("host permissions are exactly the portals in sites.ts, so tab.url stays readable for them without the tabs permission (EXT-4, EXT-12)", () => {
  // siteOf(tab.url) decides which system the panel shows. Without "tabs", Chrome fills tab.url only for hosts the extension has permission for.
  const portals = Object.values(SITE_ORIGINS).flat().map((o) => `${o}/*`).sort();
  assert.deepEqual([...manifest.host_permissions].sort(), portals);
  // The Supabase API answers CORS for any origin (checked for this extension's origin), so the service worker needs no host permission for it.
  assert.ok(!manifest.host_permissions.some((h) => /supabase\.co/.test(h)));
});

test("content scripts run only on hosts the extension has permission for, and only the MAIN-world hook is MAIN", () => {
  for (const cs of manifest.content_scripts) for (const m of cs.matches) assert.ok(manifest.host_permissions.includes(m), m);
  const main = manifest.content_scripts.filter((cs) => cs.world === "MAIN");
  assert.deepEqual(main.map((cs) => cs.js), [["uiuc-main.js"]]);
  assert.deepEqual(main[0].matches, ["https://myillini.illinois.edu/*"]);
});
