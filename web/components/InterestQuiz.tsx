"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
        <Results answers={answers} onRetake={retake} onBack={() => setPos(total - 1)} />
      ) : (
        <section className="space-y-5 rounded-2xl border-2 border-ink bg-white p-5" aria-live="polite">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-zinc-600">
              <span>
                Question {current + 1} of {total}
              </span>
              <span>{answeredCount(answers)} answered</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-zinc-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answeredCount(answers)}
              aria-label="Quiz progress"
            >
              <div className="h-full bg-ink" style={{ width: `${(answeredCount(answers) / total) * 100}%` }} />
            </div>
          </div>
          <p className="text-sm font-semibold text-zinc-600">How much would you enjoy this?</p>
          <h2 className="font-display text-2xl font-bold">{QUESTIONS[current].text}</h2>
          <div className="grid gap-2 sm:grid-cols-5">
            {ANSWER_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => answer(i + 1)}
                className={buttonClass("secondary", "md", answers[current] === i + 1)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" className={buttonClass("quiet", "sm")} disabled={current === 0} onClick={() => setPos(current - 1)}>
              Back
            </button>
            {answers[current] !== null && (
              <button type="button" className={buttonClass("quiet", "sm")} onClick={() => setPos(current + 1)}>
                Skip ahead
              </button>
            )}
          </div>
        </section>
      )}
      <p className="text-xs text-zinc-500">
        This is not the official O*NET Interest Profiler. Career interest scores and occupation titles come from the O*NET {ONET_VERSION} Database
        by the U.S. Department of Labor, Employment and Training Administration, used under{" "}
        <a className="underline underline-offset-4" href="https://creativecommons.org/licenses/by/4.0/">
          CC BY 4.0
        </a>
        . We selected a subset of occupations and compare your profile to them ourselves; USDOL/ETA has not approved, endorsed, or tested this quiz.
        Linked programs are from the{" "}
        <a className="underline underline-offset-4" href="https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56">
          NCES CIP 2020 to SOC 2018 crosswalk
        </a>
        . O*NET&reg; is a trademark of USDOL/ETA.
      </p>
    </div>
  );
}

function Results({ answers, onRetake, onBack }: { answers: Answers; onRetake: () => void; onBack: () => void }) {
  const scores = scoreAnswers(answers);
  const code = interestCode(scores);
  const matches = matchCareers(scores, INTEREST_CAREERS, 12);
  const programs = suggestPrograms(matches.slice(0, 8), 8);
  const flat = matches.length === 0;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border-2 border-ink bg-white p-5">
        <div>
          <p className="text-sm font-semibold text-zinc-600">Your interest code</p>
          <p className="font-display text-5xl font-bold tracking-widest">{code.join("")}</p>
          <p className="mt-1 text-zinc-600">{code.map((t) => TYPE_INFO[t].name).join(" / ")}</p>
        </div>
        <ul className="space-y-3">
          {[...RIASEC]
            .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || RIASEC.indexOf(a) - RIASEC.indexOf(b))
            .map((t) => (
              <li key={t} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {t} &middot; {TYPE_INFO[t].name}
                  </span>
                  <span className="text-sm text-zinc-600">{scores[t] ?? 0}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={`${TYPE_INFO[t].name} ${scores[t] ?? 0} percent`}>
                  <div className="h-full bg-ink" style={{ width: `${scores[t] ?? 0}%` }} />
                </div>
                <p className="text-sm text-zinc-600">{TYPE_INFO[t].blurb}</p>
              </li>
            ))}
        </ul>
      </section>

      {flat ? (
        <p className="rounded-xl border border-neutral-line bg-neutral-bg p-4 text-neutral">
          Your answers were about equal for every type, so no career stands out. Retake it and use the full range, from strongly dislike to strongly like.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Careers that fit your profile</h2>
            <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {matches.map(({ career, similarity }) => (
                <li key={career.code} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <a className="font-semibold text-blue-700 underline underline-offset-4" href={onetUrl(career.code)} target="_blank" rel="noreferrer">
                      {career.title}
                    </a>
                    <p className="text-sm text-zinc-600">
                      {career.zone === 5 ? "Usually needs a graduate degree" : "Usually needs a bachelor's degree"} &middot; O*NET {career.code}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-zinc-600">{Math.round(Math.max(0, similarity) * 100)}% match</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">College programs to look at</h2>
            <p className="text-sm text-zinc-600">
              Programs the NCES crosswalk links to your top careers. A program name here is a starting point; check each college&apos;s own major list.
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
          Retake
        </button>
        <button type="button" className={buttonClass("secondary")} onClick={onBack}>
          Change my last answer
        </button>
      </div>
    </div>
  );
}
