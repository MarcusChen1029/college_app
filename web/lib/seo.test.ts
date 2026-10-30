import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPLORER_UNREAD, forExplorer } from "./explore-filters.ts";
import { collegeMetadata, PAGES, pageMetadata, ROBOTS_DISALLOW, SITE_ORIGIN, SITEMAP_STATIC_PATHS } from "./seo.ts";
import type { CollegeSummary } from "./types.ts";

test("every sitemap page except the home page has its own description, title and canonical", () => {
  for (const path of SITEMAP_STATIC_PATHS) {
    if (path === "/") continue; // app/page.tsx carries its own
    assert.ok(path in PAGES, `${path} is in the sitemap but has no entry in PAGES`);
    const meta = pageMetadata(path as keyof typeof PAGES);
    assert.ok(typeof meta.title === "string" && meta.title.length > 0, `${path} title`);
    assert.equal(meta.alternates?.canonical, path);
  }
  for (const path of Object.keys(PAGES)) assert.ok((SITEMAP_STATIC_PATHS as readonly string[]).includes(path), `${path} has metadata but is not in the sitemap`);
});

test("descriptions are unique and short enough not to be cut in search results", () => {
  const seen = new Set<string>();
  for (const [path, { description }] of Object.entries(PAGES)) {
    assert.ok(description.length >= 60 && description.length <= 175, `${path} description is ${description.length} characters`);
    assert.ok(!seen.has(description), `${path} repeats another page's description`);
    seen.add(description);
  }
});

test("sitemap paths are unique, absolute-path strings", () => {
  assert.equal(new Set(SITEMAP_STATIC_PATHS).size, SITEMAP_STATIC_PATHS.length);
  for (const p of SITEMAP_STATIC_PATHS) assert.match(p, /^\/[a-z/]*$/);
  assert.match(SITE_ORIGIN, /^https:\/\/[^/]+$/);
});

test("robots keeps crawlers out of account, token, API and OAuth paths, and no indexable page", () => {
  for (const must of ["/share/", "/api/", "/extension/", "/oauth/", "/teacher", "/application", "/settings", "/welcome", "/profile", "/connect-ai", "/writing", "/mcp"]) {
    assert.ok((ROBOTS_DISALLOW as readonly string[]).includes(must), `${must} should be disallowed`);
  }
  for (const path of SITEMAP_STATIC_PATHS) {
    assert.ok(!ROBOTS_DISALLOW.some((d) => path.startsWith(d)), `${path} is in the sitemap but disallowed in robots`);
  }
});

test("a college's metadata names it by its display name and quotes only what it has", () => {
  const full = collegeMetadata("michigan-state", {
    name: "Michigan State University",
    short_name: "Michigan State",
    city: "East Lansing",
    state_region: "MI",
    country_code: "US",
    admit_rate: 83.24,
    intl_admit_rate: 88.19,
    sat_p25: 1100,
    sat_p75: 1310,
    test_policy: "optional",
  });
  assert.equal(full.title, "Michigan State: admissions, deadlines and costs");
  assert.equal(
    full.description,
    "Michigan State in East Lansing, MI: admit rate 83% (88% international), middle 50% SAT 1100–1310. Deadlines, English test minimums, costs and aid for international applicants.",
  );
  assert.ok(String(full.description).length <= 175);
  assert.equal(full.alternates?.canonical, "/colleges/michigan-state");

  const bare = collegeMetadata("adelaide", {
    name: "Adelaide University",
    short_name: null,
    city: null,
    state_region: null,
    country_code: "AU",
    admit_rate: null,
    intl_admit_rate: null,
    sat_p25: null,
    sat_p75: null,
    test_policy: null,
  });
  assert.equal(bare.title, "Adelaide University: admissions, deadlines and costs");
  assert.ok(String(bare.description).startsWith("Adelaide University. Deadlines"), String(bare.description));
  assert.doesNotMatch(String(bare.description), /null|undefined|NaN/);

  // A city that is the college's own name is not repeated; a state still reads as a place.
  const same = collegeMetadata("adelaide", { name: "Adelaide", short_name: null, city: "Adelaide", state_region: "South Australia", country_code: "AU", admit_rate: null, intl_admit_rate: null, sat_p25: null, sat_p75: null, test_policy: null });
  assert.ok(String(same.description).startsWith("Adelaide in South Australia. Deadlines"), String(same.description));

  assert.equal(collegeMetadata("nope", undefined).title, "College");
});

test("forExplorer drops exactly the unread columns and keeps every other one", () => {
  const row = Object.fromEntries(
    [
      ...EXPLORER_UNREAD,
      "id", "slug", "name", "short_name", "country_code", "state_region", "city", "latitude", "longitude", "control", "general_tier",
      "applicants", "admit_rate", "intl_admit_rate", "sat_p25", "sat_p50", "sat_p75", "act_p25", "act_p50", "act_p75", "test_policy",
      "tuition_usd", "tuition_out_of_state_usd", "tuition_intl_usd", "intl_aid_policy", "tiers", "plans", "next_deadline",
    ].map((k) => [k, k]),
  ) as unknown as CollegeSummary;
  const out = forExplorer(row) as Record<string, unknown>;
  for (const k of EXPLORER_UNREAD) assert.ok(!(k in out), `${k} should be gone`);
  assert.equal(Object.keys(out).length, Object.keys(row).length - EXPLORER_UNREAD.length);
  assert.equal(out.slug, "slug");
  assert.ok("slug" in row && "tiers" in row, "the input is not mutated");
  assert.ok("setting" in row, "the input is not mutated");
});
