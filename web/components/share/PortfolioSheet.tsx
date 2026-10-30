"use client";

// The portfolio as a sheet torn from the home page's ticket: a stub (whose, read-only, Print), a dotted tear, then the
// résumé set in the app's own type: the name large in the display face, sections told apart by space, weight and tone
// (no rules, no outline). Entries rise in turn on arrival (.timetable-row, off with reduced motion). Only what
// portfolio_view returns is shown: no email, phone or location.

import { bindShortWords, nameSize, revealDelay } from "@/components/share/report-logic";
import { ShareFrame } from "@/components/share/ShareFrame";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { buildResume } from "@/lib/resume";
import type { PortfolioView } from "@/lib/share-links";

const SECTION_KEY: Record<string, MessageKey> = {
  leadership: "share.section.leadership",
  service: "share.section.service",
  work: "share.section.work",
  programs: "share.section.programs",
  honors: "share.section.honors",
};


function Section({ title, style, children }: { title: string; style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 pt-10 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-8">
      <h2 className="timetable-row font-display text-xl font-extrabold leading-tight tracking-[-0.015em] text-ink" style={style}>
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function PortfolioSheet({ view, print }: { view: PortfolioView; print: React.ReactNode }) {
  const t = useT();
  const { header } = view;
  const resume = buildResume({ ...view.profile, activities: view.activities }, header, view.options);
  const name = header.fullName || t("share.portfolioFallback");
  const sub = [header.school, header.gradYear ? t("share.classOf", { year: header.gradYear }) : null].filter(Boolean).join(" · ");
  let i = 0;
  // Entrances: every delay is spread over at most 600ms however long the résumé is.
  const total = 4 + resume.sections.length + resume.sections.reduce((n, sec) => n + sec.items.length, 0);
  const step = (k: number) => ({ animationDelay: revealDelay(k, total) }) as React.CSSProperties;

  return (
    <ShareFrame>
      <div className="ticket-in mx-auto w-full max-w-[56rem] print:max-w-none">
        {/* The ticket's top part: whose sheet it is, with Print beside the name (stacked on phones). */}
        <header className="ticket-body timetable-row flex flex-col items-start gap-5 bg-zinc-50 px-6 pb-8 pt-8 sm:flex-row sm:items-start sm:justify-between sm:px-12 sm:pt-10 print:bg-white print:p-0 print:[mask:none]">
          {/* Its own container, so the name is sized to its own column (in at most two lines, no lone letter). */}
          <div className="@container w-full min-w-0 flex-1">
            <h1 style={{ ...step(i++), fontSize: nameSize(name) }} className="timetable-row font-display font-extrabold leading-[0.9] tracking-[-0.04em] [overflow-wrap:break-word]">
              {bindShortWords(name)}
            </h1>
            {sub && (
              <p className="timetable-row mt-4 text-xl text-zinc-700" style={step(i++)}>
                {sub}
              </p>
            )}
          </div>
          {print}
        </header>
        <article aria-label={name} className="ticket-stub bg-white px-6 pb-12 pt-8 text-[15px] leading-relaxed text-ink sm:px-12 sm:pb-14 sm:pt-10 print:border-0 print:p-0 print:[mask:none]">
          <div>
            {resume.education.lines.length > 0 && (
              <div className="timetable-row mt-6 rounded-xl bg-blue-50 px-5 py-4 text-[17px]" style={step(i++)}>
                <p className="sr-only">{t("share.education")}</p>
                {resume.education.lines.map((l) => (
                  <p key={l} className="tabular-nums">
                    {l}
                  </p>
                ))}
              </div>
            )}
          </div>

          {resume.sections.map((s) => (
            <Section key={s.key} style={step(i++)} title={SECTION_KEY[s.key] ? t(SECTION_KEY[s.key]) : s.title}>
              <ul className="space-y-5">
                {s.items.map((item, k) => (
                  <li key={k} className="timetable-row break-inside-avoid" style={step(i++)}>
                    <p className="text-[17px] leading-snug [overflow-wrap:break-word]">
                      <span className="font-semibold">{item.title}</span>
                      {item.organization && <span className="text-zinc-700">, {item.organization}</span>}
                    </p>
                    {item.meta && <p className="text-[15px] tabular-nums text-zinc-600">{item.meta}</p>}
                    {item.description && <p className="mt-1 max-w-[68ch] text-zinc-800">{item.description}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          ))}

          {resume.sections.length === 0 && (
            <div className="mt-10 rounded-2xl bg-blue-50 px-6 py-10 sm:px-10">
              <p className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{t("share.emptyTitle")}</p>
              <p className="mt-3 max-w-[46ch] text-lg text-zinc-700">{t("share.emptyBody", { name })}</p>
            </div>
          )}
        </article>
      </div>
      <p className="mx-auto max-w-[56rem] text-base text-zinc-700 print:hidden">
        {t("share.readOnly")} · {t("share.portfolioFooter")}
      </p>
    </ShareFrame>
  );
}
