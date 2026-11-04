"use client";

// Browser-only character checker for the UCAS personal statement. The text is kept in this tab's memory and, when the
// browser allows it, in localStorage on this device. It is never put in the student store or sent anywhere.
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { UCAS_PS_QUESTIONS } from "@/lib/personal-essays";
import { checkUcasPs, parseUcasDraft, serializeUcasDraft, UCAS_DRAFT_KEY } from "@/lib/ucas-ps";
import { buttonClass, toneClass } from "@/lib/ui";

const fmt = (n: number) => n.toLocaleString("en-US");

function loadDraft(): [string, string, string] {
  try {
    return parseUcasDraft(window.localStorage.getItem(UCAS_DRAFT_KEY));
  } catch {
    return ["", "", ""];
  }
}

function saveDraft(a: readonly string[]) {
  try {
    if (a.every((s) => s === "")) window.localStorage.removeItem(UCAS_DRAFT_KEY);
    else window.localStorage.setItem(UCAS_DRAFT_KEY, serializeUcasDraft(a));
  } catch {
    // Blocked or full: the checker keeps working from memory.
  }
}

export function UcasCharChecker() {
  const t = useT();
  // Only rendered after the page has mounted on the client (EssaysPage shows a skeleton first), so reading storage here is safe.
  const [answers, setAnswers] = useState<string[]>(() => (typeof window === "undefined" ? ["", "", ""] : loadDraft()));
  const { counts, total, overBy, short } = checkUcasPs(answers);
  const update = (next: string[]) => {
    setAnswers(next);
    saveDraft(next);
  };
  return (
    <div className="space-y-3 pt-2">
      <h3 className="text-[15px] font-semibold text-ink">{t("writing.ucasQuestions")}</h3>
      <p className="text-sm text-zinc-600">{t("writing.ucasLocalOnly")}</p>
      <ul className="space-y-3">
        {UCAS_PS_QUESTIONS.map((q, i) => {
          const warn = answers[i] !== "" && short[i];
          return (
            <li key={q} className="space-y-1.5 rounded-xl bg-white p-3">
              <label htmlFor={`ucas-ps-answer-${i}`} className="block text-[15px] font-medium text-ink">
                {i + 1}. {q}
              </label>
              <textarea
                id={`ucas-ps-answer-${i}`}
                rows={6}
                className="w-full rounded-md border border-zinc-300 p-2 text-sm"
                value={answers[i]}
                onChange={(e) => update(answers.map((a, j) => (j === i ? e.target.value : a)))}
              />
              <p data-testid={`ucas-count-${i}`} className={`inline-block rounded-md px-2 py-0.5 text-xs tabular-nums ${warn ? `border ${toneClass("urgent")}` : "text-zinc-600"}`}>
                {t("writing.ucasCount", { n: fmt(counts[i]) })}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p data-testid="ucas-total" className={`rounded-md px-2 py-0.5 text-sm font-medium tabular-nums ${overBy > 0 ? `border ${toneClass("urgent")}` : "text-ink"}`}>
          {t("writing.ucasTotal", { n: fmt(total) })}
          {overBy > 0 && <> · {t("writing.ucasOver", { n: fmt(overBy) })}</>}
        </p>
        <span className="text-xs text-zinc-500">{t("writing.ucasApprox")}</span>
        <button type="button" className={buttonClass("ghost", "sm")} disabled={total === 0} onClick={() => update(["", "", ""])}>
          {t("writing.ucasClear")}
        </button>
      </div>
    </div>
  );
}
