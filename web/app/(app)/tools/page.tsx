import type { Metadata } from "next";
import Link from "next/link";
import { GradCap, Pencil, Star } from "@/components/Doodles";
import { FillerDownload } from "@/components/FillerDownload";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n";
import { buttonClass, toneClass } from "@/lib/ui";

export const metadata: Metadata = { title: "Tools" };

const card = "rounded-3xl border border-zinc-200 p-6";

const installSteps = (t: TFunction) => [
  t("tools.filler.step1"),
  <>
    {t("tools.filler.step2a")}
    <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px]">chrome://extensions</code>
    {t("tools.filler.step2b")}
  </>,
  <>
    {t("tools.filler.step3a")}
    <strong>{t("tools.filler.step3strong")}</strong>
    {t("tools.filler.step3b")}
  </>,
  <>
    {t("tools.filler.step4a")}
    <strong>{t("tools.filler.step4strong")}</strong>
    {t("tools.filler.step4b")}
  </>,
  t("tools.filler.step5"),
];

export default async function ToolsPage() {
  const t = await getT();
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="font-display text-3xl font-bold">{t("tools.title")}</h1>

      <ul className="divide-y divide-zinc-200 rounded-3xl border border-zinc-200">
        <ToolRow id="resume" art={<Pencil className="w-16" />} title={t("tools.resume.heading")} blurb={t("tools.resume.blurb")} href="/tools/resume" cta={t("tools.resume.open")} />
        <ToolRow id="match" art={<GradCap className="w-16" />} title={t("match.card.heading")} blurb={t("match.card.blurb")} href="/tools/match" cta={t("match.card.cta")} />
        <ToolRow id="interests" art={<Star className="w-12" />} title={t("tools.interests.heading")} blurb={t("tools.interests.blurb")} href="/tools/interests" cta={t("tools.interests.cta")} />
      </ul>

      <section aria-labelledby="filler-heading" className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="filler-heading" className="text-xl font-bold">
            {t("tools.filler.heading")}
          </h2>
          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass("progress")}`}>{t("tools.filler.beta")}</span>
        </div>
        <p className="text-sm text-zinc-600">
          {t("tools.filler.blurb")}
        </p>
        <p role="note" className={`rounded-xl border px-4 py-3 text-sm ${toneClass("soon")}`}>
          {t("tools.filler.note")}
        </p>
        <FillerDownload>
          <a href="/downloads/common-app-filler.zip" download className={buttonClass("primary")}>
            {t("tools.filler.download")}
          </a>
          <div className="space-y-2">
            <h3 className="text-sm font-bold">{t("tools.filler.howTo")}</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
              {installSteps(t).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </FillerDownload>
        <p className="text-sm text-zinc-600">
          <Link href="/application/transcript" className="font-semibold text-blue-700 underline-offset-4 hover:underline">
            {t("tools.filler.fillFirst")}
          </Link>
          {t("tools.filler.copiesIt")}
        </p>
      </section>
    </div>
  );
}

function ToolRow({ id, art, title, blurb, href, cta }: { id: string; art: React.ReactNode; title: string; blurb: string; href: string; cta: string }) {
  return (
    <li className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex w-16 shrink-0 justify-center">{art}</div>
      <div className="min-w-0 flex-1">
        <h2 id={`${id}-heading`} className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-zinc-600">{blurb}</p>
      </div>
      <Link href={href} className={`${buttonClass("secondary", "sm")} self-start sm:self-center`}>
        {cta}
      </Link>
    </li>
  );
}
