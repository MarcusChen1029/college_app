import { Suspense } from "react";
import { StudentClassesHome } from "@/components/classroom/gc/StudentClassesHome";

export const metadata = { title: "Classes" };

// The page reads ?c= (an open conversation), so it sits under a Suspense boundary.
export default function CounselorRoute() {
  return (
    <div data-app-screen>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <StudentClassesHome />
      </Suspense>
    </div>
  );
}
