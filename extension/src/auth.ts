import { toTranscriptCourse, toTranscriptSchool, type TranscriptCourseRow, type TranscriptSchoolRow } from "../../web/lib/student-rows.ts";
import type { TranscriptCourse, TranscriptSchool } from "../../web/lib/transcript.ts";
import { SUPABASE_KEY, SUPABASE_URL, TRACKER_URL } from "./config.ts";

export type TranscriptResult =
  | { ok: true; schools: TranscriptSchool[]; courses: TranscriptCourse[] }
  | { ok: false; reason: "signed_out" | "students_only" | "network" };

const TOKEN_KEY = "token";

/**
 * The columns extension_transcript returns (migration 0040): only what the fill planners and portal pickers read. Keep this list and the
 * SQL in step: a column the fill starts reading has to be added to both.
 */
export type ExtensionSchoolRow = Pick<TranscriptSchoolRow, "id" | "name" | "country" | "kind" | "default_period" | "school_code">;
export type ExtensionCourseRow = Omit<TranscriptCourseRow, "is_withdrawn" | "notes" | "source" | "created_at">;

/** Placeholders for the columns the server no longer sends. The fill never reads them (extension/src/auth.test.ts runs every planner both ways). */
const SCHOOL_BLANK: Omit<TranscriptSchoolRow, keyof ExtensionSchoolRow> = {
  curriculum: "us", default_scale: "letter_plus_minus", first_year: null, last_year: null,
  printed_gpa: null, printed_gpa_scale: null, gpa_weighted: null, class_rank: null, notes: null, created_at: "",
};
const COURSE_BLANK: Pick<TranscriptCourseRow, "is_withdrawn" | "notes" | "source" | "created_at"> = { is_withdrawn: false, notes: null, source: "manual", created_at: "" };

const rowOf = (r: unknown): object => {
  if (typeof r !== "object" || r === null) throw new Error("bad row");
  return r;
};

/** The connect page redirects to `https://<id>.chromiumapp.org/#token=<token>` (or `#error=...`). */
export function parseTokenFromRedirect(url: string): string | null {
  const hash = url.indexOf("#");
  if (hash < 0) return null;
  const params = new URLSearchParams(url.slice(hash + 1));
  if (params.has("error")) return null;
  return params.get("token") || null;
}

export function parseTranscriptResponse(body: unknown): TranscriptResult {
  const network = { ok: false, reason: "network" } as const;
  if (typeof body !== "object" || body === null) return network;
  const b = body as Record<string, unknown>;
  if (b.ok === false) {
    if (b.error === "invalid_token") return { ok: false, reason: "signed_out" };
    if (b.error === "students_only") return { ok: false, reason: "students_only" };
    return network;
  }
  if (b.ok !== true || !Array.isArray(b.schools) || !Array.isArray(b.courses)) return network;
  try {
    // Spread order: a server that still sends the old full rows (before migration 0040) keeps its real values.
    return {
      ok: true,
      schools: (b.schools as unknown[]).map((r) => toTranscriptSchool({ ...SCHOOL_BLANK, ...rowOf(r) } as TranscriptSchoolRow)),
      courses: (b.courses as unknown[]).map((r) => toTranscriptCourse({ ...COURSE_BLANK, ...rowOf(r) } as TranscriptCourseRow)),
    };
  } catch {
    return network;
  }
}

async function getToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const t = stored[TOKEN_KEY];
  return typeof t === "string" && t ? t : null;
}

/** Runs the tracker's connect page in a web auth flow and keeps the returned token in chrome.storage.local. */
export async function signIn(): Promise<boolean> {
  try {
    if (!TRACKER_URL) return false;
    const redirect = chrome.identity.getRedirectURL();
    const url = `${TRACKER_URL}/extension/connect?redirect_uri=${encodeURIComponent(redirect)}`;
    const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
    const token = result ? parseTokenFromRedirect(result) : null;
    if (!token) return false;
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
    return true;
  } catch {
    return false;
  }
}

/** How long Sign out waits for the server before it signs out locally anyway. */
export const REVOKE_TIMEOUT_MS = 5000;

/** Tells the server this token is finished, so a copy of it stops working (migration 0040). Best effort: never throws. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/revoke_my_extension_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
  } catch {
    // offline, timed out, or the server predates migration 0040: the local sign-out below still happens
  }
}

/** Revokes the token on the server first (best effort), then forgets it here. */
export async function signOut(): Promise<void> {
  let token: string | null = null;
  try {
    token = await getToken();
  } catch {
    // storage unreadable: nothing to revoke from here
  }
  if (token) await revokeToken(token);
  await clearToken();
}

/** Forgets the token on this device only (the server already refused it, so there is nothing to revoke). */
export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

/** POST only: the RPC writes last_used_at, and a GET would put the token in the URL. */
export async function loadTranscript(): Promise<TranscriptResult> {
  const token = await getToken();
  if (!token) return { ok: false, reason: "signed_out" };
  let body: unknown;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/extension_transcript`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return { ok: false, reason: "network" };
    body = await res.json();
  } catch {
    return { ok: false, reason: "network" };
  }
  const result = parseTranscriptResponse(body);
  if (!result.ok && result.reason === "signed_out") await clearToken();
  return result;
}
