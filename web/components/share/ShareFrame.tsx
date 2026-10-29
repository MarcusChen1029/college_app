"use client";

import Link from "next/link";
import { Duo, PhotoCredits } from "@/components/share/campus";
import { revealDelay } from "@/components/share/report-logic";
import { PageMark } from "@/components/start/PageMark";
import { CAMPUS } from "@/lib/campus-photos";
import { useT } from "@/lib/i18n/client";

/** The home page's big button: the one action on a share page. */
export const SHARE_BUTTON =
  "inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.98]";

/**
 * Every share page sits on the sky ground with a slim footer (globals.css: data-share-page, data-slim-footer). The marks
 * live only while the page is mounted, so the next page the visitor opens is not tinted.
 */
export function ShareFrame({ children }: { children: React.ReactNode }) {
  return (
    <PageMark marks={["data-share-page", "data-slim-footer"]} className="space-y-8">
      {children}
    </PageMark>
  );
}

// Entrances spread over at most 600ms (report-logic revealDelay); six parts rise on this page.
const step = (i: number) => ({ animationDelay: revealDelay(i, 6) }) as React.CSSProperties;

// The four stamps on a voided ticket: the home page's campuses, each credited under the ticket.
const STAMPS = [CAMPUS.berkeley, CAMPUS.michigan, CAMPUS.columbia, CAMPUS.princeton];
const TILT = ["-rotate-3", "rotate-2", "-rotate-1", "rotate-3"];

/** A link that is unknown, revoked or expired: the whole page is the voided ticket. It says nothing about why. */
export function ShareInactiveCard() {
  const t = useT();
  return (
    <ShareFrame>
      <div className="ticket-in mx-auto max-w-4xl">
        {/* The ticket body: what happened on the left, the campuses it would have shown as four stamps on the right. */}
        <div className="ticket-body timetable-row grid gap-8 bg-zinc-50 px-6 pb-10 pt-8 sm:px-12 sm:pb-14 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
          <div className="order-1">
            <h1 className="timetable-row max-w-[16ch] font-display text-[clamp(2.25rem,7vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.035em]" style={step(0)}>
              {t("share.inactiveTitle")}
            </h1>
            <p className="timetable-row mt-5 max-w-[46ch] text-lg leading-relaxed text-zinc-700" style={step(1)}>
              {t("share.inactiveBody")}
            </p>
            {/* The one way on sits with the message, so a phone shows it on the first screen. */}
            <Link href="/" className={`timetable-row mt-7 ${SHARE_BUTTON}`} style={step(2)}>
              {t("share.inactiveHome")}
            </Link>
          </div>
          <ul aria-hidden="true" className="order-2 grid grid-cols-2 justify-items-center gap-5 sm:flex sm:flex-wrap sm:justify-start sm:gap-5 lg:grid lg:grid-cols-2">
            {STAMPS.map((p, i) => (
              <li key={p.src} className={`share-stamp w-[min(100%,140px)] sm:w-[120px] lg:w-[132px] ${TILT[i]}`} style={{ animationDelay: revealDelay(i, STAMPS.length) }}>
                <Duo photo={p} stamp decorative sizes="140px" />
              </li>
            ))}
          </ul>
        </div>
        <div className="ticket-stub timetable-row bg-zinc-50 px-6 py-7 sm:px-12" style={step(3)}>
          <p className="timetable-row max-w-[68ch] text-base leading-relaxed text-zinc-700" style={step(4)}>
            {t("share.inactiveAbout")}
          </p>
        </div>
      </div>
      <div className="timetable-row mx-auto max-w-4xl" style={step(5)}>
        <PhotoCredits photos={STAMPS} label={t("share.photos")} />
      </div>
    </ShareFrame>
  );
}
