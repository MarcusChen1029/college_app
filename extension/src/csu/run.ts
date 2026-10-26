// Runs one Cal State Apply school inside the page (the app is a single page: no reloads between courses). Adds each planned course whose
// title is not on the school yet, then checks it shows in the school's course list.

import type { CsuSchoolPlan } from "../../../web/lib/csu-fill.ts";
import { CsuStop, existingTitles, fillCsuCourse, openCourseForm, topDrawer } from "./fill.ts";

export type CsuRunResult = { added: string[]; skippedExisting: number; stopped: string | null };

const key = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export async function runCsuSchool(doc: Document, plan: CsuSchoolPlan, shouldStop: () => boolean): Promise<CsuRunResult> {
  const added: string[] = [];
  let have: string[];
  try {
    have = await existingTitles(doc, plan.schoolName);
  } catch (e) {
    return { added, skippedExisting: 0, stopped: (e as Error).message };
  }
  const left = new Map<string, number>();
  for (const n of have) left.set(key(n), (left.get(key(n)) ?? 0) + 1);
  const todo = plan.rows.filter((r) => {
    const n = left.get(key(r.name)) ?? 0;
    if (n > 0) left.set(key(r.name), n - 1);
    return n === 0;
  });
  for (const row of todo) {
    if (shouldStop()) return { added, skippedExisting: plan.rows.length - todo.length, stopped: "Stopped." };
    try {
      await openCourseForm(doc, plan.schoolName);
      const { blanks } = await fillCsuCourse(doc, row);
      if (blanks.length) {
        return { added, skippedExisting: plan.rows.length - todo.length, stopped: `${row.name} is filled in but not saved: choose ${blanks.join(", ")} and press Save, then run again.` };
      }
      const now = await existingTitles(doc, plan.schoolName);
      if (now.filter((n) => key(n) === key(row.name)).length <= have.filter((n) => key(n) === key(row.name)).length) {
        return { added, skippedExisting: plan.rows.length - todo.length, stopped: `Cal State Apply did not list ${row.name} after saving. Check the form for a message.` };
      }
      have = now;
      added.push(row.name);
    } catch (e) {
      const msg = e instanceof CsuStop || e instanceof Error ? e.message : String(e);
      return { added, skippedExisting: plan.rows.length - todo.length, stopped: `${row.name}: ${msg}. ${topDrawer(doc) ? "The form is left open: finish or cancel it." : ""}`.trim() };
    }
  }
  return { added, skippedExisting: plan.rows.length - todo.length, stopped: null };
}
