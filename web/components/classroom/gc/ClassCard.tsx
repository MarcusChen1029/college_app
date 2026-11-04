import Link from "next/link";
import type { ReactNode } from "react";
import type { ClassTheme } from "@/lib/class-theme";
import { ClassBanner } from "./ClassBanner";
import { CardIcon, type CardIconName } from "./gcIcons";

/** One line of a card's body: what is due, when, and where it opens. `urgent` is for work that is already missing. */
export type ClassCardDue = { title: string; label: string; urgent: boolean; href: string };
/** One icon link in a card's footer; `dot` marks something new (the label says what, for a screen reader). */
export type ClassCardIcon = { label: string; href: string; dot?: boolean; icon: CardIconName };

/**
 * A class on the Classes home: the banner (a link to the class), the next things due, and icon links to its sections.
 * A white card with the site's soft border. `who` is the teacher's name, `avatar` their initial; `empty` is the body
 * when `due` is empty. `menu` (a ⋮ button and its popup, from the screen) sits at the left of the footer, so a popup
 * can open past the card: nothing here clips overflow.
 */
export function ClassCard({
  href,
  theme,
  title,
  subtitle,
  who,
  avatar,
  due,
  empty,
  icons,
  menu,
}: {
  href: string;
  theme: ClassTheme;
  title: string;
  subtitle?: string;
  who: string;
  avatar: string;
  due: ClassCardDue[];
  empty: string;
  icons: ClassCardIcon[];
  menu?: ReactNode;
}) {
  return (
    <article className="flex min-h-[15.5rem] flex-col rounded-xl border border-neutral-line bg-white">
      <Link href={href} className="block rounded-t-[11px]">
        <ClassBanner theme={theme} title={title} subtitle={subtitle} byline={who} avatar={avatar} size="card" />
      </Link>
      {/* pt-8: the avatar hangs 26px below the banner */}
      <div className="flex-1 px-4 pb-3 pt-8 text-sm">
        {due.length === 0 ? (
          <p className="text-[13px] text-neutral">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {due.map((d, i) => (
              <li key={`${i}-${d.href}`}>
                <p className={`text-[13px] ${d.urgent ? "font-semibold text-urgent" : "text-neutral"}`}>{d.label}</p>
                <Link href={d.href} className="font-semibold text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-neutral-bg px-2 py-1.5">
        {menu}
        <div className="ml-auto flex items-center gap-0.5">
          {icons.map((i) => (
            <Link
              key={`${i.icon}-${i.href}`}
              href={i.href}
              aria-label={i.label}
              title={i.label}
              className="relative grid size-10 place-items-center rounded-full text-neutral hover:bg-neutral-bg hover:text-ink"
            >
              <CardIcon name={i.icon} />
              {i.dot && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-coral outline outline-1 outline-ink/40 ring-2 ring-white" />}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
