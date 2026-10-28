"use client";

import { useEffect } from "react";
import { requiresStars } from "@/lib/application-systems-data";
import { progressState, starsPatches } from "@/lib/portals";
import type { useStudent } from "@/lib/student-store";

/**
 * While the STARS account is marked Done on Portals, ticks STARS on every listed college that asks for it and isn't
 * ticked yet (a college added after the account was marked Done). Runs on My list and Portals; writes nothing otherwise.
 */
export function useStarsSync(student: ReturnType<typeof useStudent>) {
  const done = student.ready && progressState(student.profile.portals ?? {}, "stars") === "done";
  const pending = done ? starsPatches(student.list.filter((e) => !e.custom), requiresStars) : [];
  const key = pending.map((p) => p.slug).join(",");
  useEffect(() => {
    if (!key) return;
    for (const p of starsPatches(student.list.filter((e) => !e.custom), requiresStars)) student.update(p.slug, { checklist: p.checklist });
  }, [key, student]);
}
