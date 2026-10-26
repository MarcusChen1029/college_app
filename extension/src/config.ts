// Build-time define (see build.mjs); falls back to the local tracker, and to that default under node tests.
declare const __TRACKER_URL__: string | undefined;

export const TRACKER_URL: string = typeof __TRACKER_URL__ === "string" && __TRACKER_URL__ ? __TRACKER_URL__ : "http://localhost:3000";
export const SUPABASE_URL = "https://eyvmtaggayqizllaseiu.supabase.co";
/** Publishable key (safe to expose), same as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.example. */
export const SUPABASE_KEY = "sb_publishable_5B39sQnRwgy3LaFOZrDFZg_eeCoJaoS";
