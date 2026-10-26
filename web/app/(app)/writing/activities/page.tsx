import { ActivitiesEditor } from "@/components/ActivitiesEditor";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t("writing.activitiesTitle")}</h2>
        <p className="text-sm text-zinc-500">
          {t("writing.activitiesIntro")}
        </p>
      </div>
      <ActivitiesEditor />
    </div>
  );
}
