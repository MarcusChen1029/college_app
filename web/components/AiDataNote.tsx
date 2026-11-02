"use client";

// What a connected AI can see, where that data goes, each AI's minimum age (lib/ai-plans.ts AGE_RULES, sourced), and how to
// disconnect. Shown to every visitor, so it reads no account data. The wording must stay inside what the privacy page promises.

import Link from "next/link";
import { AGE_RULES, CHECKED_ON, type PlanRow } from "@/lib/ai-plans";
import { useT } from "@/lib/i18n/client";
import { PANEL } from "@/lib/ui";

// Written out so the i18n scan sees every key.
const AGE_KEY = {
  Claude: "misc.connect.age.claude",
  ChatGPT: "misc.connect.age.chatgpt",
  Gemini: "misc.connect.age.gemini",
} as const satisfies Record<PlanRow["vendor"], string>;

export function AiDataNote() {
  const t = useT();
  return (
    <section aria-labelledby="connect-data" className={`${PANEL} space-y-4 p-6`}>
      <h2 id="connect-data" className="font-display text-xl font-bold tracking-tight text-ink">
        {t("misc.connect.dataTitle")}
      </h2>
      <p className="text-base leading-relaxed text-ink">{t("misc.connect.dataSees")}</p>
      <p className="text-base leading-relaxed text-ink">{t("misc.connect.dataCompany")}</p>

      <div>
        <h3 className="font-display text-lg font-bold text-ink">{t("misc.connect.ageTitle")}</h3>
        <p className="mt-0.5 text-sm text-zinc-600">{t("misc.connect.plansChecked", { date: CHECKED_ON })}</p>
        <ul className="mt-2 space-y-1.5 text-base leading-snug text-ink">
          {AGE_RULES.map((a) => (
            <li key={a.vendor}>
              {t(AGE_KEY[a.vendor], { age: a.minAge })}{" "}
              <a
                href={a.source}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("misc.connect.ageSourceFor", { vendor: a.vendor })}
                className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
              >
                {t("misc.connect.plansSource")}
              </a>
              {a.notRechecked && <span className="mt-0.5 block text-sm text-zinc-600">{t("misc.connect.ageNotRechecked", { date: CHECKED_ON })}</span>}
            </li>
          ))}
        </ul>
      </div>

      <p className="rounded-2xl bg-blue-50 px-4 py-3 text-base font-semibold leading-snug text-ink">{t("misc.connect.dataUnder18")}</p>
      <p className="text-base leading-relaxed text-ink">{t("misc.connect.dataDisconnect")}</p>
      <Link href="/privacy" className="inline-block text-[15px] font-semibold text-blue-700 underline-offset-4 hover:underline">
        {t("misc.connect.dataPrivacy")}
      </Link>
    </section>
  );
}
