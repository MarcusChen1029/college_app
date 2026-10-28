"use client";

// Student profile + college list.
// Signed out: kept in localStorage. Signed in: stored in Supabase (student_profiles /
// student_colleges, per-user RLS); anything saved locally is merged in on first sign-in.

import { useSyncExternalStore } from "react";
import { upgradeActivities } from "./activities";
import type { StudentProfile } from "./fit";
import { customSlug, type CustomCollege } from "./custom-college";
import { canAddMore, getPlan, type PlanKey } from "./plans";
import { parseRole, type Role } from "./roles";
import {
  COLLEGE_COLUMNS,
  fromEntry,
  fromProfile,
  fromRecommender,
  fromScholarship,
  fromTranscriptCourse,
  fromTranscriptSchool,
  portalColumns,
  PROFILE_COLUMNS,
  RECOMMENDER_COLUMNS,
  recommenderColumns,
  rowKey,
  SCHOLARSHIP_COLUMNS,
  scholarshipColumns,
  shouldRefresh,
  toEntry,
  toProfile,
  toRecommender,
  toScholarship,
  toTranscriptCourse,
  toTranscriptSchool,
  TRANSCRIPT_COURSE_COLUMNS,
  TRANSCRIPT_SCHOOL_COLUMNS,
  transcriptCourseColumns,
  transcriptSchoolColumns,
  type CollegeRow,
  type ListEntry,
  type Portal,
  type ProfileRow,
  type RecommenderRow,
  type ScholarshipRow,
  type Status,
  type TranscriptCourseRow,
  type TranscriptSchoolRow,
} from "./student-rows";
import { newRecommenderId, type Recommender, type RecommenderInput } from "./recommenders";
import { newScholarshipId, type Scholarship, type ScholarshipInput } from "./scholarships";
import { runUntilFailure } from "./sequence";
import { browserSupabase } from "./supabase-browser";
import {
  mergeTranscripts,
  newTranscriptId,
  type CourseInput,
  type SchoolInput,
  type Source,
  type TranscriptCourse,
  type TranscriptSchool,
} from "./transcript";

export { STATUSES, type ListEntry, type Portal, type Status } from "./student-rows";

/** The statuses students pick from. Older entries may hold others; shownStatus maps them where there is an equivalent. */
export const STATUS_OPTIONS = ["in_progress", "submitted", "admitted", "deferred", "waitlisted"] as const satisfies readonly Status[];
const STATUS_ALIAS: Partial<Record<Status, Status>> = { researching: "in_progress", planning: "in_progress", interview: "submitted", enrolled: "admitted" };
export const shownStatus = (s: Status): Status => STATUS_ALIAS[s] ?? s;

export { CHECKLIST, type Checklist, type ChecklistKey } from "./checklist";

export type CollegeRef = { slug: string; id: string };

type Auth = { userId: string; email: string | null } | null;
export type TeacherProfile = { displayName: string; school: string | null };
// role: undefined while loading or signed out; null when signed in but no role chosen yet (/welcome).
type State = {
  profile: StudentProfile;
  list: ListEntry[];
  /** The student's recommender tracker (private; table recommenders, migration 0026). */
  recommenders: Recommender[];
  /** The student's scholarship tracker (private; table scholarships, migration 0027). */
  scholarships: Scholarship[];
  /** The student's transcript (private; tables transcript_schools and transcript_courses, migration 0030). */
  transcriptSchools: TranscriptSchool[];
  transcriptCourses: TranscriptCourse[];
  auth: Auth;
  role: Role | null | undefined;
  teacherProfile: TeacherProfile | null;
  ready: boolean;
  sessionChecked: boolean; // the initial session lookup has resolved (with or without a user)
  syncing: boolean;
  error: string | null;
};

const KEY = "college-tracker:v1";
const EMPTY_PORTAL: Portal = { url: "", username: "", password: "" };
const EMPTY: State = { profile: {}, list: [], recommenders: [], scholarships: [], transcriptSchools: [], transcriptCourses: [], auth: null, role: undefined, teacherProfile: null, ready: false, sessionChecked: false, syncing: false, error: null };
const listeners = new Set<() => void>();
let state: State = EMPTY;
let started = false;
let lastLoad = 0; // when the account copy was last read
let savesInFlight = 0;

function emit(patch: Partial<State>) {
  state = { ...state, ...patch };
  if (!state.auth) saveLocal();
  listeners.forEach((l) => l());
}

type Local = Pick<State, "profile" | "list" | "recommenders" | "scholarships" | "transcriptSchools" | "transcriptCourses">;
const EMPTY_LOCAL: Local = { profile: {}, list: [], recommenders: [], scholarships: [], transcriptSchools: [], transcriptCourses: [] };

function loadLocal(): Local {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_LOCAL;
    const parsed = JSON.parse(raw);
    // v1 entries predate institutionId/checklist; keep what we can.
    const list = (parsed.list ?? []).map((e: Partial<ListEntry>) => ({ checklist: {}, institutionId: "", portal: EMPTY_PORTAL, ...e }));
    // Activities saved in this browser before the 2026-27 format are upgraded as they are read, so the merge on
    // first sign-in (and everything else) only ever sees the current format.
    const profile = parsed.profile ?? {};
    if (profile.activities != null) profile.activities = upgradeActivities(profile.activities);
    return {
      profile,
      list,
      recommenders: Array.isArray(parsed.recommenders) ? parsed.recommenders : [],
      scholarships: Array.isArray(parsed.scholarships) ? parsed.scholarships : [],
      transcriptSchools: Array.isArray(parsed.transcriptSchools) ? parsed.transcriptSchools : [],
      transcriptCourses: Array.isArray(parsed.transcriptCourses) ? parsed.transcriptCourses : [],
    };
  } catch {
    return EMPTY_LOCAL;
  }
}

function saveLocal() {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        profile: state.profile,
        list: state.list,
        recommenders: state.recommenders,
        scholarships: state.scholarships,
        transcriptSchools: state.transcriptSchools,
        transcriptCourses: state.transcriptCourses,
      }),
    );
  } catch {
    // storage unavailable (private mode) — keep in memory only
  }
}

function clearLocal() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

async function loadRemote(userId: string, email: string | null) {
  const db = browserSupabase();
  emit({ syncing: true, error: null });
  try {
    // Role first: only students have a profile and list, and only a student sign-in may absorb the local copy.
    const r = await db.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (r.error) throw r.error;
    const role = parseRole(r.data?.role);
    if (role !== "student") {
      let teacherProfile: TeacherProfile | null = null;
      if (role === "teacher") {
        const t = await db.from("teacher_profiles").select("display_name, school").eq("user_id", userId).maybeSingle();
        if (t.error) throw t.error;
        if (t.data) teacherProfile = { displayName: t.data.display_name, school: t.data.school };
      }
      lastLoad = Date.now();
      emit({ auth: { userId, email }, role, teacherProfile, profile: {}, list: [], recommenders: [], scholarships: [], transcriptSchools: [], transcriptCourses: [], ready: true, sessionChecked: true, syncing: false });
      return;
    }
    const local = loadLocal();
    const [p, l] = await Promise.all([
      db.from("student_profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle(),
      db.from("student_colleges").select(COLLEGE_COLUMNS).order("created_at"),
    ]);
    if (p.error) throw p.error;
    if (l.error) throw l.error;

    // First sign-in on this browser: move local data into the account.
    let profile = p.data ? toProfile(p.data as ProfileRow) : null;
    if (!profile && Object.values(local.profile).some((v) => v != null && v !== false && !(Array.isArray(v) && v.length === 0))) {
      const up = await db.from("student_profiles").upsert(fromProfile(userId, local.profile));
      if (up.error) throw up.error;
      profile = local.profile;
    }
    let list = ((l.data ?? []) as unknown as CollegeRow[]).map(toEntry);
    const missing = local.list.filter((e) =>
      e.custom ? !!e.rowId && !list.some((x) => x.rowId === e.rowId) : e.institutionId && !list.some((x) => x.institutionId === e.institutionId),
    );
    if (missing.length) {
      const ins = await db
        .from("student_colleges")
        .upsert(missing.map((e) => fromEntry(userId, e)), { onConflict: "user_id,institution_id", ignoreDuplicates: true });
      if (ins.error) throw ins.error;
      list = [...list, ...missing];
    }
    // Recommenders are separate from the list so a missing table (migration 0026 not applied yet) can't take the whole list down;
    // when they can't be read, the local copy is kept (not cleared) and nothing is merged.
    let recommenders: Recommender[] = [];
    let recError: string | null = null;
    const rr = await db.from("recommenders").select(RECOMMENDER_COLUMNS).order("created_at");
    if (rr.error) {
      recError = `Couldn't load your recommenders: ${rr.error.message}`;
    } else {
      recommenders = ((rr.data ?? []) as unknown as RecommenderRow[]).map(toRecommender);
      const missingRecs = local.recommenders.filter((x) => x?.id && !recommenders.some((y) => y.id === x.id));
      if (missingRecs.length) {
        const ins = await db.from("recommenders").upsert(missingRecs.map((x) => fromRecommender(userId, x)), { onConflict: "id", ignoreDuplicates: true });
        if (ins.error) recError = `Couldn't move your recommenders into your account: ${ins.error.message}`;
        else recommenders = [...recommenders, ...missingRecs];
      }
    }
    // Scholarships work the same way (migration 0027 may not be applied yet).
    let scholarships: Scholarship[] = [];
    let schError: string | null = null;
    const sr = await db.from("scholarships").select(SCHOLARSHIP_COLUMNS).order("created_at");
    if (sr.error) {
      schError = `Couldn't load your scholarships: ${sr.error.message}`;
    } else {
      scholarships = ((sr.data ?? []) as unknown as ScholarshipRow[]).map(toScholarship);
      const missingSch = local.scholarships.filter((x) => x?.id && !scholarships.some((y) => y.id === x.id));
      if (missingSch.length) {
        const ins = await db.from("scholarships").upsert(missingSch.map((x) => fromScholarship(userId, x)), { onConflict: "id", ignoreDuplicates: true });
        if (ins.error) schError = `Couldn't move your scholarships into your account: ${ins.error.message}`;
        else scholarships = [...scholarships, ...missingSch];
      }
    }
    // The transcript is read in its own try-block too (migration 0030 may not be applied yet); on any failure the local copy is kept.
    let transcriptSchools: TranscriptSchool[] = [];
    let transcriptCourses: TranscriptCourse[] = [];
    let txError: string | null = null;
    try {
      const [ts, tc] = await Promise.all([
        db.from("transcript_schools").select(TRANSCRIPT_SCHOOL_COLUMNS).order("created_at"),
        db.from("transcript_courses").select(TRANSCRIPT_COURSE_COLUMNS).order("created_at"),
      ]);
      const readError = ts.error ?? tc.error;
      if (readError) {
        txError = `Couldn't load your transcript: ${readError.message}`;
      } else {
        transcriptSchools = ((ts.data ?? []) as unknown as TranscriptSchoolRow[]).map(toTranscriptSchool);
        transcriptCourses = ((tc.data ?? []) as unknown as TranscriptCourseRow[]).map(toTranscriptCourse);
        const merged = mergeTranscripts(
          { schools: local.transcriptSchools.filter((x) => x?.id), courses: local.transcriptCourses.filter((x) => x?.id && x.schoolId) },
          { schools: transcriptSchools, courses: transcriptCourses },
        );
        if (merged.toInsertSchools.length) {
          const ins = await db.from("transcript_schools").upsert(merged.toInsertSchools.map((x) => fromTranscriptSchool(userId, x)), { onConflict: "id", ignoreDuplicates: true });
          if (ins.error) txError = `Couldn't move your transcript into your account: ${ins.error.message}`;
        }
        if (!txError && merged.toInsertCourses.length) {
          const ins = await db.from("transcript_courses").upsert(merged.toInsertCourses.map((x) => fromTranscriptCourse(userId, x)), { onConflict: "id", ignoreDuplicates: true });
          if (ins.error) txError = `Couldn't move your transcript into your account: ${ins.error.message}`;
        }
        if (!txError) {
          transcriptSchools = merged.schools;
          transcriptCourses = merged.courses;
        }
      }
    } catch (e) {
      txError = `Couldn't load your transcript: ${(e as Error).message}`;
    }
    if (!recError && !schError && !txError) clearLocal();
    lastLoad = Date.now();
    const error = [recError, schError, txError].filter(Boolean).join(" ") || null;
    emit({ auth: { userId, email }, role, teacherProfile: null, profile: profile ?? {}, list, recommenders, scholarships, transcriptSchools, transcriptCourses, ready: true, sessionChecked: true, syncing: false, error });
  } catch (e) {
    lastLoad = Date.now();
    emit({ auth: { userId, email }, ready: true, sessionChecked: true, syncing: false, error: `Couldn't load your saved list: ${(e as Error).message}` });
  }
}

// Back on a tab left open: pick up changes made elsewhere (another device, or an AI through Connect AI).
function refreshIfStale() {
  const a = state.auth;
  if (a && shouldRefresh({ signedIn: true, now: Date.now(), lastLoad, savesInFlight, loading: state.syncing })) void loadRemote(a.userId, a.email);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  state = { ...state, ...loadLocal(), ready: true };
  let supabase;
  try {
    supabase = browserSupabase();
  } catch {
    state = { ...state, sessionChecked: true };
    return; // no env configured — local-only mode
  }
  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (!user && !state.sessionChecked) emit({ sessionChecked: true });
    if (user && (event === "INITIAL_SESSION" || event === "SIGNED_IN") && state.auth?.userId !== user.id) {
      void loadRemote(user.id, user.email ?? null);
    } else if (!user && state.auth) {
      // Back to the browser's own copy (empty for former students, whose local data moved into the account),
      // so a teacher who signs out doesn't overwrite local data they never merged.
      emit({ auth: null, role: undefined, teacherProfile: null, ...loadLocal(), error: null });
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfStale();
  });
  window.addEventListener("focus", refreshIfStale);
}

// Remote writes are optimistic; on failure we reload the server copy and surface the error. Resolves true when the write worked.
async function remote(op: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
  if (!state.auth) return false;
  savesInFlight++;
  let error: { message: string } | null;
  try {
    ({ error } = await op());
  } finally {
    savesInFlight--;
  }
  if (error) {
    const { userId, email } = state.auth;
    await loadRemote(userId, email);
    emit({ error: `Couldn't save: ${error.message}` });
    return false;
  }
  return true;
}

// The transcript's writes depend on each other (a school must exist before its courses), so they run one after another.
let writeChain: Promise<unknown> = Promise.resolve();
// A group of writes that depend on each other stops at the first failure, so a later step never runs on top of a failed earlier one.
function remoteInOrder(...ops: Array<() => PromiseLike<{ error: { message: string } | null }>>) {
  writeChain = writeChain.then(() => runUntilFailure(ops.map((op) => () => remote(op)))).catch(() => {});
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && !state.auth) {
      state = { ...state, ...loadLocal() };
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

// Entries saved by older builds lack institutionId; fill it in once we know the colleges.
export function registerColleges(colleges: CollegeRef[]) {
  if (!state.list.some((e) => !e.institutionId && !e.custom)) return;
  const ids = new Map(colleges.map((c) => [c.slug, c.id]));
  emit({ list: state.list.map((e) => (e.institutionId || e.custom ? e : { ...e, institutionId: ids.get(e.slug) ?? "" })) });
}

export function useStudent() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const db = () => browserSupabase();
  /** Returns false (and adds nothing) when the plan's college limit is reached. */
  const add = (college: CollegeRef) => {
    if (state.list.some((e) => e.slug === college.slug)) return true;
    if (!canAddMore(state.profile.plan, state.list.length)) return false;
    const entry: ListEntry = { slug: college.slug, institutionId: college.id, plan: null, status: "in_progress", notes: "", checklist: {}, portal: EMPTY_PORTAL, addedAt: new Date().toISOString() };
    emit({ list: [...state.list, entry] });
    const a = state.auth;
    if (a) void remote(() => db().from("student_colleges").insert(fromEntry(a.userId, entry)));
    return true;
  };
  /** Adds a college the student typed in. Returns false when the plan's college limit is reached. */
  const addCustom = (custom: CustomCollege) => {
    if (!canAddMore(state.profile.plan, state.list.length)) return false;
    const rowId = crypto.randomUUID();
    const entry: ListEntry = { slug: customSlug(rowId), institutionId: "", rowId, custom, plan: null, status: "in_progress", notes: "", checklist: {}, portal: EMPTY_PORTAL, addedAt: new Date().toISOString() };
    emit({ list: [...state.list, entry] });
    const a = state.auth;
    if (a) void remote(() => db().from("student_colleges").insert(fromEntry(a.userId, entry)));
    return true;
  };
  const setProfile = (profile: StudentProfile) => {
    emit({ profile });
    const a = state.auth;
    if (a) void remote(() => db().from("student_profiles").upsert(fromProfile(a.userId, profile)));
  };
  return {
    ...s,
    plan: getPlan(s.profile.plan),
    /** False once the list is full for the current plan. */
    canAdd: canAddMore(s.profile.plan, s.list.length),
    setProfile,
    /** Merges into the latest saved profile, so back-to-back edits don't overwrite each other. */
    updateProfile(patch: Partial<StudentProfile>) {
      setProfile({ ...state.profile, ...patch });
    },
    /** No payment yet: choosing a plan just saves it. */
    setPlan(plan: PlanKey) {
      setProfile({ ...state.profile, plan });
    },
    has(slug: string) {
      return s.list.some((e) => e.slug === slug);
    },
    /** Colleges being considered but not committed to; kept apart from the list and its plan limit. */
    interested: s.profile.interested ?? [],
    isInterested(slug: string) {
      return (s.profile.interested ?? []).includes(slug);
    },
    toggleInterested(slug: string) {
      const cur = state.profile.interested ?? [];
      setProfile({ ...state.profile, interested: cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug] });
    },
    /** Moves an interested college onto the list. Returns false when the plan's limit is reached. */
    promote(college: CollegeRef) {
      if (!add(college)) return false;
      setProfile({ ...state.profile, interested: (state.profile.interested ?? []).filter((x) => x !== college.slug) });
      return true;
    },
    add,
    addCustom,
    remove(slug: string) {
      const entry = state.list.find((e) => e.slug === slug);
      emit({ list: state.list.filter((e) => e.slug !== slug) });
      const a = state.auth;
      if (a && entry) {
        const key = rowKey(entry);
        void remote(() => db().from("student_colleges").delete().eq(key.column, key.value));
      }
    },
    update(slug: string, patch: Partial<Pick<ListEntry, "plan" | "status" | "notes" | "checklist" | "portal" | "aidOfferUsd">>) {
      const entry = state.list.find((e) => e.slug === slug);
      if (!entry) return;
      const next = { ...entry, ...patch };
      emit({ list: state.list.map((e) => (e.slug === slug ? next : e)) });
      const a = state.auth;
      if (a) {
        const key = rowKey(entry);
        void remote(() =>
          db()
            .from("student_colleges")
            .update({ plan_key: next.plan, status: next.status, notes: next.notes || null, checklist: next.checklist, ...portalColumns(next.portal), aid_offer_usd: next.aidOfferUsd ?? null })
            .eq(key.column, key.value),
        );
      }
    },
    /** Adds a recommender (already checked with validateRecommender). */
    addRecommender(input: RecommenderInput) {
      const rec: Recommender = { ...input, id: newRecommenderId(), createdAt: new Date().toISOString() };
      emit({ recommenders: [...state.recommenders, rec] });
      const a = state.auth;
      if (a) void remote(() => db().from("recommenders").insert(fromRecommender(a.userId, rec)));
    },
    updateRecommender(id: string, patch: Partial<RecommenderInput>) {
      const cur = state.recommenders.find((r) => r.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      emit({ recommenders: state.recommenders.map((r) => (r.id === id ? next : r)) });
      if (state.auth) void remote(() => db().from("recommenders").update(recommenderColumns(next)).eq("id", id));
    },
    removeRecommender(id: string) {
      emit({ recommenders: state.recommenders.filter((r) => r.id !== id) });
      if (state.auth) void remote(() => db().from("recommenders").delete().eq("id", id));
    },
    /** Adds a scholarship (already checked with validateScholarship). */
    addScholarship(input: ScholarshipInput) {
      const sch: Scholarship = { ...input, id: newScholarshipId(), createdAt: new Date().toISOString() };
      emit({ scholarships: [...state.scholarships, sch] });
      const a = state.auth;
      if (a) void remote(() => db().from("scholarships").insert(fromScholarship(a.userId, sch)));
    },
    updateScholarship(id: string, patch: Partial<ScholarshipInput>) {
      const cur = state.scholarships.find((s) => s.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      emit({ scholarships: state.scholarships.map((s) => (s.id === id ? next : s)) });
      if (state.auth) void remote(() => db().from("scholarships").update(scholarshipColumns(next)).eq("id", id));
    },
    removeScholarship(id: string) {
      emit({ scholarships: state.scholarships.filter((s) => s.id !== id) });
      if (state.auth) void remote(() => db().from("scholarships").delete().eq("id", id));
    },
    /** Adds a school to the transcript (already checked with validateSchool). Returns the new id. */
    addTranscriptSchool(input: SchoolInput): string {
      const school: TranscriptSchool = { ...input, id: newTranscriptId(), createdAt: new Date().toISOString() };
      emit({ transcriptSchools: [...state.transcriptSchools, school] });
      const a = state.auth;
      if (a) remoteInOrder(() => db().from("transcript_schools").insert(fromTranscriptSchool(a.userId, school)));
      return school.id;
    },
    updateTranscriptSchool(id: string, patch: Partial<SchoolInput>) {
      const cur = state.transcriptSchools.find((s) => s.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      emit({ transcriptSchools: state.transcriptSchools.map((s) => (s.id === id ? next : s)) });
      if (state.auth) remoteInOrder(() => db().from("transcript_schools").update(transcriptSchoolColumns(next)).eq("id", id));
    },
    /** Removes a school and, with it, all of its courses. */
    removeTranscriptSchool(id: string) {
      emit({ transcriptSchools: state.transcriptSchools.filter((s) => s.id !== id), transcriptCourses: state.transcriptCourses.filter((c) => c.schoolId !== id) });
      if (state.auth) remoteInOrder(() => db().from("transcript_schools").delete().eq("id", id));
    },
    /** Adds courses to a school (each already checked with validateCourse). */
    addTranscriptCourses(schoolId: string, inputs: CourseInput[], source: Source) {
      if (!inputs.length) return;
      const now = new Date().toISOString();
      const courses: TranscriptCourse[] = inputs.map((i) => ({ ...i, schoolId, source, id: newTranscriptId(), createdAt: now }));
      emit({ transcriptCourses: [...state.transcriptCourses, ...courses] });
      const a = state.auth;
      if (a) remoteInOrder(() => db().from("transcript_courses").insert(courses.map((c) => fromTranscriptCourse(a.userId, c))));
    },
    updateTranscriptCourse(id: string, patch: Partial<CourseInput>) {
      const cur = state.transcriptCourses.find((c) => c.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      emit({ transcriptCourses: state.transcriptCourses.map((c) => (c.id === id ? next : c)) });
      if (state.auth) remoteInOrder(() => db().from("transcript_courses").update(transcriptCourseColumns(next)).eq("id", id));
    },
    removeTranscriptCourse(id: string) {
      emit({ transcriptCourses: state.transcriptCourses.filter((c) => c.id !== id) });
      if (state.auth) remoteInOrder(() => db().from("transcript_courses").delete().eq("id", id));
    },
    /** Replaces every course of one school (the import's "Replace" choice). Per-system overrides of the old courses go with them. */
    replaceSchoolCourses(schoolId: string, inputs: CourseInput[], source: Source) {
      const now = new Date().toISOString();
      const courses: TranscriptCourse[] = inputs.map((i) => ({ ...i, schoolId, source, id: newTranscriptId(), createdAt: now }));
      const old = state.transcriptCourses.filter((c) => c.schoolId === schoolId);
      emit({ transcriptCourses: [...state.transcriptCourses.filter((c) => c.schoolId !== schoolId), ...courses] });
      const a = state.auth;
      if (!a) return;
      // Insert the new courses first and delete the old ones (by id) only if that worked: a failure can leave duplicates, never an empty school.
      const oldIds = old.map((c) => c.id);
      const ops: Array<() => PromiseLike<{ error: { message: string } | null }>> = [];
      if (courses.length) ops.push(() => db().from("transcript_courses").insert(courses.map((c) => fromTranscriptCourse(a.userId, c))));
      if (oldIds.length) ops.push(() => db().from("transcript_courses").delete().in("id", oldIds));
      if (ops.length) remoteInOrder(...ops);
    },
    /** Leaves the page for Google; the PKCE code it returns with is exchanged on load (detectSessionInUrl). `returnTo` is a path on this site. */
    async signInWithGoogle(returnTo = "/profile") {
      const { error } = await db().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${returnTo}` } });
      return error?.message ?? null;
    },
    async signOut() {
      await db().auth.signOut();
    },
    /** Switches an existing account between student and teacher (refused while it still has teacher/student links). Returns an error message, or null. */
    async changeRole(role: Role, teacher?: TeacherProfile) {
      const a = state.auth;
      if (!a) return "Sign in first.";
      const { error } = await db().rpc("change_my_role", { p_role: role, p_display_name: teacher?.displayName ?? null, p_school: teacher?.school ?? null });
      if (error) return error.message;
      await loadRemote(a.userId, a.email);
      if (state.role !== role) emit({ role });
      return null;
    },
    /** One-time choice made at /welcome. Returns an error message, or null on success. */
    async setRole(role: Role, teacher?: TeacherProfile) {
      const a = state.auth;
      if (!a) return "Sign in first.";
      const { error } = await db().rpc("set_my_role", { p_role: role, p_display_name: teacher?.displayName ?? null, p_school: teacher?.school ?? null });
      if (error) return error.message;
      await loadRemote(a.userId, a.email);
      // loadRemote reports its own failures; the role is saved either way, so don't send them back to the chooser.
      if (state.role !== role) emit({ role });
      return null;
    },
    clearError() {
      emit({ error: null });
    },
  };
}
