"use client";

import { useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary, Deadline, Lookups } from "@/lib/types";
import { StudentAiContextButton } from "./AiContextButton";

const noop = () => () => {};

/** For students who don't connect an AI: copy the tracker as text to paste into any chat. Same text as "Copy for AI" on My list. */
export function CopyContextCard(props: { colleges: CollegeSummary[]; deadlines: Deadline[]; plans: Lookups["plans"]; englishTests: Lookups["englishTests"] }) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const hasList = mounted && student.ready && student.list.length > 0;
  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 p-5">
      <h2 className="font-semibold">Copy my context for AI</h2>
      <p className="text-sm text-zinc-600">
        No connector needed. Copy your scores, college list, statuses and deadlines as plain text and paste it into any AI chat. Portal logins and
        private notes are never included.
      </p>
      {hasList ? (
        <StudentAiContextButton {...props} />
      ) : (
        <p className="text-sm text-zinc-500">{mounted && student.ready ? "Add a college to your list first, then come back to copy it." : "Loading…"}</p>
      )}
    </section>
  );
}
