"use client";

import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "@/lib/classroom";
import { studentTasksForTeacher } from "@/lib/classroom-api";
import { listNotes, type TeacherNote } from "@/lib/links-api";
import { teacherMarkers, type TeacherMarker } from "@/lib/teacher-markers";
import type { TeacherStudentTask } from "@/lib/tasks";

type Loaded = { studentId: string; notes: TeacherNote[] | null; tasks: TeacherStudentTask[] | null };

/**
 * The markers on one student's items for the signed-in teacher (spec 5.2), keyed by anchorKey: the conversation about an
 * item, how many private notes and open private tasks it has. A teacher is one person, so one entry per item.
 *
 * The conversations are the ones the student page has already loaded (the teacher's whole inbox; only this student's
 * count), so they are not fetched again; the notes and the tasks are loaded here. Bump `refreshKey` to reload them after
 * the Notes or Tasks tab changed something. Markers are a convenience: a list that fails to load leaves its markers out
 * (an earlier copy for the same student stays), and the page works without them. Null until anything is known, and for no student.
 */
export function useTeacherMarkers(studentId: string | null, conversations: readonly Conversation[] | null, refreshKey = 0): ReadonlyMap<string, TeacherMarker> | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let live = true;
    Promise.allSettled([listNotes(studentId), studentTasksForTeacher(studentId)]).then(([n, k]) => {
      if (!live) return;
      setLoaded((prev) => {
        const same = prev?.studentId === studentId ? prev : null; // never carry another student's lists over
        return { studentId, notes: n.status === "fulfilled" ? n.value : (same?.notes ?? null), tasks: k.status === "fulfilled" ? k.value : (same?.tasks ?? null) };
      });
    });
    return () => {
      live = false;
    };
  }, [studentId, refreshKey]);

  return useMemo(() => {
    if (!studentId) return null;
    const mine = loaded?.studentId === studentId ? loaded : null;
    if (!mine && !conversations) return null;
    return teacherMarkers({ studentId, conversations: conversations ?? [], notes: mine?.notes ?? [], tasks: mine?.tasks ?? [] });
  }, [studentId, conversations, loaded]);
}
