import Link from "next/link";
import { ResumeBuilder } from "@/components/ResumeBuilder";
import { PortfolioShare } from "@/components/ShareLinkPanel";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Résumé" };

export default async function ResumePage() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/tools" className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">
          {t("tools.resume.back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("tools.resume.pageTitle")}</h1>
        <p className="text-sm text-zinc-500">{t("tools.resume.pageBlurb")}</p>
      </div>
      <ResumeBuilder />
      <PortfolioShare />
    </div>
  );
}
