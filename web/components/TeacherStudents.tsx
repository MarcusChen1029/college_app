"use client";

import { useSearchParams } from "next/navigation";
import { TeacherGate } from "@/components/TeacherGate";
import { TeacherRoster } from "@/components/TeacherRoster";
import { TeacherStudentDetail } from "@/components/TeacherStudentDetail";

/** /teacher/students: the roster, or one student's detail when the URL has ?s=<studentId>. Wrap in <Suspense>. */
export function TeacherStudents() {
  const id = useSearchParams().get("s");
  return (
    <TeacherGate returnTo="/teacher/students">
      {/* key: moving between students starts the detail load from scratch */}
      {id ? <TeacherStudentDetail key={id} id={id} /> : <TeacherRoster />}
    </TeacherGate>
  );
}
