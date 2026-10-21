// Logins for shared application systems (Common App, UC, ApplyTexas…), testing and aid sites,
// campus status portals inside a system (UCLA, UT Austin MyStatus…) and anything else the student
// adds. Per-college portals for listed colleges live on the list entries themselves.
// Links are only filled in where an official sign-in page was confirmed; the rest are left for the
// student, with a hint on where the login comes from.

export type Login = { url: string; username: string; password: string };
export const EMPTY_LOGIN: Login = { url: "", username: "", password: "" };

export type PortalGroup = "application" | "testing";
export const GROUP_TITLES: Record<PortalGroup, string> = { application: "Application systems", testing: "Testing & financial aid" };

export type PortalSystem = { key: string; name: string; group: PortalGroup; url: string | null; hint: string; campuses?: string[] };

export const SYSTEMS: PortalSystem[] = [
  { key: "commonapp", name: "Common App", group: "application", url: "https://apply.commonapp.org", hint: "One login for every Common App college." },
  {
    key: "uc",
    name: "UC Application",
    group: "application",
    url: "https://apply.universityofcalifornia.edu",
    hint: "One application for all nine UC campuses. After you apply, each campus sends its own portal login.",
    campuses: ["UC Berkeley", "UC Davis", "UC Irvine", "UCLA", "UC Merced", "UC Riverside", "UC San Diego", "UC Santa Barbara", "UC Santa Cruz"],
  },
  {
    key: "applytexas",
    name: "ApplyTexas",
    group: "application",
    url: "https://www.applytexas.org",
    hint: "Texas public universities. UT Austin then emails a UT EID for its MyStatus portal.",
    campuses: ["UT Austin (MyStatus)", "UT Dallas", "UT Arlington", "UT San Antonio", "UT El Paso", "Texas A&M", "Texas Tech", "University of Houston"],
  },
  { key: "calstate", name: "Cal State Apply", group: "application", url: "https://www.calstate.edu/apply", hint: "One application for the CSU campuses." },
  { key: "coalition", name: "Coalition (on Scoir)", group: "application", url: "https://app.scoir.com/signin", hint: "Your Scoir account is your Coalition login." },
  {
    key: "stars",
    name: "STARS self-reported transcript",
    group: "application",
    url: null,
    hint: "No central login: each college that uses it (e.g. Clemson, Virginia Tech, Oregon) links to it from its applicant portal. One record can be shared.",
  },
  { key: "collegeboard", name: "College Board (SAT, AP, score sends)", group: "testing", url: "https://www.collegeboard.org", hint: "SAT and AP scores and score sending." },
  { key: "act", name: "MyACT", group: "testing", url: "https://my.act.org", hint: "ACT registration and score sending." },
  { key: "toefl", name: "TOEFL (ETS account)", group: "testing", url: "https://www.ets.org/toefl", hint: "TOEFL registration and score sending." },
  { key: "ielts", name: "IELTS", group: "testing", url: null, hint: "Login is with the test centre you booked through." },
  { key: "duolingo", name: "Duolingo English Test", group: "testing", url: "https://englishtest.duolingo.com", hint: "Taking the test and sending results." },
  { key: "css", name: "CSS Profile", group: "testing", url: "https://cssprofile.collegeboard.org", hint: "Uses your College Board login; needed for aid at many private colleges." },
  { key: "fafsa", name: "FAFSA (StudentAid.gov)", group: "testing", url: "https://studentaid.gov", hint: "US citizens and eligible non-citizens only." },
];

export type CustomPortal = Login & { id: string; name: string };

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
