import { Fragment } from "react";
import { splitLinks } from "@/lib/linkify";

/**
 * Plain text with web addresses made clickable. The text is never markup: React escapes it, and only the http(s)
 * addresses splitLinks finds become links (new tab, no referrer, no search-engine credit). Line breaks are kept and
 * long unbroken text wraps.
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-line break-words">
      {splitLinks(text).map((p, i) =>
        p.kind === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-700 underline underline-offset-2 hover:text-blue-900">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </span>
  );
}
