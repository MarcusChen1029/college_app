import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { FitSheet, type FitSheetRow } from "@/components/home/FitSheet";
import { Reveal } from "@/components/home/Reveal";
import { HomeStickyCta } from "@/components/HomeStickyCta";
import { SignInButton } from "@/components/SignInDialog";
import { CAMPUS, type CampusPhoto } from "@/lib/campus-photos";
import { getDeadlines, getEnglishSummaries, getSummaries } from "@/lib/data";
import { daysUntil, fmtInt, fmtUsd } from "@/lib/format";
import { collegeCounts, countFloor, hasSocialProof, seasonRows, SOCIAL_PROOF, type SeasonRow } from "@/lib/home-stats";
import type { Locale } from "@/lib/i18n/core";
import { getLocale, getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n";
import type { CollegeSummary, Deadline, EnglishSummary } from "@/lib/types";

// "Trakur" is short for "track ur college", the domain; the title and description say both.
export const metadata: Metadata = {
  title: { absolute: "Trakur: track ur college" },
  description:
    "Trakur (track-ur-college.com) builds your US college list: reach, target or safety from international admit rates, English test minimums and ED/EA/RD deadlines, each linked to an official source.",
  openGraph: { siteName: "Trakur", url: "https://www.track-ur-college.com" },
};

// The page is the application season's printed timetable: a ticket over campus photographs, then more pieces of the
// same stationery (a rate sheet, receipts, a list of names, a menu, a reply card). One frame and one pair of margins.
const FRAME = "mx-auto w-full max-w-7xl px-4 sm:px-8";
const DISPLAY = "font-display font-extrabold tracking-[-0.035em]";
const BIG_BUTTON =
  "inline-flex h-14 items-center justify-center rounded-full bg-ink px-8 text-base font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.98]";

// Public universities whose international admit rate is far below the overall one (CDS C1), plus Purdue for contrast.
const FIT_SLUGS = ["arkansas", "oklahoma-state", "kansas-state", "western-michigan", "unm", "idaho", "iowa", "purdue"];

const DATE_LOCALE: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };
const today = () => new Date().toISOString().slice(0, 10);

function fmtDay(iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(DATE_LOCALE[locale], { ...opts, timeZone: "UTC" });
}

const planLabel = (t: TFunction, plan: string) => t(`application.planLabel.${plan}` as MessageKey);
const nameOf = (c: CollegeSummary) => c.short_name ?? c.name;

function leftText(t: TFunction, days: number) {
  if (days <= 0) return t("status.deadline.today");
  if (days === 1) return t("status.deadline.tomorrow");
  return t("status.deadline.days", { n: days });
}

// ---------------------------------------------------------------------------------------------------------------- hero

function Timetable({ rows, locale, t }: { rows: SeasonRow[]; locale: Locale; t: TFunction }) {
  return (
    <table className="w-full text-left tabular-nums">
      <caption className="pb-3 text-left text-base font-semibold">
        {t("home.timetable.caption", { date: fmtDay(today(), locale, { weekday: "short", month: "short", day: "numeric" }) })}
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col" className="py-2 pr-4 font-semibold">
            {t("home.timetable.date")}
          </th>
          <th scope="col" className="py-2 pr-4 font-semibold">
            {t("home.timetable.plan")}
          </th>
          <th scope="col" className="hidden py-2 pr-4 font-semibold sm:table-cell">
            {t("home.timetable.colleges")}
          </th>
          <th scope="col" className="py-2 text-right font-semibold">
            {t("home.timetable.left")}
          </th>
        </tr>
      </thead>
      <tbody className="border-t-[3px] border-ink">
        {rows.map((r, i) => {
          const days = daysUntil(r.date);
          const more = r.count - r.names.length;
          const names = r.names.join(t("home.timetable.sep"));
          return (
            <tr key={`${r.date}-${r.plan}`} className="timetable-row border-b border-ink/15" style={{ "--i": i } as React.CSSProperties}>
              <td className="whitespace-nowrap py-3 pr-4 align-top font-display text-2xl font-extrabold leading-tight sm:text-[28px]">{fmtDay(r.date, locale)}</td>
              <td className="py-3 pr-4 align-top">
                <span className="block text-base font-semibold leading-snug">{planLabel(t, r.plan)}</span>
                <span className="block text-base leading-snug text-zinc-600">{more > 0 ? t("home.timetable.namesMore", { names, n: more }) : names}</span>
              </td>
              <td className="hidden whitespace-nowrap py-3 pr-4 align-top text-base sm:table-cell">{r.count === 1 ? t("home.timetable.countOne") : t("home.timetable.count", { n: r.count })}</td>
              <td className={`whitespace-nowrap py-3 text-right align-top text-base font-semibold ${days <= 7 ? "text-urgent" : days <= 21 ? "text-soon" : ""}`}>
                {leftText(t, days)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------------------------------------------------- slips

type SlipLine = { label: string; value: string };
type Slip = { slug: string; name: string; kind: string; photo: CampusPhoto; lines: SlipLine[]; note: string | null; height: number; tilt: number };

function buildSlips(t: TFunction, locale: Locale, bySlug: Map<string, CollegeSummary>, deadlines: Deadline[], english: Record<string, EnglishSummary>): Slip[] {
  const slips: Slip[] = [];
  const add = (slug: string, kind: string, photo: CampusPhoto, lines: (SlipLine | null)[], note: string | null, height: number, tilt = 0) => {
    const c = bySlug.get(slug);
    const kept = lines.filter((l): l is SlipLine => l != null);
    if (c && kept.length > 0) slips.push({ slug, name: nameOf(c), kind, photo, lines: kept, note, height, tilt });
  };
  const line = (label: string, value: string | number | null | undefined): SlipLine | null => (value == null || value === "" ? null : { label, value: String(value) });
  const pct = (n: number | null) => (n == null ? null : `${Number(n).toFixed(1)}%`);
  const cds = (c: CollegeSummary | undefined) => (c?.cds_year ? t("home.slip.cds", { year: c.cds_year }) : null);

  const umich = bySlug.get("umich");
  const umichDates = umich
    ? deadlines
        .filter((d) => d.institution_id === umich.id && d.kind === "application" && d.plan_key && d.due_date)
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
        .map((d) => line(planLabel(t, d.plan_key!), fmtDay(d.due_date!, locale)))
    : [];
  add("umich", t("home.slip.deadlines"), CAMPUS.michigan, umichDates, t("home.slip.admissionsSite"), 500);

  const purdue = bySlug.get("purdue");
  const en = purdue ? english[purdue.id] : undefined;
  add("purdue", t("home.slip.english"), CAMPUS.purdue, [line("TOEFL iBT", en?.toefl), line("IELTS", en?.ielts), line("Duolingo", en?.duolingo)], t("home.slip.admissionsSite"), 545, 1.5);

  const mit = bySlug.get("mit");
  add(
    "mit",
    t("home.slip.scores"),
    CAMPUS.mit,
    [line(t("home.slip.pct", { p: 25 }), mit?.sat_p25), line(t("home.slip.pct", { p: 50 }), mit?.sat_p50), line(t("home.slip.pct", { p: 75 }), mit?.sat_p75)],
    cds(mit),
    480,
  );

  const uiuc = bySlug.get("uiuc");
  const rank = (tier: string) => "SABCD".indexOf(tier[0]) * 3 - (tier.match(/\+/g)?.length ?? 0);
  const subjects = Object.entries(uiuc?.tiers ?? {})
    .filter(([k]) => k !== "general")
    .sort(([, a], [, b]) => rank(a) - rank(b))
    .slice(0, 3)
    .map(([k, tier]) => line(t(`match.tierCat.${k}` as MessageKey), tier));
  add("uiuc", t("home.slip.tiers"), CAMPUS.uiuc, [line(t("home.slip.overall"), uiuc?.general_tier), ...subjects], null, 560, -1);

  const ark = bySlug.get("arkansas");
  add("arkansas", t("home.slip.cost"), CAMPUS.arkansas, [line(t("home.slip.tuition"), ark?.tuition_intl_usd != null ? fmtUsd(ark.tuition_intl_usd) : null), line(t("home.slip.total"), ark?.total_coa_usd != null ? fmtUsd(ark.total_coa_usd) : null)], null, 505, 1);

  const col = bySlug.get("columbia");
  add(
    "columbia",
    t("home.slip.admissions"),
    CAMPUS.columbia,
    [
      line(t("home.slip.applicants"), col?.applicants != null ? fmtInt(col.applicants) : null),
      line(t("home.slip.admitted"), col?.admits != null ? fmtInt(col.admits) : null),
      line(t("home.slip.admitRate"), pct(col?.admit_rate ?? null)),
      line(t("home.slip.edRate"), pct(col?.ed_admit_rate ?? null)),
      line(t("home.slip.intlRate"), pct(col?.intl_admit_rate ?? null)),
    ],
    cds(col),
    530,
  );
  return slips;
}

function SlipCard({ slip, i, t }: { slip: Slip; i: number; t: TFunction }) {
  return (
    <li
      data-reveal
      className="slip bg-zinc-50 text-ink lg:flex-1"
      style={{ "--i": i, "--h": `${slip.height}px`, rotate: `${slip.tilt}deg` } as React.CSSProperties}
    >
      <div className="plate aspect-[3/2]">
        <Image src={slip.photo.src} alt={slip.photo.title} width={480} height={320} sizes="(min-width: 1024px) 17vw, (min-width: 640px) 33vw, 50vw" className="h-full w-full object-cover" />
      </div>
      <div className="p-3 sm:p-5">
        <p className="font-display text-xl font-bold leading-tight">{slip.name}</p>
        <p className="text-base font-semibold text-zinc-600">{slip.kind}</p>
        <div aria-hidden className="tear mt-3" />
        <dl className="mt-3 space-y-1.5 text-base tabular-nums">
          {slip.lines.map((l) => (
            <div key={l.label} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-zinc-700">{l.label}</dt>
              <dd className="font-semibold">{l.value}</dd>
            </div>
          ))}
        </dl>
        {slip.note && <p className="mt-3 text-[13px] text-zinc-600">{slip.note}</p>}
        <Link href={`/colleges/${slip.slug}`} className="mt-3 inline-block text-base font-semibold text-blue-700 underline underline-offset-4">
          {t("home.slip.open")}
        </Link>
      </div>
    </li>
  );
}

// -------------------------------------------------------------------------------------------------------------- menu

const MENU = [
  {
    group: "home.menu.list",
    items: [
      ["home.menu.checklist", "home.menu.checklistBody", "home.menu.free"],
      ["home.menu.reminders", "home.menu.remindersBody", "home.menu.free"],
      ["home.menu.compare", "home.menu.compareBody", "home.menu.free"],
    ],
  },
  {
    group: "home.menu.writing",
    items: [
      ["home.menu.essays", "home.menu.essaysBody", "home.menu.free"],
      ["home.menu.activities", "home.menu.activitiesBody", "home.menu.free"],
    ],
  },
  {
    group: "home.menu.tools",
    items: [
      ["home.menu.match", "home.menu.matchBody", "home.menu.free"],
      ["home.menu.quiz", "home.menu.quizBody", "home.menu.free"],
      ["home.menu.autofill", "home.menu.autofillBody", "home.menu.senior"],
    ],
  },
] as const satisfies readonly { group: MessageKey; items: readonly (readonly [MessageKey, MessageKey, MessageKey])[] }[];

// -------------------------------------------------------------------------------------------------------------- page

// Reads the language cookie; app/layout.tsx renders every page inside a Suspense boundary, so this streams after the shell.
export default async function Home() {
  const [t, locale, colleges, deadlines, english] = await Promise.all([getT(), getLocale(), getSummaries(), getDeadlines(), getEnglishSummaries()]);
  const bySlug = new Map(colleges.map((c) => [c.slug, c]));
  // Every count on this page comes from the loaded data (lib/home-stats.ts), never a typed-in number.
  const counts = collegeCounts(colleges);
  const totalPlus = countFloor(counts.total);
  const allSeason = seasonRows(deadlines, colleges, today(), 12);
  const bigRows = allSeason.filter((r) => r.count >= 3);
  const season = (bigRows.length >= 3 ? bigRows : allSeason).slice(0, 4);
  const fitRows: FitSheetRow[] = FIT_SLUGS.flatMap((slug) => {
    const c = bySlug.get(slug);
    return c ? [{ ...c, slug, name: nameOf(c), place: [c.city, c.state_region].filter(Boolean).join(", ") }] : [];
  });
  const slips = buildSlips(t, locale, bySlug, deadlines, english);
  const NAMES_SHOWN = 100;
  const NAMES_ON_PHONES = 44;
  const byPopularity = [...colleges].sort((a, b) => (b.applicants ?? 0) - (a.applicants ?? 0));
  const shownNames = byPopularity.slice(0, NAMES_SHOWN);
  const credits = [CAMPUS.berkeley, CAMPUS.mit, CAMPUS.michigan, CAMPUS.purdue, CAMPUS.uiuc, CAMPUS.arkansas, CAMPUS.columbia, CAMPUS.stanford];

  return (
    <>
      <Reveal />

      {/* The ticket: the season's next deadlines over a campus at dusk. */}
      <section className="relative isolate overflow-hidden bg-ink">
        <div aria-hidden className="absolute inset-0 -z-10">
          <Image src={CAMPUS.berkeley.src} alt="" fill priority sizes="100vw" className="hero-drift duotone-dim object-cover object-[50%_18%]" />
        </div>
        <div className={`${FRAME} pb-20 pt-[clamp(9rem,30svh,17rem)] sm:pb-28`}>
          <div className="ticket-in">
            <div className="ticket-body bg-zinc-50 px-5 pb-8 pt-6 text-ink sm:px-10 sm:pb-10 sm:pt-8">
              <h1 className={`${DISPLAY} text-[clamp(3.75rem,18vw,5.5rem)] leading-[0.86] tracking-[-0.045em] sm:flex sm:justify-between sm:text-[clamp(4rem,8.4vw,8.5rem)]`}>
                <span>Track</span> <span>ur</span> <span className="max-sm:block">college</span>
              </h1>
              <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-8">
                <div className="lg:col-span-5">
                  <p className="max-w-[30ch] text-xl font-medium leading-snug sm:text-2xl">{t("home.hero.body")}</p>
                  <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                    <Link href="/start" data-home-cta className={BIG_BUTTON}>
                      {t("home.build")}
                    </Link>
                    <Link href="/colleges" className="text-base font-semibold underline underline-offset-4 hover:text-blue-700">
                      {t("home.search.all", { n: totalPlus })}
                    </Link>
                  </div>
                </div>
                <div className="lg:col-span-7">
                  <Timetable rows={season} locale={locale} t={t} />
                </div>
              </div>
            </div>
            <div className="ticket-stub flex flex-col gap-2 bg-zinc-50 px-5 py-5 text-base text-ink sm:flex-row sm:items-center sm:justify-between sm:px-10">
              <p className="text-zinc-600">{t("home.timetable.source")}</p>
              <p>
                {t("home.haveAccount")}{" "}
                <SignInButton className="font-semibold text-blue-700 underline underline-offset-4">{t("home.signIn")}</SignInButton>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The live thing: one SAT score, two places to apply from, eight real admit rates. */}
      <section className="bg-blue-100 py-28 text-ink sm:py-40">
        <div className={FRAME}>
          <FitSheet rows={fitRows} />
        </div>
      </section>

      {/* Receipts: real numbers from six colleges, each with where it came from. */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <div aria-hidden className="absolute inset-0 -z-10">
          <Image src={CAMPUS.mit.src} alt="" fill sizes="100vw" className="duotone-dim object-cover object-[50%_35%]" />
        </div>
        <div className={`${FRAME} pt-28 sm:pt-40`}>
          <div className="max-w-3xl">
            <h2 data-reveal className={`${DISPLAY} text-[clamp(2.5rem,4.4vw,4rem)] leading-[0.95]`}>
              {t("home.slips.title")}
            </h2>
            <p data-reveal style={{ "--i": 1 } as React.CSSProperties} className="mt-6 max-w-xl text-xl leading-relaxed text-blue-50">
              {t("home.slips.body")}
            </p>
          </div>
        </div>
        <ul className="slips mx-auto mt-16 grid max-w-7xl grid-cols-2 gap-3 px-4 pb-16 sm:grid-cols-3 sm:px-8 lg:mt-24 lg:flex lg:max-w-none lg:items-end lg:pb-0">
          {slips.map((s, i) => (
            <SlipCard key={s.slug} slip={s} i={i} t={t} />
          ))}
        </ul>
      </section>

      {/* Every college by name, on one card the section cuts off. */}
      <section className="names-section relative overflow-hidden bg-zinc-100 pt-28 sm:pt-40">
        <div className={FRAME}>
          <div data-reveal className="names-card mx-auto w-full max-w-[880px] bg-white px-6 pb-16 pt-10 sm:px-14 sm:pt-14">
            <h2 className={`${DISPLAY} text-center text-[clamp(2.25rem,4.4vw,4rem)] leading-none`}>{t("home.names.title", { n: fmtInt(counts.total) })}</h2>
            <form action="/colleges" role="search" className="mx-auto mt-8 flex max-w-lg flex-col gap-2 sm:flex-row">
              <label htmlFor="home-search" className="sr-only">
                {t("home.search.label")}
              </label>
              <input
                id="home-search"
                name="q"
                type="search"
                placeholder={t("home.search.placeholder")}
                className="h-14 min-w-0 flex-1 rounded-full border-2 border-ink/20 bg-white px-6 text-base focus:border-ink focus:outline-none"
              />
              <button type="submit" className={BIG_BUTTON}>
                {t("home.search.submit")}
              </button>
            </form>
            <p className="mt-4 text-center">
              <Link href="/colleges" className="text-base font-semibold text-blue-700 underline underline-offset-4">
                {t("home.search.all", { n: totalPlus })}
              </Link>
            </p>
            <div className="plate mt-10 aspect-[16/9]">
              <Image src={CAMPUS.columbia.src} alt={CAMPUS.columbia.title} width={1600} height={900} sizes="(min-width: 1024px) 760px, 92vw" className="h-full w-full object-cover" />
            </div>
            <p className="mt-10 text-center text-base leading-[1.75] sm:text-xl">
              {shownNames.map((c, i) => (
                <span key={c.slug} className={i >= NAMES_ON_PHONES ? "max-sm:hidden" : undefined}>
                  <Link href={`/colleges/${c.slug}`} className="underline-offset-4 hover:underline">
                    {nameOf(c)}
                  </Link>
                  {i < shownNames.length - 1 ? " ·  " : ""}
                </span>
              ))}
            </p>
          </div>
        </div>
      </section>

      {/* The rest of the season, set as a menu. */}
      <section className="bg-blue-100 py-28 text-ink sm:py-40">
        <div className={`${FRAME} grid gap-12 lg:grid-cols-12 lg:gap-8`}>
          <div className="lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <div className="lg:sticky lg:top-28">
              <h2 data-reveal className={`${DISPLAY} text-[clamp(2.5rem,4.4vw,4rem)] leading-[0.95]`}>
                {t("home.more.title")}
              </h2>
              <p data-reveal style={{ "--i": 1 } as React.CSSProperties} className="mt-6 max-w-md text-xl leading-relaxed">
                {t("home.more.body")}
              </p>
              <Link data-reveal style={{ "--i": 2 } as React.CSSProperties} href="/tools" className={`${BIG_BUTTON} mt-8`}>
                {t("home.more.cta")}
              </Link>
            </div>
          </div>
          <div data-reveal className="paper-scallop bg-white px-6 pb-14 pt-16 sm:px-14 lg:col-span-6 lg:row-start-1">
            {MENU.map((g, gi) => (
              <div key={g.group} className={gi > 0 ? "mt-14" : ""}>
                <h3 className="text-center font-display text-[28px] font-bold tracking-tight">{t(g.group)}</h3>
                <ul className="mt-6 space-y-5">
                  {g.items.map(([name, body, value]) => (
                    <li key={name}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xl font-semibold leading-snug">{t(name)}</span>
                        <span className={`shrink-0 text-base font-semibold ${value === "home.menu.senior" ? "text-blue-700" : "text-zinc-600"}`}>{t(value)}</span>
                      </div>
                      <p className="mt-1 max-w-[42ch] text-base leading-snug text-zinc-600">{t(body)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof: real numbers and quotes only (lib/home-stats.ts); hidden while there are none. */}
      {hasSocialProof(SOCIAL_PROOF) && (
        <section className="bg-zinc-100 py-16">
          <div className={FRAME}>
            {SOCIAL_PROOF.students != null && <p className="text-center text-2xl font-bold">{t("home.proof.students", { n: fmtInt(SOCIAL_PROOF.students) })}</p>}
            {SOCIAL_PROOF.quotes.length > 0 && (
              <ul className="mt-8 grid gap-5 md:grid-cols-3">
                {SOCIAL_PROOF.quotes.map((q) => (
                  <li key={q.who} className="bg-white p-6">
                    <blockquote className="text-base leading-relaxed">“{q.text}”</blockquote>
                    <p className="mt-3 text-[13px] font-semibold text-zinc-600">{q.who}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* The reply card. */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className={`${FRAME} grid gap-14 pt-24 sm:pt-32 lg:grid-cols-12 lg:items-end lg:gap-8`}>
          <div className="lg:col-span-4 lg:pb-24">
            <p data-reveal className="text-2xl leading-snug">
              {t("home.cta.lead")}
            </p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <div data-reveal className="reply-card relative mx-auto max-w-[620px] bg-zinc-50 px-6 pb-28 pt-36 text-center text-ink sm:px-12 sm:pt-40">
              <div className="stamp plate absolute right-6 top-6 w-[72px] sm:w-[88px]">
                <Image src={CAMPUS.stanford.src} alt={CAMPUS.stanford.title} width={176} height={234} className="aspect-[3/4] w-full object-cover" />
              </div>
              <h2 className={`${DISPLAY} mx-auto max-w-[12ch] text-[clamp(2.25rem,4.4vw,4rem)] leading-[0.95]`}>{t("home.cta.title")}</h2>
              <p className="mt-4 text-xl">{t("home.cta.body")}</p>
              <Link href="/start" data-home-cta className={`${BIG_BUTTON} mt-8 w-full`}>
                {t("home.build")}
              </Link>
              <p className="mt-5 text-base">
                {t("home.haveAccount")}{" "}
                <SignInButton className="font-semibold text-blue-700 underline underline-offset-4">{t("home.signIn")}</SignInButton>
                {" · "}
                <Link href="/pricing" className="font-semibold text-blue-700 underline underline-offset-4">
                  {t("home.seePlans")}
                </Link>
              </p>
            </div>
          </div>
        </div>
        <div className={`${FRAME} relative bg-ink pb-10 pt-10`}>
          <p className="max-w-4xl text-[13px] leading-relaxed text-blue-200">
            {t("home.photos")}:{" "}
            {credits.map((p, i) => (
              <span key={p.src}>
                <a href={p.sourcePage} className="underline underline-offset-2 hover:text-white">
                  {p.title}
                </a>
                {" "}({p.creator},{" "}
                <a href={p.licenceUrl} className="underline underline-offset-2 hover:text-white">
                  {p.licence}
                </a>
                ){i < credits.length - 1 ? "; " : "."}
              </span>
            ))}
          </p>
        </div>
      </section>

      <Suspense>
        <HomeStickyCta />
      </Suspense>
    </>
  );
}
