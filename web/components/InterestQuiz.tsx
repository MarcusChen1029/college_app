"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
  suggestPrograms,
  type Answers,
} from "@/lib/interest-quiz";
import { buttonClass } from "@/lib/ui";

/** Chinese text for quiz data (items, types, careers) is keyed by id; anything without an entry shows its English text. */
function tr(t: TFunction, key: string, fallback: string): string {
  return key in en ? t(key as MessageKey) : fallback;
}

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

  return (
    <div className="space-y-6">
      {done ? (
        <Results t={t} answers={answers} onRetake={retake} onBack={() => setPos(total - 1)} />
      ) : (
        <section className="space-y-5 rounded-2xl border-2 border-ink bg-white p-5" aria-live="polite">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-zinc-600">
              <span>
                {t("quiz.question", { current: current + 1, total })}
              </span>
              <span>{t("quiz.answered", { n: answeredCount(answers) })}</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-zinc-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answeredCount(answers)}
              aria-label={t("quiz.progress")}
            >
              <div className="h-full bg-ink" style={{ width: `${(answeredCount(answers) / total) * 100}%` }} />
            </div>
          </div>
          <p className="text-sm font-semibold text-zinc-600">{t("quiz.prompt")}</p>
          <h2 className="font-display text-2xl font-bold">{tr(t, `quiz.item.${QUESTIONS[current].id}`, QUESTIONS[current].text)}</h2>
          <div className="grid gap-2 sm:grid-cols-5">
            {ANSWER_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => answer(i + 1)}
                className={buttonClass("secondary", "md", answers[current] === i + 1)}
              >
                {tr(t, `quiz.answer.${i + 1}`, label)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" className={buttonClass("quiet", "sm")} disabled={current === 0} onClick={() => setPos(current - 1)}>
              {t("quiz.back")}
            </button>
            {answers[current] !== null && (
              <button type="button" className={buttonClass("quiet", "sm")} onClick={() => setPos(current + 1)}>
                {t("quiz.skip")}
              </button>
            )}
          </div>
        </section>
      )}
      <p className="text-xs text-zinc-500">
        {t("quiz.attr1", { version: ONET_VERSION })}
        <a className="underline underline-offset-4" href="https://creativecommons.org/licenses/by/4.0/">
          CC BY 4.0
        </a>
        {t("quiz.attr2")}
        <a className="underline underline-offset-4" href="https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56">
          NCES CIP 2020 to SOC 2018 crosswalk
        </a>
        {t("quiz.attr3")}
      </p>
    </div>
  );
}

function Results({ t, answers, onRetake, onBack }: { t: TFunction; answers: Answers; onRetake: () => void; onBack: () => void }) {
  const scores = scoreAnswers(answers);
  const code = interestCode(scores);
  const matches = matchCareers(scores, INTEREST_CAREERS, 12);
  const programs = suggestPrograms(matches.slice(0, 8), 8);
  const flat = matches.length === 0;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border-2 border-ink bg-white p-5">
        <div>
          <p className="text-sm font-semibold text-zinc-600">{t("quiz.yourCode")}</p>
          <p className="font-display text-5xl font-bold tracking-widest">{code.join("")}</p>
          <p className="mt-1 text-zinc-600">{code.map((c) => tr(t, `quiz.type.${c}.name`, TYPE_INFO[c].name)).join(" / ")}</p>
        </div>
        <ul className="space-y-3">
          {[...RIASEC]
            .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || RIASEC.indexOf(a) - RIASEC.indexOf(b))
            .map((c) => (
              <li key={c} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {c} &middot; {tr(t, `quiz.type.${c}.name`, TYPE_INFO[c].name)}
                  </span>
                  <span className="text-sm text-zinc-600">{scores[c] ?? 0}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={t("quiz.scoreAria", { name: tr(t, `quiz.type.${c}.name`, TYPE_INFO[c].name), n: scores[c] ?? 0 })}>
                  <div className="h-full bg-ink" style={{ width: `${scores[c] ?? 0}%` }} />
                </div>
                <p className="text-sm text-zinc-600">{tr(t, `quiz.type.${c}.blurb`, TYPE_INFO[c].blurb)}</p>
              </li>
            ))}
        </ul>
      </section>

      {flat ? (
        <p className="rounded-xl border border-neutral-line bg-neutral-bg p-4 text-neutral">
          {t("quiz.flat")}
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">{t("quiz.careersHeading")}</h2>
            <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {matches.map(({ career, similarity }) => (
                <li key={career.code} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <a className="font-semibold text-blue-700 underline underline-offset-4" href={onetUrl(career.code)} target="_blank" rel="noreferrer">
                      {tr(t, `quiz.career.${career.code}`, career.title)}
                    </a>
                    <p className="text-sm text-zinc-600">
                      {career.zone === 5 ? t("quiz.reqGrad") : t("quiz.reqBach")} &middot; O*NET {career.code}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-zinc-600">{t("quiz.matchPct", { n: Math.round(Math.max(0, similarity) * 100) })}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">{t("quiz.programsHeading")}</h2>
            <p className="text-sm text-zinc-600">
              {t("quiz.programsBlurb")}
            </p>
            <ul className="flex flex-wrap gap-2">
              {programs.map((p) => (
                <li key={p.program} className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm">
                  {p.program}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass("primary")} onClick={onRetake}>
          {t("quiz.retake")}
        </button>
        <button type="button" className={buttonClass("secondary")} onClick={onBack}>
          {t("quiz.changeLast")}
        </button>
      </div>
    </div>
  );
}
