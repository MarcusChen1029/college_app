"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { StudentProfile } from "@/lib/fit";
import { fmtInt } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { testCardView } from "@/lib/i18n/test-plan-text";
import { cleanRegions, REGIONS, type RegionCode } from "@/lib/regions";
import { ENGLISH_TEST_KEYS, ENGLISH_TESTS } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import { scoredTests, type AdmissionTest } from "@/lib/test-plan";
import { regionName } from "./ProfileCards";
import { testLabel } from "./TestScoresForm";
import { EnglishFields, GpaFields, HINT, TestFields } from "./start/StartFields";
import { StartGoogle } from "./start/StartGoogle";
import { SheetLine, StartSheet, type AddNote } from "./start/StartSheet";
import { buildPreview, pickFor, type Slot, type StartCollege } from "./start/start-preview";

// The onboarding every "Build my list" button leads to. A ticket being filled in (the home page's stationery,
// .ticket-body / .ticket-stub in globals.css) with its title and one question per step, and beside it a sheet that
// sorts the real colleges by the student's answers (start/StartSheet.tsx). Finishing adds the starter colleges they kept.

const noop = () => () => {};
const NONE: StartCollege[] = [];

const STEPS = ["profile.start.step0", "profile.start.step1", "profile.start.step2", "profile.start.step3"] as const;
const QUESTIONS = ["profile.start.fromTitle", "profile.start.regionsTitle", "profile.start.statsTitle", "profile.start.readyTitle"] as const;
const LAST = STEPS.length - 1;

/** When the plan has less room than the student kept, a safety goes in first, then a target, then the reach: with
 *  little room, a list should first hold a college they are likely to get into. */
const ROOM_ORDER: Slot[] = ["safety", "target", "reach"];

// One row. The ticket keeps its own height; the sheet keeps its natural height and stays in view (sticky) while a
// long step scrolls, so neither is stretched over empty paper.
const GRID = "grid gap-x-10 gap-y-8 lg:grid-cols-12 lg:items-start";
const BIG_HINT = "mt-3 max-w-[54ch] text-lg leading-snug text-zinc-600";
const BIG_BUTTON =
  "inline-flex h-14 shrink-0 items-center justify-center rounded-full bg-ink px-8 text-base font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-ink disabled:active:scale-100";
// Tiles keep a 112px target on wider screens; on a phone they hug their text. The description sits under the title.
const TILE =
  "flex w-full flex-col rounded-2xl p-4 text-left transition-[background-color,color,transform] duration-200 active:scale-[0.99] sm:min-h-28 sm:p-5";
const ON = "bg-ink text-white";
const OFF = "bg-blue-50 text-ink hover:bg-blue-100";
const FOCUS_WITHIN = "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-400";
const LINK = "font-semibold text-blue-700 underline underline-offset-4 hover:text-ink";

/** The score editors save on blur, so the field being edited is committed before a step changes. */
function commitFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
}

/** Back from Google sign-in, the wizard reopens on its last step (`/start?step=ready`). */
const startsReady = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("step") === "ready";

/** The round mark on a choice: an empty ring, or a filled tick once chosen. */
function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-200 ${on ? "bg-white text-ink" : "ring-2 ring-inset ring-ink/25"}`}>
      {on && (
        <svg viewBox="0 0 16 16" className="size-4">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** The ticket's title, printed at its head like the home page's. */
function StartTitle() {
  const t = useT();
  return (
    <header className="mb-8 sm:mb-10">
      <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.03em] sm:text-[32px]">{t("profile.start.title")}</h1>
      <p className="mt-2 max-w-[52ch] text-lg leading-snug">{t("profile.start.subtitle")}</p>
    </header>
  );
}

const BODY = "ticket-body bg-white px-5 pb-10 pt-6 sm:px-10 sm:pb-12 sm:pt-10";

/** The page's shape while the colleges and the student's saved answers load: the ticket with its title, the sheet. */
export function StartSkeleton() {
  return (
    <div className={GRID}>
      <div className={`${BODY} lg:col-span-7`}>
        <StartTitle />
        <div aria-hidden className="h-[360px] animate-pulse rounded-2xl bg-blue-50" />
      </div>
      <div aria-hidden className="hidden h-[760px] animate-pulse bg-white/70 lg:col-span-5 lg:block" />
    </div>
  );
}

export function StartWizard({ pool, regionCounts, total }: { pool: StartCollege[]; regionCounts: Record<RegionCode, number>; total: number }) {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // The server renders the skeleton (not mounted yet), so reading the URL here cannot cause a hydration mismatch.
  const [step, setStep] = useState(() => (startsReady() ? LAST : 0));
  const [reached, setReached] = useState(() => (startsReady() ? LAST : 0));
  const [international, setInternational] = useState<boolean | null>(null);
  // A SAT or ACT still being typed (saved when the box is left); the sheet already counts it.
  const [draft, setDraft] = useState<Partial<Record<AdmissionTest, number | null>>>({});
  const [turns, setTurns] = useState<Record<Slot, number>>({ reach: 0, target: 0, safety: 0 });
  const [dropped, setDropped] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // After Next or Back, the new question is where keyboard and screen-reader focus lands.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  if (!mounted || !student.ready) return <StartSkeleton />;

  const { profile } = student;
  // Redoing setup starts from what is already saved.
  const from = international ?? profile.international ?? null;
  const regions = cleanRegions(profile.targetRegions);
  const usPool = regions.length === 0 || regions.includes("US") ? pool : NONE;

  // What the sheet sorts by: the saved profile, the place just chosen, and a score still being typed.
  const seen: StudentProfile = { ...profile, international: from ?? false };
  for (const k of ["sat", "act"] as const) if (draft[k] !== undefined) seen[k] = draft[k];
  const preview = buildPreview(usPool, seen);
  const picks = pickFor(preview, turns);
  const score = scoredTests(seen)
    .map((k) => `${k.toUpperCase()} ${k === "sat" ? seen.sat : seen.act}`)
    .join(" / ");

  // The starter colleges finishing adds: ticked, not already listed, and only as many as the plan has room for, taken
  // in ROOM_ORDER. A kept pick with no room is shown unticked, so what is ticked is exactly what gets added.
  const kept = picks.filter((p) => !student.has(p.college.slug) && !dropped.includes(p.college.slug));
  const limit = student.plan.limit;
  const room = limit == null ? kept.length : Math.max(0, limit - student.list.length);
  const toAdd = [...kept].sort((a, b) => ROOM_ORDER.indexOf(a.slot) - ROOM_ORDER.indexOf(b.slot)).slice(0, room);
  const adding = toAdd.map((p) => p.college.slug);
  const noRoom = kept.filter((p) => !adding.includes(p.college.slug)).map((p) => p.college.slug);
  const note: AddNote | null =
    picks.length === 0
      ? null
      : toAdd.length > 0
        ? "some"
        : picks.every((p) => student.has(p.college.slug))
          ? "listed"
          : noRoom.length > 0
            ? "full"
            : "unticked";

  const englishKey = ENGLISH_TEST_KEYS.find((k) => profile.tests?.english?.[k]?.total != null);
  const english = englishKey ? profile.tests!.english![englishKey]! : null;
  const test = testCardView(t, locale, profile);

  const go = (to: number) => {
    commitFocus();
    moved.current = true;
    setStep(to);
    setReached((r) => Math.max(r, to));
  };
  const finish = () => {
    commitFocus();
    for (const p of toAdd) student.add({ slug: p.college.slug, id: p.college.id });
    router.push(toAdd.length > 0 || student.list.length > 0 ? "/application/list" : "/colleges");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 0) {
      if (from == null) return;
      student.updateProfile({ international: from });
    }
    if (step < LAST) go(step + 1);
    else finish();
  };
  const choose = (v: boolean) => {
    setInternational(v);
    student.updateProfile({ international: v });
  };
  const saveRegions = (next: RegionCode[]) => student.updateProfile({ targetRegions: cleanRegions(next) });
  const toggleRegion = (code: RegionCode) => saveRegions(regions.includes(code) ? regions.filter((c) => c !== code) : [...regions, code]);
  const onDraft = (k: AdmissionTest, n: number | null | undefined) =>
    setDraft((d) => {
      const next = { ...d };
      if (n === undefined) delete next[k];
      else next[k] = n;
      return next;
    });

  const finishLabel =
    toAdd.length > 1
      ? t("profile.start.finishMany", { n: toAdd.length })
      : toAdd.length === 1
        ? t("profile.start.finishOne")
        : student.list.length > 0
          ? t("profile.start.finishOpen")
          : t("profile.start.seeColleges");

  const summary = [
    { label: t("profile.start.applyingFrom"), value: from == null ? "—" : from ? t("profile.start.valAbroad") : t("profile.start.valUS"), to: 0 },
    { label: t("profile.start.regions"), value: regions.length ? regions.map((c) => regionName(t, c)).join(", ") : t("profile.start.valAll"), to: 1 },
    { label: "GPA", value: profile.gpa ?? "—", sub: profile.gpaWeighted != null ? t("profile.gpaWeightedShort", { gpa: profile.gpaWeighted }) : "", to: 2 },
    { label: test.label, value: test.value ?? "—", sub: test.sub, to: 2 },
    { label: englishKey ? testLabel(t, englishKey, ENGLISH_TESTS[englishKey].label) : t("profile.englishTest"), value: english?.total ?? "—", to: 2 },
  ];

  return (
    <div className={GRID}>
      <form onSubmit={submit} noValidate aria-labelledby="start-q" className="min-w-0 lg:col-span-7">
        <div className={BODY}>
          <StartTitle />
          <ol aria-label={t("profile.start.progress")} className="grid grid-cols-4 gap-2 sm:gap-3">
            {STEPS.map((key, i) => {
              const now = i === step;
              const inner = (
                <>
                  <span aria-hidden className={`block h-1.5 rounded-full transition-colors duration-300 ${i <= step ? "bg-ink" : "bg-zinc-200"}`} />
                  <span
                    className={`mt-2 block text-[13px] leading-tight sm:text-[15px] ${now ? "font-bold text-ink" : i < step ? "font-semibold text-ink group-hover:underline" : "font-semibold text-zinc-600 group-hover:underline"}`}
                  >
                    {t(key)}
                  </span>
                </>
              );
              return (
                <li key={key} aria-current={now ? "step" : undefined}>
                  {i <= reached && !now ? (
                    <button type="button" onClick={() => go(i)} className="group block w-full py-2 text-left underline-offset-4">
                      {inner}
                    </button>
                  ) : (
                    <div className="py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>

          <h2
            id="start-q"
            ref={heading}
            tabIndex={-1}
            // Focus lands here only to announce the new question; the global :focus-visible ring is for controls.
            style={{ outline: "none" }}
            className="mt-6 font-display text-[clamp(2rem,3.2vw,2.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] sm:mt-8"
          >
            {t(QUESTIONS[step])}
          </h2>

          {step === 0 && (
            <div>
              <p className={BIG_HINT}>{t("profile.start.fromHint")}</p>
              <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2">
                {([false, true] as const).map((v) => {
                  const on = from === v;
                  return (
                    <button key={String(v)} type="button" aria-pressed={on} onClick={() => choose(v)} className={`${TILE} ${on ? ON : OFF}`}>
                      <span className="flex w-full items-start justify-between gap-3">
                        <span className="text-xl font-semibold leading-tight sm:text-[22px]">{t(v ? "profile.start.abroad" : "profile.start.inUS")}</span>
                        <Tick on={on} />
                      </span>
                      <span className={`mt-2 block text-[15px] leading-snug sm:text-base ${on ? "text-blue-100" : "text-zinc-600"}`}>
                        {t(v ? "profile.start.abroadHint" : "profile.start.inUSHint")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <p className={BIG_HINT}>{t("profile.start.regionsHint")}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6">
                {REGIONS.map((r) => {
                  const on = regions.includes(r.code);
                  return (
                    <label key={r.code} className={`${TILE} cursor-pointer sm:min-h-24 ${FOCUS_WITHIN} ${on ? ON : OFF}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleRegion(r.code)} />
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="text-lg font-semibold leading-tight sm:text-[22px]">{regionName(t, r.code)}</span>
                        <Tick on={on} />
                      </span>
                      <span className={`mt-2 block text-[15px] tabular-nums sm:text-base ${on ? "text-blue-100" : "text-zinc-600"}`}>
                        {t("profile.start.collegesN", { n: fmtInt(regionCounts[r.code]) })}
                      </span>
                    </label>
                  );
                })}
              </div>
              {regions.length > 1 && (
                <div role="group" aria-labelledby="start-opens" className="mt-6">
                  <p id="start-opens" className="text-[15px] font-semibold">
                    {t("profile.start.opensOn")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {regions.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={i === 0}
                        onClick={() => saveRegions([c, ...regions.filter((x) => x !== c)])}
                        className={`h-12 rounded-full px-5 text-base font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.97] ${i === 0 ? ON : OFF}`}
                      >
                        {regionName(t, c)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {regions.length === 0 && <p className={HINT}>{t("profile.regionsNone")}</p>}
            </div>
          )}

          {step === 2 && (
            <>
              <p className={BIG_HINT}>{t("profile.start.statsHint")}</p>
              <div className="mt-8 space-y-10">
                <GpaFields />
                <TestFields onDraft={onDraft} />
                <EnglishFields />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className={BIG_HINT}>{student.auth ? t("profile.start.savedAccount", { email: student.auth.email ?? "" }) : t("profile.start.savedBrowser")}</p>
              <dl className="mt-8 space-y-4 text-lg">
                {summary.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-3">
                    <dt className="flex min-w-0 flex-1 items-baseline gap-3">
                      <span className="shrink-0">{row.label}</span>
                      <span aria-hidden className="leader min-w-6 flex-1" />
                    </dt>
                    <dd className="flex shrink-0 items-baseline gap-4">
                      <span className="max-w-[16ch] text-right font-semibold tabular-nums sm:max-w-[24ch]">
                        {row.value}
                        {row.sub ? <span className="block text-[15px] font-normal text-zinc-600">{row.sub}</span> : null}
                      </span>
                      <button type="button" onClick={() => go(row.to)} aria-label={t("profile.start.changeLabel", { what: row.label })} className={`text-[15px] ${LINK}`}>
                        {t("profile.start.change")}
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
              {/* Signed-out students can't be emailed, so offer the account (reminders are on by default for new accounts).
                  Nothing is added before the sign-in: the visitor may already have an account whose list and plan differ,
                  so they come back to this step and add the starters there, checked against that account. */}
              {!student.auth && (
                <section aria-labelledby="start-remind" className="mt-10 bg-blue-50 p-5 sm:p-6">
                  <h3 id="start-remind" className="font-display text-[22px] font-bold tracking-[-0.02em]">
                    {t("profile.start.remindTitle")}
                  </h3>
                  <p className="mt-2 max-w-[60ch] text-base leading-relaxed">{t("profile.start.remindBody")}</p>
                  <div className="mt-4">
                    <StartGoogle returnTo="/start?step=ready" />
                  </div>
                </section>
              )}
              <p className="mt-6 text-base">
                <Link href="/colleges" className={LINK}>
                  {t("profile.start.browse", { n: fmtInt(total) })}
                </Link>
              </p>
            </>
          )}

        </div>

        {/* On phones and tablets the stub holds to the bottom of the screen while the form is in view: the one-line tally
            (a link down to the sheet below the form) over Back and Next, so every answer shows its effect at once. */}
        <div className="ticket-stub z-10 bg-white px-5 pb-4 pt-3 max-lg:sticky max-lg:bottom-0 sm:px-10 lg:py-5">
          <SheetLine preview={preview} pool={usPool.length} />
          <div className="flex items-center justify-between gap-4">
            {step > 0 ? (
              <button type="button" onClick={() => go(step - 1)} className="h-14 px-1 text-base font-semibold underline underline-offset-4 hover:text-blue-700">
                {t("common.back")}
              </button>
            ) : (
              <span />
            )}
            <button type="submit" disabled={step === 0 && from == null} className={BIG_BUTTON}>
              {step < LAST ? t("common.next") : finishLabel}
            </button>
          </div>
        </div>
      </form>

      <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-5">
        <StartSheet
          preview={preview}
          picks={picks}
          pool={usPool.length}
          international={!!seen.international}
          score={score}
          adding={adding}
          noRoom={noRoom}
          note={note}
          onToggle={(slug) => setDropped((d) => (d.includes(slug) ? d.filter((s) => s !== slug) : [...d, slug]))}
          onAnother={(slot) => setTurns((tn) => ({ ...tn, [slot]: tn[slot] + 1 }))}
          isListed={student.has}
          room={room}
          limit={limit}
        />
      </div>
    </div>
  );
}
