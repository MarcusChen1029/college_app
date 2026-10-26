"use client";

import Link from "next/link";
import { useCallback } from "react";
import { StatusPill } from "@/components/StatusPill";
import { ActivitiesPanel } from "@/components/TeacherDetailActivities";
import { CollegesPanel } from "@/components/TeacherDetailColleges";
import { EssaysPanel } from "@/components/TeacherDetailEssays";
import { InterestedPanel, OverviewPanel } from "@/components/TeacherDetailOverview";
import { btn } from "@/components/TeacherClassCard";
import { errorText, flagDetail, flagLabel } from "@/components/TeacherText";
import { TeacherNotes } from "@/components/TeacherNotes";
import { TeacherTabs } from "@/components/TeacherTabs";
import { useT } from "@/lib/i18n/client";
import { teacherStudent } from "@/lib/links-api";
import { computeFlags } from "@/lib/roster";
import { flagTone } from "@/lib/status";
import { detailToRoster } from "@/lib/roster-detail";
import { useLoad } from "@/lib/use-load";

function Back() {
  const t = useT();
  return (
    <Link href="/teacher/students" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
      {t("teacher.detail.back")}
    </Link>
  );
}

const badge = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only view of one linked student: header with attention flags, then Overview / Colleges / Activities / Essays / Interested tabs. */
export function TeacherStudentDetail({ id }: { id: string }) {
  const t = useT();
  const load = useCallback(async () => {
    if (!UUID.test(id)) throw new Error("student not found"); // a mistyped link: skip the round trip
    return { detail: await teacherStudent(id), now: new Date() };
  }, [id]);
  const { data, error, retry } = useLoad(load);

  if (!data) {
    if (!error) return <div className="space-y-4"><Back /><div className="h-64 animate-pulse rounded-lg bg-zinc-100" /></div>;
    const notFound = /student not found/i.test(error);
    return (
      <div className="space-y-3">
        <Back />
        <p role="alert" className="text-sm text-urgent">
          {notFound ? t("teacher.detail.notFound") : errorText(t, error)}
        </p>
        {!notFound && (
          <button type="button" className={btn} onClick={retry}>
            {t("teacher.tryAgain")}
          </button>
        )}
      </div>
    );
  }

  const { detail, now } = data;
  const flags = computeFlags(detailToRoster(detail), now);

  return (
    <div className="space-y-6">
      <Back />
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold [overflow-wrap:anywhere]">{detail.displayName}</h1>
          {detail.profile.isInternational && <span className={`${badge} bg-blue-50 text-blue-700`}>{t("teacher.detail.international")}</span>}
          {detail.profile.needsAid && <span className={`${badge} bg-zinc-100 text-zinc-700`}>{t("teacher.detail.needsAid")}</span>}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
          <span className="[overflow-wrap:anywhere]">{detail.email}</span>
          <span aria-hidden="true">·</span>
          {t("teacher.linked", { date: new Date(detail.linkedAt).toLocaleDateString() })}
          {detail.classes.map((c) => (
            <span key={c.id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
              {c.name}
            </span>
          ))}
        </p>
        <p className="text-sm">
          {t("teacher.detail.essaySharing")}<span className="font-semibold">{detail.shareEssays ? t("teacher.detail.on") : t("teacher.detail.off")}</span>
          {!detail.shareEssays && <span className="text-zinc-500"> {t("teacher.detail.notShared", { name: detail.displayName })}</span>}
        </p>
        {flags.length > 0 && (
          <ul className="space-y-2 rounded-2xl border border-zinc-200 p-4 text-sm">
            {flags.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-2">
                <StatusPill tone={flagTone(f.key)}>{flagLabel(t, f)}</StatusPill> {flagDetail(t, f)}
              </li>
            ))}
          </ul>
        )}
      </header>

      <TeacherTabs
        label={t("teacher.detail.tabsLabel", { name: detail.displayName })}
        tabs={[
          { id: "overview", label: t("teacher.detail.tabOverview"), panel: <OverviewPanel detail={detail} /> },
          { id: "colleges", label: t("teacher.detail.tabColleges", { n: detail.colleges.length }), panel: <CollegesPanel detail={detail} now={now} /> },
          { id: "activities", label: t("teacher.detail.tabActivities"), panel: <ActivitiesPanel detail={detail} /> },
          { id: "essays", label: t("teacher.detail.tabEssays"), panel: <EssaysPanel detail={detail} /> },
          { id: "interested", label: t("teacher.detail.tabInterested", { n: detail.profile.interested.length }), panel: <InterestedPanel detail={detail} /> },
          { id: "notes", label: t("teacher.detail.tabNotes"), keepMounted: true, panel: <TeacherNotes studentId={detail.studentId} studentName={detail.displayName} /> },
        ]}
      />
    </div>
  );
}
