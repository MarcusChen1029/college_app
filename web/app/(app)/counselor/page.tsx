import { Suspense } from "react";
import { CounselorPage } from "@/components/classroom/CounselorPage";

export const metadata = { title: "Counselors" };

// The page reads ?c= (an open conversation) and ?focus= (a task to jump to), so it sits under a Suspense boundary.
export default function CounselorRoute() {
  return (
    <div data-app-screen>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <CounselorPage />
      </Suspense>
    </div>
  );
}
