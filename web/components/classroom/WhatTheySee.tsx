"use client";

import { useId } from "react";
import { TEACHER_NEVER_SEES, TEACHER_SEES } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import type { MyTeacher } from "@/lib/links-api";
import { buttonClass, LABEL } from "@/lib/ui";

/** A bullet or a switch in the same narrow column, so the lines of text start at the same place. */
const MARK = "flex h-6 w-4 shrink-0 items-center justify-center";

/**
 * "What <teacher> can see" (spec 4.1): everything they can read about the student, one line each, with the one switch
 * that exists in phase 1 (the essays), then what they never see, and Leave. Phase 2 adds a switch per section.
 * A white bordered box for a page's side column (the 1-on-1 page, a class page's Stream). Without `onLeave` the Leave row
 * is left out, for a page where leaving is offered elsewhere.
 */
export function WhatTheySee({
  teacher,
  busy,
  onShareEssays,
  onLeave,
}: {
  teacher: MyTeacher;
  busy: boolean;
  onShareEssays: (value: boolean) => void;
  onLeave?: () => void;
}) {
  const t = useT();
  const headingId = useId();
  const name = teacher.displayName;

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-[10px] border border-neutral-line bg-white p-4">
      <h2 id={headingId} className={`${LABEL} [overflow-wrap:anywhere]`}>
        {t("classroom.sees.title", { name })}
      </h2>
      <ul className="space-y-1 text-[15px] leading-6 text-ink">
        {TEACHER_SEES.map((k) => (
          <li key={k} className="flex gap-2">
            {k === "essays" ? (
              <label className="flex min-w-0 gap-2">
                <span className={MARK}>
                  <input
                    type="checkbox"
                    className="size-4"
                    aria-label={t("classroom.sees.shareEssaysLabel", { name })}
                    checked={teacher.shareEssays}
                    disabled={busy}
                    onChange={(e) => onShareEssays(e.target.checked)}
                  />
                </span>
                <span className="min-w-0">{t("classroom.sees.essays")}</span>
              </label>
            ) : (
              <>
                <span aria-hidden="true" className={MARK}>
                  <span className="size-1.5 rounded-full bg-zinc-400" />
                </span>
                <span className="min-w-0">{t(`classroom.sees.${k}`)}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="pt-1 text-[13px] font-semibold text-zinc-700 [overflow-wrap:anywhere]">{t("classroom.sees.notShared", { name })}</p>
      <ul className="space-y-1 text-[15px] leading-6 text-zinc-700">
        {TEACHER_NEVER_SEES.map((k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden="true" className={MARK}>
              <span className="size-1.5 rounded-full bg-zinc-300" />
            </span>
            <span className="min-w-0">{t(`classroom.sees.${k}`)}</span>
          </li>
        ))}
      </ul>

      {onLeave && (
        <div className="space-y-3 border-t border-neutral-line pt-4">
          <p className="text-[13px] text-zinc-700 [overflow-wrap:anywhere]">{t("classroom.sees.leaveNote", { name })}</p>
          <button type="button" disabled={busy} className={buttonClass("danger", "sm")} onClick={onLeave}>
            {t("classroom.sees.leave", { name })}
          </button>
        </div>
      )}
    </section>
  );
}
