"use client";

// The parent view as the home page's stationery: a ticket with the student's name beside a campus on their list, then
// the season in plain words, the deadlines as a timetable and every college placed in its stage. Only what parent_view
// returns is shown. Rows are separated by tone, not rules; they rise in turn (globals.css .timetable-row, off when the
// visitor prefers reduced motion).

import { campusFor, Duo, PhotoCredits } from "@/components/share/campus";
import { bindShortWords, nameSize, reportDeadlines, revealDelay, stages, type StageKey } from "@/components/share/report-logic";
import { ShareFrame } from "@/components/share/ShareFrame";
import { StatusIcon, StatusPill } from "@/components/StatusPill";
import { CAMPUS, type CampusPhoto } from "@/lib/campus-photos";
import { isDeadlineDone } from "@/lib/application";
import { progress } from "@/lib/checklist";
import { daysUntil } from "@/lib/format";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { shortDate } from "@/lib/roster-view";
import { localToday } from "@/lib/share-api";
import { parentDeadlines, parentSummary, type ParentCollege, type ParentView } from "@/lib/share-links";
import type { Tone } from "@/lib/status";
import type { Status } from "@/lib/student-store";

const TONE_ROWS = "odd:bg-white even:bg-zinc-50";
const TILT = ["-rotate-2", "rotate-2", "-rotate-1", "rotate-3"];

const STAGE_TITLE: Record<StageKey, MessageKey> = {
  ready: "share.status.ready",
  working: "share.status.working",
  waiting: "share.status.waiting",
  decided: "share.report.decisions",
  withdrawn: "share.status.withdrawn",
};
const DECISION_KEY: Partial<Record<Status, MessageKey>> = {
  admitted: "share.status.admitted",
  enrolled: "share.status.enrolled",
  deferred: "share.status.deferred",
  waitlisted: "share.status.waitlisted",
  rejected: "share.status.rejected",
};
const DECISION_TONE: Partial<Record<Status, Tone>> = { admitted: "done", enrolled: "done", deferred: "soon", waitlisted: "soon", rejected: "neutral" };

function dueWords(t: TFunction, days: number): string {
  if (days < 0) return t("status.deadline.overdue");
  if (days === 0) return t("status.deadline.today");
  if (days === 1) return t("status.deadline.tomorrow");
  return t("status.deadline.days", { n: days });
}

/** Month and day in the reader's language, the year underneath only when it is not this year. */
function Day({ date }: { date: string }) {
  const locale = useLocale();
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const lang = locale === "en" ? "en-US" : locale;
  return (
    <>
      <span className="block whitespace-nowrap font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] sm:text-[28px]">
        {at.toLocaleDateString(lang, { month: "short", day: "numeric", timeZone: "UTC" })}
      </span>
      {y !== new Date().getFullYear() && <span className="block text-sm text-zinc-600">{at.toLocaleDateString(lang, { year: "numeric", timeZone: "UTC" })}</span>}
    </>
  );
}

function Fact({ label, children, style }: { label: string; children: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div className={`timetable-row grid gap-1 px-5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6 sm:px-8 ${TONE_ROWS}`} style={style}>
      <dt className="text-base text-zinc-600 sm:pt-1">{label}</dt>
      <dd className="text-xl font-medium text-ink [overflow-wrap:break-word]">{children}</dd>
    </div>
  );
}

function College({ c }: { c: ParentCollege }) {
  const t = useT();
  const p = progress(c.checklist);
  const decision = DECISION_KEY[c.status];
  return (
    <li className="flex items-start gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-ink [overflow-wrap:break-word]">{c.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-zinc-600">
          {c.plan && <span>{c.plan}</span>}
          {decision ? <StatusPill tone={DECISION_TONE[c.status] ?? "neutral"}>{t(decision)}</StatusPill> : p.total > 0 && <span>{t("share.checkDone", { done: p.done, total: p.total })}</span>}
        </p>
      </div>
    </li>
  );
}

export function ParentReport({ view, print }: { view: ParentView; print: React.ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const s = parentSummary(view);
  const { next, rows, more } = reportDeadlines(parentDeadlines(view, localToday()), 8);
  const who = view.student.name ?? t("share.yourStudent");
  const sub = [view.student.school, view.student.gradYear ? t("share.classOf", { year: view.student.gradYear }) : null].filter(Boolean).join(" · ");
  const groups = stages(view.colleges);
  const n = s.colleges;

  // The hero campus: the next-deadline college's photo, else the first list college the registry has; else none.
  const registryOrder = Object.values(CAMPUS) as CampusPhoto[];
  const listPhotos = view.colleges.map((c) => campusFor(c.name)).filter((p): p is CampusPhoto => p !== null);
  const hero = (next && campusFor(next.college)) || registryOrder.find((p) => listPhotos.includes(p)) || null;
  // One stamp per list college that has a campus photo, in stage order.
  const stampCards = groups.flatMap((g) => g.colleges.map((c) => ({ name: c.name, photo: campusFor(c.name) }))).filter((x, i, all): x is { name: string; photo: CampusPhoto } => x.photo !== null && all.findIndex((y) => y.photo === x.photo) === i);
  const credits = [...(hero ? [hero] : []), ...stampCards.map((x) => x.photo)];
  // Rows rise in turn, the whole run inside 600ms however long the page is.
  const total = 7 + rows.length + groups.length;
  const reveal = (i: number) => ({ animationDelay: revealDelay(i, total) }) as React.CSSProperties;

  let row = 0;
  return (
    <ShareFrame>
      <section className="relative isolate">
        {hero && (
          <figure className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-[46%]">
            <Duo photo={hero} priority sizes="(min-width: 1024px) 46vw, 100vw" className="share-pan h-56 sm:h-80 lg:h-full" />
          </figure>
        )}
        <div className={`ticket-in relative ${hero ? "-mt-12 lg:mt-0 lg:w-[62%] lg:py-12" : ""}`}>
          <div className="ticket-body @container bg-zinc-50 px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
            {/* Sized to fit its column in at most two lines; short words are bound so no line is a lone letter. */}
            <h1 className="font-display font-extrabold leading-[0.9] tracking-[-0.04em] [overflow-wrap:break-word]" style={{ fontSize: nameSize(who) }}>
              {bindShortWords(who)}
            </h1>
            {sub && <p className="mt-4 text-xl text-zinc-700">{sub}</p>}
          </div>
          <div className="ticket-stub flex flex-wrap items-center justify-between gap-4 bg-zinc-50 px-6 py-5 sm:px-10">
            <p className="text-base text-zinc-700">{view.updatedAt ? t("share.readOnlyUpdated", { date: shortDate(view.updatedAt, locale) }) : t("share.readOnly")}</p>
            {print}
          </div>
        </div>
      </section>

      <section aria-labelledby="report-heading" className="space-y-4">
        <h2 id="report-heading" className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
          {t("share.report.heading")}
        </h2>
        <dl className="overflow-hidden rounded-2xl">
          <Fact label={t("share.report.onList")} style={reveal(row++)}>
            {t(n === 1 ? "share.report.collegesN.one" : "share.report.collegesN.other", { n })}
          </Fact>
          <Fact label={t("share.report.sent")} style={reveal(row++)}>
            {t("share.report.ofTotal", { n: s.submitted, total: n })}
          </Fact>
          <Fact label={t("share.report.decisions")} style={reveal(row++)}>
            {s.decisions === 0 ? <span className="text-zinc-600">{t("share.report.noneYet")}</span> : t("share.report.decisionsValue", { admitted: s.admitted, decisions: s.decisions })}
          </Fact>
          <Fact label={t("share.report.next")} style={reveal(row++)}>
            {next ? (
              <>
                {shortDate(next.dueDate, locale)} <span className="text-zinc-600">({dueWords(t, daysUntil(next.dueDate))})</span> · {next.college}
              </>
            ) : (
              <span className="text-zinc-600">{t("share.report.noNext")}</span>
            )}
          </Fact>
          {s.checklistTotal > 0 && (
            <Fact label={t("share.report.checklist")} style={reveal(row++)}>
              {t("share.report.checklistValue", { done: s.checklistDone, total: s.checklistTotal })}
            </Fact>
          )}
          {view.recommenders && view.recommenders.total > 0 && (
            <Fact label={t("share.report.recs")} style={reveal(row++)}>
              {t("share.report.recsValue", { n: view.recommenders.submitted, total: view.recommenders.total })}
            </Fact>
          )}
          {view.scholarships && view.scholarships.total > 0 && (
            <Fact label={t("share.report.scholarships")} style={reveal(row++)}>
              {t("share.report.scholarshipsValue", { total: view.scholarships.total, waiting: view.scholarships.submitted, won: view.scholarships.awarded })}
            </Fact>
          )}
        </dl>
      </section>

      <section aria-labelledby="deadlines-heading" className="space-y-4">
        <h2 id="deadlines-heading" className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
          {t("share.deadlines")}
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white px-6 py-6 text-lg text-zinc-700">{t("share.noDeadlines")}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">{t("share.deadlines")}</caption>
              <tbody>
                {rows.map((d, i) => {
                  const done = isDeadlineDone(d.kind, d.status);
                  const days = daysUntil(d.dueDate);
                  const when = done ? (
                    <span className="inline-flex items-center gap-1.5 text-zinc-600">
                      <StatusIcon tone="done" />
                      {t("share.submitted")}
                    </span>
                  ) : (
                    <span className={days <= 7 ? "text-urgent" : ""}>{dueWords(t, days)}</span>
                  );
                  return (
                    <tr key={`${d.college}-${d.dueDate}-${i}`} className={`timetable-row ${TONE_ROWS}`} style={reveal(row++)}>
                      <td className="w-[7.5rem] py-4 pl-5 pr-3 align-top sm:w-[10rem] sm:pl-8">
                        <Day date={d.dueDate} />
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <span className={`block text-lg leading-snug [overflow-wrap:break-word] ${done ? "text-zinc-600" : "font-semibold text-ink"}`}>{d.college}</span>
                        <span className="block text-base text-zinc-600">{d.label || d.kind}</span>
                        <span className="mt-1 block text-base font-semibold sm:hidden">{when}</span>
                      </td>
                      <td className="hidden whitespace-nowrap py-4 pr-8 text-right align-top text-lg font-semibold sm:table-cell">{when}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {more > 0 && <p className="bg-zinc-50 px-5 py-3 text-base text-zinc-600 sm:px-8">{t("share.moreDeadlines", { n: more })}</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="stages-heading" className="space-y-4">
        <h2 id="stages-heading" className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
          {t("share.lanesHeading")}
        </h2>
        {stampCards.length > 0 && (
          <ul aria-label={t("share.campuses")} className="grid grid-cols-2 gap-x-6 gap-y-8 pb-2 sm:flex sm:flex-wrap sm:gap-8">
            {stampCards.map((x, i) => (
              <li key={x.photo.src} className="share-stamp sm:w-[150px]" style={{ animationDelay: revealDelay(i, stampCards.length) }}>
                <div className={`mx-auto w-[min(100%,150px)] ${TILT[i % TILT.length]}`}>
                  <Duo photo={x.photo} stamp sizes="150px" />
                </div>
                <p className="mt-3 text-base font-semibold leading-snug [overflow-wrap:break-word]">{x.name}</p>
              </li>
            ))}
          </ul>
        )}
        {view.colleges.length === 0 ? (
          <p className="rounded-2xl bg-white px-6 py-6 text-lg text-zinc-700">{t("share.noColleges")}</p>
        ) : (
          <dl className="overflow-hidden rounded-2xl">
            {groups.map((g) => (
              <div key={g.key} className={`timetable-row grid gap-3 px-5 py-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6 sm:px-8 ${TONE_ROWS}`} style={reveal(row++)}>
                <dt className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                  <span className="text-lg font-semibold text-ink">{t(STAGE_TITLE[g.key])}</span>
                  <span className="font-display text-[28px] font-extrabold leading-none tabular-nums">{g.colleges.length}</span>
                </dt>
                <dd>
                  {g.colleges.length === 0 ? (
                    <p className="pt-1 text-base text-zinc-600">—</p>
                  ) : (
                    <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                      {g.colleges.map((c, i) => (
                        <College key={`${c.name}-${i}`} c={c} />
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="space-y-2">
        <PhotoCredits photos={credits} label={t("share.photos")} className="max-w-[75ch]" />
        <p className="max-w-[75ch] text-base text-zinc-700">{t("share.footer")}</p>
      </div>
    </ShareFrame>
  );
}
