import type { Metadata } from "next";
import { Fragment } from "react";
import { SettingsLink } from "@/components/AccountPanel";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Help" };

const link = "font-semibold text-blue-700 underline underline-offset-4";

/** Renders <b>…</b> as bold and <s>…</s> as the Settings link, so each paragraph is one translatable string. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<b>.*?<\/b>|<s>.*?<\/s>)/).map((part, i) => {
        if (part.startsWith("<b>")) return <strong key={i}>{part.slice(3, -4)}</strong>;
        if (part.startsWith("<s>"))
          return (
            <SettingsLink key={i} className={link}>
              {part.slice(3, -4)}
            </SettingsLink>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export default async function HelpPage() {
  const t = await getT();
  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-3xl font-bold">{t("misc.help.title")}</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">{t("misc.help.accountQ")}</h2>
        <p className="text-zinc-600">
          <Rich text={t("misc.help.accountA")} />
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">{t("misc.help.dataQ")}</h2>
        <p className="text-zinc-600">{t("misc.help.dataA")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">{t("misc.help.shareQ")}</h2>
        <p className="text-zinc-600">
          <Rich text={t("misc.help.shareA")} />
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">{t("misc.help.teacherQ")}</h2>
        <p className="text-zinc-600">{t("misc.help.teacherA")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">{t("misc.help.remindersQ")}</h2>
        <p className="text-zinc-600">
          <Rich text={t("misc.help.remindersA")} />
        </p>
      </section>
    </div>
  );
}
