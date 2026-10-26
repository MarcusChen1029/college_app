"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary, Deadline, Lookups } from "@/lib/types";
import { StudentAiContextButton } from "./AiContextButton";

const noop = () => () => {};

/** For students who don't connect an AI: copy the tracker as text to paste into any chat. Same text as "Copy for AI" on My list. */
export function CopyContextCard(props: { colleges: CollegeSummary[]; deadlines: Deadline[]; plans: Lookups["plans"]; englishTests: Lookups["englishTests"] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const hasList = mounted && student.ready && student.list.length > 0;
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 p-5">
      <h2 className="font-semibold">{t("application.ai.cardTitle")}</h2>
      <p className="text-sm text-zinc-600">
        {t("application.ai.cardIntro")}
      </p>
      {hasList ? (
        <StudentAiContextButton {...props} />
      ) : (
        <p className="text-sm text-zinc-500">{mounted && student.ready ? t("application.ai.cardEmpty") : t("application.ai.cardLoading")}</p>
      )}
    </section>
  );
}
