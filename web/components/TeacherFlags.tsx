import { StatusPill } from "@/components/StatusPill";
import type { Flag } from "@/lib/roster";
import { flagTone } from "@/lib/status";

/** Colored pills for a student's attention flags; the hover text carries the detail. */
export function FlagPills({ flags, emptyLabel }: { flags: Flag[]; emptyLabel?: string }) {
  if (flags.length === 0) return emptyLabel ? <span className="text-xs text-zinc-500">{emptyLabel}</span> : null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <StatusPill key={f.key} tone={flagTone(f.key)} title={f.detail}>
          {f.label}
          <span className="sr-only">: {f.detail}</span>
        </StatusPill>
      ))}
    </span>
  );
}
