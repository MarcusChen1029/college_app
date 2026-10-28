import type { Metadata } from "next";
import { ContactEmail, operatorLine } from "@/components/LegalPage";
import { LegalRich } from "@/components/LegalRich";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const t = await getT();
  return (
    <div className="max-w-2xl space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-bold">{t("legal.contact.title")}</h1>
        <p className="text-zinc-600">{t("legal.contact.intro")}</p>
      </header>

      <section className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-lg">
          <span className="font-semibold">{t("legal.contact.emailLabel")}</span> <ContactEmail t={t} />
        </p>
        <p className="text-sm text-zinc-600">{operatorLine(t)}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t("legal.contact.topicsTitle")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-zinc-600">
          {(["legal.contact.topicPrivacy", "legal.contact.topicSecurity", "legal.contact.topicData", "legal.contact.topicBug"] as const).map((k) => (
            <li key={k}>
              <LegalRich text={t(k)} />
            </li>
          ))}
        </ul>
        <p className="font-medium text-zinc-700">{t("legal.contact.never")}</p>
        <p className="text-zinc-600">
          <LegalRich text={t("legal.contact.help")} />
        </p>
      </section>
    </div>
  );
}
