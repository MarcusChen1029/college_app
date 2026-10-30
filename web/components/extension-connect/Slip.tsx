"use client";

// The extension's permission slip (/extension/connect), on the home page's ticket stationery: the body says plainly
// what the extension can read and what it can't, the stub carries who is signing and the decision. Presentation only:
// ExtensionConnect keeps every check, the token request and the redirects.

import { PageMark } from "@/components/start/PageMark";
import { useT } from "@/lib/i18n/client";

/** One slip: a ticket body with the title and content, and an optional tear-off stub for the action. */
export function Slip({ title, children, stub }: { title: string; children?: React.ReactNode; stub?: React.ReactNode }) {
  return (
    // The slip lies on the site's sky ground with a slim footer (globals.css: data-slip-page, data-slim-footer).
    // Centred in the space between header and footer, so a short slip doesn't leave a blank band under it.
    <PageMark marks={["data-slip-page", "data-slim-footer"]} className="flex min-h-[calc(100svh-15rem)] items-center py-2 sm:py-6">
    <div className="ticket-in mx-auto w-full max-w-2xl">
      <div className="ticket-body bg-zinc-50 px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
        <h1 className="font-display text-2xl font-extrabold leading-[1.1] tracking-[-0.02em] [overflow-wrap:break-word] sm:text-[32px]">{title}</h1>
        {children && <div className="mt-4 space-y-5 text-base leading-relaxed text-zinc-700">{children}</div>}
      </div>
      {stub && <div className="ticket-stub bg-zinc-50 px-6 py-6 sm:px-10">{stub}</div>}
    </div>
    </PageMark>
  );
}

function Mark({ yes }: { yes: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`mt-0.5 size-5 shrink-0 ${yes ? "text-done" : "text-zinc-500"}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {yes ? <path d="M20 6 9 17l-5-5" /> : <path d="M6 6l12 12M18 6 6 18" />}
    </svg>
  );
}

/** What the transcript-and-activities token reads, and what stays out of its reach. */
export function Permissions() {
  const t = useT();
  const can = [t("extension.readTranscript"), t("extension.readActivities")];
  const cannot = [t("extension.noEssays"), t("extension.noList"), t("extension.noPortals"), t("extension.noAid"), t("extension.noElse")];
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <section aria-labelledby="ext-can" className="rounded-xl bg-white px-5 py-4">
        <h2 id="ext-can" className="font-display text-lg font-bold text-ink">
          {t("extension.canRead")}
        </h2>
        <ul className="mt-3 space-y-2.5">
          {can.map((x) => (
            <li key={x} className="flex gap-2.5 text-ink">
              <Mark yes />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ext-cannot" className="rounded-xl bg-blue-50 px-5 py-4">
        <h2 id="ext-cannot" className="font-display text-lg font-bold text-ink">
          {t("extension.cannotRead")}
        </h2>
        <ul className="mt-3 space-y-2.5">
          {cannot.map((x) => (
            <li key={x} className="flex gap-2.5">
              <Mark yes={false} />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The stub's two halves: who is signing (and how to undo it), then the decision. */
export function SlipActions({ who, children }: { who: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-base text-zinc-700">{who}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
