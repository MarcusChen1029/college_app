import type { Metadata } from "next";
import Link from "next/link";
import { FillerDownload } from "@/components/FillerDownload";
import { buttonClass, toneClass } from "@/lib/ui";

export const metadata: Metadata = { title: "Tools" };

const card = "rounded-2xl border border-zinc-200 p-6";

const INSTALL_STEPS = [
  "Unzip the file.",
  <>
    Open <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px]">chrome://extensions</code> in Chrome.
  </>,
  <>
    Turn on <strong>Developer mode</strong> (top right).
  </>,
  <>
    Click <strong>Load unpacked</strong> and choose the unzipped folder.
  </>,
  "Click the extension's icon, open the side panel, and sign in.",
];

export default function ToolsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-bold">Tools</h1>

      <section aria-labelledby="resume-heading" className={`${card} space-y-3`}>
        <h2 id="resume-heading" className="text-xl font-bold">
          Résumé generator
        </h2>
        <p className="text-sm text-zinc-600">Build a one-page résumé from your activities and profile.</p>
        <Link href="/tools/resume" className={buttonClass("primary")}>
          Open résumé generator
        </Link>
      </section>

      <section aria-labelledby="filler-heading" className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="filler-heading" className="text-xl font-bold">
            College application filler
          </h2>
          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass("progress")}`}>Beta</span>
        </div>
        <p className="text-sm text-zinc-600">
          A Chrome extension that fills Common App&apos;s Courses &amp; Grades and Current Year Courses from your transcript in one click, and helps you type your courses into the UC application, STARS, Cal State Apply, UIUC&apos;s SRAR and UT Austin&apos;s coursework form.
        </p>
        <p role="note" className={`rounded-xl border px-4 py-3 text-sm ${toneClass("soon")}`}>
          Beta. Check every course and grade after filling. The extension fills whichever account is open in that browser.
        </p>
        <FillerDownload>
          <a href="/downloads/common-app-filler.zip" download className={buttonClass("primary")}>
            Download for Chrome (.zip)
          </a>
          <div className="space-y-2">
            <h3 className="text-sm font-bold">How to install</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
              {INSTALL_STEPS.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </FillerDownload>
        <p className="text-sm text-zinc-600">
          <Link href="/application/transcript" className="font-semibold text-blue-700 underline-offset-4 hover:underline">
            Fill your transcript first
          </Link>
          . The extension copies it into your applications.
        </p>
      </section>
    </div>
  );
}
