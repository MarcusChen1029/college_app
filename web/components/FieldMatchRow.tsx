"use client";

import Link from "next/link";
import { FitBadge, Pill, SchoolLogo, TierBadge } from "@/components/badges";
import type { Rec } from "@/lib/field-match";
import { courseOffer, offerRange, reasonFor, type MatchCourse, type MatchRow } from "@/lib/field-match-view";
import type { FieldKey } from "@/lib/fields";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { fmtPct } from "@/lib/format";
import { FEW_GRADUATES, formatEarnings, type FieldEarnings } from "@/lib/outcomes";
import { useStudent } from "@/lib/student-store";

/** One college. `earnings`: Scorecard median earnings in the chosen field, added to the evidence line. `reason` rows (famous but not strong) show why instead of a strength bar.
 *  `undecided`: no field chosen, so every row is ranked by its overall tier alone. The page says that once; a row shows its tier
 *  badge only, without the strength bar, the confidence pill or an "Overall tier" line that would say the same thing again. */
export function FieldMatchRow({
  rec,
  reason = false,
  earnings,
  undecided = false,
  field,
  courses,
}: {
  rec: Rec<MatchRow>;
  reason?: boolean;
  earnings?: FieldEarnings;
  undecided?: boolean;
  /** The chosen direction ("undecided" when none). */
  field?: FieldKey;
  /** A non-US university's courses and offers; undefined for US colleges or when none are loaded. */
  courses?: MatchCourse[];
}) {
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
  if (earnings) {
    parts.push(t(earnings.n < FEW_GRADUATES ? "outcomes.match.earningsFew" : "outcomes.match.earnings", { amount: formatEarnings(earnings.median) }));
  }
  const why = reason ? reasonFor(score) : null;
  // Undecided rows carry the admit rate mid-row (the international one for a student abroad, when it is published), so
  // the row reads as data rather than a name and a chip far apart.
  const { profile } = useStudent();
  const intl = !!profile.international && college.intl_admit_rate != null;
  const rate = intl ? college.intl_admit_rate : college.admit_rate;
  // A university that admits by course: the offer of the course in the chosen field, or the spread across its courses
  // while undecided, said plainly when the data is missing (never a bare dash).
  const byCourse = college.country_code !== "US";
  const fieldCourse = !undecided && field ? courses?.find((c) => c.fields.includes(field)) : undefined;
  const range = undecided && courses?.length ? offerRange(courses) : null;
  const rangeText = range == null ? t("match.offerNoFixed") : "varies" in range ? t("match.offerVaries") : range.text;
  const offerText = byCourse
    ? undecided
      ? courses?.length
        ? [t("match.offerCourses", { n: courses.length }), rangeText].join(" · ")
        : t("match.offerNone")
      : fieldCourse
        ? (courseOffer(fieldCourse) ?? t("match.offerNoFixed"))
        : courses?.length && field
          ? t("match.offerNoField", { field: t(`match.field.${field}` as MessageKey) })
          : t("match.offerNone")
    : null;
  const offerTitle = undecided ? courses?.map((c) => `${c.name}: ${courseOffer(c) ?? t("match.offerNoFixed")}`).join("\n") : fieldCourse?.name;
  if (offerText && !undecided && !why) parts.push(offerText);

  return (
    <li className="rounded-2xl bg-zinc-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SchoolLogo slug={college.slug} name={college.short_name ?? college.name} />
        {/* A fixed slot, so names line up whether the badge reads S++ or B. */}
        <span className="inline-flex w-11 shrink-0">
          <TierBadge tier={college.general_tier} />
        </span>
        <Link
          href={`/colleges/${college.slug}`}
          className={`min-w-0 flex-1 truncate font-semibold hover:underline ${undecided ? "sm:flex-none sm:basis-64" : ""}`}
        >
          {college.short_name ?? college.name}
        </Link>
        {undecided && (
          // Phone: the name takes the first line and the rate follows the chip on the second; wider: the rate mid-row.
          <span className={`order-last text-sm text-zinc-700 tabular-nums sm:order-none sm:min-w-0 sm:flex-1 ${byCourse ? "" : "whitespace-nowrap"}`}>
            {byCourse ? (
              <span title={offerTitle}>{offerText}</span>
            ) : rate != null ? (
              t(intl ? "match.admitIntl" : "match.admit", { rate: fmtPct(rate) })
            ) : (
              t("match.admitNone")
            )}
          </span>
        )}
        {fit && <FitBadge fit={fit.fit} result={fit} />}
        {!reason && !undecided && score.strength != null && (
          <span className="flex items-center gap-2" title={t("match.strength", { n: score.strength })}>
            <span className="h-2 w-20 overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${score.strength}%` }} />
            </span>
            <span className="w-7 text-right text-sm font-bold tabular-nums">{score.strength}</span>
          </span>
        )}
        {!reason && !undecided && score.confidence && <Pill tone={score.confidence === "rated" ? "blue" : "zinc"}>{t(`match.conf.${score.confidence}` as MessageKey)}</Pill>}
      </div>
      {(why || (!undecided && parts.length > 0)) && <p className="mt-1 text-[13px] text-zinc-600">{why ? t(why.key, why.vars) : parts.join(" · ")}</p>}
    </li>
  );
}
