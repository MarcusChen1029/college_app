// What a teacher has on the items of one student's record (spec 5.2): the conversation about an item, their private
// notes about it and their open private tasks, plus where a click on each marker goes. Pure helpers only; the page loads
// the lists (components/classroom/useTeacherMarkers.ts) and routes the clicks.

import { anchorKey, type Anchor } from "./anchors.ts";
import { markersByAnchor, type AnchorInfo, type Conversation, type Marker } from "./classroom.ts";

/** A Marker plus the newest private note on the item, so a click on the lock can scroll to that note. */
export type TeacherMarker = Marker & { firstNoteId: string | null };

/**
 * One teacher's markers on one student's items, keyed by anchorKey. `conversations` is the teacher's whole inbox: only
 * the ones with this student count. `notes` must be newest first (listNotes returns them so), and the first note about an
 * item is the one a click scrolls to. General notes, general conversations and done tasks leave no marker.
 */
export function teacherMarkers(i: {
  studentId: string;
  conversations?: readonly Conversation[];
  notes?: readonly { id: string; anchor: Anchor | null }[];
  tasks?: readonly { id: string; about: AnchorInfo | null; done: boolean }[];
}): Map<string, TeacherMarker> {
  const base = markersByAnchor({ conversations: (i.conversations ?? []).filter((c) => c.otherId === i.studentId), notes: i.notes, tasks: i.tasks });
  const out = new Map<string, TeacherMarker>();
  for (const [key, m] of base) out.set(key, { ...m, firstNoteId: null });
  for (const n of i.notes ?? []) {
    if (!n.anchor || n.anchor.kind === "general") continue;
    const m = out.get(anchorKey(n.anchor));
    if (m && m.firstNoteId === null) m.firstNoteId = n.id;
  }
  return out;
}

/** The three markers an item can show. */
export type MarkerKind = "comments" | "notes" | "tasks";

/**
 * What a click on a marker does: the tab to open, whether to open the item's conversation there (the Messages tab opens
 * the existing conversation about the item), and the `data-focus` value of the row to scroll to (the newest private note,
 * the first open task) or null when there is nothing to scroll to.
 */
export type MarkerRoute = { tab: "messages" | "notes" | "tasks"; openConversation: boolean; scrollTo: string | null };

export function markerRoute(what: MarkerKind, marker: TeacherMarker | undefined): MarkerRoute {
  switch (what) {
    case "comments":
      return { tab: "messages", openConversation: true, scrollTo: null };
    case "notes":
      return { tab: "notes", openConversation: false, scrollTo: marker?.firstNoteId ? `note:${marker.firstNoteId}` : null };
    case "tasks":
      return { tab: "tasks", openConversation: false, scrollTo: marker?.firstTaskId ? `task:${marker.firstTaskId}` : null };
  }
}
