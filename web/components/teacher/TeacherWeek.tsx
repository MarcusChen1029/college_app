"use client";

import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { FlagPills } from "@/components/TeacherFlags";
import { studentHref } from "@/components/TeacherRosterTable";
import { relativeText, statusText } from "@/components/TeacherText";
import { DayStamp } from "@/components/teacher/DayStamp";
import { useLocale, useT } from "@/lib/i18n/client";
import { teacherDeadlines, teacherRoster } from "@/lib/links-api";
import { relativeTime, statusLabel, statusTone } from "@/lib/roster-view";
import { buildWeek, WEEK_DAYS, type CheckIn, type WeekDay, type WeekItem } from "@/lib/roster-week";
import { useLoad } from "@/lib/use-load";

const LINK = "font-semibold text-blue-700 underline underline-offset-4";
const SHEET = "rounded-2xl border border-zinc-200 bg-white";

async function fetchWeek() {
  const now = new Date();
  const [roster, deadlines] = await Promise.all([teacherRoster(), teacherDeadlines(WEEK_DAYS)]);
  return { week: buildWeek(roster, deadlines, now), now };
}

/** "Fri, Oct 30 – Thu, Nov 5": the seven days the sheet covers. */
function weekRange(locale: string, now: Date): string {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + WEEK_DAYS - 1);
  const fmt = (d: Date) => d.toLocaleDateString(locale === "en" ? "en-US" : locale, { weekday: "short", month: "short", day: "numeric" });
  return `${fmt(now)} – ${fmt(end)}`;
}

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col-reverse justify-end px-4 py-3 sm:px-5">
      <dt className="mt-1.5 text-[13px] font-medium text-zinc-600">{label}</dt>
      <dd className="font-display text-[28px] leading-none font-bold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Item({ item }: { item: WeekItem }) {
  const t = useT();
  const d = item.deadline;
  const meta = [d.label, item.open === null ? null : item.open === 0 ? t("teacher.week.allDone") : t("teacher.week.open", { n: item.open, total: item.total ?? 0 })];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0">
        <Link href={studentHref(d.studentId)} className="font-semibold text-blue-700 underline-offset-4 hover:underline">
          {d.studentName}
        </Link>
        <p className="text-[15px] text-ink [overflow-wrap:anywhere]">{d.collegeName}</p>
        <p className="text-[13px] text-zinc-600">{meta.filter(Boolean).join(" · ")}</p>
      </div>
      <StatusPill tone={statusTone(d.status)}>{statusText(t, statusLabel(d.status))}</StatusPill>
    </li>
  );
}

function Day({ day }: { day: WeekDay }) {
  return (
    <li className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-4 px-4 py-4 sm:px-5">
      <DayStamp date={day.date} days={day.days} />
      <ul className="space-y-4">
        {day.items.map((item) => (
          <Item key={`${item.deadline.studentId}-${item.deadline.collegeSlug}-${item.deadline.kind}-${item.deadline.label}`} item={item} />
        ))}
      </ul>
    </li>
  );
}

function CheckInRow({ c, now }: { c: CheckIn; now: Date }) {
  const t = useT();
  const s = c.row.student;
  const n = s.colleges.length;
  const colleges = t(n === 1 ? "teacher.week.colleges.one" : "teacher.week.colleges.other", { n });
  return (
    <li className="space-y-1.5 px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={studentHref(s.studentId)} className="font-semibold text-blue-700 underline-offset-4 hover:underline">
          {s.displayName}
        </Link>
        <FlagPills flags={c.reasons} />
      </div>
      <p className="text-[13px] text-zinc-600">
        {colleges} · {s.lastActive ? t("teacher.week.lastChange", { when: relativeText(t, relativeTime(s.lastActive, now)).toLowerCase() }) : t("teacher.week.noChange")}
      </p>
    </li>
  );
}

/** The teacher home's one idea: who needs you this week (open deadlines in the next seven days, then the other flags). */
export function TeacherWeek() {
  const t = useT();
  const locale = useLocale();
  const { data, error, retry } = useLoad(fetchWeek);

  if (!data) {
    return error ? (
      <p role="alert" className="text-sm text-zinc-600">
        {t("teacher.attention.loadError")}{" "}
        <button type="button" className={LINK} onClick={retry}>
          {t("teacher.tryAgain")}
        </button>
      </p>
    ) : (
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-100" />
    );
  }

  const { week, now } = data;
  if (week.students === 0) {
    return (
      <p className="rounded-2xl bg-blue-50 px-6 py-8 text-center text-[15px] text-ink">
        {t("teacher.attention.nonePre")}
        <Link href="/teacher/classes" className={LINK}>
          {t("teacher.classes.title")}
        </Link>
        {t("teacher.attention.nonePost")}
      </p>
    );
  }

  const open = week.days.reduce((sum, d) => sum + d.items.length, 0);
  return (
    <div className="space-y-8">
      <dl className={`${SHEET} grid grid-cols-2 divide-zinc-200 *:border-zinc-200 max-sm:[&>*:nth-child(-n+2)]:border-b max-sm:[&>*:nth-child(even)]:border-l sm:grid-cols-4 sm:divide-x`}>
        <Tally value={open} label={t("teacher.week.tally.open")} />
        <Tally value={week.submitted} label={t("teacher.week.tally.submitted")} />
        <Tally value={week.checkIns.length} label={t("teacher.week.tally.checkIn")} />
        <Tally value={week.students} label={t("teacher.week.tally.students")} />
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <section aria-labelledby="week-due" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 id="week-due" className="font-display text-xl font-bold">
                {t("teacher.week.dueHeading")}
              </h2>
              <p className="text-[13px] text-zinc-600">{weekRange(locale, now)}</p>
            </div>
            <Link href="/teacher/deadlines" className={`text-sm ${LINK}`}>
              {t("teacher.week.allDeadlines")}
            </Link>
          </div>
          {week.days.length === 0 ? (
            <p className={`${SHEET} px-5 py-6 text-[15px] text-zinc-700`}>{t("teacher.week.noneDue")}</p>
          ) : (
            <ol className={`${SHEET} divide-y divide-zinc-200`}>
              {week.days.map((day) => (
                <Day key={day.date} day={day} />
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="week-check" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="week-check" className="font-display text-xl font-bold">
              {t("teacher.week.checkInHeading")}
            </h2>
            <Link href="/teacher/students" className={`text-sm ${LINK}`}>
              {t("teacher.attention.viewAll", { n: week.students })}
            </Link>
          </div>
          {week.checkIns.length === 0 ? (
            <p className={`${SHEET} px-5 py-6 text-[15px] text-zinc-700`}>{t("teacher.attention.nobody")}</p>
          ) : (
            <ul className={`${SHEET} divide-y divide-zinc-200`}>
              {week.checkIns.map((c) => (
                <CheckInRow key={c.row.student.studentId} c={c} now={now} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
