"use client";

import { useId, useRef, useState } from "react";

/** keepMounted: the panel stays in the page (hidden) when another tab is selected, so unsaved typing survives. */
export type TabDef = { id: string; label: string; panel: React.ReactNode; keepMounted?: boolean };

/** Accessible tabs: arrow keys, Home and End move between tabs; only the selected panel is rendered. */
export function TeacherTabs({ tabs, label }: { tabs: TabDef[]; label: string }) {
  const base = useId();
  const [selected, setSelected] = useState(tabs[0].id);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.id === selected) ?? tabs[0];

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setSelected(tabs[next].id);
    buttons.current[tabs[next].id]?.focus();
  }

  // Styled as the shared SectionTabs (filled ink pill for the current tab, no hairline, a phone row that scrolls inside
  // itself and fades at its edge). SectionTabs itself links routes; these are in-page tabs, so they keep tab semantics.
  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto py-1.5 pl-1 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:p-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t, i) => {
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                buttons.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={on ? `${base}-panel` : undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                on ? "bg-ink text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => {
        const on = t.id === current.id;
        if (!on && !t.keepMounted) return null;
        return (
          <div key={t.id} role="tabpanel" id={on ? `${base}-panel` : undefined} aria-labelledby={`${base}-tab-${t.id}`} tabIndex={0} hidden={!on}>
            {t.panel}
          </div>
        );
      })}
    </div>
  );
}
