import { Suspense } from "react";
import { MyList } from "@/components/MyList";
import { TeacherTasksForStudent } from "@/components/TeacherTasksForStudent";
import { getDeadlines, getLookups, getScoreCodes, getSummaries } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "My list" };

async function Data() {
  const [colleges, deadlines, lookups, codes] = await Promise.all([getSummaries(), getDeadlines(), getLookups(), getScoreCodes()]);
  return <MyList colleges={colleges} deadlines={deadlines} plans={lookups.plans} englishTests={lookups.englishTests} codes={codes} />;
}

async function Intro() {
  const t = await getT();
  return (
    <p className="text-sm text-zinc-500">
      {t("application.listIntroPre")}
      <strong>{t("application.listIntroReady")}</strong>
      {t("application.listIntroPost")}
    </p>
  );
}

export default function MyListPage() {
  return (
    <div className="space-y-4">
      <TeacherTasksForStudent />
      <Suspense fallback={null}>
        <Intro />
      </Suspense>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
