import type { Metadata } from "next";
import { LegalSection, LegalSheet, LegalStub, LegalTicket, LEGAL_TEXT } from "@/components/legal/LegalTicket";
import { LegalRich } from "@/components/LegalRich";
import type { Locale } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { groupByDate, type RefreshEntry } from "@/lib/refresh-log";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/data-updates");

const DATE_LOCALE: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };

/** "October 27, 2026" / "2026年10月27日" from an ISO day, read as a calendar day (no time zone shift). */
function dayLabel(iso: string, locale: Locale) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(DATE_LOCALE[locale], { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// The record of when data went in (lib/data/refresh-log.json), set as the other info pages are: the stub carries the title
// and what the page is, the sheet below lists the loads newest first, each day's date held beside its entries.
export default async function DataUpdatesPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const lang = locale === "zh-TW" ? "zh" : "en";
  const text = (e: RefreshEntry) => e[lang];
  return (
    <LegalTicket>
      <LegalStub title={t("updates.title")}>
        <p className="mt-6 max-w-[40rem] text-xl leading-snug">{t("updates.lead")}</p>
        <p className="mt-3 max-w-[40rem] text-lg leading-relaxed">{t("updates.perCollege")}</p>
      </LegalStub>

      <LegalSheet>
        <ol aria-label={t("updates.listLabel")} className="space-y-14">
          {groupByDate().map((g) => (
            <li key={g.date}>
              <LegalSection title={dayLabel(g.date, locale)}>
                <div className="space-y-8">
                  {g.entries.map((e, i) => (
                    <article key={`${g.date}-${i}`}>
                      <h3 className="font-display text-lg font-bold leading-snug tracking-[-0.02em] sm:text-xl">{text(e).title}</h3>
                      <p className={`${LEGAL_TEXT} mt-1`}>{text(e).summary}</p>
                    </article>
                  ))}
                </div>
              </LegalSection>
            </li>
          ))}
        </ol>
        <p className={LEGAL_TEXT}>
          <LegalRich text={t("updates.wrong")} />
        </p>
      </LegalSheet>
    </LegalTicket>
  );
}
