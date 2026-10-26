"use client";

// The teacher's weekly digest switch (migration 0029). Read from the caller's own teacher_profiles row (RLS: own row),
// written only through the set_my_digest RPC. Errors come back as plain wording.

import { browserSupabase } from "./supabase-browser";

export function digestErrorMessage(message: string): string {
  if (/digest_enabled|set_my_digest|does not exist|schema cache/i.test(message)) return "Weekly summaries aren't available yet.";
  if (/teachers only/i.test(message)) return "Only teacher and counselor accounts can get the weekly summary.";
  return "Couldn't save. Please try again.";
}

/** Whether the signed-in teacher has the weekly digest on (false when there is no profile row). */
export async function getMyDigest(userId: string): Promise<boolean> {
  const { data, error } = await browserSupabase().from("teacher_profiles").select("digest_enabled").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(digestErrorMessage(error.message));
  return data?.digest_enabled === true;
}

export async function setMyDigest(enabled: boolean): Promise<void> {
  const { error } = await browserSupabase().rpc("set_my_digest", { p_enabled: enabled });
  if (error) throw new Error(digestErrorMessage(error.message));
}
