"use client";

import { Fragment, Suspense, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { PLANS } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { OrderStatus } from "./OrderStatus";
import { PassCheckout } from "./PassCheckout";

const noop = () => () => {};

/** Renders <b>…</b> as bold so each sentence is one translatable string. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<b>.*?<\/b>)/).map((part, i) => (part.startsWith("<b>") ? <strong key={i}>{part.slice(3, -4)}</strong> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

export function PricingPlans() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const current = mounted && student.ready ? student.plan.key : null;

  return (
    <div className="space-y-6">
      {/* After ECPay: /pricing?order=<id> shows the payment's progress above the plans. */}
      <Suspense fallback={null}>
        <OrderStatus />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => {
          const isCurrent = current === p.key;
          return (
            <section
              key={p.key}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                isCurrent ? "border-blue-500 ring-2 ring-blue-500/30" : "border-zinc-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold">{t(`payments.planName.${p.key}`)}</h2>
                {isCurrent && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{t("misc.pricing.currentPlan")}</span>}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{t(`misc.pricing.blurb.${p.key}`)}</p>
              <p className="mt-5 flex items-baseline gap-2">
                {p.priceTwd === 0 ? (
                  <span className="font-display text-4xl font-bold">{t("misc.pricing.free")}</span>
                ) : (
                  <>
                    <span className="font-display text-4xl font-bold tabular-nums">NT${p.priceTwd}</span>
                    <span className="text-sm text-zinc-500">{t("payments.priceNote")}</span>
                  </>
                )}
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-done">✓</span>
                  <span>
                    <Rich text={p.limit == null ? t("misc.pricing.limitUnlimited") : t("misc.pricing.limitUpTo", { n: p.limit })} />
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-done">✓</span>{t("misc.pricing.featChecklist")}
                </li>
                <li className="flex gap-2">
                  <span className="text-done">✓</span>{t("misc.pricing.featReminders")}
                </li>
                <li className="flex gap-2">
                  <span className="text-done">✓</span>
                  {p.fullAiContext ? (
                    <span>
                      <Rich text={t("misc.pricing.featAiFull")} />
                    </span>
                  ) : (
                    <span>{t("misc.pricing.featAiBasic")}</span>
                  )}
                </li>
                {p.connectAi && (
                  <li className="flex gap-2">
                    <span className="text-done">✓</span>
                    <span>
                      <Rich text={t("misc.pricing.featConnect")} />
                    </span>
                  </li>
                )}
                {p.filler && (
                  <li className="flex gap-2">
                    <span className="text-done">✓</span>
                    <span>
                      <Rich text={t("misc.pricing.featFiller")} />
                    </span>
                  </li>
                )}
              </ul>
              {p.key === "senior" && <PassCheckout />}
            </section>
          );
        })}
      </div>
    </div>
  );
}
