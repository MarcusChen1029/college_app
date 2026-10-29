import { ActivitiesEditor } from "@/components/ActivitiesEditor";
import { getT } from "@/lib/i18n/server";
import { PAGE_INTRO, SECTION_TITLE } from "@/lib/ui";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <div>
        <h2 className={SECTION_TITLE}>{t("writing.activitiesTitle")}</h2>
        <p className={`${PAGE_INTRO} mt-2`}>
          {t("writing.activitiesIntro")}
        </p>
      </div>
      <ActivitiesEditor />
    </div>
  );
}
