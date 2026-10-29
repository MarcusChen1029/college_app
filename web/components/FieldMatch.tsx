"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FieldMatchRow } from "@/components/FieldMatchRow";
import { fmtDate } from "@/lib/format";
import { FIELD_AREAS, FIELDS, cleanStudyFields, type FieldKey } from "@/lib/fields";
import { recommend, type Bucket, type FieldEvidence } from "@/lib/field-match";
import type { MatchCourse, MatchRow } from "@/lib/field-match-view";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { REGIONS, cleanRegions, type RegionCode } from "@/lib/regions";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import { buttonClass, PANEL } from "@/lib/ui";

const BUCKETS: Bucket[] = ["reach", "target", "safety", "unknown"];
const PER_BUCKET = 8;
/** The directions most applicants pick, offered as one-click chips while the field is undecided (lib/fields.ts keys). */
const POPULAR: FieldKey[] = ["computer_science", "engineering", "business", "economics", "biology", "pre_med", "psychology", "math_physical", "data_science", "international_relations"];
const select =
  "h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[15px] font-normal text-ink hover:border-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-zinc-50";

export function FieldMatch({
  colleges,
  evidence,
  courses,
  released,
}: {
  colleges: MatchRow[];
  evidence: Record<string, FieldEvidence>;
  /** Non-US universities' courses with their offers (app/(app)/tools/match/page.tsx). */
  courses: Record<string, MatchCourse[]>;
  released: string;
}) {
  const t = useT();
  const student = useStudent();
  const profile = student.profile;
  const saved = cleanStudyFields(profile.studyFields);
  const main: FieldKey = saved[0] ?? "undecided";
  const second = saved[1] ?? null;
  const label = (k: FieldKey) => t(`match.field.${k}` as MessageKey);

  // Regions: the ones in the data. Until the reader picks, follow the student's target regions (all when none).
  const present = useMemo(() => REGIONS.filter((r) => colleges.some((c) => c.country_code === r.code)), [colleges]);
  const [picked, setPicked] = useState<RegionCode[] | null>(null);
  const targeted = cleanRegions(profile.targetRegions).filter((c) => present.some((r) => r.code === c));
  const regions = picked ?? (targeted.length ? targeted : present.map((r) => r.code));
  const toggleRegion = (code: RegionCode) => {
    const next = regions.includes(code) ? regions.filter((c) => c !== code) : [...regions, code];
    if (next.length) setPicked(next);
  };

  const result = useMemo(
    () => recommend({ colleges, evidence, student: profile, fields: [main, second ?? undefined], regions }),
    [colleges, evidence, profile, main, second, regions],
  );
  const [open, setOpen] = useState<Partial<Record<Bucket, boolean>>>({});
  const total = BUCKETS.reduce((n, b) => n + result.buckets[b].length, 0);
  const hasScores = scoredTests(profile).length > 0;

  const setFields = (next: FieldKey[]) => student.updateProfile({ studyFields: cleanStudyFields(next) });
  const fieldName = second ? `${label(main)} + ${label(second)}` : label(main);
  // Scorecard earnings for the main direction only (the same one the graduate count describes).
  const earningsFor = (slug: string) => (main === "undecided" ? undefined : evidence[slug]?.earnings?.[main]);
  const showEarningsNote = main !== "undecided" && colleges.some((c) => earningsFor(c.slug));

  const undecided = main === "undecided";

  // Controls in a rail on the left (sticky on a wide screen), the colleges filling the rest of the width.
  return (
    <div className="grid gap-8 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
      <aside aria-label={t("match.direction")} className={`${PANEL} h-fit space-y-5 p-5 lg:sticky lg:top-24`}>
        <label className="block space-y-1.5 text-sm font-semibold">
          {t("match.direction")}
          <select className={select} value={main} onChange={(e) => setFields(e.target.value === "undecided" ? [] : [e.target.value as FieldKey, ...(second ? [second] : [])])}>
            {FIELD_AREAS.map((area) => (
              <optgroup key={area} label={t(`match.area.${area}` as MessageKey)}>
                {FIELDS.filter((f) => f.area === area).map((f) => (
                  <option key={f.key} value={f.key}>{label(f.key)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-semibold">
          {t("match.second")}
          <select className={select} value={second ?? ""} disabled={main === "undecided"} onChange={(e) => setFields(e.target.value ? [main, e.target.value as FieldKey] : [main])}>
            <option value="">{t("match.noSecond")}</option>
            {FIELD_AREAS.map((area) => {
              const options = FIELDS.filter((f) => f.area === area && f.key !== "undecided" && f.key !== main);
              return options.length ? (
                <optgroup key={area} label={t(`match.area.${area}` as MessageKey)}>
                  {options.map((f) => (
                    <option key={f.key} value={f.key}>{label(f.key)}</option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <div role="group" aria-label={t("match.regions")} className="space-y-1.5">
          <p className="text-sm font-semibold">{t("match.regions")}</p>
          <div className="flex flex-wrap gap-2">
            {present.map((r) => (
              <button
                key={r.code}
                type="button"
                aria-pressed={regions.includes(r.code)}
                onClick={() => toggleRegion(r.code)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                  regions.includes(r.code) ? "bg-blue-200 text-ink" : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:text-ink"
                }`}
              >
                {/* Selected: a filled chip with a tick, so the state reads at a glance. */}
                {regions.includes(r.code) && (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {t(`colleges.region.${r.code}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        {/* One banner says what the ranking rests on, so the rows don't repeat it. */}
        {(undecided || !hasScores) && (
          <div className="space-y-1 rounded-2xl bg-blue-50 px-5 py-3 text-[15px] text-ink">
            {undecided && <p>{t("match.undecidedNote")}</p>}
            {!hasScores && (
              <p>
                {t("match.noScores")}{" "}
                <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
                  {t("match.noScoresLink")}
                </Link>
              </p>
            )}
          </div>
        )}

        {/* Undecided: the common directions one click away, right above the results they would re-rank. */}
        {undecided && (
          <div role="group" aria-labelledby="match-pick" className="space-y-2">
            <p id="match-pick" className="text-[15px] font-semibold text-ink">
              {t("match.pickDirection")}
            </p>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFields([k])}
                  className="inline-flex h-9 items-center rounded-full bg-white px-3.5 text-sm font-semibold text-ink ring-1 ring-inset ring-zinc-300 transition-shadow hover:ring-ink"
                >
                  {label(k)}
                </button>
              ))}
            </div>
          </div>
        )}

        {total === 0 && <p className="rounded-2xl bg-zinc-50 p-4 text-[15px] text-ink">{t("match.empty")}</p>}
        {BUCKETS.filter((b) => result.buckets[b].length > 0).map((b) => {
          const list = result.buckets[b];
          const all = !!open[b];
          return (
            <section key={b} aria-labelledby={`bucket-${b}`} className="space-y-2">
              <div>
                <h2 id={`bucket-${b}`} className="font-display text-xl font-bold tracking-tight">
                  {t(`match.bucket.${b}` as MessageKey)} <span className="text-sm font-normal text-zinc-600 tabular-nums">({list.length})</span>
                </h2>
                <p className="text-[15px] text-zinc-700">{t(`match.bucket.${b}Hint` as MessageKey)}</p>
              </div>
              <ul className="space-y-2">
                {(all ? list : list.slice(0, PER_BUCKET)).map((rec) => (
                  <FieldMatchRow key={rec.college.slug} rec={rec} earnings={earningsFor(rec.college.slug)} undecided={undecided} field={main} courses={courses[rec.college.slug]} />
                ))}
              </ul>
              {list.length > PER_BUCKET && (
                <button type="button" onClick={() => setOpen({ ...open, [b]: !all })} className={buttonClass("quiet", "sm")}>
                  {all ? t("match.showFewer") : t("match.showAll", { n: list.length })}
                </button>
              )}
            </section>
          );
        })}

        {result.famousNotForField.length > 0 && (
          <section aria-labelledby="famous-heading" className="space-y-2">
            <div>
              <h2 id="famous-heading" className="font-display text-xl font-bold tracking-tight">{t("match.famous", { field: fieldName })}</h2>
              <p className="text-[15px] text-zinc-700">{t("match.famousIntro")}</p>
            </div>
            <ul className="space-y-2">
              {result.famousNotForField.map((rec) => (
                <FieldMatchRow key={rec.college.slug} rec={rec} reason field={main} courses={courses[rec.college.slug]} />
              ))}
            </ul>
          </section>
        )}

        {result.weaker.length > 0 && (
          <details className={`${PANEL} px-5 py-4`}>
            <summary className="cursor-pointer font-semibold">{t("match.weaker", { n: result.weaker.length })}</summary>
            <p className="mt-2 text-[15px] text-zinc-700">{t("match.weakerIntro")}</p>
            <ul className="mt-2 space-y-2">
              {result.weaker.map((rec) => (
                <FieldMatchRow key={rec.college.slug} rec={rec} earnings={earningsFor(rec.college.slug)} undecided={undecided} field={main} courses={courses[rec.college.slug]} />
              ))}
            </ul>
          </details>
        )}

        <p className="text-[13px] text-zinc-600">{t("match.dataNote")}</p>
        {showEarningsNote && <p className="text-[13px] text-zinc-600">{t("outcomes.match.note", { date: fmtDate(released) })}</p>}
      </div>
    </div>
  );
}
