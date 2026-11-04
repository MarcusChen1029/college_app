import type { Metadata } from "next";
import { Suspense } from "react";
import { TeacherMessages } from "@/components/classroom/TeacherMessages";

export const metadata: Metadata = { title: "Messages" };

export default function TeacherMessagesPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
      <TeacherMessages />
    </Suspense>
  );
}
