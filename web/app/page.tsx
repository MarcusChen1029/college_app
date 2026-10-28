import Link from "next/link";
import { Suspense } from "react";
import { TierBadge } from "@/components/badges";
import { Calendar, GradCap, PaperPlane, Pencil, Scribble, Squiggle, Star, Wave } from "@/components/Doodles";
import { getSummaries } from "@/lib/data";
import { fmtPct } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { buttonClass } from "@/lib/ui";

const STEPS = [
  { title: "home.step1.title", body: "home.step1.body", tint: "bg-sun/70" },
  { title: "home.step2.title", body: "home.step2.body", tint: "bg-mint/70" },
  { title: "home.step3.title", body: "home.step3.body", tint: "bg-coral/60" },
] as const;

// Well-known colleges spread across the tiers, so the strip also shows what S through D look like.
const STRIP_SLUGS = ["stanford", "mit", "carnegie-mellon", "umich", "nyu", "uiuc", "purdue", "ohio-state", "penn-state", "asu"];

async function CollegeStrip() {
  const all = await getSummaries();
  const colleges = STRIP_SLUGS.flatMap((slug) => all.filter((c) => c.slug === slug));
  const t = await getT();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {colleges.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/colleges/${c.slug}`}
            className="group flex h-full flex-col gap-2 rounded-2xl border-2 border-ink/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-400"
          >
            <span className="flex items-center justify-between">
              <TierBadge tier={c.general_tier} />
              <span className="text-xs text-zinc-500">{c.state_region}</span>
            </span>
            <span className="font-display text-lg font-bold leading-tight group-hover:text-blue-600">{c.short_name ?? c.name}</span>
            <span className="mt-auto text-xs text-zinc-500">{t("home.admitRate", { rate: fmtPct(c.admit_rate, 0) })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Reads the language cookie; app/layout.tsx renders every page inside a Suspense boundary, so this streams after the shell.
export default async function Home() {
  const t = await getT();
  // English puts spaces around the highlighted words; Chinese doesn't.
  const sp = (await getLocale()) === "en" ? " " : "";
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-100" />
        <div aria-hidden className="absolute -left-32 top-64 h-80 w-80 rounded-full bg-blue-50" />
        <GradCap className="drift absolute left-[5%] top-24 hidden w-28 xl:block" style={{ "--r": "-8deg" } as React.CSSProperties} />
        <Calendar className="drift absolute right-[6%] top-20 hidden w-24 xl:block" style={{ "--r": "6deg", animationDelay: "-2s" } as React.CSSProperties} />
        <Star className="drift absolute right-[20%] top-[26rem] hidden w-12 xl:block" style={{ animationDelay: "-4s" } as React.CSSProperties} />
        <Pencil className="drift absolute bottom-24 left-[8%] hidden w-36 xl:block" style={{ "--r": "-18deg", animationDelay: "-1s" } as React.CSSProperties} />
        <PaperPlane className="drift absolute bottom-20 right-[8%] hidden w-28 xl:block" style={{ "--r": "8deg", animationDelay: "-3s" } as React.CSSProperties} />

        <div className="relative mx-auto max-w-4xl px-4 pb-28 pt-20 text-center md:pt-28">
          <h1 className="text-5xl font-extrabold leading-[1.05] sm:text-6xl md:text-7xl">
            {t("home.hero.before")}
            {sp}
            <span className="relative inline-block px-5">
              {t("home.hero.highlight")}
              <Scribble className="absolute -inset-x-9 -inset-y-5 h-[calc(100%+2.5rem)] w-[calc(100%+4.5rem)]" />
            </span>
            {sp}
            {t("home.hero.after")}
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-600">{t("home.hero.body")}</p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/start" className={buttonClass("primary")}>
              {t("home.getStarted")}
            </Link>
            <Link href="/colleges" className={buttonClass("secondary")}>
              {t("home.browse")}
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500">{t("home.cta.body")}</p>
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

      {/* Colleges */}
      <section className="bg-blue-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-4xl font-bold">{t("home.startTen")}</h2>
            <Link href="/colleges" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
              {t("home.seeAll")}
            </Link>
          </div>
          <div className="mt-8">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white" />}>
              <CollegeStrip />
            </Suspense>
          </div>
        </div>
      </section>

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
    </>
  );
}
