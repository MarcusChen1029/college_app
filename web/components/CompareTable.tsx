"use client";

import { useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { SECTION_TITLE } from "@/lib/ui";

export type CompareSection = { title: string; rows: { label: string; cells: React.ReactNode[] }[] };

const PHONE = "(max-width: 767px)";
const subscribe = (fn: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};

/**
 * The comparison table (app/(app)/compare/page.tsx renders its cells on the server). On a wide screen every college has a
 * column. On a phone two columns show at a time with a switcher above, so no cell is cut off and the page never scrolls
 * sideways; the row labels stay in their own column.
 */
export function CompareTable({
  names,
  heads,
  add,
  sections,
  titleTag = "h2",
}: {
  /** One per column, the add slot included (its name is "Add a college"). */
  names: string[];
  /** The college heads, in column order. */
  heads: React.ReactNode[];
  /** The add slot, a last column, when there is room for another college. */
  add?: React.ReactNode;
  sections: CompareSection[];
  titleTag?: "h2" | "h3";
}) {
  const t = useT();
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
  const [start, setStart] = useState(0);
  const total = heads.length + (add ? 1 : 0);
  const from = phone ? Math.min(start, Math.max(0, total - 2)) : 0;
  const shown = phone ? [from, from + 1].filter((i) => i < total) : Array.from({ length: total }, (_, i) => i);
  const Title = titleTag;
  const head = (i: number) => (i < heads.length ? heads[i] : add);

  return (
    <div className="space-y-3">
      {phone && total > 2 && (
        <div className="flex items-center gap-3" role="group" aria-label={t("college.compareColumns")}>
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-lg text-ink disabled:text-zinc-400"
            aria-label={t("college.comparePrev")}
            disabled={from === 0}
            onClick={() => setStart(from - 1)}
          >
            ‹
          </button>
          <p className="min-w-0 flex-1 text-center text-sm" aria-live="polite">
            <span className="block truncate font-semibold text-ink">{shown.map((i) => names[i]).join(" · ")}</span>
            <span className="text-zinc-600 tabular-nums">{t("college.compareShowing", { from: from + 1, to: from + shown.length, n: total })}</span>
          </p>
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-lg text-ink disabled:text-zinc-400"
            aria-label={t("college.compareNext")}
            disabled={from + 2 >= total}
            onClick={() => setStart(from + 1)}
          >
            ›
          </button>
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={phone ? undefined : { minWidth: `${6.5 + total * 9}rem` }}>
          <colgroup>
            <col className="w-26 md:w-44" />
            {shown.map((i) => (
              <col key={i} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-white md:top-0 md:z-30">
                <span className="sr-only">{t("college.compareTitle")}</span>
              </th>
              {shown.map((i) => (
                <th key={i} scope="col" className="bg-white px-1.5 pb-3 align-top font-normal md:sticky md:top-0 md:z-20 md:pt-2">
                  {head(i)}
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((s) => (
            <tbody key={s.title}>
              <tr>
                <th scope="colgroup" colSpan={shown.length + 1} className="pt-8 pb-2 text-left font-normal">
                  <Title className={`${SECTION_TITLE} sticky left-0 inline-block`}>{s.title}</Title>
                </th>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.label} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-t border-zinc-200 bg-white py-3 pr-3 text-left align-top text-[13px] font-medium text-zinc-600 md:static">
                    {r.label}
                  </th>
                  {shown.map((i) =>
                    i < heads.length ? (
                      <td key={i} className="border-t border-zinc-200 px-2 py-3 align-top text-ink break-words group-hover:bg-zinc-50 md:px-3">
                        {r.cells[i]}
                      </td>
                    ) : (
                      <td key={i} className="border-t border-zinc-100" />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
