"use client";

// /pricing: the four things people ask before paying, beside the ticket: it is one payment, a parent can pay, how, and
// the refund. Words only; the payment itself lives on the ticket's stub (PassCheckout).

import { useT } from "@/lib/i18n/client";
import { PANEL } from "@/lib/ui";

export function PayingFacts() {
  const t = useT();
  const facts = [
    { title: t("misc.pricing.factOnce"), text: t("misc.pricing.factOnceText") },
    { title: t("misc.pricing.factParent"), text: t("misc.pricing.factParentText") },
    { title: t("misc.pricing.factMethods"), text: t("payments.methods") },
    { title: t("misc.pricing.factRefund"), text: t("misc.pricing.factRefundText") },
  ];
  return (
    <section aria-labelledby="paying-facts" className={`${PANEL} px-5 py-6 sm:px-8 sm:py-7`}>
      <h2 id="paying-facts" className="font-display text-xl font-bold tracking-tight text-ink">
        {t("misc.pricing.factsTitle")}
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.title}>
            <dt className="font-semibold text-ink">{f.title}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-zinc-700">{f.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
