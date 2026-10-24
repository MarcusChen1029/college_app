"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ActivitiesPanel } from "@/components/TeacherDetailActivities";
import { CollegesPanel } from "@/components/TeacherDetailColleges";
import { EssaysPanel } from "@/components/TeacherDetailEssays";
import { InterestedPanel, OverviewPanel } from "@/components/TeacherDetailOverview";
import { btn } from "@/components/TeacherClassCard";
import { TeacherNotes } from "@/components/TeacherNotes";
import { TeacherTabs } from "@/components/TeacherTabs";
import { teacherStudent } from "@/lib/links-api";
import { computeFlags } from "@/lib/roster";
import { detailToRoster } from "@/lib/roster-detail";
import { useLoad } from "@/lib/use-load";

const back = (
  <Link href="/teacher/students" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
    Back to all students
  </Link>
);

const badge = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only view of one linked student: header with attention flags, then Overview / Colleges / Activities / Essays / Interested tabs. */
export function TeacherStudentDetail({ id }: { id: string }) {
  const load = useCallback(async () => {
    if (!UUID.test(id)) throw new Error("student not found"); // a mistyped link: skip the round trip
    return { detail: await teacherStudent(id), now: new Date() };
  }, [id]);
  const { data, error, retry } = useLoad(load);

  if (!data) {
    if (!error) return <div className="space-y-4">{back}<div className="h-64 animate-pulse rounded-lg bg-zinc-100" /></div>;
    const notFound = /student not found/i.test(error);
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="text-sm text-rose-600">
          {notFound ? "This student isn't linked to you, or they have left. Go back to your student list to pick someone else." : error}
        </p>
        {!notFound && (
          <button type="button" className={btn} onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const { detail, now } = data;
  const flags = computeFlags(detailToRoster(detail), now);

  return (
    <div className="space-y-6">
      {back}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold [overflow-wrap:anywhere]">{detail.displayName}</h1>
          {detail.profile.isInternational && <span className={`${badge} bg-blue-50 text-blue-700`}>International</span>}
          {detail.profile.needsAid && <span className={`${badge} bg-amber-100 text-amber-800`}>Needs aid</span>}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
          <span className="[overflow-wrap:anywhere]">{detail.email}</span>
          <span aria-hidden="true">·</span>
          Linked {new Date(detail.linkedAt).toLocaleDateString()}
          {detail.classes.map((c) => (
            <span key={c.id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
              {c.name}
            </span>
          ))}
        </p>
        <p className="text-sm">
          Essay sharing: <span className="font-semibold">{detail.shareEssays ? "on" : "off"}</span>
          {!detail.shareEssays && <span className="text-zinc-500"> ({detail.displayName} has chosen not to share essays with you.)</span>}
        </p>
        {flags.length > 0 && (
          <ul className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            {flags.map((f) => (
              <li key={f.key}>
                <span className="font-semibold">{f.label}.</span> {f.detail}
              </li>
            ))}
          </ul>
        )}
      </header>

      <TeacherTabs
        label={`${detail.displayName}'s application`}
        tabs={[
          { id: "overview", label: "Overview", panel: <OverviewPanel detail={detail} /> },
          { id: "colleges", label: `Colleges (${detail.colleges.length})`, panel: <CollegesPanel detail={detail} now={now} /> },
          { id: "activities", label: "Activities", panel: <ActivitiesPanel detail={detail} /> },
          { id: "essays", label: "Essays", panel: <EssaysPanel detail={detail} /> },
          { id: "interested", label: `Interested (${detail.profile.interested.length})`, panel: <InterestedPanel detail={detail} /> },
          { id: "notes", label: "Notes", keepMounted: true, panel: <TeacherNotes studentId={detail.studentId} studentName={detail.displayName} /> },
        ]}
      />
    </div>
  );
}
