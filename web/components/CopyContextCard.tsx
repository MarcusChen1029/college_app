"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary, Deadline, Lookups } from "@/lib/types";
import { PANEL } from "@/lib/ui";
import { StudentAiContextButton } from "./AiContextButton";

const noop = () => () => {};

/** For students who don't connect an AI: copy the tracker as text to paste into any chat. Same text as "Copy for AI" on My list. */
export function CopyContextCard(props: { colleges: CollegeSummary[]; deadlines: Deadline[]; plans: Lookups["plans"]; englishTests: Lookups["englishTests"] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const hasList = mounted && student.ready && student.list.length > 0;
  return (
    <section aria-labelledby="copy-context" className={`${PANEL} space-y-4 p-6`}>
      <div className="space-y-1.5">
        <h2 id="copy-context" className="font-display text-xl font-bold tracking-tight text-ink">
          {t("application.ai.cardTitle")}
        </h2>
        <p className="text-base leading-relaxed text-ink">{t("application.ai.cardIntro")}</p>
      </div>
      <div>
        {hasList ? (
          <StudentAiContextButton {...props} label={t("misc.connect.copyButton")} />
        ) : (
          <p className="text-sm text-zinc-600">{mounted && student.ready ? t("application.ai.cardEmpty") : t("application.ai.cardLoading")}</p>
        )}
      </div>
    </section>
  );
}
