import { PricingPlans } from "@/components/PricingPlans";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-zinc-500">Every plan has the full tracker. Plans differ only in how many colleges you can keep in My list.</p>
      </div>
      <PricingPlans />
    </div>
  );
}
