"use client";

import Link from "next/link";
import { FitBadge, Pill, SchoolLogo, TierBadge } from "@/components/badges";
import type { Rec } from "@/lib/field-match";
import { reasonFor, type MatchRow } from "@/lib/field-match-view";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";

/** One college. `reason` rows (famous but not strong) show why instead of a strength bar. */
export function FieldMatchRow({ rec, reason = false }: { rec: Rec<MatchRow>; reason?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { college, score, fit } = rec;
  const num = (n: number) => n.toLocaleString(locale === "zh-TW" ? "zh-TW" : "en-US");

  // Evidence: the tiers behind the score, the size of the program, and the overall tier when the score leans on it.
  const parts: string[] = score.tier.map((x) =>
    t(x.proxy ? "match.ev.proxyTier" : "match.ev.tier", { category: t(`match.tierCat.${x.category}` as MessageKey), tier: x.code }),
  );
  if (score.grads) parts.push(t("match.ev.grads", { n: num(score.grads) }));
  else if (college.country_code !== "US" && score.depth === "established") parts.push(t("match.ev.course"));
  if (college.general_tier && (score.confidence === "estimated" || score.confidence === "partly_rated" || score.confidence === "general")) {
    parts.push(t("match.ev.general", { tier: college.general_tier }));
  }
  const why = reason ? reasonFor(score) : null;

  return (
    <li className="rounded-2xl border border-zinc-200 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SchoolLogo slug={college.slug} />
        <TierBadge tier={college.general_tier} />
        <Link href={`/colleges/${college.slug}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
          {college.short_name ?? college.name}
        </Link>
        {fit && <FitBadge fit={fit.fit} result={fit} />}
        {!reason && score.strength != null && (
          <span className="flex items-center gap-2" title={t("match.strength", { n: score.strength })}>
            <span className="h-2 w-20 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${score.strength}%` }} />
            </span>
            <span className="w-7 text-right text-sm font-bold tabular-nums">{score.strength}</span>
          </span>
        )}
        {!reason && score.confidence && <Pill tone={score.confidence === "rated" ? "blue" : "zinc"}>{t(`match.conf.${score.confidence}` as MessageKey)}</Pill>}
      </div>
      <p className="mt-1 text-xs text-zinc-500">{why ? t(why.key, why.vars) : parts.join(" · ")}</p>
    </li>
  );
}
