// Small pieces of the product set beside /help's answers, so each answer shows the thing it explains. They are drawn
// with the app's own components (FitBadge, DeadlineChip, the college page's Ref and SourceItem) from real data about
// one real college, Purdue, and nothing in them is a dead control: the only links are real ones (the source and its [1]).
import type { ReactNode } from "react";
import { FitBadge } from "@/components/badges";
import { Ref } from "@/components/college/Ref";
import { SourceItem } from "@/components/college/SourceItem";
import { DeadlineChip } from "@/components/StatusPill";
import { getCollege, getDeadlines, getSummaries } from "@/lib/data";
import { computeFit } from "@/lib/fit";
import { daysUntil, fmtDate } from "@/lib/format";
import type { TFunction } from "@/lib/i18n";
import { fitReasonText } from "@/lib/i18n/fit-text";
import { PLANS } from "@/lib/plans";

/** The college every figure shows, and the student the fit figure compares with it. */
const SLUG = "purdue";
const STUDENT = { international: true, sat: 1350 } as const;
const today = () => new Date().toISOString().slice(0, 10);
const nameOf = (c: { short_name: string | null; name: string }) => c.short_name ?? c.name;

/** A product fragment set as a figure: the fragment in a quiet frame (data-ui: the app's own borders), a caption under it. */
export function HelpFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="mt-5 lg:mt-4 lg:max-w-[22rem]">
      <div data-ui className="rounded-xl border border-zinc-200 bg-white p-4">
        {children}
      </div>
      <figcaption className="mt-2 text-sm leading-snug text-zinc-600">{caption}</figcaption>
    </figure>
  );
}

/** The figure's shape while its data loads. */
export function HelpFigureSkeleton() {
  return <div aria-hidden className="mt-5 h-28 animate-pulse rounded-xl bg-zinc-50 lg:mt-4 lg:max-w-[22rem]" />;
}

/** How fit is decided: Purdue's chip for an applicant from abroad with SAT 1350, and the reasons the app gives for it. */
export async function FitFigure({ t }: { t: TFunction }) {
  const c = (await getSummaries()).find((x) => x.slug === SLUG);
  const result = c ? computeFit(STUDENT, c) : null;
  if (!c || !result) return null;
  return (
    <HelpFigure caption={t("misc.help.figFit", { college: nameOf(c), sat: STUDENT.sat })}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-semibold">{nameOf(c)}</span>
        <FitBadge fit={result.fit} result={result} />
      </div>
      <p className="mt-2 text-sm leading-snug text-zinc-600">{fitReasonText(t, result)}</p>
    </HelpFigure>
  );
}

/** How many colleges fit: the room in My list on each plan, read from lib/plans.ts. */
export function PlanFigure({ t }: { t: TFunction }) {
  return (
    <HelpFigure caption={t("misc.help.figPlans")}>
      <dl className="space-y-2 text-base">
        {PLANS.map((p) => (
          <div key={p.key} className="flex items-baseline gap-3">
            <dt className="font-semibold">{p.name}</dt>
            <span aria-hidden className="leader min-w-6 flex-1" />
            <dd className="tabular-nums">{p.limit == null ? t("misc.help.figNoLimit") : t("misc.help.figColleges", { n: p.limit })}</dd>
          </div>
        ))}
      </dl>
    </HelpFigure>
  );
}

/** Deadline reminders: Purdue's next application deadline as My list shows it, counted from today. */
export async function DeadlineFigure({ t }: { t: TFunction }) {
  const [colleges, deadlines] = await Promise.all([getSummaries(), getDeadlines()]);
  const c = colleges.find((x) => x.slug === SLUG);
  const now = today();
  const next = c
    ? deadlines
        .filter((d) => d.institution_id === c.id && d.kind === "application" && d.plan_key && d.due_date && d.due_date >= now)
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
    : undefined;
  if (!c || !next) return null;
  const plan = t(`application.planLabel.${next.plan_key}` as Parameters<TFunction>[0]);
  return (
    <HelpFigure caption={t("misc.help.figDeadline", { college: nameOf(c) })}>
      <p className="text-base font-semibold">{nameOf(c)}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-zinc-600">{plan}</span>
        <DeadlineChip date={next.due_date!} days={daysUntil(next.due_date!)} done={false} />
      </div>
    </HelpFigure>
  );
}

/** Where the numbers come from: Purdue's admit rate with its numbered source, the way the college page cites it. */
export async function SourceFigure({ t }: { t: TFunction }) {
  const college = await getCollege(SLUG);
  const stats = [...(college?.admission_stats ?? [])].filter((s) => s.admit_rate != null).sort((a, b) => b.cds_year.localeCompare(a.cds_year))[0];
  const source = stats && college?.sources.find((s) => s.id === stats.source_id);
  if (!college || !stats || !source) return null;
  return (
    <HelpFigure caption={t("misc.help.figSource", { college: nameOf(college) })}>
      <p className="flex items-baseline justify-between gap-3 text-base">
        <span>{t("misc.help.figAdmitRate")}</span>
        <span className="font-semibold tabular-nums">
          {Number(stats.admit_rate).toFixed(1)}%<Ref n={1} />
        </span>
      </p>
      <ol className="mt-3 border-t border-zinc-100 pt-3 text-sm">
        <SourceItem n={1} url={source.url} title={source.title ?? source.url} accessed={t("misc.help.figAccessed", { date: fmtDate(source.accessed_on) })} />
      </ol>
    </HelpFigure>
  );
}
