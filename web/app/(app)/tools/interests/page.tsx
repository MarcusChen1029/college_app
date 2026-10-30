import type { Metadata } from "next";
import InterestQuiz from "@/components/InterestQuiz";
import { getT } from "@/lib/i18n/server";
import { PAGE_INTRO, PAGE_TITLE } from "@/lib/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/tools/interests");

export default async function InterestsPage() {
  const t = await getT();
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className={PAGE_TITLE}>{t("tools.interestsPage.title")}</h1>
        <p className={PAGE_INTRO}>{t("tools.interestsPage.intro")}</p>
      </div>
      <InterestQuiz />
    </div>
  );
}
