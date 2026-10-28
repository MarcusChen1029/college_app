// Logins for shared application systems (Common App, UC, UCAS, OUAC, UAC…), testing and aid sites,
// visa accounts, campus status portals inside a system (UCLA, UT Austin MyStatus…) and anything else
// the student adds. Per-college portals for listed colleges live on the list entries themselves.
// Links are only filled in where an official sign-in or landing page was confirmed; the rest are left
// for the student, with a hint on where the login comes from.

import { isSubmitted } from "./application.ts";
import type { Checklist } from "./checklist.ts";
import type { RegionCode } from "./regions";
import type { Status } from "./student-store";

export type Login = { url: string; username: string; password: string };
export const EMPTY_LOGIN: Login = { url: "", username: "", password: "" };

/** "application" systems are always listed; "optional" ones (testing, aid, visas) are added under Other when needed. */
export type PortalGroup = "application" | "optional";

/** "ANY" = not tied to a country (English tests). */
export type PortalRegion = RegionCode | "ANY";

/** An application system is either a way to apply ("route") or something needed on top of the application ("addon", e.g. STARS). */
export type SystemKind = "route" | "addon";

export type PortalSystem = { key: string; name: string; group: PortalGroup; region: PortalRegion; url: string | null; hint: string; campuses?: string[]; kind?: SystemKind };

// Keys are what students' saved logins are stored under: never rename one.
export const SYSTEMS: PortalSystem[] = [
  // United States
  { key: "commonapp", name: "Common App", group: "application", region: "US", url: "https://apply.commonapp.org", hint: "One login for every Common App college.", kind: "route" },
  {
    key: "uc",
    name: "UC Application",
    group: "application",
    kind: "route",
    region: "US",
    url: "https://apply.universityofcalifornia.edu",
    hint: "One application for all nine UC campuses. After you apply, each campus sends its own portal login.",
    campuses: ["UC Berkeley", "UC Davis", "UC Irvine", "UCLA", "UC Merced", "UC Riverside", "UC San Diego", "UC Santa Barbara", "UC Santa Cruz"],
  },
  {
    key: "applytexas",
    name: "ApplyTexas",
    group: "application",
    kind: "route",
    region: "US",
    url: "https://www.applytexas.org",
    hint: "Texas public universities. UT Austin then emails a UT EID for its MyStatus portal.",
    campuses: ["UT Austin (MyStatus)", "UT Dallas", "UT Arlington", "UT San Antonio", "UT El Paso", "Texas A&M", "Texas Tech", "University of Houston"],
  },
  { key: "calstate", name: "Cal State Apply", group: "application", region: "US", url: "https://www.calstate.edu/apply", hint: "One application for the CSU campuses.", kind: "route" },
  { key: "coalition", name: "Coalition (on Scoir)", group: "application", region: "US", url: "https://app.scoir.com/signin", hint: "Your Scoir account is your Coalition login.", kind: "route" },
  {
    key: "stars",
    name: "STARS self-reported transcript",
    group: "application",
    kind: "addon",
    region: "US",
    url: "https://ssar.selfreportedtranscript.com/Login.aspx",
    hint: "Self-reported transcript (formerly SRAR/SSAR). Colleges that use it link to it from their applicant portal; one record can be shared.",
  },
  { key: "collegeboard", name: "College Board (SAT, AP, score sends)", group: "optional", region: "US", url: "https://www.collegeboard.org", hint: "SAT and AP scores and score sending." },
  { key: "act", name: "MyACT", group: "optional", region: "US", url: "https://my.act.org", hint: "ACT registration and score sending." },
  { key: "css", name: "CSS Profile", group: "optional", region: "US", url: "https://cssprofile.collegeboard.org", hint: "Uses your College Board login; needed for aid at many private colleges." },
  { key: "fafsa", name: "FAFSA (StudentAid.gov)", group: "optional", region: "US", url: "https://studentaid.gov", hint: "US citizens and eligible non-citizens only." },

  // United Kingdom
  { key: "ucas", name: "UCAS", group: "application", region: "GB", url: "https://www.ucas.com", hint: "Undergraduate applications to UK universities, and where you follow your choices and offers.", kind: "route" },
  { key: "ukvi", name: "UK Student visa (UKVI)", group: "optional", region: "GB", url: "https://www.gov.uk/student-visa", hint: "Student visa application; once granted you get an eVisa through a UKVI account." },

  // Canada
  {
    key: "ouac",
    name: "OUAC (Ontario)",
    group: "application",
    kind: "route",
    region: "CA",
    url: null,
    hint: "Ontario universities. Your login is the OUAC account you create on the OUAC site when you apply (link not confirmed here).",
  },
  { key: "applyalberta", name: "ApplyAlberta", group: "application", region: "CA", url: "https://prod.applyalberta.ca", hint: "Alberta post-secondary applications and transcript transfer. Sign-in goes through an Alberta.ca account.", kind: "route" },
  { key: "educationplannerbc", name: "EducationPlannerBC", group: "application", region: "CA", url: "https://signon.educationplannerbc.ca/signin", hint: "British Columbia post-secondary applications and transcripts.", kind: "route" },
  { key: "sram", name: "SRAM (Quebec)", group: "application", region: "CA", url: "https://admission.sram.qc.ca/mon-dossier", hint: "Applications to cégeps (college-level programs) in the Montréal area. The site is in French.", kind: "route" },
  {
    key: "ircc",
    name: "IRCC account (study permit)",
    group: "optional",
    region: "CA",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account.html",
    hint: "Study permit applications and status. Sign in with GCKey or a sign-in partner.",
  },

  // Australia
  { key: "uac", name: "UAC (NSW and ACT)", group: "application", region: "AU", url: "https://apply.uac.edu.au/welcome", hint: "Universities Admissions Centre: undergraduate applications for NSW and ACT.", kind: "route" },
  { key: "vtac", name: "VTAC (Victoria)", group: "application", region: "AU", url: "https://vtacapplicantsportal.vtac.edu.au/signin", hint: "Victorian Tertiary Admissions Centre applicant portal.", kind: "route" },
  { key: "qtac", name: "QTAC (Queensland)", group: "application", region: "AU", url: "https://applications.qtac.edu.au/sign-in", hint: "Queensland Tertiary Admissions Centre application portal.", kind: "route" },
  { key: "satac", name: "SATAC (South Australia and NT)", group: "application", region: "AU", url: "https://www.satac.edu.au/undergraduate-apply-login", hint: "Create or log in to your mySATAC account to apply.", kind: "route" },
  {
    key: "tisc",
    name: "TISC (Western Australia)",
    group: "application",
    kind: "route",
    region: "AU",
    url: null,
    hint: "Western Australian university applications. Your login is the TISC account you create on the TISC site (link not confirmed here).",
  },
  { key: "immiaccount", name: "ImmiAccount (student visa)", group: "optional", region: "AU", url: "https://online.immi.gov.au/lusc/login", hint: "Australian Home Affairs account used to apply for and track a student visa." },

  // Not tied to a country
  { key: "toefl", name: "TOEFL (ETS account)", group: "optional", region: "ANY", url: "https://www.ets.org/toefl", hint: "TOEFL registration and score sending." },
  { key: "ielts", name: "IELTS", group: "optional", region: "ANY", url: null, hint: "Login is with the test centre you booked through." },
  { key: "duolingo", name: "Duolingo English Test", group: "optional", region: "ANY", url: "https://englishtest.duolingo.com", hint: "Taking the test and sending results." },
  { key: "pte", name: "PTE (Pearson)", group: "optional", region: "ANY", url: "https://www.pearsonpte.com", hint: "PTE Academic booking and score sending." },
];

/** Systems tied to one country, or the country-free ones for "ANY". */
export const systemsForRegion = (region: PortalRegion): PortalSystem[] => SYSTEMS.filter((s) => s.region === region);

export const ANY_SYSTEMS: PortalSystem[] = systemsForRegion("ANY");

/** Which country a college belongs to; a missing country_code means the US. */
export const regionOfCollege = (c: { country_code?: string | null }): string => c.country_code ?? "US";

/** No region = "any country" (everything saved before regions existed). */
export type CustomPortal = Login & { id: string; name: string; region?: RegionCode };

/** The student's own tick: done or not, with an optional note on what is left. */
export type PortalProgress = { done: boolean; note?: string };

export type PortalData = {
  systems?: Record<string, Login>;
  /** Keyed "<system key>:<campus name>"; present once the student adds that campus. */
  campuses?: Record<string, Login>;
  custom?: CustomPortal[];
  /** Keyed by system key, campus key ("uc:UCLA"), "custom:<id>" or "college:<slug>". Missing = not marked, counted as not done. */
  progress?: Record<string, PortalProgress>;
};

export const campusKey = (system: string, campus: string) => `${system}:${campus}`;

export function campusesOf(data: PortalData, system: PortalSystem): string[] {
  return (system.campuses ?? []).filter((c) => data.campuses?.[campusKey(system.key, c)]);
}

/** The link to open: the student's own if set, else the system's official sign-in page. */
export const openUrl = (login: Login | undefined, fallback: string | null) => login?.url?.trim() || fallback || "";

/** Number of portals with a username saved, for the page summary. */
export function savedCount(data: PortalData): number {
  const logins = [...Object.values(data.systems ?? {}), ...Object.values(data.campuses ?? {}), ...(data.custom ?? [])];
  return logins.filter((l) => l.username.trim()).length;
}

/**
 * Saved logins (with a username) that no page shows, so Portals can say they are hidden: those of a country outside
 * `visible`. A route login heading a My list group (`routesOnList`) always shows there; one with no group shows on Portals
 * under its country. Country-free systems and custom portals with no region are never hidden.
 */
export function hiddenLoginCount(data: PortalData, visible: readonly RegionCode[], routesOnList: readonly string[]): number {
  const hidden = (region: PortalRegion | undefined) => !!region && region !== "ANY" && !visible.includes(region);
  const regionOfKey = (key: string) => SYSTEMS.find((s) => s.key === key)?.region;
  const onMyList = (key: string) => SYSTEMS.find((s) => s.key === key)?.kind === "route" && routesOnList.includes(key);
  const saved = (l: Login) => l.username.trim() !== "";
  const fromSystems = Object.entries(data.systems ?? {}).filter(([key, l]) => saved(l) && hidden(regionOfKey(key)) && !onMyList(key));
  const fromCampuses = Object.entries(data.campuses ?? {}).filter(([key, l]) => saved(l) && hidden(regionOfKey(key.split(":")[0])));
  const fromCustom = (data.custom ?? []).filter((p) => saved(p) && hidden(p.region));
  return fromSystems.length + fromCampuses.length + fromCustom.length;
}

export const customProgressKey = (id: string) => `custom:${id}`;
export const collegeProgressKey = (slug: string) => `college:${slug}`;

/** Marked done / not done; "unmarked" is counted as not done but shows neither button pressed. */
export type ProgressState = "done" | "notDone" | "unmarked";

export function progressState(data: PortalData, key: string): ProgressState {
  const p = data.progress?.[key];
  return !p ? "unmarked" : p.done ? "done" : "notDone";
}

export const progressNote = (data: PortalData, key: string): string => data.progress?.[key]?.note ?? "";

/** The data with one progress entry changed. A blank note is dropped; the note is kept when the row is ticked done. */
export function withProgress(data: PortalData, key: string, patch: { done?: boolean; note?: string }): PortalData {
  const prev = data.progress?.[key];
  const note = (patch.note ?? prev?.note ?? "").trim();
  const next: PortalProgress = { done: patch.done ?? prev?.done ?? false, ...(note ? { note } : {}) };
  return { ...data, progress: { ...data.progress, [key]: next } };
}

/** The data without the progress entries for these keys (a removed portal or campus keeps no mark). */
export function withoutProgress(data: PortalData, keys: readonly string[]): PortalData {
  if (!data.progress || !keys.some((k) => k in data.progress!)) return data;
  const progress = { ...data.progress };
  for (const k of keys) delete progress[k];
  return { ...data, progress };
}

/**
 * Order of the groups on My list: the route systems from most to least general (a college that takes several is listed
 * under the first), then "direct" (the college's own application). scripts/build_application_systems.py has the same list.
 */
export const ROUTE_ORDER: readonly string[] = ["commonapp", "coalition", "uc", "calstate", "applytexas", "ucas", "ouac", "educationplannerbc", "applyalberta", "sram", "uac", "vtac", "qtac", "satac", "tisc", "direct"];

export type RouteGroup<T> = { route: string; items: T[] };

/**
 * List entries grouped by application route, in ROUTE_ORDER, list order inside a group. Custom colleges and unknown
 * routes go to "direct"; a route with no entries is left out.
 */
export function routeGroups<T extends { slug: string; custom?: boolean }>(items: readonly T[], routeOf: (slug: string) => string): RouteGroup<T>[] {
  const byRoute = new Map<string, T[]>();
  for (const item of items) {
    const r = item.custom ? "direct" : routeOf(item.slug);
    const route = ROUTE_ORDER.includes(r) ? r : "direct";
    byRoute.set(route, [...(byRoute.get(route) ?? []), item]);
  }
  return ROUTE_ORDER.filter((r) => byRoute.has(r)).map((route) => ({ route, items: byRoute.get(route)! }));
}

/** "2 of 5 submitted" for one group; every status past submitting (interview, decisions) counts as submitted. */
export function groupProgress(statuses: readonly Status[]): { submitted: number; total: number; done: boolean } {
  const submitted = statuses.filter(isSubmitted).length;
  return { submitted, total: statuses.length, done: statuses.length > 0 && submitted === statuses.length };
}

/** The colleges that ask for STARS and are not ticked yet, each with `stars` ticked: what marking the STARS account done writes. */
export function starsPatches(entries: readonly { slug: string; checklist: Checklist }[], requires: (slug: string) => boolean): { slug: string; checklist: Checklist }[] {
  return entries.filter((e) => requires(e.slug) && !e.checklist.stars).map((e) => ({ slug: e.slug, checklist: { ...e.checklist, stars: true } }));
}