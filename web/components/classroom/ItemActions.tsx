"use client";

import { createContext, useContext } from "react";
import { ActionsMenu, type MenuAction } from "@/components/teacher/ActionsMenu";
import { anchorKey, type Anchor } from "@/lib/anchors";
import type { Marker } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import type { MarkerKind, TeacherMarker } from "@/lib/teacher-markers";
import { toneClass } from "@/lib/ui";
import type { AnchorOption } from "./anchorOptions";
import { BoxIcon, BubbleIcon, LockIcon } from "./icons";
import { MARKER_ICON, MARKER_PILL } from "./markerPill";

/** What the ⋯ menu offers on an item. */
export type ItemAction = "comment" | "note" | "task";

/**
 * What a teacher can do with one item of a student's record (spec 5.2): the markers for what already exists on it (a
 * speech bubble with the unread count and a dot while a reply waits, a lock with the private note count, a box with the
 * open task count; each opens the matching tab) and the ⋯ menu with its three actions, each saying who will see the result.
 * `option` is the item and the name to show for it; `studentName` fills the "Only <student>" lines.
 */
export function ItemActions({
  option,
  studentName,
  marker,
  onAction,
  onMarker,
  className = "",
}: {
  option: AnchorOption;
  studentName: string;
  marker?: Marker;
  onAction: (action: ItemAction) => void;
  onMarker: (what: MarkerKind) => void;
  /** Extra classes for the row of markers and the menu button (spacing and alignment). */
  className?: string;
}) {
  const t = useT();
  const item = option.label;
  const actions: MenuAction[] = [
    { id: "comment", label: t("classroom.item.comment"), note: t("classroom.item.onlyBoth", { name: studentName }), onSelect: () => onAction("comment") },
    { id: "note", label: t("classroom.item.note"), note: t("classroom.item.onlyYou"), onSelect: () => onAction("note") },
    { id: "task", label: t("teacher.tasks.assignHeading"), note: t("classroom.item.onlyStudent", { name: studentName }), onSelect: () => onAction("task") },
  ];

  const unread = marker?.unread ?? 0;
  const commentName = `${t("classroom.item.markComment", { item })}${unread > 0 ? ` (${t("classroom.marker.unread", { n: unread })})` : ""}`;
  const noteName = t("classroom.item.markNotes", { item, n: marker?.notes ?? 0 });
  const taskName = t("classroom.item.markTasks", { item, n: marker?.openTasks ?? 0 });

  return (
    <div className={`flex shrink-0 flex-wrap items-center justify-end gap-1.5 ${className}`}>
      {marker?.conversationId && (
        <button type="button" title={commentName} onClick={() => onMarker("comments")} className={`${MARKER_PILL} ${toneClass(unread > 0 ? "progress" : "neutral")}`}>
          <BubbleIcon className={MARKER_ICON} />
          {unread > 0 && (
            <>
              <span aria-hidden className="tabular-nums">
                {unread}
              </span>
              <span aria-hidden className="size-2 rounded-full bg-current" />
            </>
          )}
          <span className="sr-only">{commentName}</span>
        </button>
      )}
      {marker && marker.notes > 0 && (
        <button type="button" title={noteName} onClick={() => onMarker("notes")} className={`${MARKER_PILL} ${toneClass("neutral")}`}>
          <LockIcon className={MARKER_ICON} />
          <span aria-hidden className="tabular-nums">
            {marker.notes}
          </span>
          <span className="sr-only">{noteName}</span>
        </button>
      )}
      {marker && marker.openTasks > 0 && (
        <button type="button" title={taskName} onClick={() => onMarker("tasks")} className={`${MARKER_PILL} ${toneClass("neutral")}`}>
          <BoxIcon className={MARKER_ICON} />
          <span aria-hidden className="tabular-nums">
            {marker.openTasks}
          </span>
          <span className="sr-only">{taskName}</span>
        </button>
      )}
      <ActionsMenu label={t("classroom.item.menu", { item })} actions={actions} quiet floating />
    </div>
  );
}

/** What the student page gives the items under it, so each item only names its anchor. */
export type TeacherItemContextValue = {
  studentName: string;
  /** The items a comment, note or task can be about (teacherAnchorOptions), by anchorKey. */
  options: ReadonlyMap<string, AnchorOption>;
  markers: ReadonlyMap<string, TeacherMarker> | null;
  onAction: (action: ItemAction, option: AnchorOption) => void;
  onMarker: (what: MarkerKind, option: AnchorOption) => void;
};

export const TeacherItemContext = createContext<TeacherItemContextValue | null>(null);

/**
 * The ⋯ menu and markers for the item with this anchor, wherever the student page's tabs show it. Renders nothing for an
 * item no comment could point at (an activity with only a made-up id, the essays while they are not shared) and outside the page.
 */
export function TeacherItemActions({ anchor, className }: { anchor: Anchor; className?: string }) {
  const ctx = useContext(TeacherItemContext);
  const key = anchorKey(anchor);
  const option = ctx?.options.get(key);
  if (!ctx || !option) return null;
  return (
    <ItemActions
      option={option}
      studentName={ctx.studentName}
      marker={ctx.markers?.get(key)}
      onAction={(a) => ctx.onAction(a, option)}
      onMarker={(w) => ctx.onMarker(w, option)}
      className={className}
    />
  );
}
