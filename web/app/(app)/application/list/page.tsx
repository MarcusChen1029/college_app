import { Suspense } from "react";
import { MyList } from "@/components/MyList";
import { getDeadlines, getLookups, getScoreCodes, getSummaries } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { essayCountsBySlug } from "@/lib/supplements";
import { SUPPLEMENTS } from "@/lib/supplements-data";
import { PAGE_INTRO } from "@/lib/ui";

export const metadata = { title: "My list" };

async function Data() {
  const [colleges, deadlines, lookups, codes] = await Promise.all([getSummaries(), getDeadlines(), getLookups(), getScoreCodes()]);
  // The intro sits just above the table it explains; the "due soon" card and teacher tasks go first.
  return (
    <MyList
      colleges={colleges}
      deadlines={deadlines}
      plans={lookups.plans}
      englishTests={lookups.englishTests}
      codes={codes}
      intro={<Intro />}
      essayCounts={essayCountsBySlug(SUPPLEMENTS)}
    />
  );
}

async function Intro() {
  const t = await getT();
  return (
    <p className={PAGE_INTRO}>
      {t("application.listIntroPre")}
      <strong>{t("application.listIntroReady")}</strong>
      {t("application.listIntroPost")}
    </p>
  );
}

export default function MyListPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
      <Data />
    </Suspense>
  );
}
