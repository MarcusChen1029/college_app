"use client";

import { Suspense, useSyncExternalStore } from "react";
import { PayingFacts } from "@/components/pricing/PayingFacts";
import { PlanCompare } from "@/components/pricing/PlanCompare";
import { useT } from "@/lib/i18n/client";
import { getPlan } from "@/lib/plans";
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

      {/* The comparison beside the ticket; the questions people ask before paying in one row under both. On a phone the
          ticket (it carries the purchase) comes first. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <PlanCompare current={current} />
        <div className="order-first lg:order-none">
          <PassCheckout head={<PassHead current={current === "senior"} />} />
        </div>
        <div className="lg:col-span-2">
          <PayingFacts />
        </div>
      </div>
    </div>
  );
}

/** A tick on the navy face, pale enough to read there (the green AccessMark is for light grounds). */
function Tick() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-blue-200" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** The ticket's face: the pass, its price, what it includes and how long it runs. */
function PassHead({ current }: { current: boolean }) {
  const t = useT();
  const pass = getPlan("senior");
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-2xl font-bold tracking-tight">{t("payments.planName.senior")}</h2>
        {current && <span className="inline-flex h-6 items-center rounded-full bg-blue-100 px-2.5 text-[13px] font-semibold text-ink">{t("misc.pricing.currentPlan")}</span>}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">{t("payments.price", { price: pass.priceTwd })}</span>
        <span className="text-base text-blue-100">{t("payments.priceNote")}</span>
      </p>
      <ul aria-label={t("misc.pricing.included")} className="mt-4 grid gap-x-5 gap-y-1.5 text-[15px] leading-snug text-white sm:grid-cols-2">
        {[t("misc.pricing.coverList"), t("misc.pricing.coverAi"), t("misc.pricing.coverConnect"), t("misc.pricing.rowFiller")].map((c) => (
          <li key={c} className="flex gap-2">
            <Tick />
            <span>{c}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-blue-100">{t("misc.pricing.validLine")}</p>
    </>
  );
}
