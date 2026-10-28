import Link from "next/link";
import { Fragment } from "react";

const link = "font-semibold text-blue-700 underline underline-offset-4";

/**
 * Renders <b>…</b> as bold and [label](/path) as a link on this site, so each sentence stays one translatable string.
 * `newTab` opens the links in a new tab (used inside the sign-in dialog, so the dialog isn't lost).
 */
export function LegalRich({ text, newTab = false, linkClassName = link }: { text: string; newTab?: boolean; linkClassName?: string }) {
  return (
    <>
      {text.split(/(<b>.*?<\/b>|\[[^\]]+\]\(\/[^)]*\))/).map((part, i) => {
        if (part.startsWith("<b>")) return <strong key={i} className="text-zinc-800">{part.slice(3, -4)}</strong>;
        const m = part.match(/^\[([^\]]+)\]\((\/[^)]*)\)$/);
        if (m)
          return (
            <Link key={i} href={m[2]} className={linkClassName} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {m[1]}
            </Link>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
