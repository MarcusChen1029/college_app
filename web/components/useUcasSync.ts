"use client";

import { useEffect } from "react";
import { ucasSharedPatches } from "@/lib/ucas-shared";
import type { useStudent } from "@/lib/student-store";

/**
 * Copies the profile's UCAS personal statement and reference marks into every UK college's checklist. One way only,
 * profile -> checklist (the checklist rows are read-only links): a copy that differs takes the profile's value, so it can
 * tick or untick. Runs on My list; writes nothing when the copies already match.
 */
export function useUcasSync(student: ReturnType<typeof useStudent>) {
  const pending = student.ready ? ucasSharedPatches(student.list, student.profile.essays) : [];
  const key = pending.map((p) => p.slug).join(",");
  useEffect(() => {
    if (!key) return;
    for (const p of ucasSharedPatches(student.list, student.profile.essays)) student.update(p.slug, { checklist: p.checklist });
  }, [key, student]);
}
