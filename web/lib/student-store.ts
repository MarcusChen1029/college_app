"use client";

// Student profile + college list.
// Signed out: kept in localStorage. Signed in: stored in Supabase (student_profiles /
// student_colleges, per-user RLS); anything saved locally is merged in on first sign-in.

import { useSyncExternalStore } from "react";
import type { Checklist } from "./checklist";
import type { StudentProfile } from "./fit";
import { browserSupabase } from "./supabase-browser";

export const STATUSES = [
  "researching",
  "planning",
  "in_progress",
  "submitted",
  "interview",
  "admitted",
  "deferred",
  "waitlisted",
  "rejected",
  "withdrawn",
  "enrolled",
] as const;
export type Status = (typeof STATUSES)[number];

/** The statuses students pick from. Older entries may hold others; shownStatus maps them where there is an equivalent. */
export const STATUS_OPTIONS = ["in_progress", "submitted", "admitted", "deferred", "waitlisted"] as const satisfies readonly Status[];
const STATUS_ALIAS: Partial<Record<Status, Status>> = { researching: "in_progress", planning: "in_progress", interview: "submitted", enrolled: "admitted" };
export const shownStatus = (s: Status): Status => STATUS_ALIAS[s] ?? s;

export { CHECKLIST, type Checklist, type ChecklistKey } from "./checklist";

export type Portal = { url: string; username: string; password: string };

export type ListEntry = {
  slug: string;
  institutionId: string;
  plan: string | null;
  status: Status;
  notes: string;
  checklist: Checklist;
  portal: Portal;
  addedAt: string;
};

export type CollegeRef = { slug: string; id: string };

type Auth = { userId: string; email: string | null } | null;
type State = { profile: StudentProfile; list: ListEntry[]; auth: Auth; ready: boolean; syncing: boolean; error: string | null };

const KEY = "college-tracker:v1";
const EMPTY_PORTAL: Portal = { url: "", username: "", password: "" };
const EMPTY: State = { profile: {}, list: [], auth: null, ready: false, syncing: false, error: null };
const listeners = new Set<() => void>();
let state: State = EMPTY;
let started = false;

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

// ── Supabase mapping ──

type ProfileRow = {
  sat_total: number | null;
  act_composite: number | null;
  gpa_unweighted: number | null;
  is_international: boolean;
  reminder_emails: boolean;
};
type CollegeRow = {
  institution_id: string;
  plan_key: string | null;
  status: Status;
  notes: string | null;
  checklist: Checklist | null;
  portal_url: string | null;
  portal_username: string | null;
  portal_password: string | null;
  created_at: string;
  institutions: { slug: string } | null;
};

const toProfile = (r: ProfileRow): StudentProfile => ({
  sat: r.sat_total,
  act: r.act_composite,
  gpa: r.gpa_unweighted != null ? Number(r.gpa_unweighted) : null,
  international: r.is_international,
  reminderEmails: r.reminder_emails,
});
const fromProfile = (userId: string, p: StudentProfile) => ({
  user_id: userId,
  sat_total: p.sat ?? null,
  act_composite: p.act ?? null,
  gpa_unweighted: p.gpa ?? null,
  is_international: !!p.international,
  reminder_emails: p.reminderEmails ?? true,
});
const toEntry = (r: CollegeRow): ListEntry => ({
  slug: r.institutions?.slug ?? "",
  institutionId: r.institution_id,
  plan: r.plan_key,
  status: r.status,
  notes: r.notes ?? "",
  checklist: r.checklist ?? {},
  portal: { url: r.portal_url ?? "", username: r.portal_username ?? "", password: r.portal_password ?? "" },
  addedAt: r.created_at,
});
const fromEntry = (userId: string, e: ListEntry) => ({
  user_id: userId,
  institution_id: e.institutionId,
  plan_key: e.plan,
  status: e.status,
  notes: e.notes || null,
  checklist: e.checklist,
  ...portalColumns(e.portal),
});
const portalColumns = (p: Portal) => ({
  portal_url: p.url || null,
  portal_username: p.username || null,
  portal_password: p.password || null,
});

async function loadRemote(userId: string, email: string | null) {
  const db = browserSupabase();
  emit({ syncing: true, error: null });
  try {
    const local = loadLocal();
    const [p, l] = await Promise.all([
      db.from("student_profiles").select("sat_total, act_composite, gpa_unweighted, is_international, reminder_emails").eq("user_id", userId).maybeSingle(),
      db.from("student_colleges").select("institution_id, plan_key, status, notes, checklist, portal_url, portal_username, portal_password, created_at, institutions(slug)").order("created_at"),
    ]);
    if (p.error) throw p.error;
    if (l.error) throw l.error;

    // First sign-in on this browser: move local data into the account.
    let profile = p.data ? toProfile(p.data as ProfileRow) : null;
    if (!profile && Object.values(local.profile).some((v) => v != null && v !== false)) {
      const up = await db.from("student_profiles").upsert(fromProfile(userId, local.profile));
      if (up.error) throw up.error;
      profile = local.profile;
    }
    let list = ((l.data ?? []) as unknown as CollegeRow[]).map(toEntry);
    const missing = local.list.filter((e) => e.institutionId && !list.some((x) => x.institutionId === e.institutionId));
    if (missing.length) {
      const ins = await db
        .from("student_colleges")
        .upsert(missing.map((e) => fromEntry(userId, e)), { onConflict: "user_id,institution_id", ignoreDuplicates: true });
      if (ins.error) throw ins.error;
      list = [...list, ...missing];
    }
    clearLocal();
    emit({ auth: { userId, email }, profile: profile ?? {}, list, ready: true, syncing: false });
  } catch (e) {
    emit({ auth: { userId, email }, ready: true, syncing: false, error: `Couldn't load your saved list: ${(e as Error).message}` });
  }
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
      emit({ auth: null, profile: {}, list: [], error: null });
    }
  });
}

// Remote writes are optimistic; on failure we reload the server copy and surface the error.
async function remote(op: () => PromiseLike<{ error: { message: string } | null }>) {
  if (!state.auth) return;
  const { error } = await op();
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
  if (!state.list.some((e) => !e.institutionId)) return;
  const ids = new Map(colleges.map((c) => [c.slug, c.id]));
  emit({ list: state.list.map((e) => (e.institutionId ? e : { ...e, institutionId: ids.get(e.slug) ?? "" })) });
}

export function useStudent() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const db = () => browserSupabase();
  return {
    ...s,
    setProfile(profile: StudentProfile) {
      emit({ profile });
      const a = state.auth;
      if (a) void remote(() => db().from("student_profiles").upsert(fromProfile(a.userId, profile)));
    },
    has(slug: string) {
      return s.list.some((e) => e.slug === slug);
    },
    add(college: CollegeRef) {
      if (state.list.some((e) => e.slug === college.slug)) return;
      const entry: ListEntry = { slug: college.slug, institutionId: college.id, plan: null, status: "in_progress", notes: "", checklist: {}, portal: EMPTY_PORTAL, addedAt: new Date().toISOString() };
      emit({ list: [...state.list, entry] });
      const a = state.auth;
      if (a) void remote(() => db().from("student_colleges").insert(fromEntry(a.userId, entry)));
    },
    remove(slug: string) {
      const entry = state.list.find((e) => e.slug === slug);
      emit({ list: state.list.filter((e) => e.slug !== slug) });
      const a = state.auth;
      if (a && entry) void remote(() => db().from("student_colleges").delete().eq("institution_id", entry.institutionId));
    },
    update(slug: string, patch: Partial<Pick<ListEntry, "plan" | "status" | "notes" | "checklist" | "portal">>) {
      const entry = state.list.find((e) => e.slug === slug);
      if (!entry) return;
      const next = { ...entry, ...patch };
      emit({ list: state.list.map((e) => (e.slug === slug ? next : e)) });
      const a = state.auth;
      if (a)
        void remote(() =>
          db()
            .from("student_colleges")
            .update({ plan_key: next.plan, status: next.status, notes: next.notes || null, checklist: next.checklist, ...portalColumns(next.portal) })
            .eq("institution_id", entry.institutionId),
        );
    },
    /** Leaves the page for Google; the PKCE code it returns with is exchanged on load (detectSessionInUrl). */
    async signInWithGoogle() {
      const { error } = await db().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/profile` } });
      return error?.message ?? null;
    },
    async signOut() {
      await db().auth.signOut();
    },
    clearError() {
      emit({ error: null });
    },
  };
}
