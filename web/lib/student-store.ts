"use client";

// Student profile + college list.
// Signed out: kept in localStorage. Signed in: stored in Supabase (student_profiles /
// student_colleges, per-user RLS); what was saved locally is added to the account at sign-in if the student says so.
// Portal passwords are not part of either copy: they live only in the encrypted store (portal-vault-client.ts), or in
// device mode only in this browser's device store. profile.passwordStorage (0049) says which; it is read with the
// profile, kept in step with the password client (onPasswordMode / noteProfileMode) and never written by a profile save.

import { useSyncExternalStore } from "react";
import { upgradeActivities } from "./activities";
import type { StudentProfile } from "./fit";
import { customSlug, type CustomCollege } from "./custom-college";
import { canAddMore, effectivePlanKey, getPlan, listLimit, taipeiToday, type PlanKey, type PlanWindow } from "./plans";
import { collegeSlot, pairWithAccount, type SlotPassword } from "./portal-slots";
import { forgetPassword, importPasswords, loadSlots, noteProfileMode, onPasswordMode, onUnlock } from "./portal-vault-client";
import { mergePortals } from "./portals";
import { parseRole, type Role } from "./roles";
import {
  agreedFor,
  EMPTY_LOCAL,
  fillMissingProfile,
  hasLocalData,
  LEGACY_KEY,
  localWrites,
  MOVE_KEY,
  parseLocal,
  parseMove,
  profileHasData,
  serializeLocal,
  serializeMove,
  type LocalData,
  type MoveAgreement,
} from "./student-local";
import {
  COLLEGE_COLUMNS,
  fromEntry,
  fromProfile,
  fromRecommender,
  fromScholarship,
  fromTranscriptCourse,
  fromTranscriptSchool,
  PLAN_COLUMNS,
  portalColumns,
  PROFILE_COLUMNS,
  RECOMMENDER_COLUMNS,
  recommenderColumns,
  rowKey,
  SCHOLARSHIP_COLUMNS,
  scholarshipColumns,
  shouldRefresh,
  toEntry,
  toPlanFields,
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
import { afterAdd, afterDiscard, keptCopy, localOffer, type LocalFound } from "./sign-in-merge";
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
/** What this browser saved while signed out, as offered to the account at sign-in. */
export type { LocalFound };
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
  /** Signed in with data still saved in this browser from before: the sign-in dialog asks whether to add it. */
  localFound: LocalFound | null;
  /** Passwords an older build saved in this browser, waiting to be moved into an account (signed in: waiting for the vault to open). */
  localPasswordCount: number;
  /** Colleges the last sign-in merge kept in this browser because the account's plan had no room (0 when signed out). */
  localLeftover: number;
};

const KEY = "college-tracker:v1";
const EMPTY_PORTAL: Portal = { url: "", username: "" };
const EMPTY: State = {
  profile: {},
  list: [],
  recommenders: [],
  scholarships: [],
  transcriptSchools: [],
  transcriptCourses: [],
  auth: null,
  role: undefined,
  teacherProfile: null,
  ready: false,
  sessionChecked: false,
  syncing: false,
  error: null,
  localFound: null,
  localPasswordCount: 0,
  localLeftover: 0,
};
const NO_WINDOWS: PlanWindow[] = [];
const listeners = new Set<() => void>();
let state: State = EMPTY;
let started = false;
let lastLoad = 0; // when the account copy was last read
let savesInFlight = 0;
// Passwords an older build saved in this browser (in the copy, or already moved to LEGACY_KEY). Only ever filled from
// storage itself; kept in storage until imported into the account or removed by the student.
let localPasswords: SlotPassword[] = [];
// The stored copy and LEGACY_KEY value as last read or written, so an unchanged state isn't rewritten.
let storedJson: string | null = null;
let storedLegacy: string | null = null;
// "later" after "Not now" in the sign-in dialog: don't ask again until the next page load or sign-in.
let mergeChoice: "ask" | "later" = "ask";
// The account's `portals` exactly as last read or written, password keys included: profile saves put back the ones
// the database still holds (fromProfile), so a profile save never drops a password key it did not put there.
let storedPortals: unknown = null;
// A move of the agreed passwords is running (moveLocalPasswords); the agreement itself is in storage (MOVE_KEY).
let moving = false;
// Whose account copy has loaded successfully on this page. Until it has, account writes are refused: the page would
// otherwise overwrite the account with whatever it holds in memory (and drop password keys it never read).
let loadedFor: string | null = null;

function emit(patch: Partial<State>) {
  state = { ...state, ...patch };
  if (!state.auth) saveLocal();
  listeners.forEach((l) => l());
}

/**
 * The plan in force: the account's pass windows (written only by the server) on today's Taipei date. Signed out it
 * is always Free, whatever an older build saved in this browser.
 */
const planKeyOf = (s: Pick<State, "auth" | "profile">): PlanKey => (s.auth ? effectivePlanKey(s.profile.planWindows, taipeiToday()) : "free");

type Local = LocalData;
const pickLocal = (s: State): Local => ({
  profile: s.profile,
  list: s.list,
  recommenders: s.recommenders,
  scholarships: s.scholarships,
  transcriptSchools: s.transcriptSchools,
  transcriptCourses: s.transcriptCourses,
});

function loadLocal(): Local {
  let raw: string | null = null;
  let rawLegacy: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
    rawLegacy = window.localStorage.getItem(LEGACY_KEY);
  } catch {}
  const { data, passwords, inCopy } = parseLocal(raw, rawLegacy);
  // Activities saved in this browser before the 2026-27 format are upgraded as they are read, so the merge on
  // first sign-in (and everything else) only ever sees the current format.
  if (data.profile.activities != null) data.profile.activities = upgradeActivities(data.profile.activities);
  // A plan comes only from the account. One an older build saved here (the old free choice on /pricing) means
  // nothing: it neither counts as data to offer at sign-in nor reaches the account's profile in the merge.
  // The same for where passwords are kept: only the account's profile says that.
  if (data.profile.plan !== undefined || data.profile.planWindows !== undefined || data.profile.passwordStorage !== undefined) {
    const profile = { ...data.profile };
    delete profile.plan;
    delete profile.planWindows;
    delete profile.passwordStorage;
    data.profile = profile;
  }
  localPasswords = passwords;
  // A copy that still embeds passwords counts as unsaved: the next save moves them under LEGACY_KEY, then rewrites it.
  storedJson = raw && !inCopy ? serializeLocal(data) : null;
  storedLegacy = rawLegacy;
  return data;
}

/** The signed-out view of this browser's copy. */
const localState = () => ({ ...loadLocal(), localPasswordCount: localPasswords.length });

// Writes the copy (or removes it when `drop`), always putting the old passwords under LEGACY_KEY first, so the copy
// can lose its passwords without the browser losing them. Throws when storage refuses (caller decides).
function store(d: Local, drop = false) {
  const w = localWrites(d, localPasswords);
  if (w.legacy !== storedLegacy) {
    if (w.legacy) window.localStorage.setItem(LEGACY_KEY, w.legacy);
    else window.localStorage.removeItem(LEGACY_KEY);
    storedLegacy = w.legacy;
  }
  if (drop) {
    window.localStorage.removeItem(KEY);
    storedJson = null;
  } else if (w.copy !== storedJson) {
    window.localStorage.setItem(KEY, w.copy);
    storedJson = w.copy;
  }
}

function saveLocal() {
  try {
    store(pickLocal(state));
  } catch {
    // storage unavailable (private mode) — keep in memory only
  }
}

/** Replaces the stored copy (removing it when empty); the old passwords stay under LEGACY_KEY. */
function writeLocal(d: Local) {
  try {
    store(d, !hasLocalData(d, []));
  } catch {}
}

// The student's agreement to move browser passwords into the vault (MOVE_KEY): slots only, never a password. It is
// written by the sign-in merge for what the vault could not take yet (locked, or not set up), survives reloads, and
// is what moveLocalPasswords works from. "Not now" and the logins the merge held back for a different username
// (pairWithAccount) are never in it, so they never move on their own.
function readMove(): MoveAgreement | null {
  try {
    return parseMove(window.localStorage.getItem(MOVE_KEY));
  } catch {
    return null;
  }
}
function writeMove(m: MoveAgreement | null) {
  try {
    const raw = serializeMove(m);
    if (raw) window.localStorage.setItem(MOVE_KEY, raw);
    else window.localStorage.removeItem(MOVE_KEY);
  } catch {}
}
/** The slots this account's student agreed to move that are still waiting. */
const agreedSlots = (userId: string): Set<string> => agreedFor(readMove(), userId);

/**
 * Runs when the vault opens (portal-vault-client.ts onUnlock): sends the passwords the student agreed to move that the
 * merge could not store, and keeps the ones the server did not confirm, with the same bookkeeping as the merge. Only for
 * the account the agreement was made for. Never throws.
 */
async function moveLocalPasswords() {
  const a = state.auth;
  if (moving || !a) return;
  const agreed = agreedSlots(a.userId);
  if (!agreed.size) return;
  moving = true;
  try {
    const send = localPasswords.filter((p) => agreed.has(p.slot));
    const notStored = send.length ? await importPasswords(send) : [];
    const left = new Set(notStored.map((p) => p.slot));
    // This browser's copy as it is now (the signed-in state holds the account's data and must not be written there):
    // drop the sent passwords that are stored, keep everything else.
    const local = loadLocal();
    const sent = new Set(send.map((p) => p.slot));
    localPasswords = localPasswords.filter((p) => !sent.has(p.slot) || left.has(p.slot));
    writeLocal(local);
    // The agreement shrinks to what is still waiting (re-read: a merge may have added to it while this ran).
    const now = readMove();
    if (now && now.userId === a.userId) {
      const waiting = now.slots.filter((s) => localPasswords.some((p) => p.slot === s));
      writeMove(waiting.length ? { userId: a.userId, slots: waiting } : null);
    }
    emit({ localPasswordCount: localPasswords.length });
  } catch {
    // nothing was removed; the next unlock tries again
  } finally {
    moving = false;
  }
}

/**
 * The college limit of the account's plan today (Taipei; null = none), from the account's profile as read. What the
 * signed-out copy can offer under it is worked out again on every read (sign-in-merge.ts localOffer).
 */
const limitOf = (profile: StudentProfile | null): number | null => listLimit(effectivePlanKey(profile?.planWindows, taipeiToday()));

async function loadRemote(userId: string, email: string | null, opts: { merge?: boolean } = {}): Promise<{ passwordsFailed: number }> {
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
      loadedFor = userId;
      emit({ auth: { userId, email }, role, teacherProfile, profile: {}, list: [], recommenders: [], scholarships: [], transcriptSchools: [], transcriptCourses: [], ready: true, sessionChecked: true, syncing: false, localFound: null, localLeftover: 0 });
      return { passwordsFailed: 0 };
    }
    const local = loadLocal();
    const localPw = localPasswords;
    // Passwords the student already agreed to add (now waiting for the vault to open) are not offered again.
    const agreed = agreedSlots(userId);
    const merge = !!opts.merge;
    const [p, l] = await Promise.all([
      db.from("student_profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle(),
      db.from("student_colleges").select(COLLEGE_COLUMNS).order("created_at"),
    ]);
    if (p.error) throw p.error;
    if (l.error) throw l.error;
    storedPortals = p.data ? ((p.data as ProfileRow).portals ?? null) : null;

    let profile = p.data ? toProfile(p.data as ProfileRow) : null;
    let list = ((l.data ?? []) as unknown as CollegeRow[]).map(toEntry);
    // Only as many local colleges can join as the account's plan allows today (its own colleges count first, local
    // ones go in oldest first; the server refuses the rest, 0046, and one refused row would fail the whole insert).
    // The others stay in this browser's copy untouched (status, notes, checklist, custom details, login and its
    // password) until a pass makes room. Worked out from the account as read, before any write below. The dialog
    // offers (and "Add" sends) only `pw.offered`: never the agreed passwords, never a kept college's own.
    const { fit, pw, found } = localOffer(local, localPw, list, limitOf(profile), agreed);
    const keep = fit.keep;
    // Data saved in this browser before sign-in is only added when the student said so (the sign-in dialog), and only
    // asked about while something can actually be added.
    const offer = !merge && mergeChoice === "ask" && !!found;
    let passwordsFailed = 0;
    if (merge) {
      // Which offered passwords may join the account's logins: only where the account has no username for that login,
      // or the same one this browser saved (decided on the account as it was before this merge).
      const paired = pairWithAccount(pw.offered, { portals: profile?.portals, list }, { portals: local.profile.portals, list: local.list });
      // A new account takes the local profile; an existing one keeps what it has and gains the fields and portal
      // logins it lacks.
      if (!profile && profileHasData(local.profile)) {
        const row = fromProfile(userId, local.profile, storedPortals);
        const up = await db.from("student_profiles").upsert(row);
        if (up.error) throw up.error;
        storedPortals = row.portals;
        profile = local.profile;
      } else if (profile) {
        const next = { ...fillMissingProfile(profile, local.profile), portals: mergePortals(profile.portals ?? {}, local.profile.portals ?? {}) };
        if (JSON.stringify(next) !== JSON.stringify(profile)) {
          const row = fromProfile(userId, next, storedPortals);
          const up = await db.from("student_profiles").upsert(row);
          if (up.error) throw up.error;
          storedPortals = row.portals;
          profile = next;
        }
      }
      if (fit.insert.length) {
        const ins = await db
          .from("student_colleges")
          .upsert(fit.insert.map((e) => fromEntry(userId, e)), { onConflict: "user_id,institution_id", ignoreDuplicates: true });
        if (ins.error) throw ins.error;
        list = [...list, ...fit.insert];
      }
      // The profile and list are in the account: move the offered passwords into the encrypted store, and take the
      // profile and the moved colleges out of this browser now, whatever happens to the reads below. A password leaves
      // the browser only once the server confirmed it stored it; the rest (every one while the vault is locked or not
      // set up), the ones held back for a different username, kept colleges' own and the ones agreed earlier (neither
      // was sent) stay for next time (sign-in-merge.ts afterAdd). The ones the student agreed to add (sent here and not
      // stored, or agreed earlier and still waiting) are remembered by slot in MOVE_KEY and move when the vault opens
      // (moveLocalPasswords), even after a reload; held ones and kept colleges' own never move on their own.
      // In device mode they go into this browser's device store instead (insert-only, nothing sent): the password
      // client is loaded first so it knows the account's mode.
      if (paired.send.length) await loadSlots();
      const notStored = paired.send.length ? await importPasswords(paired.send) : [];
      const after = afterAdd(pw, { notStored, hold: paired.hold });
      localPasswords = after.passwords;
      passwordsFailed = after.failed; // kept colleges' and earlier agreed passwords didn't fail: they were never sent
      writeMove(after.moveSlots.length ? { userId, slots: after.moveSlots } : null);
      writeLocal({ ...local, profile: {}, list: keep });
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
      if (merge && missingRecs.length) {
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
      if (merge && missingSch.length) {
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
          merge ? { schools: local.transcriptSchools.filter((x) => x?.id), courses: local.transcriptCourses.filter((x) => x?.id && x.schoolId) } : { schools: [], courses: [] },
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
    // Everything moved: the copy goes, except the colleges kept for lack of room (so it is only wiped when none were
    // kept). Passwords not yet stored stay under LEGACY_KEY either way: the agreed ones wait for the vault, kept
    // colleges' own stay with them, the others are offered again.
    if (merge && !recError && !schError && !txError) writeLocal(keptCopy(keep));
    lastLoad = Date.now();
    loadedFor = userId;
    const error = [recError, schError, txError].filter(Boolean).join(" ") || null;
    // The leftover is derived on every read (not remembered), so the notice survives reloads and follows the plan.
    emit({ auth: { userId, email }, role, teacherProfile: null, profile: profile ?? {}, list, recommenders, scholarships, transcriptSchools, transcriptCourses, ready: true, sessionChecked: true, syncing: false, error, localFound: offer ? found : null, localLeftover: fit.leftover, localPasswordCount: localPasswords.length });
    // Switched on another device since this page loaded? The password client reads everything again.
    noteProfileMode(userId, profile?.passwordStorage ?? "vault");
    return { passwordsFailed };
  } catch (e) {
    lastLoad = Date.now();
    emit({ auth: { userId, email }, ready: true, sessionChecked: true, syncing: false, error: `Couldn't load your saved list: ${(e as Error).message}` });
    return { passwordsFailed: 0 };
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
  // The vault opening (or device mode becoming ready) is when passwords waiting in this browser can be stored.
  onUnlock(() => void moveLocalPasswords());
  // The password client read or switched the account's mode: the profile shows the same.
  onPasswordMode((userId, mode) => {
    if (state.auth?.userId === userId && state.role === "student" && (state.profile.passwordStorage ?? "vault") !== mode)
      emit({ profile: { ...state.profile, passwordStorage: mode } });
  });
  state = { ...state, ...localState(), ready: true };
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
      mergeChoice = "ask";
      storedPortals = null;
      loadedFor = null;
      emit({ auth: null, role: undefined, teacherProfile: null, ...localState(), error: null, localFound: null, localLeftover: 0 });
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
  if (loadedFor !== state.auth.userId) {
    // Same wording style as the other store errors; the next successful load (focus, reload) re-enables saving.
    emit({ error: "Couldn't save: your account didn't load. Reload the page and try again." });
    return false;
  }
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
    if ((e.key === KEY || e.key === LEGACY_KEY) && !state.auth) {
      state = { ...state, ...localState() };
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
    if (!canAddMore(planKeyOf(state), state.list.length)) return false;
    const entry: ListEntry = { slug: college.slug, institutionId: college.id, plan: null, status: "in_progress", notes: "", checklist: {}, portal: EMPTY_PORTAL, addedAt: new Date().toISOString() };
    emit({ list: [...state.list, entry] });
    const a = state.auth;
    if (a) void remote(() => db().from("student_colleges").insert(fromEntry(a.userId, entry)));
    return true;
  };
  /** Adds a college the student typed in. Returns false when the plan's college limit is reached. */
  const addCustom = (custom: CustomCollege) => {
    if (!canAddMore(planKeyOf(state), state.list.length)) return false;
    const rowId = crypto.randomUUID();
    const entry: ListEntry = { slug: customSlug(rowId), institutionId: "", rowId, custom, plan: null, status: "in_progress", notes: "", checklist: {}, portal: EMPTY_PORTAL, addedAt: new Date().toISOString() };
    emit({ list: [...state.list, entry] });
    const a = state.auth;
    if (a) void remote(() => db().from("student_colleges").insert(fromEntry(a.userId, entry)));
    return true;
  };
  /** Resolves true once the account has the change (false when signed out, not loaded, or the save failed). */
  const setProfile = (profile: StudentProfile): Promise<boolean> => {
    emit({ profile });
    const a = state.auth;
    if (!a) return Promise.resolve(false);
    // Password keys the row still holds go back out unchanged; see storedPortals.
    const row = fromProfile(a.userId, profile, storedPortals);
    storedPortals = row.portals;
    return remote(() => db().from("student_profiles").upsert(row));
  };
  const planKey = planKeyOf(s);
  return {
    ...s,
    /** The plan in force today (Taipei): the pass while one of the account's windows covers today, else Free. */
    plan: getPlan(planKey),
    /** The account's passes as the server wrote them (none when signed out). */
    planWindows: (s.auth && s.profile.planWindows) || NO_WINDOWS,
    /** False once the list is full for the current plan. */
    canAdd: canAddMore(planKey, s.list.length),
    setProfile,
    /** Merges into the latest saved profile, so back-to-back edits don't overwrite each other. */
    updateProfile(patch: Partial<StudentProfile>) {
      return setProfile({ ...state.profile, ...patch });
    },
    /**
     * After a payment: re-reads only the account's plan columns (`plan`, `plan_windows`), which only the server writes,
     * and updates the plan in force. Nothing else is read from the account and nothing is merged; what this browser's
     * copy can offer is worked out again, so colleges that now fit are offered (unless the student said "Not now").
     * Does nothing until the account copy has loaded (that load reads them anyway); a failed read shows the usual
     * store error.
     */
    async reloadPlan(): Promise<void> {
      const a = state.auth;
      if (!a || loadedFor !== a.userId || state.role !== "student") return;
      const { data, error } = await db().from("student_profiles").select(PLAN_COLUMNS).eq("user_id", a.userId).maybeSingle();
      if (state.auth?.userId !== a.userId) return; // signed out or switched account meanwhile
      if (error) {
        emit({ error: `Couldn't refresh your plan: ${error.message}` });
        return;
      }
      const fields = data ? toPlanFields(data as Pick<ProfileRow, "plan" | "plan_windows">) : { planWindows: [] };
      const profile = { ...state.profile, ...fields };
      const local = loadLocal(); // also re-reads localPasswords
      const { fit, found } = localOffer(local, localPasswords, state.list, limitOf(profile), agreedSlots(a.userId));
      emit({ profile, localLeftover: fit.leftover, localFound: mergeChoice === "ask" ? found : null });
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
        // The password goes only once the row is really gone (not after a refused or failed write).
        void remote(() => db().from("student_colleges").delete().eq(key.column, key.value)).then((ok) => {
          if (ok) forgetPassword(collegeSlot(entry));
        });
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
    /**
     * The sign-in dialog's "Add to this account": merges this browser's signed-out copy into the account and moves
     * the offered passwords into the encrypted store. Resolves to how many of those couldn't be stored yet (they stay
     * in this browser: the ones sent move when the vault opens, the ones held back for a different username are
     * offered again).
     */
    async addLocalData(): Promise<{ passwordsFailed: number }> {
      const a = state.auth;
      if (!a) return { passwordsFailed: 0 };
      emit({ localFound: null });
      return loadRemote(a.userId, a.email, { merge: true });
    },
    /**
     * "Don't add": deletes what the dialog offered from this browser's signed-out copy, passwords included
     * (sign-in-merge.ts afterDiscard). Colleges that don't fit the plan were never offered: they and their own
     * passwords stay (My list's notice explains them). Passwords the student already agreed to move (waiting for the
     * vault to open) were not offered either, so they stay, and so does that agreement (MOVE_KEY).
     */
    discardLocalData() {
      const a = state.auth;
      const local = loadLocal(); // also re-reads localPasswords
      const offer = a ? localOffer(local, localPasswords, state.list, limitOf(state.profile), agreedSlots(a.userId)) : null;
      const after = offer ? afterDiscard(localPasswords, offer) : { passwords: [], local: EMPTY_LOCAL };
      localPasswords = after.passwords;
      writeLocal(after.local);
      emit({ localFound: null, localPasswordCount: localPasswords.length, localLeftover: offer?.fit.leftover ?? 0 });
    },
    /** "Not now" (or closing the dialog): keeps the copy in this browser, unmerged; asks again on the next page load. */
    keepLocalForLater() {
      mergeChoice = "later";
      emit({ localFound: null });
    },
    /** Signed out: removes the passwords an older build saved in this browser. */
    forgetLocalPasswords() {
      localPasswords = [];
      writeMove(null);
      writeLocal(pickLocal(state));
      emit({ localPasswordCount: 0 });
    },
  };
}
