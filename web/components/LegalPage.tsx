import { LegalRich } from "@/components/LegalRich";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { CONTACT_EMAIL, legalDate, OPERATOR_NAME } from "@/lib/legal";

/** "Trakur is run by …" with the operator's name, or without it while lib/legal.ts has none. */
export function operatorLine(t: TFunction): string {
  return OPERATOR_NAME ? t("legal.operator.named", { name: OPERATOR_NAME }) : t("legal.operator.unnamed");
}

/** One section of a legal page. Each body entry is a paragraph; an array is a bulleted list. */
export type LegalSection = { id: string; title: MessageKey; body: readonly (MessageKey | readonly MessageKey[])[] };

const link = "font-semibold text-blue-700 underline underline-offset-4";

/** The contact address as a mailto link, or a note that it isn't published yet (see lib/legal.ts). */
export function ContactEmail({ t }: { t: TFunction }) {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span className="italic">{t("legal.contact.emailPending")}</span>
  );
}

/** Shared layout for /privacy, /terms and /security: title, last-updated date, intro, contents, sections. */
export async function LegalPage({
  title,
  intro,
  sections,
  contactSection,
}: {
  title: MessageKey;
  intro: readonly MessageKey[];
  sections: readonly LegalSection[];
  /** id of the section that should end with the contact address. */
  contactSection?: string;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  return (
    <article className="max-w-2xl space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-bold">{t(title)}</h1>
        <p className="text-sm text-zinc-500">{t("legal.updated", { date: legalDate(locale) })}</p>
        <p className="text-zinc-600">{operatorLine(t)}</p>
        {intro.map((k) => (
          <p key={k} className="text-zinc-600">
            <LegalRich text={t(k)} />
          </p>
        ))}
      </header>

      {sections.length > 3 && (
        <nav aria-label={t("legal.contents")} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
          <h2 className="font-semibold">{t("legal.contents")}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-blue-700 underline-offset-4 hover:underline">
                  {t(s.title)}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {sections.map((s, n) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 space-y-3">
          <h2 id={`${s.id}-h`} className="text-xl font-bold">
            {sections.length > 3 && <span className="mr-2 text-zinc-400 tabular-nums">{n + 1}.</span>}
            {t(s.title)}
          </h2>
          {s.body.map((b, i) =>
            typeof b === "string" ? (
              <p key={i} className="text-zinc-600">
                <LegalRich text={t(b as MessageKey)} />
              </p>
            ) : (
              <ul key={i} className="list-disc space-y-2 pl-5 text-zinc-600">
                {(b as readonly MessageKey[]).map((k) => (
                  <li key={k}>
                    <LegalRich text={t(k)} />
                  </li>
                ))}
              </ul>
            ),
          )}
          {s.id === contactSection && (
            <p className="text-zinc-600">
              {t("legal.contact.emailLabel")} <ContactEmail t={t} />
            </p>
          )}
        </section>
      ))}
    </article>
  );
}
