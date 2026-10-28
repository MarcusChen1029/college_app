import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { FitBadge, TierBadge } from "@/components/badges";
import { Calendar, GradCap, PaperPlane, Pencil, Scribble, Squiggle, Star, Wave } from "@/components/Doodles";
import { HomeStickyCta } from "@/components/HomeStickyCta";
import { SignInButton } from "@/components/SignInDialog";
import { DeadlineChip } from "@/components/StatusPill";
import { getDeadlines, getSummaries } from "@/lib/data";
import { computeFit, type StudentProfile } from "@/lib/fit";
import { daysUntil, fmtInt, fmtPct } from "@/lib/format";
import { collegeCounts, countFloor, hasSocialProof, nextDeadline, SOCIAL_PROOF, upcomingDeadlines } from "@/lib/home-stats";
import { getLocale, getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n";
import type { CollegeSummary, Deadline } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";

// "Trakur" is short for "track ur college", the domain; the title and description say both.
export const metadata: Metadata = {
  title: { absolute: "Trakur: track ur college" },
  description:
    "Trakur (track-ur-college.com) builds your US college list: reach, target or safety from international admit rates, English test minimums and ED/EA/RD deadlines, each linked to an official source.",
  openGraph: { siteName: "Trakur", url: "https://www.track-ur-college.com" },
};

const STEPS = [
  { title: "home.step1.title", body: "home.step1.body", tint: "bg-sun/70" },
  { title: "home.step2.title", body: "home.step2.body", tint: "bg-mint/70" },
  { title: "home.step3.title", body: "home.step3.body", tint: "bg-coral/60" },
] as const;

// Well-known colleges for the "start with" cards. They show admit rates only: a low tier letter here reads as "bad school".
const STRIP_SLUGS = ["stanford", "mit", "carnegie-mellon", "umich", "nyu", "uiuc", "purdue", "ohio-state", "penn-state", "asu"];

// The hero's example list: real colleges and dates, scored for a made-up student the card names as an example.
const PREVIEW_SLUGS = ["umich", "purdue", "asu"];
const PREVIEW_STUDENT: StudentProfile = { sat: 1400, international: true };

const bySlug = (all: readonly CollegeSummary[], slugs: readonly string[]) => slugs.flatMap((slug) => all.filter((c) => c.slug === slug));
const today = () => new Date().toISOString().slice(0, 10);

function rateLine(t: TFunction, c: CollegeSummary) {
  return c.intl_admit_rate != null ? t("home.intlAdmitRate", { rate: fmtPct(c.intl_admit_rate, 0) }) : t("home.admitRate", { rate: fmtPct(c.admit_rate, 0) });
}

function HeroPreview({ colleges, deadlines, t }: { colleges: CollegeSummary[]; deadlines: Deadline[]; t: TFunction }) {
  const now = today();
  // Application deadlines only (not aid or priority dates), labelled by plan: ED, EA, RD, Rolling.
  const applications = deadlines.filter((d) => d.kind === "application" && d.plan_key);
  return (
    <figure aria-label={t("home.preview.label")} className="relative mx-auto w-full max-w-md rounded-3xl border-2 border-ink/10 bg-white p-4 text-left shadow-xl shadow-blue-900/10 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t("home.preview.label")}</p>
      <p className="mt-1 text-sm text-zinc-600">{t("home.preview.student")}</p>
      <ul className="mt-4 space-y-3">
        {colleges.map((c) => {
          const fit = computeFit(PREVIEW_STUDENT, c);
          const next = nextDeadline(applications, c.id, now);
          return (
            <li key={c.slug} className="rounded-2xl border border-zinc-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-display font-bold leading-tight">{c.short_name ?? c.name}</span>
                {fit && <FitBadge fit={fit.fit} result={fit} />}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{rateLine(t, c)}</p>
              {next?.due_date && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                  {t("home.preview.next")}
                  <DeadlineChip date={next.due_date} days={daysUntil(next.due_date)} done={false} label={next.plan_key === "ROLLING" ? "Rolling" : next.plan_key!} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-3 text-xs text-zinc-500">{t("home.preview.note")}</figcaption>
    </figure>
  );
}

function CollegeStrip({ colleges, t }: { colleges: CollegeSummary[]; t: TFunction }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {colleges.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/colleges/${c.slug}`}
            className="group flex h-full flex-col gap-2 rounded-2xl border-2 border-ink/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-400"
          >
            <span className="text-xs text-zinc-500">{c.state_region}</span>
            <span className="font-display text-lg font-bold leading-tight group-hover:text-blue-600">{c.short_name ?? c.name}</span>
            <span className="mt-auto text-xs text-zinc-500">{t("home.admitRate", { rate: fmtPct(c.admit_rate, 0) })}</span>
            {c.intl_admit_rate != null && <span className="text-xs text-zinc-500">{t("home.intlAdmitRate", { rate: fmtPct(c.intl_admit_rate, 0) })}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Reads the language cookie; app/layout.tsx renders every page inside a Suspense boundary, so this streams after the shell.
export default async function Home() {
  const [t, locale, colleges, deadlines] = await Promise.all([getT(), getLocale(), getSummaries(), getDeadlines()]);
  // English puts spaces around the highlighted words; Chinese doesn't.
  const sp = locale === "en" ? " " : "";
  // Every count on this page comes from the loaded data (lib/home-stats.ts), never a typed-in number.
  const counts = collegeCounts(colleges);
  const usPlus = countFloor(counts.us);
  const totalPlus = countFloor(counts.total);
  const upcoming = upcomingDeadlines(deadlines, today()).length;
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-100" />
        <div aria-hidden className="absolute -left-32 top-64 h-80 w-80 rounded-full bg-blue-50" />
        <GradCap className="drift absolute left-[3%] top-10 hidden w-24 2xl:block" style={{ "--r": "-8deg" } as React.CSSProperties} />
        <PaperPlane className="drift absolute bottom-20 right-[3%] hidden w-24 2xl:block" style={{ "--r": "8deg", animationDelay: "-3s" } as React.CSSProperties} />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-12 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div className="text-center lg:text-left">
            <p className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{t("home.brand")}</p>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] sm:text-5xl xl:text-[3.5rem]">
              {t("home.hero.title", { n: usPlus })
                .split(/(<b>.*?<\/b>)/)
                .map((part, i) =>
                  part.startsWith("<b>") ? (
                    <span key={i} className="relative inline-block px-3">
                      {part.slice(3, -4)}
                      <Scribble className="absolute -inset-x-6 -inset-y-4 h-[calc(100%+2rem)] w-[calc(100%+3rem)]" />
                    </span>
                  ) : (
                    <Fragment key={i}>{part}</Fragment>
                  ),
                )}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-600 lg:mx-0">{t("home.hero.body")}</p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/start" className={buttonClass("primary")}>
                {t("home.getStarted")}
              </Link>
              <Link href="/colleges" className={buttonClass("secondary")}>
                {t("home.browse")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-zinc-500">
              {t("home.cta.body")}{" "}
              <Link href="/pricing" className="font-semibold text-blue-700 underline underline-offset-4">
                {t("home.seePlans")}
              </Link>
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {t("home.haveAccount")}{" "}
              <SignInButton className="font-semibold text-blue-700 underline underline-offset-4">{t("home.signIn")}</SignInButton>
            </p>
          </div>
          <HeroPreview colleges={bySlug(colleges, PREVIEW_SLUGS)} deadlines={deadlines} t={t} />
        </div>
        <Wave className="absolute bottom-0 left-0 h-14 w-full" fill="#e9f2fa" />
      </section>

      {/* How it works */}
      <section className="bg-zinc-100 pb-20 pt-10">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="max-w-xl text-4xl font-bold">{t("home.stepsTitle")}</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className={`rounded-3xl p-6 ${s.tint} ${i === 1 ? "md:translate-y-6" : ""}`}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white font-display text-lg font-bold">{i + 1}</span>
                <h3 className="mt-4 text-xl font-bold">{t(s.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/80">{t(s.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What's inside */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-24 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div>
          <h2 className="text-4xl font-bold">{t("home.tiersTitle")}</h2>
          <p className="mt-4 leading-relaxed text-zinc-600">{t("home.tiersBody")}</p>
          <Squiggle className="mt-6 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-4 rounded-3xl bg-blue-50 p-5">
            <div className="flex gap-1.5">
              {(["S", "A", "B", "C", "D"] as const).map((t) => (
                <TierBadge key={t} tier={t} />
              ))}
            </div>
            <p className="text-sm text-zinc-600">{t("home.tiersLegend")}</p>
          </div>
          <div className="rounded-3xl bg-lilac/40 p-5">
            <p className="font-display text-lg font-bold">{t("home.englishTitle")}</p>
            <p className="mt-1 text-sm text-ink/80">{t("home.englishBody")}</p>
          </div>
          <div className="rounded-3xl bg-sun/60 p-5">
            <p className="font-display text-lg font-bold">{t("home.sourcesTitle")}</p>
            <p className="mt-1 text-sm text-ink/80">{t("home.sourcesBody")}</p>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="bg-blue-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-4xl font-bold">{t("home.search.title", { n: totalPlus })}</h2>
          <p className="mt-3 text-zinc-600">{t("home.search.body", { us: counts.us, other: counts.other })}</p>
          <form action="/colleges" role="search" className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label htmlFor="home-search" className="sr-only">
              {t("home.search.label")}
            </label>
            <input
              id="home-search"
              name="q"
              type="search"
              placeholder={t("home.search.placeholder")}
              className="h-11 min-w-0 flex-1 rounded-full border-2 border-ink/15 bg-white px-5 text-[15px] focus:border-blue-400 focus:outline-none"
            />
            <button type="submit" className={buttonClass("primary")}>
              {t("home.search.submit")}
            </button>
          </form>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            <li>✓ {t("home.facts.colleges", { n: fmtInt(counts.total) })}</li>
            <li>✓ {t("home.facts.deadlines", { n: fmtInt(upcoming) })}</li>
            <li>✓ {t("home.facts.sources")}</li>
          </ul>

          <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
            <h3 className="text-xl font-bold">{t("home.search.examples")}</h3>
            <Link href="/colleges" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
              {t("home.search.all", { n: totalPlus })}
            </Link>
          </div>
          <div className="mt-4">
            <CollegeStrip colleges={bySlug(colleges, STRIP_SLUGS)} t={t} />
          </div>
        </div>
      </section>

      {/* Reminders and the autofill extension */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-4xl font-bold">{t("home.more.title")}</h2>
          <Link href="/tools" className={buttonClass("secondary", "sm")}>
            {t("home.more.cta")}
          </Link>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl bg-mint/50 p-6">
            <Calendar className="w-14" />
            <h3 className="mt-4 text-xl font-bold">{t("home.reminders.title")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/80">{t("home.reminders.body")}</p>
          </div>
          <Link href="/tools" className="group block rounded-3xl bg-lilac/40 p-6 transition hover:-translate-y-0.5">
            <Pencil className="w-20" />
            <span className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold group-hover:underline">{t("home.filler.title")}</span>
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass("progress")}`}>{t("home.filler.beta")}</span>
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-ink/80">{t("home.filler.body")}</span>
          </Link>
        </div>
      </section>

      {/* Social proof: real numbers and quotes only (lib/home-stats.ts); hidden while there are none. */}
      {hasSocialProof(SOCIAL_PROOF) && (
        <section className="bg-zinc-100 py-16">
          <div className="mx-auto max-w-6xl px-4">
            {SOCIAL_PROOF.students != null && <p className="text-center text-2xl font-bold">{t("home.proof.students", { n: fmtInt(SOCIAL_PROOF.students) })}</p>}
            {SOCIAL_PROOF.quotes.length > 0 && (
              <ul className="mt-8 grid gap-5 md:grid-cols-3">
                {SOCIAL_PROOF.quotes.map((q) => (
                  <li key={q.who} className="rounded-3xl bg-white p-6">
                    <blockquote className="text-sm leading-relaxed text-ink/80">“{q.text}”</blockquote>
                    <p className="mt-3 text-xs font-semibold text-zinc-500">{q.who}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Closing CTA */}
      <section className="relative overflow-hidden bg-ink py-20 text-center text-white">
        <Star className="absolute left-[12%] top-10 hidden w-10 md:block" />
        <Star className="absolute bottom-10 right-[14%] hidden w-14 md:block" />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2 className="text-4xl font-bold sm:text-5xl">
            {t("home.cta.before")}
            {sp}
            <span className="inline-block -rotate-2 rounded-lg bg-sun px-3 text-ink">{t("home.cta.highlight")}</span>
            {sp}
            {t("home.cta.after")}
          </h2>
          <p className="mt-4 text-blue-100">{t("home.cta.body")}</p>
          <Link href="/start" className="mt-8 inline-block rounded-full bg-sun px-8 py-3.5 font-semibold text-ink hover:bg-white">
            {t("home.getStarted")}
          </Link>
        </div>
      </section>

      <Suspense>
        <HomeStickyCta />
      </Suspense>
    </>
  );
}
