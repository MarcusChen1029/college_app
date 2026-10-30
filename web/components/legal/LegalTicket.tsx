// The legal pages (/privacy, /terms, /security, /contact) set as /help is: a ticket on the sky ground. The stub carries the
// title, the date and who runs the site, the introduction and the contents; below the notched perforation each section
// sits with its heading on the left and its text at about 62 characters a line. Layout only: every word comes from the
// legal dictionaries, unchanged (they are drafts awaiting review).
import type { ReactNode } from "react";
import { PageMark } from "@/components/start/PageMark";

// The sky ground behind the page, and on a short page the slim footer (no wordmark); PageMark takes the marks off when
// the visitor leaves (see components/start/PageMark.tsx).
const MARKS = ["data-legal-page"] as const;
const SLIM_MARKS = ["data-legal-page", "data-slim-footer"] as const;

// break-words: an address such as myaccount.google.com/connections wraps inside the measure on a phone.
export const LEGAL_TEXT = "max-w-[34rem] break-words text-lg leading-relaxed";
export const LEGAL_LINK = "font-semibold text-blue-700 underline underline-offset-4 hover:text-ink";

/** The page frame: the ticket, centred, on the page's sky ground. `slimFooter` for a page too short to carry the
 *  footer's full-width wordmark (/contact). */
export function LegalTicket({ slimFooter = false, children }: { slimFooter?: boolean; children: ReactNode }) {
  return (
    <PageMark marks={slimFooter ? SLIM_MARKS : MARKS} className="pb-4 sm:pt-4">
      <article className="mx-auto max-w-[64rem]">{children}</article>
    </PageMark>
  );
}

/** The stub: the title set large as the page's lead (as on /help), then what the caller passes. */
export function LegalStub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header id="legal-top" className="ticket-body scroll-mt-24 bg-white px-6 pb-10 pt-10 sm:px-12 sm:pb-12 sm:pt-12">
      <h1 className="font-display text-[clamp(3rem,7vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">{title}</h1>
      {children}
    </header>
  );
}

/** The sheet under the perforation. */
export function LegalSheet({ children }: { children: ReactNode }) {
  return <div className="ticket-stub space-y-14 bg-white px-6 pb-16 pt-12 sm:px-12">{children}</div>;
}

/** One section: its heading in the left third on desktop, held in view (sticky, under the site header) while its text
 *  scrolls beside it; on a phone, heading then text. */
export function LegalSection({ id, title, back, children }: { id?: string; title: string; back?: string; children: ReactNode }) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section id={id} aria-labelledby={hid} className="scroll-mt-24 lg:grid lg:grid-cols-12 lg:gap-x-10">
      <h2 id={hid} className="font-display text-xl font-extrabold leading-snug tracking-[-0.02em] sm:text-2xl lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
        {title}
      </h2>
      <div className="mt-3 space-y-4 lg:col-span-8 lg:mt-0">
        {children}
        {back && (
          <p className="pt-2">
            <a href="#legal-top" className="text-base font-semibold text-blue-700 underline underline-offset-4 hover:text-ink">
              <span aria-hidden>↑ </span>
              {back}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

/** A bulleted list at the reading measure, its dots in ink. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className={`${LEGAL_TEXT} list-disc space-y-2 pl-6 marker:text-ink`}>{children}</ul>;
}
