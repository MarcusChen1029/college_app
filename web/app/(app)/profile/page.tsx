import { Suspense } from "react";
import { LegacyAccountHash } from "@/components/LegacyAccountHash";
import { ProfileDashboard } from "@/components/ProfileDashboard";
import { getDeadlines, getSummaries } from "@/lib/data";

export const metadata = { title: "Profile" };

async function Data() {
  const [colleges, deadlines] = await Promise.all([getSummaries(), getDeadlines()]);
  return <ProfileDashboard colleges={colleges} deadlines={deadlines} />;
}

export default function ProfilePage() {
  return (
    <>
      {/* An app screen: the slim footer (globals.css, "App screens"). */}
      <span hidden data-app-screen />
      <LegacyAccountHash />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <Data />
      </Suspense>
    </>
  );
}
