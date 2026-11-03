"use client";

// Materials > Essays: the fold every card on the page shares (the personal statement, the UC questions, each college).
// A folded card is its header line; the title is the button that opens it.
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

export function FoldButton({ expanded, controls, onToggle, children }: { expanded: boolean; controls: string; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-left hover:underline" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      <svg
        aria-hidden
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      {children}
    </button>
  );
}

/** Ticked once the card's essays are done, so a folded card still says where it stands. */
export function DoneMark({ done }: { done: boolean }) {
  const t = useT();
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${done ? "bg-done text-white" : "border border-zinc-300"}`}
      aria-label={done ? t("writing.essaysDoneAria") : t("writing.essaysNotDoneAria")}
    >
      {done ? "✓" : ""}
    </span>
  );
}
