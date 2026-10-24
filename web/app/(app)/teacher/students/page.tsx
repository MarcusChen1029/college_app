import type { Metadata } from "next";
import { Suspense } from "react";
import { TeacherStudents } from "@/components/TeacherStudents";

export const metadata: Metadata = { title: "Students" };

export default function TeacherStudentsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
      <TeacherStudents />
    </Suspense>
  );
}
