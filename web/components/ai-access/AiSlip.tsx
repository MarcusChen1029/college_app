"use client";

// The AI's permission slip (/oauth/consent): the extension slip's stationery (ticket body, perforated stub, sky ground,
// slim footer), set wider because an AI's two lists are long; at 672px the decision fell below a 900px screen.

import { PageMark } from "@/components/start/PageMark";

export function AiSlip({ title, children, stub }: { title: string; children?: React.ReactNode; stub?: React.ReactNode }) {
  return (
    <PageMark marks={["data-slip-page", "data-slim-footer"]} className="flex min-h-[calc(100svh-15rem)] items-center py-2 sm:py-6">
      <div className="ticket-in mx-auto w-full max-w-4xl">
        <div className="ticket-body bg-zinc-50 px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
          <h1 className="font-display text-2xl font-extrabold leading-[1.1] tracking-[-0.02em] [overflow-wrap:break-word] sm:text-[32px]">{title}</h1>
          {children && <div className="mt-4 space-y-5 text-base leading-relaxed text-zinc-700">{children}</div>}
        </div>
        {stub && <div className="ticket-stub bg-zinc-50 px-6 py-6 sm:px-10">{stub}</div>}
      </div>
    </PageMark>
  );
}

/** The slip's shape while a request loads, on the same ground, so the page doesn't jump when it arrives. */
export function AiSlipSkeleton({ label }: { label: string }) {
  return (
    <PageMark marks={["data-slip-page", "data-slim-footer"]} className="flex min-h-[calc(100svh-15rem)] items-center py-2 sm:py-6">
      <div role="status" aria-label={label} className="mx-auto h-[26rem] w-full max-w-4xl animate-pulse rounded-2xl bg-zinc-50/70" />
    </PageMark>
  );
}
