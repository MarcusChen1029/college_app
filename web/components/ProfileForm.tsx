"use client";

import { useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

function num(v: string, min: number, max: number) {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** GPA box. Uncontrolled and saves on blur. */
export function GpaEditor() {
  const { profile, setProfile } = useStudent();
  const field = "w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-zinc-500">GPA (unweighted)</span>
      <input
        className={field}
        inputMode="decimal"
        placeholder="3.9"
        defaultValue={profile.gpa ?? ""}
        onBlur={(e) => setProfile({ ...profile, gpa: num(e.target.value, 0, 4) })}
      />
    </label>
  );
}

export function InternationalToggle() {
  const { profile, setProfile } = useStudent();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!profile.international} onChange={(e) => setProfile({ ...profile, international: e.target.checked })} />
      <span>International applicant</span>
    </label>
  );
}

export function ProfileForm() {
  // Inputs are uncontrolled; remount once after hydration so they pick up the saved profile.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <form key={mounted ? "client" : "server"} className="flex flex-wrap items-end gap-3 text-sm" onSubmit={(e) => e.preventDefault()}>
      <GpaEditor />
      <div className="pb-1">
        <InternationalToggle />
      </div>
    </form>
  );
}
