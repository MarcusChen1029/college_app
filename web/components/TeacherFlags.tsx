import type { Flag, FlagKey } from "@/lib/roster";

const FLAG_STYLE: Record<FlagKey, string> = {
  deadline_soon: "bg-rose-100 text-rose-800",
  essay_not_started: "bg-amber-100 text-amber-800",
  no_scores: "bg-amber-100 text-amber-800",
  no_colleges: "bg-blue-100 text-blue-800",
  inactive: "bg-zinc-200 text-zinc-700",
};

/** Colored pills for a student's attention flags; the hover text carries the detail. */
export function FlagPills({ flags, emptyLabel }: { flags: Flag[]; emptyLabel?: string }) {
  if (flags.length === 0) return emptyLabel ? <span className="text-xs text-zinc-500">{emptyLabel}</span> : null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f.key} title={f.detail} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FLAG_STYLE[f.key]}`}>
          {f.label}
          <span className="sr-only">: {f.detail}</span>
        </span>
      ))}
    </span>
  );
}
