"use client";

// Thin typed wrapper over the class-charts RPC (migration 0033). Throws an Error with plain wording on failure.

import { chartsErrorMessage, parseClassOutcomes, type ClassOutcomes } from "./class-charts";
import { browserSupabase } from "./supabase-browser";

/** Anonymous outcome points per college for the caller's linked students (all, or one of the caller's classes). */
export async function teacherOutcomes(classId: string | null): Promise<ClassOutcomes> {
  const res = await browserSupabase().rpc("teacher_outcomes", { p_class_id: classId });
  if (res.error) throw new Error(chartsErrorMessage(res.error.message));
  return parseClassOutcomes(res.data);
}
