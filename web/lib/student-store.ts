"use client";

// Demo-only persistence in localStorage. Phase 2 moves this to Supabase
// (student_profiles / student_colleges tables, already created with per-user RLS).

import { useSyncExternalStore } from "react";
import type { StudentProfile } from "./fit";

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

export type ListEntry = { slug: string; plan: string | null; status: Status; notes: string; addedAt: string };

type State = { profile: StudentProfile; list: ListEntry[] };

const KEY = "college-tracker:v1";
const EMPTY: State = { profile: {}, list: [] };
const listeners = new Set<() => void>();
let cache: State | null = null;

function read(): State {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache!;
}

function write(next: State) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — keep in memory only
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStudent() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    profile: state.profile,
    list: state.list,
    setProfile(profile: StudentProfile) {
      write({ ...read(), profile });
    },
    has(slug: string) {
      return state.list.some((e) => e.slug === slug);
    },
    add(slug: string) {
      const s = read();
      if (s.list.some((e) => e.slug === slug)) return;
      write({ ...s, list: [...s.list, { slug, plan: null, status: "researching", notes: "", addedAt: new Date().toISOString() }] });
    },
    remove(slug: string) {
      const s = read();
      write({ ...s, list: s.list.filter((e) => e.slug !== slug) });
    },
    update(slug: string, patch: Partial<Omit<ListEntry, "slug">>) {
      const s = read();
      write({ ...s, list: s.list.map((e) => (e.slug === slug ? { ...e, ...patch } : e)) });
    },
  };
}
