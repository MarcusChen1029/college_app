"use client";

import { StatusPill } from "@/components/StatusPill";
import { flagDetail, flagLabel } from "@/components/TeacherText";
import { useT } from "@/lib/i18n/client";
import type { Flag } from "@/lib/roster";
import { flagTone } from "@/lib/status";

/** Colored pills for a student's attention flags; the hover text carries the detail. */
export function FlagPills({ flags, emptyLabel }: { flags: Flag[]; emptyLabel?: string }) {
  const t = useT();
  if (flags.length === 0) return emptyLabel ? <span className="text-[13px] text-zinc-500">{emptyLabel}</span> : null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <StatusPill key={f.key} tone={flagTone(f.key)} title={flagDetail(t, f)}>
          {flagLabel(t, f)}
          <span className="sr-only">: {flagDetail(t, f)}</span>
        </StatusPill>
      ))}
    </span>
  );
}
