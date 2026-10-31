"use client";

// What a connected AI can and can't do with the tracker, as two lists with drawn marks (never ✓/✕ glyphs).
// Shared by /connect-ai and the consent slip (/oauth/consent). Presentation only: the lists come from lib/connect-ai.

import { useId } from "react";
import { AI_CAN, AI_CANNOT } from "@/lib/connect-ai";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";

/** A drawn tick (allowed) or cross (not allowed), 20px, in the done green or a quiet grey. */
export function AccessMark({ yes }: { yes: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`mt-0.5 size-5 shrink-0 ${yes ? "text-done" : "text-zinc-500"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {yes ? <path d="M20 6 9 17l-5-5" /> : <path d="M6 6l12 12M18 6 6 18" />}
    </svg>
  );
}

/**
 * The two lists side by side. `onSky`: the lists sit on a slip (zinc-50) or the sky ground, so the "can" list is white;
 * on a white app screen it takes the zinc-50 panel tone instead. The "can't" list is always the pale blue step.
 */
export function AccessLists({ canTitle, cannotTitle, onSky = false }: { canTitle: string; cannotTitle: string; onSky?: boolean }) {
  const t = useT();
  const id = useId();
  const can = AI_CAN.map((text, i) => t(`misc.connect.can.${i}` as MessageKey) || text);
  const cannot = AI_CANNOT.map((text, i) => t(`misc.connect.cannot.${i}` as MessageKey) || text);
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <section aria-labelledby={`${id}-can`} className={`rounded-xl px-5 py-4 ${onSky ? "bg-white" : "bg-zinc-50"}`}>
        <h2 id={`${id}-can`} className="font-display text-lg font-bold text-ink">
          {canTitle}
        </h2>
        <ul className="mt-3 space-y-2.5 text-base leading-snug text-ink">
          {can.map((x) => (
            <li key={x} className="flex gap-2.5">
              <AccessMark yes />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby={`${id}-cannot`} className="rounded-xl bg-blue-50 px-5 py-4">
        <h2 id={`${id}-cannot`} className="font-display text-lg font-bold text-ink">
          {cannotTitle}
        </h2>
        <ul className="mt-3 space-y-2.5 text-base leading-snug text-ink">
          {cannot.map((x) => (
            <li key={x} className="flex gap-2.5">
              <AccessMark yes={false} />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
