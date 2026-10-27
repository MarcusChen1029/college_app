"use client";

// Writing > Essays, top: "Write once, adapt". The same kind of prompt across the student's colleges, shortest limit
// first, so one long draft can be cut down for the rest. Only shown when at least two colleges share a category.
import { useT } from "@/lib/i18n/client";
import type { ReuseGroup } from "@/lib/supplements";
import { limitLabel } from "./supplement-text";

export function EssayReusePanel({ groups }: { groups: ReuseGroup[] }) {
  const t = useT();
  if (!groups.length) return null;
  return (
    <section className="space-y-3 rounded-3xl border-2 border-zinc-200 p-5">
      <div>
        <h2 className="text-xl font-bold">{t("supplements.reuseTitle")}</h2>
        <p className="text-sm text-zinc-500">{t("supplements.reuseIntro")}</p>
      </div>
      <ul className="space-y-3">
        {groups.map((g) => {
          // Start from the longest essay the student is sure to write (a "maybe" might not apply to them).
          const longest = g.items.filter((i) => !i.maybe).at(-1) ?? g.items[g.items.length - 1];
          const colleges = new Set(g.items.map((i) => i.slug)).size;
          return (
            <li key={g.category} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{t(`supplements.cat.${g.category}`)}</span>
                <span className="text-zinc-500">{t("supplements.reuseCovers", { n: colleges })}</span>
                {(longest.words != null || longest.chars != null) && (
                  <span className="text-xs text-zinc-500">· {t("supplements.reuseLongest", { name: longest.name, limit: limitLabel(t, { word_limit: longest.words, char_limit: longest.chars }) })}</span>
                )}
              </div>
              <ol className="flex flex-wrap items-center gap-1.5 text-xs">
                {g.items.map((i, n) => (
                  <li key={`${i.slug}-${i.key}`} className="flex items-center gap-1.5">
                    {n > 0 && <span aria-hidden="true" className="text-zinc-400">→</span>}
                    <a
                      href={`#essays-${i.slug}`}
                      title={i.maybe ? t("supplements.reuseMaybe") : undefined}
                      className={`rounded-full border px-2.5 py-0.5 hover:border-zinc-500 hover:bg-zinc-50 ${i.maybe ? "border-dashed border-zinc-300 text-zinc-500" : "border-zinc-300"}`}
                    >
                      <span className="font-medium">{i.name}</span> <span className="tabular-nums text-zinc-500">{limitLabel(t, { word_limit: i.words, char_limit: i.chars })}</span>
                      {i.lastYear && <span className="text-zinc-400"> *</span>}
                    </a>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
      {groups.some((g) => g.items.some((i) => i.maybe)) && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span aria-hidden="true" className="inline-block h-3 w-6 rounded-full border border-dashed border-zinc-400" />
          {t("supplements.reuseMaybe")}
        </p>
      )}
      {groups.some((g) => g.items.some((i) => i.lastYear)) && <p className="text-xs text-zinc-500">* {t("supplements.lastYearHint")}</p>}
    </section>
  );
}
