"use client";

// The tabs of a class page (Stream / Classwork / People) and of the To-do page. The chosen tab lives in the URL as
// `?tab=<id>` so a refresh or a shared link lands on the same tab; a switch uses history.replaceState (it does not add a
// Back-button step, and Next's router keeps useSearchParams in step). Missing or unknown means the first tab.
// The page must sit under a <Suspense> boundary (useSearchParams).

import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { pickTab, tabHref } from "@/lib/class-tab";
import { useT } from "@/lib/i18n/client";

/** The id of the tab button for `id` and of the panel it controls: a page puts `classPanelProps(id)` on its panel. */
const tabDomId = (id: string): string => `class-tab-${id}`;
const panelDomId = (id: string): string => `class-panel-${id}`;

/** The attributes a page's panel needs so its tab and it point at each other (`<div {...classPanelProps(tab)}>`). */
export function classPanelProps(id: string) {
  return { role: "tabpanel", id: panelDomId(id), "aria-labelledby": tabDomId(id), tabIndex: 0 } as const;
}

/** The selected tab id: `?tab=` when it is one of `ids`, otherwise the first. */
export function useClassTab(ids: readonly string[]): string {
  return pickTab(useSearchParams().get("tab"), ids);
}

export function ClassTabs({ tabs }: { tabs: { id: string; label: string }[] }) {
  const t = useT();
  const current = useClassTab(tabs.map((x) => x.id));
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function select(id: string) {
    window.history.replaceState(null, "", tabHref(window.location.href, id));
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].id);
    buttons.current[tabs[next].id]?.focus();
  }

  return (
    <div role="tablist" aria-label={t("classroom.tabs.label")} className="flex flex-wrap gap-x-6 border-b border-neutral-line">
      {tabs.map((tab, i) => {
        const on = tab.id === current;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={tabDomId(tab.id)}
            aria-selected={on}
            aria-controls={on ? panelDomId(tab.id) : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => select(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px inline-flex h-12 items-center border-b-[3px] px-1 text-[15px] font-semibold whitespace-nowrap transition-colors ${
              on ? "border-ink text-ink" : "border-transparent text-neutral hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
