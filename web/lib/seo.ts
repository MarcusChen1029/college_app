// What search engines and link previews read: the public origin, each indexable page's title and description, and the
// paths the sitemap lists. English only on purpose: crawlers send no `lang` cookie, so a translated description would never
// be seen, and reading the cookie here would push every page's metadata to request time.
import type { Metadata } from "next";
import { FREE_LIMIT, PASS_PRICE_TWD } from "./plans.ts";
import type { CollegeSummary } from "./types.ts";

/** The public origin: metadataBase, canonical URLs, the sitemap and robots.txt all hang off it. */
export const SITE_ORIGIN = "https://www.track-ur-college.com";

type Entry = { title: string; description: string };

/** Every indexable page except the home page (its metadata lives in app/page.tsx) and /colleges/<slug> (generateMetadata). */
export const PAGES = {
  "/colleges": {
    title: "Colleges",
    description: "Browse colleges in the US, UK, Canada and Australia on a map or in a table: tiers, SAT/ACT ranges, international admit rates, English test minimums and deadlines.",
  },
  "/help": {
    title: "Help",
    description: "Answers about Trakur: how reach, target and safety are decided, deadline reminders, where the data comes from, sharing your list with a teacher, and your account.",
  },
  "/start": {
    title: "Get started",
    description: "Answer a few questions about where you apply from, where you want to study and your test scores, and Trakur starts your college list with fit labels and deadlines.",
  },
  "/tools": {
    title: "Tools",
    description: "Tools for college applicants: a one-page résumé generator, a 30-question interest quiz, and a college match ranked by how strong each school is in your field.",
  },
  "/tools/interests": {
    title: "Interest quiz",
    description: "Take a 30-question interest quiz for a three-letter Holland (RIASEC) code, matching careers from O*NET and college programs worth a look. Answers stay in your browser.",
  },
  "/tools/match": {
    title: "College match by field",
    description: "Pick a field such as business, engineering or pre-law and see colleges ranked by how strong they are in it, split into reach, target and safety from your scores.",
  },
  "/tools/resume": {
    title: "Résumé",
    description: "Build a one-page activity résumé from your activities and profile, then edit the header and print or copy it.",
  },
  "/compare": {
    title: "Compare",
    description: "Compare colleges side by side: admit rates, SAT/ACT ranges, deadlines, English test requirements and costs, each with an official source.",
  },
  "/pricing": {
    title: "Pricing",
    description: `Start free with up to ${FREE_LIMIT} colleges in My list. The NT$${PASS_PRICE_TWD} admission-year pass, paid once with no subscription, adds an unlimited list, Connect AI and the application filler.`,
  },
  "/privacy": {
    title: "Privacy Policy",
    description: "What Trakur collects and why: you can browse without an account, we don't sell data, show ads or use analytics, and you can ask to see, correct or delete your records.",
  },
  "/terms": {
    title: "Terms of Service",
    description: "The terms of service for Trakur, the college application tracker for students, teachers and counselors, including who can use it and the age and guardian rules.",
  },
  "/security": {
    title: "Security",
    description: "How Trakur protects your data: HTTPS everywhere, an encrypted database, access rules that keep each student's records private, and how logins are handled.",
  },
  "/contact": {
    title: "Contact",
    description: "Contact Trakur about privacy requests, a parent or guardian's questions about a minor's data, or a security problem, and what to include in your message.",
  },
} as const satisfies Record<string, Entry>;

export type SeoPath = keyof typeof PAGES;

/** title, description and canonical URL for one of the pages above (the canonical is relative: metadataBase makes it absolute). */
export function pageMetadata(path: SeoPath): Metadata {
  const { title, description } = PAGES[path];
  return { title, description, alternates: { canonical: path } };
}

/** The sitemap's fixed entries, in reading order; the colleges follow (app/sitemap.ts). */
export const SITEMAP_STATIC_PATHS = ["/", "/colleges", "/help", "/start", "/tools", "/tools/interests", "/tools/match", "/tools/resume", "/compare", "/pricing", "/privacy", "/terms", "/security", "/contact"] as const;

/** Paths crawlers are asked to stay out of: account screens (none of which has a noindex), tokens, APIs and OAuth. */
export const ROBOTS_DISALLOW = ["/share/", "/api/", "/extension/", "/oauth/", "/teacher", "/application", "/settings", "/welcome", "/profile", "/connect-ai", "/redeem", "/writing", "/mcp"] as const;

// Rates are stored as percentages (83.24), as the college page shows them.
const pct = (v: number | string | null | undefined) => (v == null || Number.isNaN(Number(v)) ? null : `${Math.round(Number(v))}%`);

type SeoCollege = Pick<CollegeSummary, "name" | "short_name" | "city" | "state_region" | "country_code" | "admit_rate" | "intl_admit_rate" | "sat_p25" | "sat_p75" | "test_policy">;

/** /colleges/<slug>: the display name in the title and one line of facts the page itself shows. Pure, so it is unit-tested. */
export function collegeMetadata(slug: string, c: SeoCollege | undefined): Metadata {
  if (!c) return { title: "College", alternates: { canonical: `/colleges/${slug}` } };
  const name = c.short_name ?? c.name;
  // "Adelaide in Adelaide, South Australia" reads badly: leave the city out when it is the name.
  const place = [c.city && c.city !== name ? c.city : null, c.state_region].filter(Boolean).join(", ");
  const admit = pct(c.admit_rate);
  const intl = pct(c.intl_admit_rate);
  const facts = [
    admit && intl ? `admit rate ${admit} (${intl} international)` : admit ? `admit rate ${admit}` : intl ? `international admit rate ${intl}` : null,
    c.sat_p25 != null && c.sat_p75 != null ? `middle 50% SAT ${c.sat_p25}–${c.sat_p75}` : null,
  ].filter(Boolean);
  const lead = place ? `${name} in ${place}` : name;
  const description = `${lead}${facts.length ? `: ${facts.join(", ")}` : ""}. Deadlines, English test minimums, costs and aid for international applicants.`;
  return { title: `${name}: admissions, deadlines and costs`, description, alternates: { canonical: `/colleges/${slug}` } };
}
