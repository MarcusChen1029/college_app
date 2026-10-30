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
      <ActivitiesEditor />
    </div>
  );
}
