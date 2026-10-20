import Link from "next/link";
import { Suspense } from "react";
import { TierBadge } from "@/components/badges";
import { Calendar, GradCap, PaperPlane, Pencil, Scribble, Squiggle, Star, Wave } from "@/components/Doodles";
import { getSummaries } from "@/lib/data";
import { fmtPct } from "@/lib/format";

const STEPS = [
  {
    title: "Tell us your numbers",
    body: "GPA, SAT or ACT, and whether you are applying from outside the US. Skip anything you don't have yet.",
    tint: "bg-sun/70",
  },
  {
    title: "See where you fit",
    body: "Every college is marked reach, target or safety for you, with the reasoning shown next to the label.",
    tint: "bg-mint/70",
  },
  {
    title: "Track every deadline",
    body: "Pick ED, EA or RD per college, tick off essays and recommendations, and get emailed before dates arrive.",
    tint: "bg-coral/60",
  },
];

async function CollegeStrip() {
  const colleges = await getSummaries();
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
            <span className="mt-auto text-xs text-zinc-500">Admit rate {fmtPct(c.admit_rate, 0)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-100" />
        <div aria-hidden className="absolute -left-32 top-64 h-80 w-80 rounded-full bg-blue-50" />
        <GradCap className="drift absolute left-[5%] top-24 hidden w-28 md:block" style={{ "--r": "-8deg" } as React.CSSProperties} />
        <Calendar className="drift absolute right-[6%] top-20 hidden w-24 md:block" style={{ "--r": "6deg", animationDelay: "-2s" } as React.CSSProperties} />
        <Star className="drift absolute right-[20%] top-[26rem] hidden w-12 md:block" style={{ animationDelay: "-4s" } as React.CSSProperties} />
        <Pencil className="drift absolute bottom-24 left-[8%] hidden w-36 md:block" style={{ "--r": "-18deg", animationDelay: "-1s" } as React.CSSProperties} />
        <PaperPlane className="drift absolute bottom-20 right-[8%] hidden w-28 md:block" style={{ "--r": "8deg", animationDelay: "-3s" } as React.CSSProperties} />

        <div className="relative mx-auto max-w-4xl px-4 pb-28 pt-20 text-center md:pt-28">
          <h1 className="text-5xl font-extrabold leading-[1.05] sm:text-6xl md:text-7xl">
            Build your{" "}
            <span className="relative inline-block px-3">
              college list
              <Scribble className="absolute -inset-x-6 -inset-y-3 h-[calc(100%+1.5rem)] w-[calc(100%+3rem)]" />
            </span>{" "}
            without the chaos.
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-600">
            Compare US colleges by tier, test scores, deadlines and English requirements. Made for students applying from anywhere, and
            every number links to its official source.
          </p>

          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 rounded-[2rem] border-2 border-ink bg-white p-2 shadow-[6px_6px_0_0_#cdeafc] sm:flex-row sm:rounded-full">
            <span className="px-5 py-2 font-display text-lg font-bold sm:flex-1 sm:text-left">Ready when you are</span>
            <Link href="/colleges" className="rounded-full border-2 border-blue-200 px-5 py-2.5 text-sm font-semibold hover:bg-blue-50">
              Browse colleges
            </Link>
            <Link href="/start" className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              Get started now
            </Link>
          </div>
        </div>
        <Wave className="absolute bottom-0 left-0 h-14 w-full" fill="#e9f2fa" />
      </section>

      {/* How it works */}
      <section className="bg-zinc-100 pb-20 pt-10">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="max-w-xl text-4xl font-bold">Three steps from &ldquo;where do I even start?&rdquo; to a finished list.</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className={`rounded-3xl p-6 ${s.tint} ${i === 1 ? "md:translate-y-6" : ""}`}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white font-display text-lg font-bold">{i + 1}</span>
                <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/80">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What's inside */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-24 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div>
          <h2 className="text-4xl font-bold">Tiers you can actually argue with.</h2>
          <p className="mt-4 leading-relaxed text-zinc-600">
            Each college gets an overall tier and a tier per subject, with a written reason. Nothing is a mystery score.
          </p>
          <Squiggle className="mt-6 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-4 rounded-3xl bg-blue-50 p-5">
            <div className="flex gap-1.5">
              {(["S", "A", "B", "C", "D"] as const).map((t) => (
                <TierBadge key={t} tier={t} />
              ))}
            </div>
            <p className="text-sm text-zinc-600">S is the top handful nationally in a field. D is outside the top 100.</p>
          </div>
          <div className="rounded-3xl bg-lilac/40 p-5">
            <p className="font-display text-lg font-bold">English tests, decoded</p>
            <p className="mt-1 text-sm text-ink/80">TOEFL (old and new scale), IELTS, Duolingo, PTE and Cambridge, side by side.</p>
          </div>
          <div className="rounded-3xl bg-sun/60 p-5">
            <p className="font-display text-lg font-bold">Sources on everything</p>
            <p className="mt-1 text-sm text-ink/80">Common Data Set or admissions page. If we couldn&apos;t confirm it, we leave it blank.</p>
          </div>
        </div>
      </section>

      {/* Colleges */}
      <section className="bg-blue-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-4xl font-bold">Start with these ten</h2>
            <Link href="/colleges" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
              See all colleges
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
            Your list, <span className="marker text-ink">sorted</span> by tonight.
          </h2>
          <p className="mt-4 text-blue-100">It takes about a minute, and you don&apos;t need an account.</p>
          <Link href="/start" className="mt-8 inline-block rounded-full bg-sun px-8 py-3.5 font-semibold text-ink hover:bg-white">
            Get started now
          </Link>
        </div>
      </section>
    </>
  );
}
