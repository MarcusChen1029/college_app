import { PricingPlans } from "@/components/PricingPlans";
import { getT } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";
import { PAGE_TITLE } from "@/lib/ui";

export const metadata = pageMetadata("/pricing");

export default async function PricingPage() {
  const t = await getT();
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className={PAGE_TITLE}>{t("misc.pricing.title")}</h1>
        <p className="max-w-4xl text-base leading-relaxed text-ink">{t("misc.pricing.subtitle")}</p>
      </div>
      <PricingPlans />
    </div>
  );
}
