import type { Metadata } from "next";
import InterestQuiz from "@/components/InterestQuiz";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Interest quiz" };

export default async function InterestsPage() {
  const t = await getT();
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">{t("tools.interestsPage.title")}</h1>
        <p className="text-zinc-600">{t("tools.interestsPage.intro")}</p>
      </div>
      <InterestQuiz />
    </div>
  );
}
