"use client";

import Link from "next/link";
import { afterOfferFacts, stepVariant } from "@/lib/after-offer";
import { AFTER_OFFER, afterOfferSteps, type AfterOfferKey, type Checklist, type CollegeContext } from "@/lib/checklist";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { ListEntry } from "@/lib/student-store";
import { Check, Section } from "../ChecklistPanel";

const VISA_KEYS = new Set<string>(Object.values(AFTER_OFFER).flatMap((list) => list.filter(([, isVisa]) => isVisa).map(([key]) => key)));

/** The after-offer steps for a UK, Canada or Australia college, each with its sourced "when / how much" facts. Never counts toward Ready. */
export function AfterOfferSection({
  entry,
  ctx,
  citizenship,
  set,
}: {
  entry: ListEntry;
  ctx: CollegeContext;
  citizenship: string | null;
  set: (patch: Partial<Checklist>) => void;
}) {
  const t = useT();
  const steps = afterOfferSteps(entry.checklist, entry.status, ctx, { international: true, citizenship });
  if (steps.length === 0) return null;
  const showNote = citizenship === null && steps.some((s) => VISA_KEYS.has(s.key));

  return (
    <Section title={t("application.offer.title")} done={steps.every((s) => s.done)} hint={t("application.offer.notReady")} className="md:col-span-2">
      {steps.map((s) => {
        const key = s.key as AfterOfferKey;
        const label = key === "ca_pal" && stepVariant(entry.slug, key) === "caq" ? t("application.offer.ca_pal_caq") : t(`application.offer.${key}` as MessageKey);
        const facts = afterOfferFacts(entry.slug, key, citizenship);
        return (
          <div key={key} className="space-y-0.5">
            <Check checked={s.done} onChange={(v) => set({ [key]: v })}>
              {label}
            </Check>
            {facts.map((f) => (
              <p key={`${f.sourceUrl}|${f.text}`} className="pl-5 text-[11px] text-zinc-500">
                {f.text}{" "}
                <a
                  href={f.link ?? f.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t("application.offer.officialPage")}: ${label}, ${f.text}`}
                  className="text-blue-700 underline"
                >
                  {t("application.offer.officialPage")}
                </a>
              </p>
            ))}
          </div>
        );
      })}
      {showNote && (
        <p className="text-[11px] text-zinc-500">
          {t("application.offer.citizenshipNote")}{" "}
          <Link href="/profile" className="text-blue-700 underline">
            {t("application.offer.citizenshipLink")}
          </Link>
        </p>
      )}
    </Section>
  );
}
