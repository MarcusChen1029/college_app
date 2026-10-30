"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { en } from "@/lib/i18n/en";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { INTEREST_CAREERS, ONET_VERSION } from "@/lib/interest-careers";
import {
  ANSWER_LABELS,
  QUESTIONS,
  RIASEC,
  STORAGE_KEY,
  TYPE_INFO,
  answeredCount,
  emptyAnswers,
  interestCode,
  matchCareers,
  onetUrl,
  parseStored,
  scoreAnswers,
  type Answers,
  type RiasecType,
} from "@/lib/interest-quiz";
import { buttonClass, LABEL, PANEL } from "@/lib/ui";
import { rankPrograms } from "./tools/programs";

// The quiz is a card: one statement at a time on a five-step scale (keys 1-5 answer it), a 30-step track, and beside it
// the student's interest code forming as they answer, with the O*NET careers that fit it so far. The items are our own
// (lib/interest-quiz.ts); the career data is O*NET (CC BY 4.0, lib/interest-careers.ts).

/** Chinese text for quiz data (items, types, careers) is keyed by id; anything without an entry shows its English text. */
function tr(t: TFunction, key: string, fallback: string): string {
  return key in en ? t(key as MessageKey) : fallback;
}
const typeName = (t: TFunction, c: RiasecType) => tr(t, `quiz.type.${c}.name`, TYPE_INFO[c].name);

// Tiny localStorage-backed store; every access is wrapped because storage can be blocked or empty.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeRaw(value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage unavailable: the quiz still works for this visit */
  }
  listeners.forEach((l) => l());
}

export default function InterestQuiz() {
  const t = useT();
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  // If storage is blocked we keep answers in memory so the quiz still works.
  const [memory, setMemory] = useState<Answers | null>(null);
  const answers: Answers = useMemo(() => parseStored(raw) ?? memory ?? emptyAnswers(), [raw, memory]);
  const [pos, setPos] = useState<number | null>(null);

  const total = QUESTIONS.length;
  const firstOpen = answers.findIndex((a) => a === null);
  const current = pos ?? (firstOpen === -1 ? total : firstOpen);
  const done = current >= total;
  const answered = answeredCount(answers);

  function answer(value: number) {
    const next = answers.slice();
    next[current] = value;
    setMemory(next);
    writeRaw(JSON.stringify(next));
    setPos(Math.min(current + 1, total));
  }

  function retake() {
    setMemory(null);
    writeRaw(null);
    setPos(0);
  }

  // Keys 1-5 answer the statement on screen and Backspace goes back, unless the visitor is typing somewhere, a dialog
  // (sign-in, a menu sheet) is open over the quiz, or the key is held down and repeating.
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        answer(Number(e.key));
      } else if (e.key === "Backspace" && current > 0) {
        e.preventDefault();
        setPos(current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const attribution = (
    <p className="max-w-4xl text-[13px] leading-relaxed text-zinc-600 lg:col-span-12">
      {t("quiz.attr1", { version: ONET_VERSION })}
      <a className="underline underline-offset-4 hover:text-ink" href="https://creativecommons.org/licenses/by/4.0/">
        CC BY 4.0
      </a>
      {t("quiz.attr2")}
      <a className="underline underline-offset-4 hover:text-ink" href="https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56">
        NCES CIP 2020 to SOC 2018 crosswalk
      </a>
      {t("quiz.attr3")}
    </p>
  );

  if (done)
    return (
      <div className="space-y-8">
        <Results t={t} answers={answers} onRetake={retake} onBack={() => setPos(total - 1)} />
        {attribution}
      </div>
    );

  const q = QUESTIONS[current];
  return (
    // The card and the panel beside it stretch to one height, so the row ends on one line.
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-12">
      <section aria-labelledby="quiz-q" className={`${PANEL} p-5 sm:p-8 lg:col-span-7`}>
        <div className="flex items-baseline justify-between gap-3 text-[15px]">
          <span className="font-semibold">{t("quiz.question", { current: current + 1, total })}</span>
          <span className="text-zinc-600">{t("quiz.answered", { n: answered })}</span>
        </div>
        {/* The track: one step per statement, filled once answered, the one on screen marked. */}
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label={t("quiz.progress")} className="mt-3 flex h-2 gap-0.5">
          {QUESTIONS.map((x, i) => (
            <span key={x.id} className={`flex-1 rounded-full transition-colors duration-200 ${i === current ? "bg-blue-600" : answers[i] !== null ? "bg-ink" : "bg-zinc-200"}`} />
          ))}
        </div>

        <p className="mt-8 text-[15px] font-semibold text-zinc-600">{t("quiz.prompt")}</p>
        {/* Room for two lines, the statement centred in it, so the scale under it never moves between statements. */}
        <div className="flex min-h-[2.3em] items-center font-display text-[26px] leading-[1.15] sm:text-[32px]">
          <h2 id="quiz-q" key={q.id} aria-live="polite" className="font-bold tracking-[-0.02em]">
            {tr(t, `quiz.item.${q.id}`, q.text)}
          </h2>
        </div>

        {/* The scale, dislike to like; each step shows the key that answers it. */}
        <div role="group" aria-labelledby="quiz-q" className="mt-4 grid gap-2 sm:grid-cols-5">
          {ANSWER_LABELS.map((label, i) => {
            const on = answers[current] === i + 1;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => answer(i + 1)}
                className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] sm:min-h-24 sm:flex-col sm:items-start sm:justify-between ${
                  on ? "bg-ink text-white" : "bg-white text-ink hover:bg-blue-50"
                }`}
              >
                <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums ${on ? "bg-white text-ink" : "bg-zinc-100 text-ink"}`}>
                  {i + 1}
                </span>
                <span className="leading-tight">{tr(t, `quiz.answer.${i + 1}`, label)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {/* Back appears once there is something to go back to (a disabled link-button would read as faint text). */}
          {current > 0 ? (
            <button type="button" className={buttonClass("quiet", "sm")} onClick={() => setPos(current - 1)}>
              {t("quiz.back")}
            </button>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-zinc-600 max-sm:hidden">{t("quiz.keys")}</span>
          {answers[current] !== null && (
            <button type="button" className={buttonClass("quiet", "sm")} onClick={() => setPos(current + 1)}>
              {t("quiz.skip")}
            </button>
          )}
        </div>
      </section>

      <LiveCode t={t} answers={answers} />
      {attribution}
    </div>
  );
}

/** Beside the card: the code forming as the student answers, the six scores, and the careers that fit so far. */
function LiveCode({ t, answers }: { t: TFunction; answers: Answers }) {
  const scores = scoreAnswers(answers);
  const code = interestCode(scores);
  const top = new Set(code);
  const careers = matchCareers(scores, INTEREST_CAREERS, 3);
  return (
    <aside aria-labelledby="quiz-live" className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 lg:col-span-5">
      <h2 id="quiz-live" className={LABEL}>
        {t("quiz.live.title")}
      </h2>
      <p aria-live="polite" className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-[0.08em] tabular-nums">
        {code.length ? code.join("") : "—"}
      </p>
      {/* One line a type: its name, its bar, its score; the three that make the code in the data hue. */}
      <ul className="mt-5 space-y-2">
        {RIASEC.map((c) => {
          const s = scores[c];
          return (
            <li key={c} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 text-[15px]">
              <span className={`truncate ${top.has(c) ? "font-semibold" : ""}`}>
                {c} · {typeName(t, c)}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <span className={`block h-full rounded-full transition-[width] duration-300 ${top.has(c) ? "bg-blue-600" : "bg-zinc-400"}`} style={{ width: `${s ?? 0}%` }} />
              </span>
              <span className="text-right tabular-nums text-zinc-600">{s == null ? "—" : `${s}%`}</span>
            </li>
          );
        })}
      </ul>
      <h3 className={`${LABEL} mt-6`}>{t("quiz.live.careers")}</h3>
      {careers.length ? (
        <ol className="mt-2 space-y-1.5 text-[15px]">
          {careers.map(({ career, similarity }) => (
            <li key={career.code} className="flex items-baseline justify-between gap-3">
              <span>{tr(t, `quiz.career.${career.code}`, career.title)}</span>
              <span className="shrink-0 tabular-nums text-zinc-600">{t("quiz.matchPct", { n: Math.round(Math.max(0, similarity) * 100) })}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[15px] leading-snug text-zinc-600">{t("quiz.live.empty")}</p>
      )}
    </aside>
  );
}

function Results({ t, answers, onRetake, onBack }: { t: TFunction; answers: Answers; onRetake: () => void; onBack: () => void }) {
  const scores = scoreAnswers(answers);
  const code = interestCode(scores);
  const matches = matchCareers(scores, INTEREST_CAREERS, 12);
  // Undergraduate programs only, the ones the closest careers share first (components/tools/programs.ts).
  const programs = rankPrograms(matches.slice(0, 8), 8);
  const flat = matches.length === 0;
  const top = new Set(code);

  return (
    <div className="grid gap-x-8 gap-y-8 lg:grid-cols-12 lg:items-start">
      <section aria-labelledby="quiz-code" className={`${PANEL} p-5 sm:p-8 lg:col-span-5`}>
        <h2 id="quiz-code" className={LABEL}>
          {t("quiz.yourCode")}
        </h2>
        <p className="mt-2 font-display text-[44px] font-extrabold leading-none tracking-[0.08em]">{code.join("")}</p>
        <p className="mt-2 text-base">{code.map((c) => typeName(t, c)).join(" / ")}</p>
        <ul className="mt-6 space-y-4">
          {[...RIASEC]
            .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || RIASEC.indexOf(a) - RIASEC.indexOf(b))
            .map((c) => (
              <li key={c}>
                <div className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span className={top.has(c) ? "font-semibold" : ""}>
                    {c} · {typeName(t, c)}
                  </span>
                  <span className="tabular-nums text-zinc-600">{scores[c] ?? 0}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={t("quiz.scoreAria", { name: typeName(t, c), n: scores[c] ?? 0 })}>
                  <div className={`h-full rounded-full ${top.has(c) ? "bg-blue-600" : "bg-zinc-400"}`} style={{ width: `${scores[c] ?? 0}%` }} />
                </div>
                <p className="mt-1 text-[15px] leading-snug text-zinc-600">{tr(t, `quiz.type.${c}.blurb`, TYPE_INFO[c].blurb)}</p>
              </li>
            ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className={buttonClass("primary")} onClick={onRetake}>
            {t("quiz.retake")}
          </button>
          <button type="button" className={buttonClass("secondary")} onClick={onBack}>
            {t("quiz.changeLast")}
          </button>
        </div>
      </section>

      <div className="space-y-8 lg:col-span-7">
        {flat ? (
          <p className="rounded-xl border border-neutral-line bg-neutral-bg p-4 text-neutral">{t("quiz.flat")}</p>
        ) : (
          <>
            <section aria-labelledby="quiz-careers">
              <h2 id="quiz-careers" className="font-display text-2xl font-bold tracking-tight">
                {t("quiz.careersHeading")}
              </h2>
              <ol className="mt-3 divide-y divide-zinc-100 rounded-3xl border border-zinc-200 bg-white">
                {matches.map(({ career, similarity }) => (
                  <li key={career.code} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <a className="font-semibold text-blue-700 underline underline-offset-4 hover:text-ink" href={onetUrl(career.code)} target="_blank" rel="noreferrer">
                        {tr(t, `quiz.career.${career.code}`, career.title)}
                      </a>
                      <p className="mt-0.5 text-[13px] text-zinc-600">
                        {career.zone === 5 ? t("quiz.reqGrad") : t("quiz.reqBach")} · O*NET {career.code}
                      </p>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">{t("quiz.matchPct", { n: Math.round(Math.max(0, similarity) * 100) })}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="quiz-programs">
              <h2 id="quiz-programs" className="font-display text-2xl font-bold tracking-tight">
                {t("quiz.programsHeading")}
              </h2>
              <p className="mt-2 text-base leading-relaxed">{t("quiz.programsBlurb")}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {programs.map((p) => (
                  <li key={p.program} className="rounded-full bg-zinc-100 px-3 py-1.5 text-[15px]">
                    {p.program}
                  </li>
                ))}
              </ul>
              <Link href="/tools/match" className={`${buttonClass("secondary")} mt-5`}>
                {t("match.card.cta")}
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
