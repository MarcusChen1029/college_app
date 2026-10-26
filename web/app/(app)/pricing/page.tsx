import { PricingPlans } from "@/components/PricingPlans";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">{t("misc.pricing.title")}</h1>
        <p className="mt-2 text-zinc-500">{t("misc.pricing.subtitle")}</p>
      </div>
      <PricingPlans />
    </div>
  );
}
