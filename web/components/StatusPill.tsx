import { fmtDate } from "@/lib/format";
import { deadlineText, deadlineTone, referenceTone, type Tone } from "@/lib/status";
import { toneClass } from "@/lib/ui";

export function StatusIcon({ tone }: { tone: Tone }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {tone === "urgent" && (
        <>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </>
      )}
      {tone === "soon" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {tone === "done" && <path d="M20 6 9 17l-5-5" />}
      {tone === "progress" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
        </>
      )}
      {tone === "neutral" && <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

export function StatusPill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${toneClass(tone)}`}
      title={title}
    >
      <StatusIcon tone={tone} />
      {children}
    </span>
  );
}

export function DeadlineChip({
  date,
  days,
  done,
  doneLabel = "Done",
  reference = false,
  label,
}: {
  date: string;
  days: number;
  done: boolean;
  doneLabel?: string;
  /** Reference pages: a past date reads "passed" in neutral, not overdue. */
  reference?: boolean;
  label?: string;
}) {
  const tone = reference ? referenceTone(days) : deadlineTone(days, done);
  const text = done ? doneLabel : reference && days < 0 ? "passed" : deadlineText(days);
  return (
    <StatusPill tone={tone}>
      {label ? `${label} ` : ""}
      {fmtDate(date)} · {text}
    </StatusPill>
  );
}
