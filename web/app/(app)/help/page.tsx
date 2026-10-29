import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense, type ReactNode } from "react";
import { SettingsLink } from "@/components/AccountPanel";
import { DeadlineFigure, FitFigure, HelpFigureSkeleton, PlanFigure, SourceFigure } from "@/components/help/HelpFigures";
import { planLimitsText } from "@/components/help/plan-text";
import { PageMark } from "@/components/start/PageMark";
import { HTML_LANG, type MessageKey } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Help" };

const LINK = "font-semibold text-blue-700 underline underline-offset-4 hover:text-ink";
const BIG_BUTTON =
  "inline-flex h-14 items-center justify-center rounded-full bg-ink px-8 text-base font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.98]";

/**
 * Renders <b>…</b> as bold, <s>…</s> as the Settings link and [label](/path) as a link on this site, so each answer
 * stays one translatable string.
 */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<b>.*?<\/b>|<s>.*?<\/s>|\[[^\]]+\]\(\/[^)]*\))/).map((part, i) => {
        if (part.startsWith("<b>")) return <strong key={i}>{part.slice(3, -4)}</strong>;
        if (part.startsWith("<s>"))
          return (
            <SettingsLink key={i} className={LINK}>
              {part.slice(3, -4)}
            </SettingsLink>
          );
        const m = part.match(/^\[([^\]]+)\]\((\/[^)]*)\)$/);
        if (m)
          return (
            <Link key={i} href={m[2]} className={LINK}>
              {m[1]}
            </Link>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

type Question = { id: string; q: MessageKey; a: MessageKey };

// The questions, grouped the way students arrive at them. Each answer is one translatable string (misc.ts).
const GROUPS: { id: string; title: MessageKey; items: Question[] }[] = [
  {
    id: "list",
    title: "misc.help.groupList",
    items: [
      { id: "account-needed", q: "misc.help.noAccountQ", a: "misc.help.noAccountA" },
      { id: "fit", q: "misc.help.fitQ", a: "misc.help.fitA" },
      { id: "how-many", q: "misc.help.planQ", a: "misc.help.planA" },
      { id: "reminders", q: "misc.help.remindersQ", a: "misc.help.remindersA" },
    ],
  },
  {
    id: "numbers",
    title: "misc.help.groupData",
    items: [
      { id: "data", q: "misc.help.dataQ", a: "misc.help.dataA" },
      { id: "wrong-number", q: "misc.help.wrongQ", a: "misc.help.wrongA" },
    ],
  },
  {
    id: "teachers",
    title: "misc.help.groupTeachers",
    items: [
      { id: "share", q: "misc.help.shareQ", a: "misc.help.shareA" },
      { id: "teacher-sees", q: "misc.help.teacherSeesQ", a: "misc.help.teacherSeesA" },
      { id: "teacher-accounts", q: "misc.help.teacherQ", a: "misc.help.teacherA" },
    ],
  },
  {
    id: "account",
    title: "misc.help.groupAccount",
    items: [
      { id: "account", q: "misc.help.accountQ", a: "misc.help.accountA" },
      { id: "language", q: "misc.help.languageQ", a: "misc.help.languageA" },
    ],
  },
];

// The sky ground behind the page; PageMark takes the mark off when the visitor leaves (see components/start/PageMark.tsx).
const MARKS = ["data-help-page"] as const;

// A reading page set as the home page's ticket: the stub carries the title and the four groups as its stops; below the
// notched perforation, each question sits beside its answer (the answer kept to about 60 characters a line).
export default async function HelpPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  // The plans answer is written from lib/plans.ts, whatever plans it holds.
  const vars = { plans: planLimitsText(PLANS, t, HTML_LANG[locale]) };
  // Beside four answers, the piece of the product it explains (components/help/HelpFigures.tsx), from real data.
  const figures: Record<string, ReactNode> = {
    fit: (
      <Suspense fallback={<HelpFigureSkeleton />}>
        <FitFigure t={t} />
      </Suspense>
    ),
    "how-many": <PlanFigure t={t} />,
    reminders: (
      <Suspense fallback={<HelpFigureSkeleton />}>
        <DeadlineFigure t={t} />
      </Suspense>
    ),
    data: (
      <Suspense fallback={<HelpFigureSkeleton />}>
        <SourceFigure t={t} />
      </Suspense>
    ),
  };

  return (
    <PageMark marks={MARKS} className="pb-4 sm:pt-4">
      <article className="mx-auto max-w-[64rem]">
        <header id="help-top" className="ticket-body scroll-mt-24 bg-white px-6 pb-10 pt-10 sm:px-12 sm:pb-12 sm:pt-12">
          <h1 className="font-display text-[clamp(3rem,7vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">{t("misc.help.title")}</h1>
          <p className="mt-5 max-w-[44ch] text-xl leading-snug">{t("misc.help.lead")}</p>
          <nav aria-label={t("misc.help.contents")} className="mt-10">
            {/* Each whole cell is the link: a tinted tile with the group, its question count and an arrow down to it. */}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {GROUPS.map((g) => (
                <li key={g.id} className="flex">
                  <a
                    href={`#help-${g.id}`}
                    className="group flex w-full items-start justify-between gap-3 rounded-2xl bg-blue-50 p-4 transition-[background-color,transform] duration-200 hover:bg-blue-100 active:scale-[0.98]"
                  >
                    <span>
                      <span className="block font-display text-lg font-bold leading-tight tracking-[-0.02em] text-blue-700 underline decoration-2 underline-offset-4 group-hover:text-ink">
                        {t(g.title)}
                      </span>
                      <span className="mt-1 block text-[15px] text-zinc-600">{t("misc.help.questionsN", { n: g.items.length })}</span>
                    </span>
                    <span aria-hidden className="text-xl font-bold leading-none text-blue-700 transition-transform duration-200 group-hover:translate-y-0.5">
                      ↓
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div className="ticket-stub bg-white px-6 pb-16 pt-12 sm:px-12">
          {GROUPS.map((g, gi) => (
            <section key={g.id} id={`help-${g.id}`} aria-labelledby={`help-${g.id}-title`} className="scroll-mt-24">
              {gi > 0 && <div aria-hidden className="tear mb-8 mt-6" />}
              <h2 id={`help-${g.id}-title`} className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em]">
                {t(g.title)}
              </h2>
              <div className="mt-6 space-y-8 lg:space-y-10">
                {g.items.map((it) => (
                  // Desktop: the question, with its figure under it, beside the answer. Phone: question, answer, figure.
                  <div key={it.id} id={it.id} className="scroll-mt-24 lg:grid lg:grid-cols-12 lg:gap-x-10">
                    <h3 className="font-display text-xl font-bold leading-snug tracking-[-0.02em] lg:col-span-5 lg:row-start-1">{t(it.q)}</h3>
                    <p className="mt-2 max-w-[34rem] text-lg leading-relaxed lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:mt-0">
                      <Rich text={t(it.a, vars)} />
                    </p>
                    {figures[it.id] && <div className="lg:col-span-5 lg:row-start-2">{figures[it.id]}</div>}
                  </div>
                ))}
              </div>
              <p className="mt-8">
                <a href="#help-top" className="text-base font-semibold text-blue-700 underline underline-offset-4 hover:text-ink">
                  <span aria-hidden>↑ </span>
                  {t("misc.help.backToQuestions")}
                </a>
              </p>
            </section>
          ))}

          <div aria-hidden className="tear mb-8 mt-6" />
          <section aria-labelledby="help-contact" className="bg-blue-50 px-6 py-8 sm:px-8 lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-10">
            <div className="lg:col-span-8">
              <h2 id="help-contact" className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em]">
                {t("misc.help.contactTitle")}
              </h2>
              <p className="mt-2 max-w-[34rem] text-lg leading-relaxed">{t("misc.help.contactBody")}</p>
            </div>
            <div className="mt-6 lg:col-span-4 lg:mt-0 lg:text-right">
              <Link href="/contact" className={BIG_BUTTON}>
                {t("misc.help.contactCta")}
              </Link>
            </div>
          </section>
        </div>
      </article>
    </PageMark>
  );
}
