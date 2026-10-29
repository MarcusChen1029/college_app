import type { Tone } from "@/lib/status";
import { toneClass } from "@/lib/ui";

// The college page's tag: the shared Pill / StatusPill tones at 13px, so nothing on the page that is meant to be read is
// under 13px. A pale tint with dark text of the same hue; never squeezed (no wrap, no shrink).
export function Tag({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[13px] leading-none font-semibold whitespace-nowrap ${toneClass(tone)}`}>
      {children}
    </span>
  );
}
