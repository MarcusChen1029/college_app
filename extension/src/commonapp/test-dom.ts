// Test helper: parse a saved Common App fixture with linkedom (no browser needed).
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

export function fixture(name: string): Document {
  const html = readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url), "utf8");
  return parseHTML(html).document as unknown as Document;
}

export function html(body: string): Document {
  return parseHTML(`<!doctype html><html><body>${body}</body></html>`).document as unknown as Document;
}
