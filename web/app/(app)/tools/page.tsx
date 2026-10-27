import type { Metadata } from "next";
import Link from "next/link";
import { FillerDownload } from "@/components/FillerDownload";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n";
import { buttonClass, toneClass } from "@/lib/ui";

export const metadata: Metadata = { title: "Tools" };

const card = "rounded-2xl border border-zinc-200 p-6";

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
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-bold">{t("tools.title")}</h1>

      <section aria-labelledby="resume-heading" className={`${card} space-y-3`}>
        <h2 id="resume-heading" className="text-xl font-bold">
          {t("tools.resume.heading")}
        </h2>
        <p className="text-sm text-zinc-600">{t("tools.resume.blurb")}</p>
        <Link href="/tools/resume" className={buttonClass("primary")}>
          {t("tools.resume.open")}
        </Link>
      </section>

      <section aria-labelledby="match-heading" className={`${card} space-y-3`}>
        <h2 id="match-heading" className="text-xl font-bold">
          {t("match.card.heading")}
        </h2>
        <p className="text-sm text-zinc-600">{t("match.card.blurb")}</p>
        <Link href="/tools/match" className={buttonClass("primary")}>
          {t("match.card.cta")}
        </Link>
      </section>

      <section aria-labelledby="interests-heading" className={`${card} space-y-3`}>
        <h2 id="interests-heading" className="text-xl font-bold">
          {t("tools.interests.heading")}
        </h2>
        <p className="text-sm text-zinc-600">{t("tools.interests.blurb")}</p>
        <Link href="/tools/interests" className={buttonClass("primary")}>
          {t("tools.interests.cta")}
        </Link>
      </section>

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
