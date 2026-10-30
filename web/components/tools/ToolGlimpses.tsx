"use client";

// Small live pieces for the Tools page, from the student's own state: their résumé page in miniature (or the labelled
// sample while they have no activities), and where they are in the interest quiz. Decorative copies of what each tool
// shows in full, so they are hidden from assistive technology; the card's heading and link say the same in words.
import { useSyncExternalStore } from "react";
import { ResumePaper, resumeView } from "@/components/ResumeBuilder";
import { useT } from "@/lib/i18n/client";
import { answeredCount, interestCode, parseStored, QUESTIONS, RIASEC, scoreAnswers, STORAGE_KEY } from "@/lib/interest-quiz";
import { useStudent } from "@/lib/student-store";
import { SAMPLE_HEADER, SAMPLE_RESUME } from "./resume-sample";

const noop = () => () => {};
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readQuiz = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const FRAME = "relative h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white";

/** The student's résumé page at about a ninth of its size, or the labelled sample (the résumé page's own sample) while
 *  theirs has fewer than two sections: at this size a page that thin reads as a blank sheet. */
export function ResumeGlimpse() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return <div aria-hidden className={FRAME} />;
  const v = resumeView(student.profile);
  const thin = v.sample || v.resume.sections.length < 2;
  const header = thin ? SAMPLE_HEADER : v.shownHeader;
  const resume = thin ? SAMPLE_RESUME : v.shown;
  return (
    <div aria-hidden className={FRAME}>
      <div className="pointer-events-none absolute left-0 top-0 w-[8.5in] origin-top-left scale-[0.115]">
        <ResumePaper header={header} resume={resume} placeholder={t("tools.rb.yourName")} sample={thin} />
      </div>
      {thin && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink px-2 py-0.5 text-[13px] font-semibold text-white">{t("tools.rb.sample")}</span>}
    </div>
  );
}

/** The quiz in one glance: the six letters before it starts, then the code so far (or the finished code). */
export function QuizGlimpse() {
  const t = useT();
  const raw = useSyncExternalStore(subscribe, readQuiz, () => null);
  const answers = parseStored(raw);
  const n = answers ? answeredCount(answers) : 0;
  if (!answers || n === 0)
    return (
      <div aria-hidden className="grid w-24 shrink-0 grid-cols-3 gap-1">
        {RIASEC.map((c) => (
          <span key={c} className="grid aspect-square place-items-center rounded-lg border border-zinc-200 bg-white font-display text-base font-extrabold">
            {c}
          </span>
        ))}
      </div>
    );
  const code = interestCode(scoreAnswers(answers));
  return (
    <div aria-hidden className="w-24 shrink-0 rounded-xl border border-zinc-200 bg-white p-2.5">
      <p className="text-[13px] leading-tight text-zinc-600">{n === QUESTIONS.length ? t("quiz.yourCode") : t("quiz.answered", { n })}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tracking-[0.06em]">{code.join("") || "—"}</p>
    </div>
  );
}
