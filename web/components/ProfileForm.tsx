"use client";

import { useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

function num(v: string, min: number, max: number) {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function ProfileForm() {
  const { profile, setProfile } = useStudent();
  // Inputs are uncontrolled; remount once after hydration so they pick up the saved profile.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const field = "w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <form key={mounted ? "client" : "server"} className="flex flex-wrap items-end gap-3 text-sm" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">SAT</span>
        <input
          className={field}
          inputMode="numeric"
          placeholder="1450"
          defaultValue={profile.sat ?? ""}
          onBlur={(e) => setProfile({ ...profile, sat: num(e.target.value, 400, 1600) })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">ACT</span>
        <input
          className={field}
          inputMode="numeric"
          placeholder="33"
          defaultValue={profile.act ?? ""}
          onBlur={(e) => setProfile({ ...profile, act: num(e.target.value, 1, 36) })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">GPA (unweighted)</span>
        <input
          className={field}
          inputMode="decimal"
          placeholder="3.9"
          defaultValue={profile.gpa ?? ""}
          onBlur={(e) => setProfile({ ...profile, gpa: num(e.target.value, 0, 4) })}
        />
      </label>
      <label className="flex items-center gap-2 pb-1">
        <input
          type="checkbox"
          checked={!!profile.international}
          onChange={(e) => setProfile({ ...profile, international: e.target.checked })}
        />
        <span>International applicant</span>
      </label>
    </form>
  );
}
