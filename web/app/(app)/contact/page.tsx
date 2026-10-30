import type { Metadata } from "next";
import { ContactEmail, operatorLine } from "@/components/LegalPage";
import { LegalList, LegalSection, LegalSheet, LegalStub, LegalTicket, LEGAL_TEXT } from "@/components/legal/LegalTicket";
import { LegalRich } from "@/components/LegalRich";
import { getT } from "@/lib/i18n/server";
import { CONTACT_EMAIL } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/contact");

// The same ticket as the other legal pages: the stub holds the title, the introduction and the address card; the sheet
// says what to put in a message. The page is short, so it takes the slim footer. While lib/legal.ts has no address,
// the card says so (legal.contact.emailPending); once it has one, the card offers it as a mailto button.
export default async function ContactPage() {
  const t = await getT();
  return (
    <LegalTicket slimFooter>
      <LegalStub title={t("legal.contact.title")}>
        <p className="mt-6 max-w-[40rem] text-xl leading-snug">{t("legal.contact.intro")}</p>
        <div className="mt-8 max-w-[40rem] rounded-2xl bg-blue-50 p-5 sm:p-6">
          {CONTACT_EMAIL ? (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-3 text-lg">
              <span className="font-semibold">{t("legal.contact.emailLabel")}</span>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex h-14 items-center justify-center rounded-full bg-ink px-8 text-base font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.98]"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          ) : (
            <p className="text-lg">
              <span className="font-semibold">{t("legal.contact.emailLabel")}</span> <ContactEmail t={t} />
            </p>
          )}
          <p className="mt-1 text-base text-zinc-600">{operatorLine(t)}</p>
        </div>
      </LegalStub>

      <LegalSheet>
        <LegalSection title={t("legal.contact.topicsTitle")}>
          <LegalList>
            {(["legal.contact.topicPrivacy", "legal.contact.topicSecurity", "legal.contact.topicData", "legal.contact.topicBug"] as const).map((k) => (
              <li key={k}>
                <LegalRich text={t(k)} />
              </li>
            ))}
          </LegalList>
          <p className={`${LEGAL_TEXT} font-semibold`}>{t("legal.contact.never")}</p>
          <p className={LEGAL_TEXT}>
            <LegalRich text={t("legal.contact.help")} />
          </p>
        </LegalSection>
      </LegalSheet>
    </LegalTicket>
  );
}
