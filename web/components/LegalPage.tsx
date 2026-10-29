import { LegalList, LegalSection as Section, LegalSheet, LegalStub, LegalTicket, LEGAL_LINK, LEGAL_TEXT } from "@/components/legal/LegalTicket";
import { LegalRich } from "@/components/LegalRich";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { CONTACT_EMAIL, legalDate, OPERATOR_NAME } from "@/lib/legal";

/** "Trakur is run by …" with the operator's name, or without it while lib/legal.ts has none. */
export function operatorLine(t: TFunction): string {
  return OPERATOR_NAME ? t("legal.operator.named", { name: OPERATOR_NAME }) : t("legal.operator.unnamed");
}

/** One section of a legal page. Each body entry is a paragraph; an array is a bulleted list. `callout` names a paragraph
 *  whose first <b>…</b> sentence is the one to notice: it is set apart in the tinted panel, the words before and after it
 *  stay as paragraphs, in order. The message itself is unchanged. */
export type LegalSection = { id: string; title: MessageKey; body: readonly (MessageKey | readonly MessageKey[])[]; callout?: MessageKey };

const CARD = "max-w-[38rem] space-y-4 rounded-2xl bg-blue-50 p-5 sm:p-6";

/** A paragraph split at its first <b>…</b>: before, the bold sentence in the tinted panel, after. */
function CalloutParagraph({ text }: { text: string }) {
  const m = text.match(/^([\s\S]*?)<b>([\s\S]*?)<\/b>([\s\S]*)$/);
  if (!m) return <p className={LEGAL_TEXT}><LegalRich text={text} /></p>;
  const [, before, bold, after] = m;
  return (
    <>
      {before.trim() && (
        <p className={LEGAL_TEXT}>
          <LegalRich text={before.trim()} />
        </p>
      )}
      <p className={`${CARD} text-xl font-semibold leading-snug`}>
        <LegalRich text={bold} />
      </p>
      {after.trim() && (
        <p className={LEGAL_TEXT}>
          <LegalRich text={after.trim()} />
        </p>
      )}
    </>
  );
}

/** The contact address as a mailto link, or a note that it isn't published yet (see lib/legal.ts). */
export function ContactEmail({ t }: { t: TFunction }) {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_LINK}>
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span className="italic">{t("legal.contact.emailPending")}</span>
  );
}

/**
 * Shared layout for /privacy, /terms and /security, set as a ticket (components/legal/LegalTicket.tsx): the stub holds the
 * title, the last-updated date, who runs the site, the introduction and the contents; the sheet holds the sections.
 * `summary` names a section whose list is the page's short version, set on a tinted card.
 */
export async function LegalPage({
  title,
  intro,
  sections,
  contactSection,
  summary,
}: {
  title: MessageKey;
  intro: readonly MessageKey[];
  sections: readonly LegalSection[];
  /** id of the section that should end with the contact address. */
  contactSection?: string;
  /** id of the section that opens the page as its short version. */
  summary?: string;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const back = sections.length > 3 ? t("legal.backToContents") : undefined;
  return (
    <LegalTicket>
      <LegalStub title={t(title)}>
        <p className="mt-5 text-base text-zinc-600">{t("legal.updated", { date: legalDate(locale) })}</p>
        <p className="mt-1 max-w-[40rem] text-base text-zinc-600">{operatorLine(t)}</p>
        {intro.map((k) => (
          <p key={k} className="mt-6 max-w-[40rem] text-xl leading-snug">
            <LegalRich text={t(k)} />
          </p>
        ))}
        {sections.length > 3 && (
          // Every section is one link to it. The columns fill top to bottom, so reading down a column is reading order;
          // the arrow follows its label and says the link moves down the page.
          <nav aria-labelledby="legal-contents" className="mt-10">
            <h2 id="legal-contents" className="font-display text-xl font-bold tracking-[-0.02em]">
              {t("legal.contents")}
            </h2>
            <ol className="mt-3 gap-x-10 sm:columns-2 lg:columns-3">
              {sections.map((s) => (
                <li key={s.id} className="break-inside-avoid">
                  <a href={`#${s.id}`} className="group -mx-2 inline-block rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-blue-50">
                    <span className="text-base font-semibold text-blue-700 underline underline-offset-4 group-hover:text-ink">{t(s.title)}</span>
                    <span aria-hidden className="ml-1.5 font-bold text-blue-700">
                      ↓
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </LegalStub>

      <LegalSheet>
        {sections.map((s) => {
          const body = s.body.map((b, i) =>
            typeof b === "string" ? (
              b === s.callout ? (
                <CalloutParagraph key={i} text={t(b as MessageKey)} />
              ) : (
                <p key={i} className={LEGAL_TEXT}>
                  <LegalRich text={t(b as MessageKey)} />
                </p>
              )
            ) : (
              <LegalList key={i}>
                {(b as readonly MessageKey[]).map((k) => (
                  <li key={k}>
                    <LegalRich text={t(k)} />
                  </li>
                ))}
              </LegalList>
            ),
          );
          return (
            <Section key={s.id} id={s.id} title={t(s.title)} back={back}>
              {s.id === summary ? <div className={CARD}>{body}</div> : body}
              {s.id === contactSection && (
                <p className={LEGAL_TEXT}>
                  {t("legal.contact.emailLabel")} <ContactEmail t={t} />
                </p>
              )}
            </Section>
          );
        })}
      </LegalSheet>
    </LegalTicket>
  );
}
