"use client";

import { essayStatusText } from "@/components/TeacherText";
import { safeLink } from "@/lib/checklist";
import { redirectHost } from "@/lib/connect-ai";
import { useT } from "@/lib/i18n/client";
import { PS_PROMPTS, UC_PIQS, UC_PICKS } from "@/lib/personal-essays";
import type { StudentDetail } from "@/lib/roster";

function Doc({ status, url }: { status?: string; url?: string }) {
  const t = useT();
  const href = url ? safeLink(url) : null;
  // Students type these links, so show where one goes before the teacher clicks it.
  const host = href ? redirectHost(href) : null;
  return (
    <p className="text-sm">
      <span className="font-semibold">{essayStatusText(t, status ?? "not_started")}</span>
      {href ? (
        <>
          {" · "}
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-4">
            {t("teacher.essays.openDoc")}
          </a>
          {host && <span className="text-zinc-500"> ({host})</span>}
        </>
      ) : url ? (
        <span className="text-zinc-500"> · {t("teacher.essays.badLink")}</span>
      ) : (
        <span className="text-zinc-500"> · {t("teacher.essays.noLink")}</span>
      )}
    </p>
  );
}

export function EssaysPanel({ detail }: { detail: StudentDetail }) {
  const t = useT();
  const essays = detail.essays;
  if (!essays) return <p className="text-sm text-zinc-500">{t("teacher.essays.notShared", { name: detail.displayName })}</p>;

  const ps = essays.ps;
  const prompt = PS_PROMPTS.find((p) => p.id === ps?.prompt);
  const picks = essays.uc?.picks ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-2 rounded-2xl border border-zinc-200 p-5">
        <h3 className="font-display text-lg font-bold">{t("teacher.essays.psTitle")}</h3>
        <Doc status={ps?.status} url={ps?.url} />
        {prompt ? (
          <p className="text-sm text-zinc-600">
            <span className="font-semibold">{t("teacher.essays.promptN", { id: prompt.id })}</span> {prompt.text}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">{t("teacher.essays.noPrompt")}</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">
          {t("teacher.essays.piqTitle")}{" "}
          <span className="text-sm font-normal text-zinc-500">
            {t("teacher.essays.chosen", { n: picks.length, total: UC_PICKS })}
          </span>
        </h3>
        {picks.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("teacher.essays.noQuestions")}</p>
        ) : (
          <ul className="space-y-3">
            {picks.map((id) => {
              const q = UC_PIQS.find((x) => x.id === id);
              const doc = essays.uc?.docs?.[String(id)];
              return (
                <li key={id} className="space-y-1 rounded-2xl border border-zinc-200 p-4">
                  <p className="font-semibold">
                    {t("teacher.essays.question", { id })}
                    {q && `: ${q.title}`}
                  </p>
                  {q && <p className="text-sm text-zinc-600">{q.text}</p>}
                  <Doc status={doc?.status} url={doc?.url} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
