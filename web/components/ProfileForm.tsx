"use client";

import { useSyncExternalStore } from "react";
import { parseGpa } from "@/lib/gpa";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

/** GPA box. Uncontrolled, saves on blur, and puts the saved value back if what was typed is out of range. */
function GpaInput({ label, value, max, placeholder, onSave }: { label: string; value: number | null | undefined; max: number; placeholder: string; onSave: (n: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        key={value ?? "empty"}
        className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
        inputMode="decimal"
        placeholder={placeholder}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value;
          const n = parseGpa(raw, 0, max);
          if (n == null && raw.trim() !== "") {
            e.target.value = value?.toString() ?? "";
            return;
          }
          if (n !== (value ?? null)) onSave(n);
        }}
      />
    </label>
  );
}

/** Unweighted GPA (what colleges compare) and, optionally, the weighted GPA from the transcript. */
export function GpaEditor() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  const weightedOnly = profile.gpaWeighted != null && profile.gpa == null;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <GpaInput label={t("profile.gpaUnweightedLabel")} value={profile.gpa} max={4} placeholder="3.9" onSave={(n) => setProfile({ ...profile, gpa: n })} />
        <GpaInput label={t("profile.gpaWeightedLabel")} value={profile.gpaWeighted} max={6} placeholder="4.5" onSave={(n) => setProfile({ ...profile, gpaWeighted: n })} />
      </div>
      <p className="text-xs text-zinc-500">{weightedOnly ? t("profile.gpaWeightedOnly") : t("profile.gpaHint")}</p>
    </div>
  );
}

export function InternationalToggle() {
  const t = useT();
  const { profile, setProfile } = useStudent();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!profile.international} onChange={(e) => setProfile({ ...profile, international: e.target.checked })} />
      <span>{t("profile.internationalApplicant")}</span>
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
