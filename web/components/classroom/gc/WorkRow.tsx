"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { dueState, type WorkItem } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { dueLabel } from "../ClassroomText";
import { CheckIcon, ClipboardIcon } from "./gcIcons";

const ROW = "block w-full rounded-lg px-3 py-2.5 text-left text-sm";

/**
 * One piece of classwork in a list: a round icon (filled mint with a tick when done), the title, the class or teacher
 * under it when given (`classLabel`, on the To-do page), and when it is due. A missed one reads "Missing · N days late"
 * in the urgent tone.
 *
 * - `expandable`: the row is a button that opens `details` in place (the instructions, an item chip, a student list), and
 *   with `href` a "View task" link at the foot. This is the Classwork list, and the teacher's rows, which have no `href`.
 * - Otherwise, with `href`, the whole row is a link (To-do, Upcoming); without, it is a plain row.
 * `today` is the reader's local `YYYY-MM-DD`.
 */
export function WorkRow({
  item,
  today,
  href,
  expandable = false,
  details,
}: {
  item: WorkItem & { classLabel?: string };
  today: string;
  href?: string;
  expandable?: boolean;
  details?: ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const state = dueState(item, today);
  const done = state.kind === "done";

  // Spans only: this sits inside a <button> or <a>. Phone: the date goes under the title; from 640px it is a right column.
  const face = (
    <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span aria-hidden="true" className={`row-span-2 grid size-9 place-items-center rounded-full sm:row-span-1 ${done ? "bg-mint text-ink" : "bg-ink text-white"}`}>
        {done ? <CheckIcon className="size-5" /> : <ClipboardIcon className="size-[18px]" />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink [overflow-wrap:anywhere]">{item.title}</span>
        {item.classLabel && <span className="block text-[13px] text-neutral [overflow-wrap:anywhere]">{item.classLabel}</span>}
      </span>
      <span className={`col-start-2 text-[13px] sm:col-start-3 sm:row-start-1 sm:text-right ${state.kind === "missing" ? "font-semibold text-urgent" : "text-neutral"}`}>
        {dueLabel(t, state, locale, today)}
      </span>
    </span>
  );

  if (!expandable) {
    return href ? (
      <Link href={href} className={`${ROW} hover:bg-neutral-bg`}>
        {face}
      </Link>
    ) : (
      <div className={ROW}>{face}</div>
    );
  }

  return (
    <div className={`rounded-[10px] border ${open ? "my-1 border-neutral-line bg-white" : "border-transparent"}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${ROW} ${open ? "rounded-b-none border-b border-neutral-bg" : "border-b border-transparent hover:bg-neutral-bg"}`}
      >
        {face}
      </button>
      {open && (
        <div id={panelId}>
          {details && <div className="px-3 py-3 pl-[3.75rem] text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{details}</div>}
          {href && (
            <div className="border-t border-neutral-bg px-3 py-2.5 pl-[3.75rem]">
              <Link href={href} className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
                {t("classroom.work.view")}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
