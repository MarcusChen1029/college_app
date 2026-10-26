"use client";

// Read-only pages opened by a share link (migration 0032). They fetch through the anon RPCs with the token
// from the URL and show only what the RPC returns. Anything wrong (unknown, revoked, network) = "not active".

import { useEffect, useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { isDeadlineDone } from "@/lib/application";
import { progress } from "@/lib/checklist";
import { daysUntil, fmtDate } from "@/lib/format";
import { buildResume } from "@/lib/resume";
import { fetchParentView, fetchPortfolioView, localToday } from "@/lib/share-api";
import { parentDeadlines, parentSummary, type ParentView, type PortfolioView } from "@/lib/share-links";
import type { Tone } from "@/lib/status";
import type { Status } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";

/** Shown for a malformed, unknown or revoked link. Deliberately says nothing about why. */
export function ShareInactive() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-3xl font-bold">{t("share.inactiveTitle")}</h1>
      <p className="mt-3 text-zinc-500">{t("share.inactiveBody")}</p>
    </div>
  );
}

function Loading() {
  const t = useT();
  return <div aria-label={t("share.loading")} className="h-64 animate-pulse rounded-2xl bg-zinc-100" />;
}

function useShared<T>(token: string, fetcher: (t: string) => Promise<T | null>): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetcher(token).then((v) => live && setData(v));
    return () => {
      live = false;
    };
  }, [token, fetcher]);
  return data;
}

function PrintButton() {
  const t = useT();
  return (
    <button type="button" className={`${buttonClass("secondary", "sm")} print:hidden`} onClick={() => window.print()}>
      {t("share.print")}
    </button>
  );
}

// ── parent ──

const PARENT_STATUS_KEY: Record<Status, MessageKey> = {
  researching: "share.status.ready",
  planning: "share.status.ready",
  in_progress: "share.status.working",
  submitted: "share.status.waiting",
  interview: "share.status.waiting",
  admitted: "share.status.admitted",
  deferred: "share.status.deferred",
  waitlisted: "share.status.waitlisted",
  rejected: "share.status.rejected",
  withdrawn: "share.status.withdrawn",
  enrolled: "share.status.enrolled",
};

const STATUS_TONE: Record<Status, Tone> = {
  researching: "neutral",
  planning: "neutral",
  in_progress: "progress",
  submitted: "progress",
  interview: "progress",
  admitted: "done",
  enrolled: "done",
  deferred: "soon",
  waitlisted: "soon",
  rejected: "neutral",
  withdrawn: "neutral",
};

export function ParentShareView({ token }: { token: string }) {
  const view = useShared(token, fetchParentView);
  if (view === undefined) return <Loading />;
  if (view === null) return <ShareInactive />;
  return <ParentPage view={view} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 break-inside-avoid">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  );
}

function ParentPage({ view }: { view: ParentView }) {
  const t = useT();
  const today = localToday();
  const s = parentSummary(view);
  const deadlines = parentDeadlines(view, today).slice(0, 12);
  const who = view.student.name ?? t("share.yourStudent");
  const sub = [view.student.school, view.student.gradYear ? t("share.classOf", { year: view.student.gradYear }) : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-500">{t("share.headerLine")}</p>
          <h1 className="font-display text-3xl font-bold">{who}</h1>
          {sub && <p className="text-zinc-600">{sub}</p>}
          {view.updatedAt && <p className="mt-1 text-xs text-zinc-500">{t("share.lastUpdated", { date: fmtDate(view.updatedAt.slice(0, 10)) })}</p>}
        </div>
        <PrintButton />
      </header>

      <section aria-label={t("share.summary")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("share.statColleges")} value={String(s.colleges)} />
        <Stat label={t("share.statSubmitted")} value={String(s.submitted)} />
        <Stat label={t("share.statAdmitted")} value={String(s.admitted)} />
        <Stat label={t("share.statChecklist")} value={s.checklistTotal ? `${s.checklistDone}/${s.checklistTotal}` : "—"} />
        {view.recommenders && <Stat label={t("share.statRecs")} value={`${view.recommenders.submitted}/${view.recommenders.total}`} />}
        {view.scholarships && <Stat label={t("share.statScholarships")} value={`${view.scholarships.awarded}/${view.scholarships.submitted + view.scholarships.awarded}`} />}
      </section>

      <section aria-labelledby="deadlines-heading">
        <h2 id="deadlines-heading" className="mb-3 text-xl font-bold">{t("share.deadlines")}</h2>
        {deadlines.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("share.noDeadlines")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {deadlines.map((d, i) => (
              <li key={`${d.college}-${d.dueDate}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm break-inside-avoid">
                <span>
                  <span className="font-semibold">{d.college}</span>
                  <span className="text-zinc-500"> · {d.label || d.kind}</span>
                </span>
                <DeadlineChip date={d.dueDate} days={daysUntil(d.dueDate)} done={isDeadlineDone(d.kind, d.status)} doneLabel={t("share.submitted")} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="colleges-heading">
        <h2 id="colleges-heading" className="mb-3 text-xl font-bold">{t("share.colleges")}</h2>
        {view.colleges.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("share.noColleges")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">{t("share.colCollege")}</th>
                  <th scope="col" className="px-4 py-2 font-semibold">{t("share.colPlan")}</th>
                  <th scope="col" className="px-4 py-2 font-semibold">{t("share.colStatus")}</th>
                  <th scope="col" className="px-4 py-2 font-semibold">{t("share.colChecklist")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {view.colleges.map((c, i) => {
                  const p = progress(c.checklist);
                  return (
                    <tr key={`${c.name}-${i}`} className="break-inside-avoid">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2">{c.plan ?? "—"}</td>
                      <td className="px-4 py-2">
                        <StatusPill tone={STATUS_TONE[c.status]}>{t(PARENT_STATUS_KEY[c.status])}</StatusPill>
                      </td>
                      <td className="px-4 py-2">
                        {p.done}/{p.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        {t("share.footer")}
      </p>
    </div>
  );
}

// ── portfolio ──

const plainHeading = { fontFamily: "inherit", letterSpacing: "normal" };

export function PortfolioShareView({ token }: { token: string }) {
  const view = useShared(token, fetchPortfolioView);
  if (view === undefined) return <Loading />;
  if (view === null) return <ShareInactive />;
  return <PortfolioPage view={view} />;
}

const SECTION_KEY: Record<string, MessageKey> = {
  leadership: "share.section.leadership",
  service: "share.section.service",
  work: "share.section.work",
  programs: "share.section.programs",
  honors: "share.section.honors",
};

function PortfolioPage({ view }: { view: PortfolioView }) {
  const t = useT();
  const { header } = view;
  const resume = buildResume({ ...view.profile, activities: view.activities }, header, view.options);
  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto w-full max-w-[8.5in] rounded-lg border border-zinc-200 bg-white p-10 font-serif text-[13px] leading-snug text-zinc-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="text-center">
          <h1 className="text-2xl font-bold" style={{ ...plainHeading, letterSpacing: "0.025em" }}>
            {header.fullName || t("share.portfolioFallback")}
          </h1>
        </header>

        {(header.school || resume.education.lines.length > 0) && (
          <PortfolioSection title={t("share.education")}>
            <div className="flex justify-between gap-4">
              <span className="font-bold">{header.school}</span>
              {header.gradYear && <span className="shrink-0">{t("share.classOf", { year: header.gradYear })}</span>}
            </div>
            {resume.education.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </PortfolioSection>
        )}

        {resume.sections.map((s) => (
          <PortfolioSection key={s.key} title={SECTION_KEY[s.key] ? t(SECTION_KEY[s.key]) : s.title}>
            <ul className="space-y-2">
              {s.items.map((item, i) => (
                <li key={i} className="break-inside-avoid">
                  <div className="flex justify-between gap-4">
                    <span>
                      <span className="font-bold">{item.title}</span>
                      {item.organization && <span>, {item.organization}</span>}
                    </span>
                    {item.meta && <span className="shrink-0 text-right text-zinc-600">{item.meta}</span>}
                  </div>
                  {item.description && <p className="mt-0.5 text-zinc-800">{item.description}</p>}
                </li>
              ))}
            </ul>
          </PortfolioSection>
        ))}

        {resume.sections.length === 0 && <p className="mt-8 text-center font-sans text-sm text-zinc-500">{t("share.noActivities")}</p>}
      </article>
    </div>
  );
}

function PortfolioSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 style={{ ...plainHeading, letterSpacing: "0.15em" }} className="mb-2 border-b border-zinc-800 pb-0.5 text-xs font-bold uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
