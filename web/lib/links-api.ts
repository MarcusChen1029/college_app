"use client";

// Thin typed wrappers over the teacher/student linking RPCs and reads (migration 0021).
// Every function throws an Error with the database message when a call fails, except the two code calls,
// which return a CodeResult so the UI can show a student-friendly message.

import { parseCodeResult, type CodeResult } from "./join-codes";
import { localDate, parseRosterRow, parseStudentDetail, parseUpcomingDeadline, type RosterStudent, type StudentDetail, type UpcomingDeadline } from "./roster";
import { browserSupabase } from "./supabase-browser";

const db = () => browserSupabase();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ───────── student side ─────────

export type MyTeacher = {
  teacherId: string;
  displayName: string;
  school: string | null;
  linkedAt: string;
  shareEssays: boolean;
  classNames: string[];
};

export async function previewCode(code: string): Promise<CodeResult> {
  const res = await db().rpc("preview_code", { p_code: code });
  return res.error ? { ok: false, error: "failed" } : parseCodeResult(res.data);
}

export async function redeemCode(code: string): Promise<CodeResult> {
  const res = await db().rpc("redeem_code", { p_code: code });
  return res.error ? { ok: false, error: "failed" } : parseCodeResult(res.data);
}

export async function myTeachers(): Promise<MyTeacher[]> {
  const rows = check(await db().rpc("my_teachers")) as {
    teacher_id: string;
    display_name: string;
    school: string | null;
    linked_at: string;
    share_essays: boolean;
    class_names: string[];
  }[];
  return rows.map((r) => ({
    teacherId: r.teacher_id,
    displayName: r.display_name,
    school: r.school,
    linkedAt: r.linked_at,
    shareEssays: r.share_essays,
    classNames: r.class_names ?? [],
  }));
}

export async function setShareEssays(teacherId: string, value: boolean): Promise<void> {
  check(await db().rpc("set_share_essays", { p_teacher: teacherId, p_value: value }));
}

export async function leaveTeacher(teacherId: string): Promise<void> {
  check(await db().rpc("leave_teacher", { p_teacher: teacherId }));
}

// ───────── teacher side ─────────

export type TeacherClass = {
  id: string;
  name: string;
  schoolYear: string | null;
  archived: boolean;
  createdAt: string;
  /** The active (not revoked) join code, or null when switched off. May be expired: check codeExpiresAt. */
  code: string | null;
  codeExpiresAt: string | null;
};

export type TeacherOverview = {
  classes: TeacherClass[];
  individualCode: string | null;
  individualCodeExpiresAt: string | null;
};

export type LinkedStudent = {
  studentId: string;
  displayName: string;
  email: string;
  linkedAt: string;
  classIds: string[];
};

export async function loadTeacherOverview(): Promise<TeacherOverview> {
  const [c, k] = await Promise.all([
    db().from("classes").select("id, name, school_year, archived, created_at").order("created_at"),
    db().from("join_codes").select("code, kind, class_id, expires_at").eq("revoked", false),
  ]);
  const classes = check(c) as { id: string; name: string; school_year: string | null; archived: boolean; created_at: string }[];
  const codes = check(k) as { code: string; kind: "class" | "individual"; class_id: string | null; expires_at: string | null }[];
  const individual = codes.find((x) => x.kind === "individual");
  return {
    classes: classes.map((x) => {
      const code = codes.find((y) => y.class_id === x.id);
      return {
        id: x.id,
        name: x.name,
        schoolYear: x.school_year,
        archived: x.archived,
        createdAt: x.created_at,
        code: code?.code ?? null,
        codeExpiresAt: code?.expires_at ?? null,
      };
    }),
    individualCode: individual?.code ?? null,
    individualCodeExpiresAt: individual?.expires_at ?? null,
  };
}

export async function listStudents(): Promise<LinkedStudent[]> {
  const rows = check(await db().rpc("teacher_students")) as {
    student_id: string;
    display_name: string;
    email: string;
    linked_at: string;
    class_ids: string[];
  }[];
  return rows.map((r) => ({ studentId: r.student_id, displayName: r.display_name, email: r.email, linkedAt: r.linked_at, classIds: r.class_ids ?? [] }));
}

export async function createClass(name: string, schoolYear?: string): Promise<{ id: string; code: string }> {
  return check(await db().rpc("teacher_create_class", { p_name: name, p_school_year: schoolYear ?? null })) as { id: string; code: string };
}

export async function archiveClass(classId: string, archived: boolean): Promise<void> {
  check(await db().rpc("teacher_archive_class", { p_class: classId, p_archived: archived }));
}

/** Replaces the active code for a class (pass classId) or for one-on-one students (omit it). Returns the new code. */
export async function newCode(kind: "class" | "individual", classId?: string, expiresAt?: Date): Promise<string> {
  return check(
    await db().rpc("teacher_new_code", { p_kind: kind, p_class: classId ?? null, p_expires: expiresAt ? expiresAt.toISOString() : null }),
  ) as string;
}

/** Switches the code off without issuing a new one. */
export async function revokeCode(kind: "class" | "individual", classId?: string): Promise<void> {
  check(await db().rpc("teacher_revoke_code", { p_kind: kind, p_class: classId ?? null }));
}

export async function removeStudent(studentId: string): Promise<void> {
  check(await db().rpc("teacher_remove_student", { p_student: studentId }));
}

export async function removeFromClass(classId: string, studentId: string): Promise<void> {
  check(await db().rpc("teacher_remove_from_class", { p_class: classId, p_student: studentId }));
}

// ───────── teacher read access (migration 0022) ─────────

/** Every linked student with headline numbers and a minimal college list. Throws if the call fails. */
export async function teacherRoster(): Promise<RosterStudent[]> {
  const rows = check(await db().rpc("teacher_roster", { p_today: localDate(new Date()) })) as Record<string, unknown>[];
  return rows.map(parseRosterRow);
}

/** Full read-only detail for one linked student; throws "student not found" for anyone not linked. */
export async function teacherStudent(studentId: string): Promise<StudentDetail> {
  return parseStudentDetail(check(await db().rpc("teacher_student", { p_student: studentId, p_today: localDate(new Date()) })));
}

/** Deadlines coming up in the next `days` days (1-365) across all linked students, soonest first. */
export async function teacherDeadlines(days = 60): Promise<UpcomingDeadline[]> {
  const rows = check(await db().rpc("teacher_deadlines", { p_days: days, p_today: localDate(new Date()) })) as Record<string, unknown>[];
  return rows.map(parseUpcomingDeadline);
}

// ───────── private teacher notes (migration 0024) ─────────

export type TeacherNote = { id: string; body: string; createdAt: string; updatedAt: string };
export const NOTE_MAX = 4000;

const toNote = (r: { id: string; body: string; created_at: string; updated_at: string }): TeacherNote => ({
  id: r.id,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** The caller's own notes about one linked student, newest first. Only the teacher who wrote them can read them. */
export async function listNotes(studentId: string): Promise<TeacherNote[]> {
  const rows = check(
    await db().from("teacher_notes").select("id, body, created_at, updated_at").eq("student_id", studentId).order("created_at", { ascending: false }),
  ) as { id: string; body: string; created_at: string; updated_at: string }[];
  return rows.map(toNote);
}

export async function addNote(studentId: string, body: string): Promise<TeacherNote> {
  const row = check(await db().from("teacher_notes").insert({ student_id: studentId, body: body.trim() }).select("id, body, created_at, updated_at").single());
  return toNote(row as { id: string; body: string; created_at: string; updated_at: string });
}

// Row security hides notes that are gone (e.g. the student left), so a change that touched no row is an error.
export async function updateNote(id: string, body: string): Promise<void> {
  const rows = check(await db().from("teacher_notes").update({ body: body.trim() }).eq("id", id).select("id")) as unknown[];
  if (rows.length === 0) throw new Error("note not found");
}

export async function deleteNote(id: string): Promise<void> {
  const rows = check(await db().from("teacher_notes").delete().eq("id", id).select("id")) as unknown[];
  if (rows.length === 0) throw new Error("note not found");
}

// ───────── college names for slugs (public read) ─────────

/** slug -> display name for the given college slugs; slugs we don't know are simply missing from the map. */
export async function collegeNames(slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = check(await db().from("institutions").select("slug, name, short_name").in("slug", slugs)) as { slug: string; name: string; short_name: string | null }[];
  return new Map(rows.map((r) => [r.slug, r.short_name || r.name]));
}
