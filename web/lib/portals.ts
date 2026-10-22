// Logins for shared application systems (Common App, UC, UCAS, OUAC, UAC…), testing and aid sites,
// visa accounts, campus status portals inside a system (UCLA, UT Austin MyStatus…) and anything else
// the student adds. Per-college portals for listed colleges live on the list entries themselves.
// Links are only filled in where an official sign-in or landing page was confirmed; the rest are left
// for the student, with a hint on where the login comes from.

import type { RegionCode } from "./regions";

export type Login = { url: string; username: string; password: string };
export const EMPTY_LOGIN: Login = { url: "", username: "", password: "" };

/** "application" systems are always listed; "optional" ones (testing, aid, visas) are added under Other when needed. */
export type PortalGroup = "application" | "optional";

/** "ANY" = not tied to a country (English tests). */
export type PortalRegion = RegionCode | "ANY";

export type PortalSystem = { key: string; name: string; group: PortalGroup; region: PortalRegion; url: string | null; hint: string; campuses?: string[] };

// Keys are what students' saved logins are stored under: never rename one.
export const SYSTEMS: PortalSystem[] = [
  // United States
  { key: "commonapp", name: "Common App", group: "application", region: "US", url: "https://apply.commonapp.org", hint: "One login for every Common App college." },
  {
    key: "uc",
    name: "UC Application",
    group: "application",
    region: "US",
    url: "https://apply.universityofcalifornia.edu",
    hint: "One application for all nine UC campuses. After you apply, each campus sends its own portal login.",
    campuses: ["UC Berkeley", "UC Davis", "UC Irvine", "UCLA", "UC Merced", "UC Riverside", "UC San Diego", "UC Santa Barbara", "UC Santa Cruz"],
  },
  {
    key: "applytexas",
    name: "ApplyTexas",
    group: "application",
    region: "US",
    url: "https://www.applytexas.org",
    hint: "Texas public universities. UT Austin then emails a UT EID for its MyStatus portal.",
    campuses: ["UT Austin (MyStatus)", "UT Dallas", "UT Arlington", "UT San Antonio", "UT El Paso", "Texas A&M", "Texas Tech", "University of Houston"],
  },
  { key: "calstate", name: "Cal State Apply", group: "application", region: "US", url: "https://www.calstate.edu/apply", hint: "One application for the CSU campuses." },
  { key: "coalition", name: "Coalition (on Scoir)", group: "application", region: "US", url: "https://app.scoir.com/signin", hint: "Your Scoir account is your Coalition login." },
  {
    key: "stars",
    name: "STARS self-reported transcript",
    group: "application",
    region: "US",
    url: null,
    hint: "No central login: each college that uses it (e.g. Clemson, Virginia Tech, Oregon) links to it from its applicant portal. One record can be shared.",
  },
  { key: "collegeboard", name: "College Board (SAT, AP, score sends)", group: "optional", region: "US", url: "https://www.collegeboard.org", hint: "SAT and AP scores and score sending." },
  { key: "act", name: "MyACT", group: "optional", region: "US", url: "https://my.act.org", hint: "ACT registration and score sending." },
  { key: "css", name: "CSS Profile", group: "optional", region: "US", url: "https://cssprofile.collegeboard.org", hint: "Uses your College Board login; needed for aid at many private colleges." },
  { key: "fafsa", name: "FAFSA (StudentAid.gov)", group: "optional", region: "US", url: "https://studentaid.gov", hint: "US citizens and eligible non-citizens only." },

  // United Kingdom
  { key: "ucas", name: "UCAS", group: "application", region: "GB", url: "https://www.ucas.com", hint: "Undergraduate applications to UK universities, and where you follow your choices and offers." },
  { key: "ukvi", name: "UK Student visa (UKVI)", group: "optional", region: "GB", url: "https://www.gov.uk/student-visa", hint: "Student visa application; once granted you get an eVisa through a UKVI account." },

  // Canada
  {
    key: "ouac",
    name: "OUAC (Ontario)",
    group: "application",
    region: "CA",
    url: null,
    hint: "Ontario universities. Your login is the OUAC account you create on the OUAC site when you apply (link not confirmed here).",
  },
  { key: "applyalberta", name: "ApplyAlberta", group: "application", region: "CA", url: "https://prod.applyalberta.ca", hint: "Alberta post-secondary applications and transcript transfer. Sign-in goes through an Alberta.ca account." },
  { key: "educationplannerbc", name: "EducationPlannerBC", group: "application", region: "CA", url: "https://signon.educationplannerbc.ca/signin", hint: "British Columbia post-secondary applications and transcripts." },
  { key: "sram", name: "SRAM (Quebec)", group: "application", region: "CA", url: "https://admission.sram.qc.ca/mon-dossier", hint: "Applications to cégeps (college-level programs) in the Montréal area. The site is in French." },
  {
    key: "ircc",
    name: "IRCC account (study permit)",
    group: "optional",
    region: "CA",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account.html",
    hint: "Study permit applications and status. Sign in with GCKey or a sign-in partner.",
  },

  // Australia
  { key: "uac", name: "UAC (NSW and ACT)", group: "application", region: "AU", url: "https://apply.uac.edu.au/welcome", hint: "Universities Admissions Centre: undergraduate applications for NSW and ACT." },
  { key: "vtac", name: "VTAC (Victoria)", group: "application", region: "AU", url: "https://vtacapplicantsportal.vtac.edu.au/signin", hint: "Victorian Tertiary Admissions Centre applicant portal." },
  { key: "qtac", name: "QTAC (Queensland)", group: "application", region: "AU", url: "https://applications.qtac.edu.au/sign-in", hint: "Queensland Tertiary Admissions Centre application portal." },
  { key: "satac", name: "SATAC (South Australia and NT)", group: "application", region: "AU", url: "https://www.satac.edu.au/undergraduate-apply-login", hint: "Create or log in to your mySATAC account to apply." },
  {
    key: "tisc",
    name: "TISC (Western Australia)",
    group: "application",
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

export type PortalData = {
  systems?: Record<string, Login>;
  /** Keyed "<system key>:<campus name>"; present once the student adds that campus. */
  campuses?: Record<string, Login>;
  custom?: CustomPortal[];
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
 * Saved logins (with a username) that belong to a country outside `visible`, so the page can say they
 * are hidden. Country-free systems and custom portals with no region are never hidden.
 */
export function hiddenLoginCount(data: PortalData, visible: readonly RegionCode[]): number {
  const hidden = (region: PortalRegion | undefined) => !!region && region !== "ANY" && !visible.includes(region);
  const regionOfKey = (key: string) => SYSTEMS.find((s) => s.key === key)?.region;
  const saved = (l: Login) => l.username.trim() !== "";
  const fromSystems = Object.entries(data.systems ?? {}).filter(([key, l]) => saved(l) && hidden(regionOfKey(key)));
  const fromCampuses = Object.entries(data.campuses ?? {}).filter(([key, l]) => saved(l) && hidden(regionOfKey(key.split(":")[0])));
  const fromCustom = (data.custom ?? []).filter((p) => saved(p) && hidden(p.region));
  return fromSystems.length + fromCampuses.length + fromCustom.length;
}
