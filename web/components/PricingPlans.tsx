"use client";

import { Suspense, useSyncExternalStore } from "react";
import { PayingFacts } from "@/components/pricing/PayingFacts";
import { PlanCompare } from "@/components/pricing/PlanCompare";
import { useT } from "@/lib/i18n/client";
import { PLANS } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { OrderStatus } from "./OrderStatus";
import { PassCheckout } from "./PassCheckout";

const noop = () => () => {};

/** /pricing: the payment's progress after ECPay (?order=), then what each plan includes beside the pass, drawn as a ticket. */
export function PricingPlans() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const current = mounted && student.ready ? student.plan.key : null;

  return (
    <div className="space-y-8">
      {/* After ECPay: /pricing?order=<id> shows the payment's progress above the plans. */}
      <Suspense fallback={null}>
        <OrderStatus />
      </Suspense>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <PlanCompare current={current} />
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PassCheckout head={<PassHead current={current === "senior"} />} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <PayingFacts />
        </div>
      </div>
    </div>
  );
}

/** The ticket's face: the pass, its price, what it is for and how long it runs. */
function PassHead({ current }: { current: boolean }) {
  const t = useT();
  const pass = PLANS[1];
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-2xl font-bold tracking-tight">{t("payments.planName.senior")}</h2>
        {current && <span className="inline-flex h-6 items-center rounded-full bg-blue-100 px-2.5 text-[13px] font-semibold text-ink">{t("misc.pricing.currentPlan")}</span>}
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">{t("payments.price", { price: pass.priceTwd })}</span>
        <span className="text-base text-blue-100">{t("payments.priceNote")}</span>
      </p>
      <p className="mt-4 max-w-md text-base leading-relaxed text-white">
        {t("misc.pricing.blurb.senior")} {t("misc.pricing.validLine")}
      </p>
    </>
  );
}
