// The student's view of a linked teacher (my_teachers): row parsing only, kept apart from links-api.ts so node can test it.
// The 0052 and 0053 columns are optional because a database that predates a migration leaves them out.

import type { MyTeacher } from "./links-api.ts";

export type MyTeacherRow = {
  teacher_id: string;
  display_name: string;
  school: string | null;
  linked_at: string;
  share_essays: boolean;
  class_names: string[];
  class_ids?: string[] | null; // 0052
  class_themes?: (string | null)[] | null; // 0053, index for index with class_ids
  class_years?: (string | null)[] | null; // 0053
  class_archived?: boolean[] | null; // 0053
};

/** `n` entries, `pick` applied to the array's item at each index; a missing, short or non-array value gives `pick(undefined)`. */
function alignedTo<T>(v: unknown, n: number, pick: (x: unknown) => T): T[] {
  const list: unknown[] = Array.isArray(v) ? v : [];
  return Array.from({ length: n }, (_, i) => pick(list[i]));
}

const textOrNull = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);

export function parseMyTeacher(r: MyTeacherRow): MyTeacher {
  const classIds = Array.isArray(r.class_ids) ? r.class_ids.filter((id) => typeof id === "string") : [];
  return {
    teacherId: r.teacher_id,
    displayName: r.display_name,
    school: r.school,
    linkedAt: r.linked_at,
    shareEssays: r.share_essays,
    classNames: r.class_names ?? [],
    classIds,
    // Always as long as classIds, so classThemes[i] is the theme of classIds[i] whatever the database returned.
    classThemes: alignedTo(r.class_themes, classIds.length, textOrNull),
    classYears: alignedTo(r.class_years, classIds.length, textOrNull),
    classArchived: alignedTo(r.class_archived, classIds.length, (x) => x === true),
  };
}
