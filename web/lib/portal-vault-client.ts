"use client";

// The browser side of saved portal passwords: POST /api/portal-passwords with the website's own access token.
// Passwords never go through the profile/list store (student-store.ts). A page asks once which slots hold a password
// ("list"); a single password is fetched only when the student asks to see or copy it, and only kept by the open
// login row. Nothing here touches localStorage.

import { useSyncExternalStore } from "react";
import { IMPORT_MAX, type SlotPassword } from "./portal-slots";
import { browserSupabase } from "./supabase-browser";

const ENDPOINT = "/api/portal-passwords";

/** idle: not asked yet; unavailable: the server isn't set up for passwords (503); error: couldn't reach it. */
export type VaultStatus = "idle" | "loading" | "ready" | "unavailable" | "error";
export type VaultView = { status: VaultStatus; slots: ReadonlySet<string> };
export type VaultError = "unauthorized" | "unavailable" | "not_found" | "unreadable" | "too_many" | "failed";

const INITIAL: VaultView = { status: "idle", slots: new Set() };
let view: VaultView = INITIAL;
let viewUser: string | null = null; // whose slots `view` holds
let listing: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: VaultView) {
  view = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Which slots hold a password, and whether the store can be reached. */
export const useVault = () => useSyncExternalStore(subscribe, () => view, () => INITIAL);

async function currentSession() {
  try {
    return (await browserSupabase().auth.getSession()).data.session;
  } catch {
    return null;
  }
}

type Reply = { status: number; data: Record<string, unknown> };

async function call(body: Record<string, unknown>): Promise<Reply> {
  const session = await currentSession();
  if (!session) return { status: 401, data: { error: "unauthorized" } };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 503 && viewUser === session.user.id) emit({ status: "unavailable", slots: new Set() });
    return { status: res.status, data };
  } catch {
    return { status: 0, data: { error: "network" } };
  }
}

const errorOf = (r: Reply): VaultError =>
  r.status === 401 ? "unauthorized" : r.status === 503 ? "unavailable" : r.status === 404 ? "not_found" : r.data.error === "unreadable" ? "unreadable" : r.data.error === "too_many" ? "too_many" : "failed";

function markSlot(slot: string, has: boolean) {
  if (view.slots.has(slot) === has) return;
  const slots = new Set(view.slots);
  if (has) slots.add(slot);
  else slots.delete(slot);
  emit({ ...view, slots });
}

/** Asks the server which slots hold a password: once per page and account (again after a failed try). */
export async function loadSlots(): Promise<void> {
  const session = await currentSession();
  const uid = session?.user.id ?? null;
  if (uid !== viewUser) {
    viewUser = uid;
    listing = null;
    emit(INITIAL);
  }
  if (!uid) return;
  listing ??= (async () => {
    emit({ status: "loading", slots: view.slots });
    const r = await call({ action: "list" });
    if (viewUser !== uid) return;
    if (r.status === 200 && Array.isArray(r.data.slots)) emit({ status: "ready", slots: new Set(r.data.slots.filter((s): s is string => typeof s === "string")) });
    else if (r.status === 503) emit({ status: "unavailable", slots: new Set() });
    else {
      emit({ status: "error", slots: view.slots });
      listing = null;
    }
  })();
  return listing;
}

export async function revealPassword(slot: string): Promise<{ password: string } | { error: VaultError }> {
  const r = await call({ action: "reveal", slot });
  if (r.status === 200 && typeof r.data.password === "string") return { password: r.data.password };
  if (r.status === 404) markSlot(slot, false);
  return { error: errorOf(r) };
}

/** Saves (or replaces) one password; "" deletes it. Null when it worked. */
export async function savePassword(slot: string, password: string): Promise<VaultError | null> {
  const r = await call({ action: "set", slot, password });
  if (r.status !== 200) return errorOf(r);
  markSlot(slot, password !== "");
  return null;
}

export async function deletePassword(slot: string): Promise<VaultError | null> {
  const r = await call({ action: "delete", slot });
  if (r.status !== 200) return errorOf(r);
  markSlot(slot, false);
  return null;
}

/** For a removed login: deletes its password unless this page already knows there is none. Errors are ignored. */
export function forgetPassword(slot: string | null) {
  if (!slot || (view.status === "ready" && !view.slots.has(slot))) return;
  void deletePassword(slot);
}

/**
 * Moves passwords saved outside the store (this browser's old signed-out copy, or an old profile row) into it.
 * Slots that already hold a password keep theirs. Resolves to how many couldn't be sent (0 = all done).
 */
export async function importPasswords(entries: readonly SlotPassword[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < entries.length; i += IMPORT_MAX) {
    const chunk = entries.slice(i, i + IMPORT_MAX);
    const r = await call({ action: "import", entries: chunk });
    if (r.status === 200) chunk.forEach((e) => markSlot(e.slot, true));
    else failed += chunk.length;
  }
  return failed;
}

// --- Clipboard ---------------------------------------------------------------------------------------------------

export const CLIPBOARD_CLEAR_MS = 30_000;
const RETRY_FOR_MS = 2 * 60_000;
let lastCopied: string | null = null; // what this page last put on the clipboard
let watchingCopies = false;

/** Copies text and remembers it was this page's last copy. False when the browser refused. */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    lastCopied = value;
    return true;
  } catch {
    return false;
  }
}

/** Copies a password, then clears the clipboard after 30 s if it still holds it (best effort; see clearLater). */
export async function copySecret(value: string): Promise<boolean> {
  if (!watchingCopies) {
    watchingCopies = true;
    // The student copied something else on this page: the clipboard no longer holds the password.
    document.addEventListener("copy", () => {
      lastCopied = null;
    });
  }
  if (!(await copyText(value))) return false;
  const until = Date.now() + CLIPBOARD_CLEAR_MS + RETRY_FOR_MS;
  setTimeout(() => void clearLater(value, until), CLIPBOARD_CLEAR_MS);
  return true;
}

// Clears only while this page's last copy is still the password, and, where the browser lets the page read the
// clipboard without asking, only if the clipboard still holds it. Writing needs the page focused: if the student is
// on the portal's tab, it tries again when they come back, for up to two more minutes.
async function clearLater(value: string, until: number) {
  if (lastCopied !== value) return;
  try {
    const perm = await navigator.permissions?.query({ name: "clipboard-read" as PermissionName });
    if (perm?.state === "granted" && (await navigator.clipboard.readText()) !== value) return;
  } catch {
    // reading isn't allowed here (most browsers): rely on lastCopied
  }
  try {
    await navigator.clipboard.writeText("");
    if (lastCopied === value) lastCopied = null;
  } catch {
    if (Date.now() < until) window.addEventListener("focus", () => void clearLater(value, until), { once: true });
  }
}
