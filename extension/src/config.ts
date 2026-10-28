// Build-time define (see build.mjs): the tracker this build signs in at. build.mjs always sets it, and it is the ONLY place the local dev
// address (http://localhost:3000) appears, so a build for the live site contains no trace of it. Under node tests it is undefined ("").
declare const __TRACKER_URL__: string | undefined;

export const TRACKER_URL: string = typeof __TRACKER_URL__ === "string" ? __TRACKER_URL__ : "";
/** True for a build that trusts a non-https tracker (the default `node build.mjs`, for local development only). */
export const DEV_BUILD: boolean = TRACKER_URL !== "" && !TRACKER_URL.startsWith("https://");
export const SUPABASE_URL = "https://eyvmtaggayqizllaseiu.supabase.co";
/** Publishable key (safe to expose), same as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.example. */
export const SUPABASE_KEY = "sb_publishable_5B39sQnRwgy3LaFOZrDFZg_eeCoJaoS";
