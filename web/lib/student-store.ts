"use client";

// Student profile + college list.
// Signed out: kept in localStorage. Signed in: stored in Supabase (student_profiles /
// student_colleges, per-user RLS); anything saved locally is merged in on first sign-in.

import { useSyncExternalStore } from "react";
import type { StudentProfile } from "./fit";
import { customSlug, type CustomCollege } from "./custom-college";
import { canAddMore, getPlan, type PlanKey } from "./plans";
import { parseRole, type Role } from "./roles";
import {
  COLLEGE_COLUMNS,
  fromEntry,
  fromProfile,
  portalColumns,
  PROFILE_COLUMNS,
  rowKey,
  shouldRefresh,
  toEntry,
  toProfile,
  type CollegeRow,
  type ListEntry,
  type Portal,
  type ProfileRow,
  type Status,
} from "./student-rows";
import { browserSupabase } from "./supabase-browser";

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
  auth: Auth;
  role: Role | null | undefined;
  teacherProfile: TeacherProfile | null;
  ready: boolean;
  syncing: boolean;
  error: string | null;
};

const KEY = "college-tracker:v1";
const EMPTY_PORTAL: Portal = { url: "", username: "", password: "" };
const EMPTY: State = { profile: {}, list: [], auth: null, role: undefined, teacherProfile: null, ready: false, syncing: false, error: null };
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

function loadLocal(): Pick<State, "profile" | "list"> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { profile: {}, list: [] };
    const parsed = JSON.parse(raw);
    // v1 entries predate institutionId/checklist; keep what we can.
    const list = (parsed.list ?? []).map((e: Partial<ListEntry>) => ({ checklist: {}, institutionId: "", portal: EMPTY_PORTAL, ...e }));
    return { profile: parsed.profile ?? {}, list };
  } catch {
    return { profile: {}, list: [] };
  }
}

function saveLocal() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ profile: state.profile, list: state.list }));
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
      emit({ auth: { userId, email }, role, teacherProfile, profile: {}, list: [], ready: true, syncing: false });
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
    clearLocal();
    lastLoad = Date.now();
    emit({ auth: { userId, email }, role, teacherProfile: null, profile: profile ?? {}, list, ready: true, syncing: false });
  } catch (e) {
    lastLoad = Date.now();
    emit({ auth: { userId, email }, ready: true, syncing: false, error: `Couldn't load your saved list: ${(e as Error).message}` });
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
    return; // no env configured — local-only mode
  }
  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
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

// Remote writes are optimistic; on failure we reload the server copy and surface the error.
async function remote(op: () => PromiseLike<{ error: { message: string } | null }>) {
  if (!state.auth) return;
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
  }
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
    update(slug: string, patch: Partial<Pick<ListEntry, "plan" | "status" | "notes" | "checklist" | "portal">>) {
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
            .update({ plan_key: next.plan, status: next.status, notes: next.notes || null, checklist: next.checklist, ...portalColumns(next.portal) })
            .eq(key.column, key.value),
        );
      }
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
