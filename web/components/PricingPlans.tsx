"use client";

import Link from "next/link";
import { Fragment, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { PLANS, type PlanKey } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

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
  const [justChose, setJustChose] = useState<PlanKey | null>(null);
  const current = mounted && student.ready ? student.plan.key : null;
  const listed = student.list.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.key;
          const over = p.limit != null && listed > p.limit;
          return (
            <section
              key={p.key}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                isCurrent ? "border-blue-500 ring-2 ring-blue-500/30" : "border-zinc-200"
              }`}
            >
              <h2 className="font-display text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t(`misc.pricing.blurb.${p.key}`)}</p>
              <p className="mt-5 flex items-baseline gap-1">
                {p.priceTwd === 0 ? (
                  <span className="font-display text-4xl font-bold">{t("misc.pricing.free")}</span>
                ) : (
                  <>
                    <span className="font-display text-4xl font-bold tabular-nums">NT${p.priceTwd}</span>
                    <span className="text-sm text-zinc-500">{t("misc.pricing.perMonth")}</span>
                  </>
                )}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
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
                {p.key === "senior" && (
                  <li className="flex gap-2">
                    <span className="text-done">✓</span>
                    <span>
                      <Rich text={t("misc.pricing.featFiller")} />
                    </span>
                  </li>
                )}
              </ul>
              {over && !isCurrent && (
                <p className={`mt-4 rounded-md border p-2 text-xs ${toneClass("soon")}`}>
                  {t("misc.pricing.over", { n: listed, limit: p.limit ?? 0 })}
                </p>
              )}
              <button
                className={`mt-5 ${buttonClass(isCurrent ? "secondary" : "primary")}`}
                disabled={isCurrent || current == null}
                onClick={() => {
                  student.setPlan(p.key);
                  setJustChose(p.key);
                }}
              >
                {isCurrent ? t("misc.pricing.currentPlan") : t("misc.pricing.choose", { name: p.name })}
              </button>
            </section>
          );
        })}
      </div>

      {justChose && current === justChose && (
        <p className={`rounded-md border p-3 text-sm ${toneClass("done")}`} role="status">
          {t("misc.pricing.onPlan", { name: PLANS.find((p) => p.key === justChose)!.name })}{" "}
          <Link href="/application/list" className="underline">
            {t("misc.pricing.goToList")}
          </Link>
        </p>
      )}

      <p className="text-xs text-zinc-500">
        {t("misc.pricing.footer")}{" "}
        {mounted && student.ready && !student.auth && t("misc.pricing.footerSaved")}
      </p>
    </div>
  );
}
