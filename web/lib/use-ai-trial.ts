"use client";

import { useEffect, useState } from "react";
import { trialCount } from "./connect-ai";
import { browserSupabase } from "./supabase-browser";

/**
 * The Connect AI free trial as the website sees it (migration 0051): how many free changes the signed-in account has left.
 * `unavailable` = the counter can't be read (the migration isn't applied yet, or the call failed); callers then show what they
 * showed before the trial existed. Pass `enabled` false (signed out, a teacher, a pass holder) to skip the call.
 */
export type AiTrial = { state: "loading" } | { state: "unavailable" } | { state: "ready"; left: number };

export function useAiTrial(enabled: boolean): AiTrial {
  const [trial, setTrial] = useState<AiTrial>({ state: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (async () => {
      try {
        const left = trialCount(await browserSupabase().rpc("ai_trial_writes_left"));
        if (live) setTrial(left === undefined ? { state: "unavailable" } : { state: "ready", left });
      } catch {
        if (live) setTrial({ state: "unavailable" });
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled]);
  return trial;
}
