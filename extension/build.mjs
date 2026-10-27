// Bundles the extension into dist/ (or OUT_DIR). TRACKER_URL (env) is baked in at build time.
// The service worker is an ES module (manifest "type": "module"); content scripts cannot be modules, so content and panel are IIFEs.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const trackerUrl = process.env.TRACKER_URL || "http://localhost:3000";
const out = process.env.OUT_DIR || "dist";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = {
  outdir: out,
  bundle: true,
  target: "chrome120",
  define: { __TRACKER_URL__: JSON.stringify(trackerUrl) },
  logLevel: "info",
};
await build({ ...common, entryPoints: { background: "src/background.ts" }, format: "esm" });
// uiuc-main runs in myIllini's own (MAIN) world: the dormant alert/confirm hook the UIUC filler switches on while it adds courses.
await build({ ...common, entryPoints: { content: "src/content.ts", "assist-content": "src/assist-content.ts", panel: "src/panel.ts", "uiuc-main": "src/uiuc-main.ts" }, format: "iife" });

copyFileSync("manifest.json", join(out, "manifest.json"));
copyFileSync("panel.html", join(out, "panel.html"));
copyFileSync("panel.css", join(out, "panel.css"));
console.log(`built ${out}/ (TRACKER_URL=${trackerUrl})`);
