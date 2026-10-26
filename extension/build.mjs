// Bundles the extension into dist/. TRACKER_URL (env) is baked in at build time.
// The service worker is an ES module (manifest "type": "module"); content scripts cannot be modules, so content and panel are IIFEs.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

const trackerUrl = process.env.TRACKER_URL || "http://localhost:3000";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const common = {
  outdir: "dist",
  bundle: true,
  target: "chrome120",
  define: { __TRACKER_URL__: JSON.stringify(trackerUrl) },
  logLevel: "info",
};
await build({ ...common, entryPoints: { background: "src/background.ts" }, format: "esm" });
await build({ ...common, entryPoints: { content: "src/content.ts", panel: "src/panel.ts" }, format: "iife" });

copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("panel.html", "dist/panel.html");
copyFileSync("panel.css", "dist/panel.css");
console.log(`built dist/ (TRACKER_URL=${trackerUrl})`);
