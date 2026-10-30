"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { daysUntil } from "@/lib/format";
import { markSent, onlyEnglishPlan, onlyTestPlan, progress, safeLink, type Checklist, type SentKind } from "@/lib/checklist";
import { hasDecision, isDeadlineDone, resultStatus, stage } from "@/lib/application";
import { collegeRoute } from "@/lib/application-systems-data";
import { buildCrunch } from "@/lib/crunch";
import { customDeadline, customSummary, isCustomSlug } from "@/lib/custom-college";
import { deadlineApplies } from "@/lib/deadline-rules";
import { useT } from "@/lib/i18n/client";
import { activeWindow, taipeiToday } from "@/lib/plans";
import { portalSlot } from "@/lib/portal-slots";
import { EMPTY_LOGIN, groupProgress, routeGroups, SYSTEMS, type Login, type PortalData } from "@/lib/portals";
import { registerColleges, useStudent, type ListEntry } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import { resultTone, stageTone } from "@/lib/status";
import { buttonClass, toneClass } from "@/lib/ui";
import type { CollegeSummary, Deadline, Lookups, ScoreCode } from "@/lib/types";
import { AddCustomCollege } from "./AddCustomCollege";
import { StudentAiContextButton } from "./AiContextButton";
import { FitBadge, TierBadge } from "./badges";
import { ChecklistPanel, usePlanLabel, useResultLabel } from "./ChecklistPanel";
import { CrunchCard } from "./CrunchCard";
import { GradCap } from "./Doodles";
import { EmptyState } from "./EmptyState";
import { LoginRow, sysText } from "./LoginRow";
import { BalanceBar, Chevron, FitChip, SentStrip, TimetableRow } from "./my-list/parts";
import { useStarsSync } from "./useStarsSync";
import { VaultUnlockedBar } from "./VaultDialogs";
import { Modal } from "./Modal";
import { SignInButton } from "./SignInDialog";
import { SchoolCodes } from "./SchoolCodes";
import { StatusIcon, StatusPill } from "./StatusPill";
import { TeacherTasksForStudent } from "./TeacherTasksForStudent";

const noop = () => () => {};

// My list is the student's application season as a stack of tickets (globals.css, "My list"): one ticket per application
// route, its stub carrying the route's shared login and how many are sent, one white line per college on its body. The
// "due soon" card is the season's own ticket on top, with the list's facts and tools on its stub, and the upcoming dates
// run beside the tickets as a printed timetable.

/** A row's plan control: a quiet 32px select, one control border a step darker than the row. */
const PLAN_SELECT =
  "h-8 w-full max-w-[13rem] cursor-pointer rounded-full border border-zinc-300 bg-white pl-3 pr-2 text-[13px] text-ink hover:border-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

/** In progress → Ready (checklist complete) → Submitted. Decisions are recorded on Results. */
function StatusCell({ entry, name, onSubmit }: { entry: ListEntry; name: string; onSubmit: (submitted: boolean) => void }) {
  const t = useT();
  const resultLabel = useResultLabel();
  if (hasDecision(entry.status)) {
    return (
      <Link href="/application/results" className="inline-flex rounded-full hover:underline">
        <StatusPill tone={resultTone(resultStatus(entry.status))}>{resultLabel(resultStatus(entry.status))}</StatusPill>
      </Link>
    );
  }
  const st = stage(entry.status, entry.checklist);
  // The chip is the control: its tone and icon say the stage, the chevron says it can change.
  return (
    <span
      className={`relative inline-flex h-8 flex-none items-center gap-1.5 rounded-full border pl-2.5 pr-2 text-[13px] font-semibold whitespace-nowrap focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-1 ${toneClass(stageTone(st))}`}
    >
      <StatusIcon tone={stageTone(st)} />
      <select
        className="cursor-pointer appearance-none bg-transparent pr-5 font-semibold focus:outline-none"
        value={st === "submitted" ? "submitted" : "working"}
        onChange={(e) => onSubmit(e.target.value === "submitted")}
        aria-label={t("application.statusFor", { name })}
        title={st === "in_progress" ? t("application.statusHint") : undefined}
      >
        {/* The stage's icon already says "ready", so the label drops its leading check mark. */}
        <option value="working">{st === "ready" ? t("application.stage.ready").replace("✓", "").trim() : t("application.stage.inProgress")}</option>
        <option value="submitted" disabled={st === "in_progress"}>
          {t("application.stage.submitted")}
        </option>
      </select>
      <Chevron dir="down" className="pointer-events-none absolute right-2 size-3.5" />
    </span>
  );
}

function ProgressBadge({ checklist }: { checklist: Checklist }) {
  const t = useT();
  const { done, total, missing } = progress(checklist);
  // One mark per checklist item, then the count and what is left: the meter fills in ink, and turns green when complete.
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-[13px]">
      <span aria-hidden className="flex gap-[3px]">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i < done ? (missing === 0 ? "bg-done" : "bg-ink") : "bg-zinc-300"}`} />
        ))}
      </span>
      <span className="tabular-nums text-zinc-600">
        {done}/{total}
      </span>
      {missing === 0 ? (
        <span className="inline-flex items-center gap-1 font-semibold text-done">
          <StatusIcon tone="done" />
          {t("application.progress.allDone")}
        </span>
      ) : (
        <span className="text-zinc-600">{t("application.progress.missing", { n: missing })}</span>
      )}
    </div>
  );
}

export function MyList({
  colleges,
  deadlines,
  plans,
  englishTests,
  codes,
  intro,
  essayCounts,
}: {
  colleges: CollegeSummary[];
  deadlines: Deadline[];
  plans: Lookups["plans"];
  englishTests: Lookups["englishTests"];
  codes: ScoreCode[];
  /** Explains the table; rendered just above it, below the "due soon" card and teacher tasks. */
  intro?: React.ReactNode;
  /** Essays each researched college asks of everyone, by slug (for the "due soon" card). */
  essayCounts?: Record<string, number>;
}) {
  const t = useT();
  const planLabel = usePlanLabel();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  useStarsSync(student);
  if (!mounted || !student.ready) return <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />;
  const international = !!student.profile.international;
  const planName = t(`payments.planName.${student.plan.key}`);
  const pass = activeWindow(student.planWindows, taipeiToday());

  // Custom colleges have no row in our data; build the same shape from what the student typed.
  const resolve = (e: ListEntry) => (e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((c) => c.slug === e.slug));
  const allDeadlines = [...deadlines, ...student.list.flatMap((e) => (e.custom ? [customDeadline(e.rowId ?? e.slug, e.custom)] : [])).filter((d): d is Deadline => !!d)];
  const listed = student.list.flatMap((e) => colleges.filter((c) => c.slug === e.slug));
  const addCustomButton = (
    <button className={buttonClass("ghost", "sm")} onClick={() => setAdding(true)}>
      {t("application.addCustom")}
    </button>
  );
  // Display only: how many of the listed applications are sent, over the same colleges the route tickets show (the ones
  // that resolve, as `entries` below), so the stub's total is the tickets' totals added up.
  const season = groupProgress(student.list.filter((e) => !!resolve(e)).map((e) => e.status));
  const banner = (
    <div className="flex flex-col gap-2 text-[15px] sm:gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:gap-y-3">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`tabular-nums ${student.canAdd ? "" : "font-semibold text-soon"}`}>
            <span className="font-display text-[28px] font-extrabold leading-none tracking-tight">
              {student.list.length}
              {student.plan.limit != null && ` / ${student.plan.limit}`}
            </span>
            {t("application.collegesSuffix")}
          </span>
          <span className="text-zinc-600">
            · {pass ? t("payments.passFor", { year: pass.entry_year }) : t("application.planName", { name: planName })} ·
          </span>
          <Link href="/pricing" className="font-semibold text-blue-700 underline-offset-4 hover:underline">
            {student.plan.key === "senior" ? t("application.plans") : t("application.upgrade")}
          </Link>
        </p>
        {season.total > 0 && (
          <p className="flex items-center gap-3 text-zinc-700">
            <SentStrip sent={season.submitted} total={season.total} className="w-32" />
            <span className="tabular-nums">{t("application.group.progress", { submitted: season.submitted, total: season.total })}</span>
          </p>
        )}
        <span className="ml-tools flex flex-wrap items-center gap-2 xl:ml-auto">
          {addCustomButton}
          {listed.length > 0 && <SchoolCodes colleges={listed} codes={codes} />}
          {/* The ticket stub names its tools in words: no sparkle glyph on this one. */}
          <StudentAiContextButton colleges={colleges} deadlines={deadlines} plans={plans} englishTests={englishTests} label={t("application.list.aiButton")} />
        </span>
      </div>
      {student.auth ? (
        // Signed in, the sync line is a reassurance a phone can do without (the account menu names the account); the
        // signed-out line below stays everywhere.
        <p className="text-sm text-zinc-600 max-sm:hidden">
          {t("application.syncedTo")} <span className="font-semibold text-ink">{student.auth.email}</span>
          {student.syncing && t("application.syncing")}
        </p>
      ) : (
        <p className="text-sm text-zinc-600">
          {t("application.localOnly")}{" "}
          <SignInButton className="font-semibold text-blue-700 underline underline-offset-4">{t("account.signIn")}</SignInButton>{" "}
          {t("application.keepList")}
        </p>
      )}
      {student.plan.limit != null && student.list.length > student.plan.limit && (
        <p className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${toneClass("soon")}`}>
          <StatusIcon tone="soon" />
          <span>
            {t("application.overLimit", { name: planName, limit: student.plan.limit })}{" "}
            <Link href="/pricing" className="font-semibold underline underline-offset-4">
              {t("payments.getPass")}
            </Link>
          </span>
        </p>
      )}
      {/* Colleges the sign-in merge kept in this browser for lack of room (shown while the plan still has a limit). */}
      {student.localLeftover > 0 && student.plan.limit != null && (
        <p className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${toneClass("soon")}`}>
          <StatusIcon tone="soon" />
          <span>
            {t("payments.mergeLeftover", { n: student.localLeftover })}{" "}
            <Link href="/pricing" className="font-semibold underline underline-offset-4">
              {t("payments.getPass")}
            </Link>
          </span>
        </p>
      )}
      {student.error && (
        <p className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${toneClass("urgent")}`}>
          <StatusIcon tone="urgent" />
          <span>
            {student.error}{" "}
            <button className="font-semibold underline underline-offset-4" onClick={student.clearError}>
              {t("application.dismiss")}
            </button>
          </span>
        </p>
      )}
      {student.auth && <VaultUnlockedBar className="w-full" />}
    </div>
  );

  const entries = student.list
    .map((e) => ({ entry: e, college: resolve(e) }))
    .filter((x): x is { entry: typeof x.entry; college: CollegeSummary } => !!x.college);
  const addDialog = adding && <AddCustomCollege onAdd={student.addCustom} onClose={() => setAdding(false)} />;

  if (entries.length === 0) {
    return (
      <div data-my-list className="space-y-6">
      <TeacherTasksForStudent />
      {intro}
      {addDialog}
      {/* An empty season is still one ticket: what to do first on its body, the list's facts and tools on its stub. */}
      <div className="ml-now ml-empty">
      <div className="ml-now-body">
      <EmptyState
        art={<GradCap className="h-16 w-auto" />}
        title={t("application.emptyTitle")}
        actions={
          <>
            <Link href="/colleges" className={buttonClass("primary")}>
              {t("home.browse")}
            </Link>
            <Link href="/tools/match" className={buttonClass("secondary")}>
              {t("match.card.cta")}
            </Link>
          </>
        }
      >
        {t("application.emptyBody")}
      </EmptyState>
      </div>
      <div className="ml-now-stub px-5 pb-5 pt-5 sm:px-10">{banner}</div>
      </div>
      </div>
    );
  }

  const hasScores = scoredTests(student.profile).length > 0;
  const fits = new Map(entries.map(({ college }) => [college.slug, hasScores ? computeFit(student.profile, college) : null]));
  const counts = { super_reach: 0, reach: 0, target: 0, safety: 0 };
  fits.forEach((f) => f && counts[f.fit]++);

  // The next week of application deadlines and what is still open for them (the card at the top).
  const crunch = buildCrunch(
    entries.map(({ entry, college }) => ({
      slug: entry.slug,
      name: college.short_name ?? college.name,
      collegeId: college.id,
      plan: entry.plan,
      status: entry.status,
      checklist: entry.checklist,
    })),
    allDeadlines,
  );
  const inCrunch = new Set(crunch.kind === "crunch" ? crunch.apps.map((a) => a.deadlineId) : []);

  // Upcoming dates for listed colleges. If a plan is chosen, show only that plan's application deadline; no FAFSA-only
  // dates for international students. Application deadlines the card above covers collapse into one line per day.
  const upcoming = entries
    .flatMap(({ entry, college }) =>
      allDeadlines
        .filter((d) => d.institution_id === college.id && d.due_date && daysUntil(d.due_date) >= 0 && !inCrunch.has(d.id))
        .filter((d) => deadlineApplies(d, { plan: entry.plan, international }))
        .map((d) => ({ d, college, entry })),
    )
    .sort((a, b) => a.d.due_date!.localeCompare(b.d.due_date!));
  const upcomingRows = [...(crunch.kind === "crunch" ? crunch.dates.map((cd) => ({ date: cd.date, cd })) : []), ...upcoming.map((u) => ({ date: u.d.due_date!, ...u }))].sort(
    (a, b) => a.date.localeCompare(b.date) || Number("d" in a) - Number("d" in b),
  );

  // "Sent to all": tick scores sent on every listed college that takes them.
  const sentFallback = {
    transcript: null,
    recommendations: null,
    test_scores: onlyTestPlan(student.profile.sat, student.profile.act),
    english_test: onlyEnglishPlan(student.profile.tests?.english),
  };
  const sentConfirm = {
    transcript: "application.allSent.transcriptConfirm",
    recommendations: "application.allSent.recsConfirm",
    test_scores: "application.allSent.testsConfirm",
    english_test: "application.allSent.englishConfirm",
  } as const;
  const sentPatches = (kind: SentKind) =>
    entries.flatMap(({ entry }) => {
      const next = markSent(entry.checklist, kind, sentFallback[kind]);
      return next ? [{ slug: entry.slug, checklist: next }] : [];
    });
  const markAllSent = (kind: SentKind, only?: string[]) => {
    const patches = sentPatches(kind).filter((p) => !only || only.includes(p.slug));
    if (!patches.length || !window.confirm(t(sentConfirm[kind], { n: patches.length }))) return;
    for (const p of patches) student.update(p.slug, { checklist: p.checklist });
  };
  const sentButton = (kind: SentKind, label: string) => {
    const n = sentPatches(kind).length;
    return (
      <button
        className="inline-flex h-8 items-center rounded-full border border-zinc-300 bg-white px-3 text-[13px] font-semibold text-ink tabular-nums hover:border-ink disabled:cursor-default disabled:border-zinc-200 disabled:bg-transparent disabled:font-medium disabled:text-zinc-500 disabled:hover:border-zinc-200"
        disabled={n === 0}
        title={n === 0 ? t("application.allSent.nothing") : undefined}
        onClick={() => markAllSent(kind)}
      >
        {label}
        {n > 0 && ` (${n})`}
      </button>
    );
  };

  const opened = entries.find(({ entry }) => entry.slug === openSlug);
  // A custom college doesn't say which plans it offers, so let the student pick any.
  const planOptions = (c: CollegeSummary) => (isCustomSlug(c.slug) ? plans : plans.filter((p) => (c.plans ?? []).includes(p.key)));
  const collegeLink = (c: CollegeSummary, text: string, className: string) =>
    isCustomSlug(c.slug) ? (
      <button className={`${className} text-left`} onClick={() => setOpenSlug(c.slug)}>
        {text}
      </button>
    ) : (
      <Link href={`/colleges/${c.slug}`} className={className}>
        {text}
      </Link>
    );
  const place = (c: CollegeSummary, e: ListEntry) => [c.city, c.state_region, e.custom?.country].filter(Boolean).join(", ");

  // One group per application route (Common App, UC, ..., Direct); the shared login for a route sits on its group header.
  const groups = routeGroups(
    entries.map((x) => ({ ...x, slug: x.entry.slug, custom: !!x.entry.custom })),
    collegeRoute,
  );
  const portalData: PortalData = student.profile.portals ?? {};
  const saveRouteLogin = (route: string, login: Login) => student.updateProfile({ portals: { ...portalData, systems: { ...portalData.systems, [route]: login } } });
  const groupHeader = (route: string, statuses: ListEntry["status"][]) => {
    const { submitted, total, done } = groupProgress(statuses);
    const pill = (
      <span className="flex items-center gap-3">
        <SentStrip sent={submitted} total={total} className="hidden w-20 sm:flex" />
        <StatusPill tone={done ? "done" : "neutral"}>{done ? t("application.group.done", { total }) : t("application.group.progress", { submitted, total })}</StatusPill>
      </span>
    );
    const sys = SYSTEMS.find((s) => s.key === route);
    if (!sys) {
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
          <h3 className="font-display text-xl font-bold leading-tight text-ink">{t("application.group.direct")}</h3>
          <span className="min-w-0 flex-1 basis-48 text-[13px] text-zinc-600">{t("application.group.directHint")}</span>
          {pill}
        </div>
      );
    }
    return (
      <ul className="ml-login">
        <LoginRow
          name={sysText(t, "name", sys.key, sys.name)}
          hint={sysText(t, "hint", sys.key, sys.hint)}
          official={sys.url}
          login={portalData.systems?.[sys.key] ?? EMPTY_LOGIN}
          slot={portalSlot("system", sys.key)}
          signedIn={!!student.auth}
          onSave={(l) => saveRouteLogin(sys.key, l)}
          status={pill}
        />
      </ul>
    );
  };

  return (
    <div data-my-list className="grid gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_17rem]">
    <div className="min-w-0 space-y-6 sm:space-y-8">
    {/* The season's own ticket: what is due soon on its body, the list's facts and tools on its stub. On a phone the card
        is compact (its heading, the soonest date and a switch that opens the rest in place) and the spacing tightens, so
        the first college is on screen one; from 640px it shows in full. */}
    <div className="ml-now">
      <div className="ml-now-body px-5 pb-4 pt-4 sm:px-8 sm:pb-7 sm:pt-7">
        <CrunchCard crunch={crunch} onOpen={setOpenSlug} onMarkSent={markAllSent} essayCounts={essayCounts} compact />
      </div>
      <div className="ml-now-stub px-5 pb-4 pt-4 sm:px-8 sm:pb-5 sm:pt-5">{banner}</div>
    </div>
    <TeacherTasksForStudent />
    <div className="space-y-5">
    <div className="ml-intro">{intro}</div>
    {addDialog}
    {opened && (
      <Modal
        key={opened.entry.slug}
        onClose={() => setOpenSlug(null)}
        title={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TierBadge tier={opened.college.general_tier} size="sm" />
            {isCustomSlug(opened.college.slug) ? (
              <span className="text-lg font-semibold">{opened.college.name}</span>
            ) : (
              <Link href={`/colleges/${opened.college.slug}`} className="text-lg font-semibold hover:underline">
                {opened.college.name}
              </Link>
            )}
            {opened.entry.custom?.website && safeLink(opened.entry.custom.website) && (
              <a href={safeLink(opened.entry.custom.website)!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline">
                {t("application.website")}
              </a>
            )}
            {fits.get(opened.college.slug) && <FitBadge fit={fits.get(opened.college.slug)!.fit} result={fits.get(opened.college.slug)!} />}
            <ProgressBadge checklist={opened.entry.checklist} />
          </div>
        }
      >
        <ChecklistPanel
          key={student.auth?.userId ?? "local"}
          entry={opened.entry}
          college={opened.college}
          international={!!student.profile.international}
          onChange={(patch) => student.update(opened.entry.slug, patch)}
          onRemove={() => {
            setOpenSlug(null);
            student.remove(opened.entry.slug);
          }}
        />
      </Modal>
    )}
    {entries.filter(({ entry }) => entry.plan === "ED" || entry.plan === "ED2").length > 1 && (
      <p className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${toneClass("urgent")}`}>
        <StatusIcon tone="urgent" />
        {t("application.multiEd")}
      </p>
    )}
    </div>

    {/* One ticket per application route, in the order students meet them. The column heads sit once above the stack. */}
    <div className="space-y-5">
      <div aria-hidden className="ml-cols hidden gap-x-3 px-5 text-[13px] text-zinc-600 xl:grid">
        <span>{t("application.col.college")}</span>
        <span>{t("application.col.fit")}</span>
        <span>{t("application.col.plan")}</span>
        <span>{t("application.col.status")}</span>
        <span>{t("application.col.checklist")}</span>
        <span />
      </div>
      {groups.map((g) => (
        <div key={g.route} className="ml-ticket">
          <div className="ml-stub px-2 py-1">{groupHeader(g.route, g.items.map((x) => x.entry.status))}</div>
          <ul className="ml-body space-y-1.5 px-2 pb-2 pt-4">
            {g.items.map(({ entry, college }) => {
              const fit = fits.get(college.slug);
              return (
                <li
                  key={entry.slug}
                  className="ml-row cursor-pointer items-center gap-x-3 gap-y-2.5 rounded-2xl bg-white px-3 py-2.5 hover:outline hover:outline-1 hover:outline-zinc-300"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("a, select, input, button")) setOpenSlug(entry.slug);
                  }}
                >
                  <div className="ml-name flex min-w-0 items-center gap-2.5">
                    <TierBadge tier={college.general_tier} size="sm" />
                    <div className="min-w-0">
                      {collegeLink(college, college.short_name ?? college.name, "text-[15px] font-semibold leading-snug text-ink hover:underline")}
                      {entry.custom && (
                        <div className="text-[13px] text-zinc-600">{t("application.custom")}{place(college, entry) && ` · ${place(college, entry)}`}</div>
                      )}
                    </div>
                  </div>
                  <div className="ml-meta">
                    <div className="ml-fit">{fit ? <FitChip fit={fit.fit} result={fit} /> : <span className="text-[13px] text-zinc-500">—</span>}</div>
                    <div className="ml-plan">
                      <select
                        className={PLAN_SELECT}
                        value={entry.plan ?? ""}
                        onChange={(e) => student.update(entry.slug, { plan: e.target.value || null })}
                        aria-label={t("application.planFor", { name: college.name })}
                      >
                        <option value="">{t("application.undecided")}</option>
                        {planOptions(college).map((p) => (
                          <option key={p.key} value={p.key}>
                            {planLabel(p.key, p.label)}
                            {p.binding ? t("application.binding") : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ml-status">
                      <StatusCell
                        entry={entry}
                        name={college.name}
                        onSubmit={(submitted) => student.update(entry.slug, { status: submitted ? "submitted" : "in_progress" })}
                      />
                    </div>
                    <div className="ml-check">
                      <ProgressBadge checklist={entry.checklist} />
                    </div>
                  </div>
                  <div className="ml-open flex justify-end">
                    <button
                      className="grid size-8 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-ink"
                      onClick={() => setOpenSlug(entry.slug)}
                      aria-haspopup="dialog"
                      aria-label={t("application.openChecklist", { name: college.name })}
                    >
                      <Chevron />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
    </div>

    {/* The season as a printed timetable (the date large, the days left under it, then the college and its plan), then the
        list's balance and the tools that tick an item on every college. Beside the tickets it stays in view while they
        scroll, and scrolls on its own when it is taller than the screen, so the right column is never empty ground. */}
    <aside className="min-w-0 space-y-10 xl:sticky xl:top-24 xl:-ml-1 xl:max-h-[calc(100svh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pb-2 xl:pl-1 xl:pr-3 xl:[scrollbar-width:thin]">
      <section>
      <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink">{t("application.upcomingDates")}</h2>
      {upcomingRows.length ? (
        <ol className="mt-4 border-t-[3px] border-ink">
          {upcomingRows.map((row) => {
            if ("cd" in row) {
              const { cd } = row;
              return (
                <TimetableRow
                  key={`crunch-${cd.date}`}
                  date={cd.date}
                  days={cd.days}
                  done={false}
                  title={
                    <a href="#crunch" className="underline-offset-4 hover:underline">
                      {cd.apps.length === 1 ? t("application.crunch.upcomingOne", { name: cd.apps[0].name }) : t("application.crunch.upcomingMany", { n: cd.apps.length })}
                    </a>
                  }
                />
              );
            }
            const { d, college, entry } = row;
            const days = daysUntil(d.due_date!);
            return (
              <TimetableRow
                key={d.id}
                date={d.due_date!}
                days={days}
                done={isDeadlineDone(d.kind, entry.status)}
                title={college.short_name ?? college.name}
                sub={d.label ?? (plans.find((p) => p.key === d.plan_key) ? planLabel(d.plan_key, plans.find((p) => p.key === d.plan_key)!.label) : d.kind)}
              />
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-[15px] text-zinc-600">{t("application.noUpcoming")}</p>
      )}
      </section>
      {hasScores && (
        <section className="space-y-3">
          <BalanceBar counts={counts} />
          <p className="text-[15px] leading-relaxed text-ink">
            {t("application.balance", { superReach: counts.super_reach, reach: counts.reach, target: counts.target, safety: counts.safety })}
            {counts.safety === 0 && t("application.noSafety")}
          </p>
        </section>
      )}
      <section className="space-y-3">
        <p className="text-[15px] font-semibold text-ink">{t("application.allSent.label")}</p>
        <div className="flex flex-wrap items-start gap-2 xl:flex-col">
          {sentButton("transcript", t("application.allSent.transcript"))}
          {sentButton("recommendations", t("application.allSent.recs"))}
          {sentButton("test_scores", t("application.allSent.tests"))}
          {sentButton("english_test", t("application.allSent.english"))}
        </div>
      </section>
    </aside>
    </div>
  );
}
