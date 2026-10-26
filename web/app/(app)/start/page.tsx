import { getT } from "@/lib/i18n/server";
import { StartWizard } from "@/components/StartWizard";

export const metadata = { title: "Get started" };

export default async function StartPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">{t("profile.start.title")}</h1>
        <p className="mt-2 text-zinc-600">{t("profile.start.subtitle")}</p>
      </div>
      <StartWizard />
    </div>
  );
}
