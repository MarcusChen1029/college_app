import { toTranscriptCourse, toTranscriptSchool, type TranscriptCourseRow, type TranscriptSchoolRow } from "../../web/lib/student-rows.ts";
import type { TranscriptCourse, TranscriptSchool } from "../../web/lib/transcript.ts";
import { SUPABASE_KEY, SUPABASE_URL, TRACKER_URL } from "./config.ts";

export type TranscriptResult =
  | { ok: true; schools: TranscriptSchool[]; courses: TranscriptCourse[] }
  | { ok: false; reason: "signed_out" | "students_only" | "network" };

const TOKEN_KEY = "token";

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
    return {
      ok: true,
      schools: (b.schools as TranscriptSchoolRow[]).map(toTranscriptSchool),
      courses: (b.courses as TranscriptCourseRow[]).map(toTranscriptCourse),
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

export async function signOut(): Promise<void> {
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
  if (!result.ok && result.reason === "signed_out") await signOut();
  return result;
}
