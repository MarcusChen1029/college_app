// Line icons for the class screens (class card, task row), drawn for this site. Same look as ../icons.tsx (2px
// round strokes on a 24px grid) and likewise decorative: the link, row or tab next to an icon names what it stands for.
// The speech bubble for Comments is BubbleIcon in ../icons.tsx.

import { BubbleIcon } from "../icons";

const PROPS = { "aria-hidden": true, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A clipboard with two lines: classwork, and a task that is still to do. */
export function ClipboardIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...PROPS} className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6H9z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

/** A megaphone: the Stream of announcements. */
export function StreamIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M4 10v4h3l5 4V6L7 10z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

/** A tick: a task that is done. */
export function CheckIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...PROPS} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export type CardIconName = "classwork" | "stream" | "comments";

/** The icon a class card's footer link shows. */
export function CardIcon({ name, className = "size-5 shrink-0" }: { name: CardIconName; className?: string }) {
  if (name === "stream") return <StreamIcon className={className} />;
  if (name === "comments") return <BubbleIcon className={className} />;
  return <ClipboardIcon className={className} />;
}
