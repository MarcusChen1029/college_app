import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { FitSheet, type FitSheetRow } from "@/components/home/FitSheet";
import { DaysLeft, TimetableCaption } from "@/components/home/LocalDay";
import { Reveal } from "@/components/home/Reveal";
import { HomeStickyCta } from "@/components/HomeStickyCta";
import { SignInButton } from "@/components/SignInDialog";
import { CAMPUS, type CampusPhoto } from "@/lib/campus-photos";
import { getDeadlines, getEnglishSummaries, getSummaries } from "@/lib/data";
import { fmtInt, fmtUsd } from "@/lib/format";
import { collegeCounts, hasSocialProof, seasonRows, SOCIAL_PROOF, type SeasonRow } from "@/lib/home-stats";
import type { Locale } from "@/lib/i18n/core";
import { getLocale, getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n";
import type { CollegeSummary, Deadline, EnglishSummary } from "@/lib/types";

// "Trakur" is short for "track ur college", the domain; the title and description say both.
export const metadata: Metadata = {
  title: { absolute: "Trakur: track ur college" },
  description:
    "Trakur (track-ur-college.com) builds your US college list: reach, target or safety from international admit rates, English test minimums and ED/EA/RD deadlines, each linked to an official source.",
  alternates: { canonical: "/" },
  openGraph: { siteName: "Trakur", url: "https://www.track-ur-college.com" },
};

// The page is the application season's printed timetable: a ticket beside a campus, then more pieces of the same
// stationery (a rate sheet, receipts, an index of names, a menu, a reply card). One frame and one pair of margins;
// every photograph in the same navy duotone (.duo in globals.css).
const FRAME = "mx-auto w-full max-w-7xl px-4 sm:px-8";
const DISPLAY = "font-display font-extrabold tracking-[-0.035em]";
const H2 = `${DISPLAY} text-[clamp(2.5rem,4.4vw,4rem)] leading-[0.95]`;
const BIG_BUTTON =
  "inline-flex h-14 shrink-0 items-center justify-center rounded-full bg-ink px-8 text-base font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.98]";
const LIGHT_BUTTON =
  "inline-flex h-14 shrink-0 items-center justify-center rounded-full bg-zinc-50 px-8 text-base font-semibold text-ink transition-[background-color,transform] duration-200 hover:bg-blue-100 active:scale-[0.98]";
const LINK = "font-semibold text-blue-700 underline underline-offset-4 hover:text-ink";

// Public universities whose international admit rate is far below the overall one (CDS C1), plus Purdue for contrast.
const FIT_SLUGS = ["arkansas", "oklahoma-state", "kansas-state", "western-michigan", "unm", "idaho", "iowa", "purdue"];
const INDEX_SIZE = 40;
const INDEX_ON_PHONES = 24;

const DATE_LOCALE: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };
const today = () => new Date().toISOString().slice(0, 10);

function fmtDay(iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(DATE_LOCALE[locale], { ...opts, timeZone: "UTC" });
}

const planLabel = (t: TFunction, plan: string) => t(`application.planLabel.${plan}` as MessageKey);
const nameOf = (c: CollegeSummary) => c.short_name ?? c.name;
const step = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** A campus photograph in the page's one treatment. The caller sizes the box. */
function Duo({ photo, className = "", sizes, priority = false, decorative = false }: { photo: CampusPhoto; className?: string; sizes: string; priority?: boolean; decorative?: boolean }) {
  return (
    <div className={`duo ${className}`}>
      {/* `priority` is deprecated in Next 16: the hero (the page's LCP) is fetched eagerly at high priority instead. */}
      <Image
        src={photo.src}
        alt={decorative ? "" : photo.title}
        fill
        loading={priority ? "eager" : undefined}
        fetchPriority={priority ? "high" : undefined}
        sizes={sizes}
        className="object-cover"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------- hero

function Timetable({ rows, locale, t }: { rows: SeasonRow[]; locale: Locale; t: TFunction }) {
  return (
    <table className="w-full text-left tabular-nums">
      <caption className="pb-3 text-left text-base font-semibold">
        <TimetableCaption serverToday={today()} locale={locale} />
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t("home.timetable.date")}</th>
          <th scope="col">{t("home.timetable.plan")}</th>
          <th scope="col">{t("home.timetable.colleges")}</th>
          <th scope="col">{t("home.timetable.left")}</th>
        </tr>
      </thead>
      <tbody className="border-t-[3px] border-ink">
        {rows.map((r, i) => {
          const more = r.count - r.names.length;
          const names = r.names.join(t("home.timetable.sep"));
          return (
            // taste-skill-ignore: the timetable is a real table; its rows keep their rules.
            <tr key={`${r.date}-${r.plan}`} className="timetable-row border-b border-ink/15" style={step(i)}>
              <td className="whitespace-nowrap py-3 pr-4 align-top font-display text-2xl font-extrabold leading-tight sm:text-[28px]">{fmtDay(r.date, locale)}</td>
              <td className="py-3 pr-4 align-top">
                <span className="block text-base font-semibold leading-snug">{planLabel(t, r.plan)}</span>
                <span className="block text-base leading-snug text-zinc-600">{more > 0 ? t("home.timetable.namesMore", { names, n: more }) : names}</span>
              </td>
              <td className="hidden whitespace-nowrap py-3 pr-4 align-top text-base sm:table-cell">
                {r.count === 1 ? t("home.timetable.countOne") : t("home.timetable.count", { n: r.count })}
              </td>
              <td className="whitespace-nowrap py-3 text-right align-top text-base font-semibold">
                <DaysLeft date={r.date} serverToday={today()} />
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
type Slip = { slug: string; name: string; kind: string; photo: CampusPhoto; lines: SlipLine[]; note: string | null; tilt: number };

function buildSlips(t: TFunction, locale: Locale, bySlug: Map<string, CollegeSummary>, deadlines: Deadline[], english: Record<string, EnglishSummary>): Slip[] {
  const slips: Slip[] = [];
  const add = (slug: string, kind: string, photo: CampusPhoto, lines: (SlipLine | null)[], note: string | null, tilt = 0) => {
    const c = bySlug.get(slug);
    const kept = lines.filter((l): l is SlipLine => l != null);
    if (c && kept.length > 0) slips.push({ slug, name: nameOf(c), kind, photo, lines: kept, note, tilt });
  };
  const line = (label: string, value: string | number | null | undefined): SlipLine | null => (value == null || value === "" ? null : { label, value: String(value) });
  const pct = (n: number | null | undefined) => (n == null ? null : `${Number(n).toFixed(1)}%`);
  const cds = (c: CollegeSummary | undefined) => (c?.cds_year ? t("home.slip.cds", { year: c.cds_year }) : null);

  const umich = bySlug.get("umich");
  const umichDates = umich
    ? deadlines
        .filter((d) => d.institution_id === umich.id && d.kind === "application" && d.plan_key && d.due_date)
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
        .map((d) => line(d.plan_key === "ROLLING" ? planLabel(t, d.plan_key) : d.plan_key!, fmtDay(d.due_date!, locale)))
    : [];
  add("umich", t("home.slip.deadlines"), CAMPUS.michigan, umichDates, t("home.slip.admissionsSite"));

  const columbia = bySlug.get("columbia");
  const en = columbia ? english[columbia.id] : undefined;
  add(
    "columbia",
    t("home.slip.english"),
    CAMPUS.columbia,
    [line("TOEFL iBT", en?.toefl), line(t("home.slip.toeflNew"), en?.toefl2026), line("IELTS", en?.ielts), line("Duolingo", en?.duolingo)],
    t("home.slip.admissionsSite"),
    1.5,
  );

  const mit = bySlug.get("mit");
  add(
    "mit",
    t("home.slip.scores"),
    CAMPUS.mit,
    [line(t("home.slip.pct", { p: 25 }), mit?.sat_p25), line(t("home.slip.pct", { p: 50 }), mit?.sat_p50), line(t("home.slip.pct", { p: 75 }), mit?.sat_p75)],
    cds(mit),
  );

  const uiuc = bySlug.get("uiuc");
  const rank = (tier: string) => "SABCD".indexOf(tier[0]) * 3 - (tier.match(/\+/g)?.length ?? 0);
  const subjects = Object.entries(uiuc?.tiers ?? {})
    .filter(([k]) => k !== "general")
    .sort(([, a], [, b]) => rank(a) - rank(b))
    .slice(0, 3)
    .map(([k, tier]) => line(t(`match.tierCat.${k}` as MessageKey), tier));
  add("uiuc", t("home.slip.tiers"), CAMPUS.uiuc, [line(t("home.slip.overall"), uiuc?.general_tier), ...subjects], null, -1);

  const ark = bySlug.get("arkansas");
  add(
    "arkansas",
    t("home.slip.cost"),
    CAMPUS.arkansas,
    [line(t("home.slip.tuition"), ark?.tuition_intl_usd != null ? fmtUsd(ark.tuition_intl_usd) : null), line(t("home.slip.total"), ark?.total_coa_usd != null ? fmtUsd(ark.total_coa_usd) : null)],
    null,
    1,
  );

  const purdue = bySlug.get("purdue");
  add(
    "purdue",
    t("home.slip.admissions"),
    CAMPUS.purdue,
    [
      line(t("home.slip.applicants"), purdue?.applicants != null ? fmtInt(purdue.applicants) : null),
      line(t("home.slip.admitted"), purdue?.admits != null ? fmtInt(purdue.admits) : null),
      line(t("home.slip.admitRate"), pct(purdue?.admit_rate)),
      line(t("home.slip.intlRate"), pct(purdue?.intl_admit_rate)),
    ],
    cds(purdue),
  );
  return slips;
}

function SlipCard({ slip, i, t }: { slip: Slip; i: number; t: TFunction }) {
  return (
    <li data-reveal className="slip torn bg-zinc-50 pb-4 text-ink lg:flex-1" style={{ ...step(i), rotate: `${slip.tilt}deg` }}>
      <Duo photo={slip.photo} sizes="(min-width: 1024px) 17vw, (min-width: 640px) 45vw, 100vw" className="aspect-[4/1] sm:aspect-[3/2]" />
      <div className="p-4 sm:p-5 lg:p-4">
        <p className="font-display text-xl font-bold leading-tight">{slip.name}</p>
        <p className="text-base font-semibold text-zinc-600">{slip.kind}</p>
        <div aria-hidden className="tear mt-3" />
        <dl className="mt-3 space-y-1.5 text-base tabular-nums">
          {slip.lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-3">
              <dt>{l.label}</dt>
              <dd className="shrink-0 font-semibold">{l.value}</dd>
            </div>
          ))}
        </dl>
        {slip.note && <p className="mt-3 text-[13px] text-zinc-600">{slip.note}</p>}
        <Link href={`/colleges/${slip.slug}`} className={`mt-3 inline-block text-base ${LINK}`}>
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

// The page's data (and the language cookie) load inside the page's own Suspense boundary, as on /colleges: the shell
// prerenders and the timetable streams in, with the hero's navy ground holding the space meanwhile.
export default function Home() {
  return (
    <Suspense fallback={<div aria-hidden className="min-h-[100svh] bg-ink" />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const [t, locale, colleges, deadlines, english] = await Promise.all([getT(), getLocale(), getSummaries(), getDeadlines(), getEnglishSummaries()]);
  const bySlug = new Map(colleges.map((c) => [c.slug, c]));
  // Every count on this page comes from the loaded data (lib/home-stats.ts), never a typed-in number.
  const total = fmtInt(collegeCounts(colleges).total);
  const allSeason = seasonRows(deadlines, colleges, today(), 12);
  const bigRows = allSeason.filter((r) => r.count >= 3);
  const season = (bigRows.length >= 3 ? bigRows : allSeason).slice(0, 4);
  const fitRows: FitSheetRow[] = FIT_SLUGS.flatMap((slug) => {
    const c = bySlug.get(slug);
    return c ? [{ ...c, slug, name: nameOf(c), place: [c.city, c.state_region].filter(Boolean).join(", ") }] : [];
  });
  const slips = buildSlips(t, locale, bySlug, deadlines, english);
  // The index: the most-applied-to colleges, alphabetical, the way a book's index reads.
  const index = [...colleges]
    .sort((a, b) => (b.applicants ?? 0) - (a.applicants ?? 0))
    .slice(0, INDEX_SIZE)
    .map((c, i) => ({ c, phone: i < INDEX_ON_PHONES }))
    .sort((a, b) => nameOf(a.c).localeCompare(nameOf(b.c), "en"));
  const credits = [CAMPUS.berkeley, CAMPUS.stanford, CAMPUS.michigan, CAMPUS.columbia, CAMPUS.mit, CAMPUS.uiuc, CAMPUS.arkansas, CAMPUS.purdue, CAMPUS.princeton];

  return (
    <>
      <Reveal />

      {/* The ticket beside the campus: the season's next deadlines. */}
      <section className="relative isolate overflow-hidden bg-ink">
        <Duo
          photo={CAMPUS.berkeley}
          decorative
          priority
          sizes="(min-width: 1024px) 54vw, 100vw"
          className="hero-photo absolute inset-x-0 top-0 -z-10 h-[44svh] lg:inset-y-0 lg:left-[46%] lg:h-auto"
        />
        <div className={`${FRAME} pb-20 pt-[36svh] sm:pb-28 lg:pt-20`}>
          <div className="ticket-in lg:w-[66%]">
            <div className="ticket-body bg-zinc-50 px-5 pb-8 pt-6 text-ink sm:px-10 sm:pb-10 sm:pt-8">
              <h1 className={`${DISPLAY} text-[clamp(3.75rem,18vw,5.5rem)] leading-[0.86] tracking-[-0.045em] sm:text-[clamp(5rem,11vw,10rem)]`}>
                Track ur
                <br />
                college
              </h1>
              <div className="mt-8 flex flex-col gap-8 lg:mt-10 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-[30ch] text-xl font-medium leading-snug sm:text-2xl">{t("home.hero.body")}</p>
                <div className="flex flex-col items-start gap-3 lg:items-end">
                  <Link href="/start" data-home-cta className={BIG_BUTTON}>
                    {t("account.getStarted")}
                  </Link>
                  <Link href="/colleges" className={`text-base ${LINK}`}>
                    {t("home.search.all", { n: total })}
                  </Link>
                </div>
              </div>
              <div className="mt-10 lg:mt-12">
                <Timetable rows={season} locale={locale} t={t} />
              </div>
            </div>
            <div className="ticket-stub flex flex-col gap-2 bg-zinc-50 px-5 py-5 text-base text-ink sm:flex-row sm:items-center sm:justify-between sm:px-10">
              <p className="text-zinc-600">{t("home.timetable.source")}</p>
              <p>
                {t("home.haveAccount")} <SignInButton className={LINK}>{t("home.signIn")}</SignInButton>
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

      {/* Receipts standing on a campus lawn: real numbers from six colleges, each with where it came from. */}
      <section className="relative isolate overflow-hidden bg-ink pb-24 text-white sm:pb-32">
        <Duo photo={CAMPUS.stanford} decorative sizes="100vw" className="absolute inset-x-0 bottom-0 top-[30%] -z-10 sm:top-[38%]" />
        <div className={`${FRAME} pt-28 sm:pt-40`}>
          <h2 data-reveal className={`${H2} max-w-3xl`}>
            {t("home.slips.title")}
          </h2>
          <p data-reveal style={step(1)} className="mt-6 max-w-xl text-xl leading-relaxed">
            {t("home.slips.body")}
          </p>
        </div>
        <ul className="mx-auto mt-16 grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-8 md:grid-cols-3 lg:mt-24 lg:flex lg:items-end lg:gap-3">
          {slips.map((s, i) => (
            <SlipCard key={s.slug} slip={s} i={i} t={t} />
          ))}
        </ul>
      </section>

      {/* An index of names, the way a book ends. */}
      <section className="overflow-hidden bg-zinc-100 py-28 text-ink sm:py-40">
        <div className={FRAME}>
          <div data-reveal className="names-card paper-scallop bg-white px-6 pb-14 pt-16 sm:px-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <h2 className={H2}>{t("home.names.title", { n: total })}</h2>
              <form action="/colleges" role="search" className="flex w-full max-w-lg flex-col gap-2 sm:flex-row">
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
            </div>
            <ul className="mt-12 columns-2 gap-x-6 text-lg leading-snug sm:columns-3 sm:gap-x-8 sm:text-xl lg:columns-4">
              {index.map(({ c, phone }) => (
                <li key={c.slug} className={`mb-3 break-inside-avoid pl-4 -indent-4 ${phone ? "" : "max-sm:hidden"}`}>
                  <Link href={`/colleges/${c.slug}`} className="underline-offset-4 hover:underline">
                    {nameOf(c)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-10">
              <Link href="/colleges" className={`text-xl ${LINK}`}>
                {t("home.search.all", { n: total })}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* The rest of the season, set as a price list in light ink on navy. */}
      <section className="bg-ink py-28 text-white sm:py-40">
        <div className={FRAME}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 data-reveal className={H2}>
                {t("home.more.title")}
              </h2>
              <p data-reveal style={step(1)} className="mt-6 max-w-xl text-xl leading-relaxed text-blue-100">
                {t("home.more.body")}
              </p>
            </div>
            <Link data-reveal style={step(2)} href="/tools" className={`${LIGHT_BUTTON} self-start lg:self-end`}>
              {t("home.more.cta")}
            </Link>
          </div>
          <div className="mt-16 grid gap-x-12 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {MENU.map((g, gi) => (
              <div key={g.group} data-reveal style={step(gi)} className={gi === MENU.length - 1 ? "md:col-span-2 lg:col-span-1" : undefined}>
                <h3 className="font-display text-[28px] font-bold tracking-tight text-blue-200">{t(g.group)}</h3>
                <ul className="mt-6 space-y-7">
                  {g.items.map(([name, body, value]) => (
                    <li key={name}>
                      <div className="flex items-baseline gap-3">
                        <span className="text-2xl font-semibold leading-snug">{t(name)}</span>
                        <span aria-hidden className="leader leader-light min-w-6 flex-1 max-sm:hidden" />
                        <span className={`ml-auto shrink-0 text-base font-semibold ${value === "home.menu.senior" ? "text-sun" : "text-blue-200"}`}>{t(value)}</span>
                      </div>
                      <p className="mt-1 text-base leading-snug text-blue-100">{t(body)}</p>
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
      <section className="relative overflow-hidden bg-blue-200 text-ink">
        <div className={`${FRAME} grid gap-14 pt-24 sm:pt-32 lg:grid-cols-12 lg:gap-8`}>
          <div className="lg:col-span-5 lg:pt-36">
            <p data-reveal className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-[28px] lg:text-[32px]">
              {t("home.cta.lead")}
            </p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <div data-reveal style={step(1)} className="reply-card relative mx-auto max-w-[620px] bg-zinc-50 px-6 pb-24 pt-40 text-center text-ink sm:px-12 sm:pt-48">
              <div className="stamp absolute right-5 top-5 w-[96px] sm:w-[124px]">
                <Duo photo={CAMPUS.princeton} sizes="(min-width: 640px) 124px, 96px" className="aspect-[4/5]" />
              </div>
              <h2 className={`${H2} mx-auto max-w-[12ch]`}>{t("home.cta.title")}</h2>
              <p className="mt-4 text-xl">{t("home.cta.body")}</p>
              <Link href="/start" data-home-cta className={`${BIG_BUTTON} mt-8 w-full`}>
                {t("account.getStarted")}
              </Link>
              <p className="mt-5 text-base">
                {t("home.haveAccount")} <SignInButton className={LINK}>{t("home.signIn")}</SignInButton>
                {" · "}
                <Link href="/pricing" className={LINK}>
                  {t("home.seePlans")}
                </Link>
              </p>
            </div>
          </div>
        </div>
        <div className={`${FRAME} pb-12 pt-12`}>
          <details className="max-w-4xl text-[13px] leading-relaxed">
            <summary className="cursor-pointer text-base font-semibold">{t("home.photosSummary")}</summary>
            <p className="mt-3">
              {t("home.photos")}:{" "}
              {credits.map((p, i) => (
                <span key={p.src}>
                  <a href={p.sourcePage} className="underline underline-offset-2 hover:text-blue-700">
                    {p.title}
                  </a>{" "}
                  ({p.creator},{" "}
                  <a href={p.licenceUrl} className="underline underline-offset-2 hover:text-blue-700">
                    {p.licence}
                  </a>
                  ){i < credits.length - 1 ? "; " : "."}
                </span>
              ))}
            </p>
          </details>
        </div>
      </section>

      <Suspense>
        <HomeStickyCta />
      </Suspense>
    </>
  );
}
