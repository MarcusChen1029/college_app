"use client";

import { useId } from "react";
import { CodeBox, codeActions, type Run } from "@/components/TeacherClassCard";
import { ActionsMenu } from "@/components/teacher/ActionsMenu";
import { useT } from "@/lib/i18n/client";
import { newCode, revokeCode, type TeacherClass } from "@/lib/links-api";
import { LABEL } from "@/lib/ui";

/**
 * The "Class code" box in the left column of a class Stream (spec 4.2): the code in large type with Copy, Copy invite
 * link and Show on screen (CodeBox), and New code / Turn code off in the box's "⋯" menu (a new code asks first: the old one
 * stops working). A class whose code is off says so, has no menu, and offers "Turn code on". `now` is the page's load time in
 * milliseconds (an expired code is judged against it); `run` does a write and then reloads the page's data.
 */
export function ClassCodeBox({ cls, now, busy, run }: { cls: TeacherClass; now: number; busy: boolean; run: Run }) {
  const t = useT();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-[10px] border border-neutral-line bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className={LABEL}>
          {t("classroom.tc.codeTitle")}
        </h2>
        {cls.code && (
          <ActionsMenu
            label={t("classroom.tc.codeMenu", { name: cls.name })}
            quiet
            disabled={busy}
            actions={codeActions(
              t,
              cls.code,
              () => run(() => newCode("class", cls.id)),
              () => run(() => revokeCode("class", cls.id)),
            )}
          />
        )}
      </div>
      <CodeBox
        code={cls.code}
        expiresAt={cls.codeExpiresAt}
        now={now}
        busy={busy}
        turnOnLabel={t("teacher.classes.turnOn")}
        subject={cls.name}
        onNew={() => run(() => newCode("class", cls.id))}
      />
    </section>
  );
}
