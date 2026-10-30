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
import { ChecklistPanel, SELECT, SELECT_BASE, usePlanLabel, useResultLabel } from "./ChecklistPanel";
import { CrunchCard } from "./CrunchCard";
import { GradCap } from "./Doodles";
import { EmptyState } from "./EmptyState";
import { LoginRow, sysText } from "./LoginRow";
import { useStarsSync } from "./useStarsSync";
import { DevicePasswordsNote, VaultUnlockedBar } from "./VaultDialogs";
import { Modal } from "./Modal";
import { SignInButton } from "./SignInDialog";
import { SchoolCodes } from "./SchoolCodes";
import { DeadlineChip, StatusPill } from "./StatusPill";
import { TeacherTasksForStudent } from "./TeacherTasksForStudent";

const noop = () => () => {};

/** In progress → Ready (checklist complete) → Submitted. Decisions are recorded on Results. */
function StatusCell({ entry, name, onSubmit }: { entry: ListEntry; name: string; onSubmit: (submitted: boolean) => void }) {
  const t = useT();
  const resultLabel = useResultLabel();
  if (hasDecision(entry.status)) {
    return (
      <Link href="/application/results" className="hover:underline">
        <StatusPill tone={resultTone(resultStatus(entry.status))}>{resultLabel(resultStatus(entry.status))}</StatusPill>
      </Link>
    );
  }
  const st = stage(entry.status, entry.checklist);
  return (
    <select
      className={`${SELECT_BASE} ${toneClass(stageTone(st))}`}
      value={st === "submitted" ? "submitted" : "working"}
      onChange={(e) => onSubmit(e.target.value === "submitted")}
      aria-label={t("application.statusFor", { name })}
      title={st === "in_progress" ? t("application.statusHint") : undefined}
    >
      <option value="working">{st === "ready" ? t("application.stage.ready") : t("application.stage.inProgress")}</option>
      <option value="submitted" disabled={st === "in_progress"}>
        {t("application.stage.submitted")}
      </option>
    </select>
  );
}

function ProgressBadge({ checklist }: { checklist: Checklist }) {
  const t = useT();
  const { done, total, missing } = progress(checklist);
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-xs">
      <span className="tabular-nums text-zinc-600">
        {done}/{total}
      </span>
      <StatusPill tone={missing === 0 ? "done" : "neutral"}>{missing === 0 ? t("application.progress.allDone") : t("application.progress.missing", { n: missing })}</StatusPill>
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
    <button className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:border-zinc-400 hover:bg-zinc-50" onClick={() => setAdding(true)}>
      {t("application.addCustom")}
    </button>
  );
  const banner = (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      {student.auth ? (
        <span className="text-zinc-500">
          {t("application.syncedTo")} <span className="font-medium text-zinc-700">{student.auth.email}</span>
          {student.syncing && t("application.syncing")}
        </span>
      ) : (
        <span className="text-zinc-500">
          {t("application.localOnly")}{" "}
          <SignInButton className="text-blue-700 underline">{t("account.signIn")}</SignInButton>{" "}
          {t("application.keepList")}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          <span className={`tabular-nums ${student.canAdd ? "" : "font-medium text-soon"}`}>
            {student.list.length}
            {student.plan.limit != null && ` / ${student.plan.limit}`}
            {t("application.collegesSuffix")}
          </span>{" "}
          · {pass ? t("payments.passFor", { year: pass.entry_year }) : t("application.planName", { name: planName })} ·{" "}
          <Link href="/pricing" className="text-blue-700 underline">
            {student.plan.key === "senior" ? t("application.plans") : t("application.upgrade")}
          </Link>
        </span>
        {addCustomButton}
        {listed.length > 0 && <SchoolCodes colleges={listed} codes={codes} />}
        <StudentAiContextButton colleges={colleges} deadlines={deadlines} plans={plans} englishTests={englishTests} />
      </span>
      {student.plan.limit != null && student.list.length > student.plan.limit && (
        <span className={`w-full rounded border px-2 py-1 text-xs ${toneClass("soon")}`}>
          {t("application.overLimit", { name: planName, limit: student.plan.limit })}{" "}
          <Link href="/pricing" className="font-semibold underline">
            {t("payments.getPass")}
          </Link>
        </span>
      )}
      {/* Colleges the sign-in merge kept in this browser for lack of room (shown while the plan still has a limit). */}
      {student.localLeftover > 0 && student.plan.limit != null && (
        <span className={`w-full rounded border px-2 py-1 text-xs ${toneClass("soon")}`}>
          {t("payments.mergeLeftover", { n: student.localLeftover })}{" "}
          <Link href="/pricing" className="font-semibold underline">
            {t("payments.getPass")}
          </Link>
        </span>
      )}
      {student.error && (
        <span className={`rounded border px-2 py-0.5 ${toneClass("urgent")}`}>
          {student.error}{" "}
          <button className="underline" onClick={student.clearError}>
            {t("application.dismiss")}
          </button>
        </span>
      )}
      {student.auth && <VaultUnlockedBar className="w-full" />}
      {student.auth && <DevicePasswordsNote className="w-full" />}
    </div>
  );

  const entries = student.list
    .map((e) => ({ entry: e, college: resolve(e) }))
    .filter((x): x is { entry: typeof x.entry; college: CollegeSummary } => !!x.college);
  const addDialog = adding && <AddCustomCollege onAdd={student.addCustom} onClose={() => setAdding(false)} />;

  if (entries.length === 0) {
    return (
      <div className="space-y-4">
      <TeacherTasksForStudent />
      {intro}
      <div>
      {banner}
      {addDialog}
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
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium hover:bg-zinc-100 disabled:cursor-default disabled:text-zinc-400 disabled:hover:bg-transparent"
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
      <StatusPill tone={done ? "done" : "neutral"}>{done ? t("application.group.done", { total }) : t("application.group.progress", { submitted, total })}</StatusPill>
    );
    const sys = SYSTEMS.find((s) => s.key === route);
    if (!sys) {
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1">
          <h3 className="font-semibold">{t("application.group.direct")}</h3>
          <span className="text-xs text-zinc-500">{t("application.group.directHint")}</span>
          <span className="ml-auto">{pill}</span>
        </div>
      );
    }
    return (
      <ul>
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
    <div className="space-y-4">
    <CrunchCard crunch={crunch} onOpen={setOpenSlug} onMarkSent={markAllSent} essayCounts={essayCounts} />
    <TeacherTasksForStudent />
    {intro}
    <div>
    {banner}
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
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>{t("application.allSent.label")}</span>
        {sentButton("transcript", t("application.allSent.transcript"))}
        {sentButton("recommendations", t("application.allSent.recs"))}
        {sentButton("test_scores", t("application.allSent.tests"))}
        {sentButton("english_test", t("application.allSent.english"))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-[13px] font-medium text-zinc-600">
            <tr>
              <th className="p-2">{t("application.col.college")}</th>
              <th className="p-2">{t("application.col.fit")}</th>
              <th className="p-2">{t("application.col.plan")}</th>
              <th className="p-2">{t("application.col.status")}</th>
              <th className="p-2">{t("application.col.checklist")}</th>
              <th className="w-8 p-2" />
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.route} className="border-t-2 border-zinc-200 first-of-type:border-t-0">
              <tr>
                <th scope="rowgroup" colSpan={6} className="bg-zinc-50/60 p-2 text-left font-normal">
                  {groupHeader(g.route, g.items.map((x) => x.entry.status))}
                </th>
              </tr>
              {g.items.map(({ entry, college }) => {
                const fit = fits.get(college.slug);
                return (
                  <tr
                    key={entry.slug}
                    className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a, select, input, button")) setOpenSlug(entry.slug);
                    }}
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <TierBadge tier={college.general_tier} size="sm" />
                        <div>
                          {collegeLink(college, college.short_name ?? college.name, "font-medium hover:underline")}
                          {entry.custom && (
                            <div className="text-[11px] text-zinc-500">{t("application.custom")}{place(college, entry) && ` · ${place(college, entry)}`}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2">{fit ? <FitBadge fit={fit.fit} result={fit} /> : <span className="text-xs text-zinc-400">—</span>}</td>
                    <td className="p-2">
                      <select
                        className={SELECT}
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
                    </td>
                    <td className="p-2">
                      <StatusCell
                        entry={entry}
                        name={college.name}
                        onSubmit={(submitted) => student.update(entry.slug, { status: submitted ? "submitted" : "in_progress" })}
                      />
                    </td>
                    <td className="p-2">
                      <ProgressBadge checklist={entry.checklist} />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        onClick={() => setOpenSlug(entry.slug)}
                        aria-haspopup="dialog"
                        aria-label={t("application.openChecklist", { name: college.name })}
                      >
                        ▸
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
        {hasScores && (
          <p className="border-t border-zinc-100 p-2 text-xs text-zinc-500">
            {t("application.balance", { superReach: counts.super_reach, reach: counts.reach, target: counts.target, safety: counts.safety })}
            {counts.safety === 0 && t("application.noSafety")}
          </p>
        )}
        {entries.filter(({ entry }) => entry.plan === "ED" || entry.plan === "ED2").length > 1 && (
          <p className="border-t border-zinc-100 p-2 text-xs text-urgent">
            {t("application.multiEd")}
          </p>
        )}
      </div>
      </div>

      <aside>
        <h2 className="mb-2 font-semibold">{t("application.upcomingDates")}</h2>
        {upcomingRows.length ? (
          <ol className="space-y-2 text-sm">
            {upcomingRows.map((row) => {
              if ("cd" in row) {
                const { cd } = row;
                return (
                  <li key={`crunch-${cd.date}`} className="rounded-md border border-zinc-200 p-2">
                    <div>
                      <DeadlineChip date={cd.date} days={cd.days} done={false} />
                    </div>
                    <a href="#crunch" className="hover:underline">
                      {cd.apps.length === 1 ? t("application.crunch.upcomingOne", { name: cd.apps[0].name }) : t("application.crunch.upcomingMany", { n: cd.apps.length })}
                    </a>
                  </li>
                );
              }
              const { d, college, entry } = row;
              const days = daysUntil(d.due_date!);
              return (
                <li key={d.id} className="rounded-md border border-zinc-200 p-2">
                  <div>
                    <DeadlineChip date={d.due_date!} days={days} done={isDeadlineDone(d.kind, entry.status)} />
                  </div>
                  <div>
                    {college.short_name ?? college.name} — {d.label ?? (plans.find((p) => p.key === d.plan_key) ? planLabel(d.plan_key, plans.find((p) => p.key === d.plan_key)!.label) : d.kind)}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">{t("application.noUpcoming")}</p>
        )}
      </aside>
    </div>
    </div>
    </div>
  );
}
