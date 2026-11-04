import { Suspense } from "react";
import { ActivitiesEditor } from "@/components/ActivitiesEditor";
import { getT } from "@/lib/i18n/server";
import { PAGE_INTRO } from "@/lib/ui";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <div>
        <p className={PAGE_INTRO}>
          {t("writing.activitiesIntro")}
        </p>
      </div>
      {/* The editor reads ?focus= (jump links), so it sits under a Suspense boundary of its own. */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />}>
        <ActivitiesEditor />
      </Suspense>
    </div>
  );
}
