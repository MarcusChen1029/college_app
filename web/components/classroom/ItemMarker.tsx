"use client";

import Link from "next/link";
import { studentHref } from "@/lib/anchors";
import type { Marker } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { toneClass } from "@/lib/ui";
import { useStudentMarkers } from "./useStudentMarkers";

const PILL = "inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold leading-tight hover:underline";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/**
 * What a counselor has on one of the student's items: a speech bubble (with the unread count) that opens the
 * conversation, and a task box (with the open task count) that opens the Counselors page at the task. `teacherName`
 * is passed only when several teachers have something on the same item, so the student can tell the markers apart.
 */
export function ItemMarker({ marker, teacherName }: { marker: Marker; teacherName?: string }) {
  const t = useT();
  const named = !!teacherName;
  const commentLabel = named ? t("classroom.marker.commentFrom", { name: teacherName }) : t("classroom.marker.comment");
  const taskLabel = named ? t("classroom.marker.taskFrom", { name: teacherName }) : t("classroom.marker.task");
  const commentName = marker.unread > 0 ? `${commentLabel} (${t("classroom.marker.unread", { n: marker.unread })})` : commentLabel;
  const taskName = `${taskLabel} (${t("classroom.marker.open", { n: marker.openTasks })})`;
  return (
    <>
      {marker.conversationId && (
        <Link
          href={`/counselor?c=${encodeURIComponent(marker.conversationId)}`}
          title={commentName}
          className={`${PILL} ${toneClass(marker.unread > 0 ? "progress" : "neutral")}`}
        >
          <Icon>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z" />
          </Icon>
          {marker.unread > 0 && (
            <span aria-hidden className="tabular-nums">
              {marker.unread}
            </span>
          )}
          {named && (
            <span aria-hidden className="min-w-0 max-w-36 truncate font-medium">
              {teacherName}
            </span>
          )}
          <span className="sr-only">{commentName}</span>
        </Link>
      )}
      {marker.openTasks > 0 && marker.firstTaskId && (
        <Link href={studentHref({ kind: "task", ref: marker.firstTaskId })} title={taskName} className={`${PILL} ${toneClass("neutral")}`}>
          <Icon>
            <rect x="4" y="4" width="16" height="16" rx="3" />
          </Icon>
          <span aria-hidden className="tabular-nums">
            {marker.openTasks}
          </span>
          {named && (
            <span aria-hidden className="min-w-0 max-w-36 truncate font-medium">
              {teacherName}
            </span>
          )}
          <span className="sr-only">{taskName}</span>
        </Link>
      )}
    </>
  );
}

/**
 * The markers on one item of a student's page, found by its anchor key (the same value as the item's data-focus; pass
 * `focusAttr(...)`). Renders nothing for an item without markers, for an item no comment can point at (key undefined)
 * and for anyone who isn't a linked student. `className` goes on the row of markers, e.g. for spacing.
 */
export function ItemMarkers({ itemKey, className = "" }: { itemKey: string | undefined; className?: string }) {
  const markers = useStudentMarkers();
  const entries = itemKey ? markers?.get(itemKey) : undefined;
  if (!entries || entries.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {entries.map((e) => (
        <ItemMarker key={e.teacherId} marker={e.marker} teacherName={entries.length > 1 ? e.teacherName : undefined} />
      ))}
    </div>
  );
}
