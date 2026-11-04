import { Suspense } from "react";
import { StudentTodo } from "@/components/classroom/gc/StudentTodo";

export const metadata = { title: "To-do" };

// The page reads ?tab= (Assigned, Missing or Done), so it sits under a Suspense boundary.
export default function TodoRoute() {
  return (
    <div data-app-screen>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <StudentTodo />
      </Suspense>
    </div>
  );
}
