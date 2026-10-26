// Bundles the extension into dist/. TRACKER_URL (env) is baked in at build time.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

const trackerUrl = process.env.TRACKER_URL || "http://localhost:3000";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: { background: "src/background.ts", content: "src/content.ts", panel: "src/panel.ts" },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  define: { __TRACKER_URL__: JSON.stringify(trackerUrl) },
  logLevel: "info",
});

copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("panel.html", "dist/panel.html");
console.log(`built dist/ (TRACKER_URL=${trackerUrl})`);
