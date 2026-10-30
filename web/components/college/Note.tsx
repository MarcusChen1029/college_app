// A research note on the college page (a CDS footnote, a cost caveat, an I-20 detail). Up to about two lines it is shown as
// it is; a longer one is folded behind "Details" so the figures stay readable. No hooks: a native <details>, usable from
// server components. The text is the data's own; nothing is filtered here.
const FOLD_AT = 170; // characters: about two lines of 14px text in the page's narrower columns

export function Note({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  if (text.length <= FOLD_AT) return <p className={`text-sm leading-relaxed text-zinc-600 ${className}`}>{text}</p>;
  return (
    <details className={`group text-sm leading-relaxed text-zinc-600 ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-blue-700 hover:underline [&::-webkit-details-marker]:hidden">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90">
          <path d="m9 6 6 6-6 6" />
        </svg>
        {label}
      </summary>
      <p className="mt-1.5">{text}</p>
    </details>
  );
}
