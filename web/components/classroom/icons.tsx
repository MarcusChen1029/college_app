// Small line icons for the classroom pieces: the speech bubble that marks the shared Messages tab and a comment marker, the
// padlock that marks the private Notes tab and a private-note marker, and the task box. Decorative (aria-hidden): the tab,
// heading or marker name next to them says what they stand for.

const PROPS = { "aria-hidden": true, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function BubbleIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function LockIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...PROPS} className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** An empty box: a task that is still to do. */
export function BoxIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg {...PROPS} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}
