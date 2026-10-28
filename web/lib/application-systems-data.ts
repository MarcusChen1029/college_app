// The built application-systems data (scripts/build_application_systems.py): which systems each college uses.
// Kept apart from portals.ts so that file stays importable by node tests, which can't import JSON without attributes.
import raw from "./data/application-systems.json";

const COLLEGES = raw.colleges as Record<string, string[]>;
const ROUTES = raw.routes as Record<string, string>;

/** System keys (see SYSTEMS in portals.ts) a college uses; empty when it only takes its own application or is unknown. */
export const collegeSystems = (slug: string): readonly string[] => COLLEGES[slug] ?? [];

/** The one route a college is listed under on My list (a SYSTEMS route key, else "direct"); custom or unknown slugs are "direct". */
export const collegeRoute = (slug: string): string => ROUTES[slug] ?? "direct";

/** True when the college asks for the STARS self-reported transcript. */
export const requiresStars = (slug: string): boolean => collegeSystems(slug).includes("stars");
