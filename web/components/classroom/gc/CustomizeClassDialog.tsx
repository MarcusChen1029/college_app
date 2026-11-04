"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/Modal";
import { CLASS_THEMES, THEME_STYLE, themeFor, type ClassTheme } from "@/lib/class-theme";
import { NAME_LIMITS } from "@/lib/classroom";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { renameClass, setClassTheme, type TeacherClass } from "@/lib/links-api";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { classroomError } from "../ClassroomText";
import { CheckIcon } from "./gcIcons";

const THEME_NAME: Record<ClassTheme, MessageKey> = {
  ink: "classroom.tc.theme.ink",
  coral: "classroom.tc.theme.coral",
  mint: "classroom.tc.theme.mint",
  lilac: "classroom.tc.theme.lilac",
  sun: "classroom.tc.theme.sun",
  sky: "classroom.tc.theme.sky",
};

/**
 * Customize a class (spec 4.2): its name (the same rule as Rename: not blank, up to 120 characters, the server decides
 * the rest) and its banner color, one of the six themes. The swatch that is selected at the start is the color the banner
 * shows now, which for a class without a chosen theme is the automatic pick; the theme is written only when the teacher
 * picks a different one. Save and the fields are disabled while it runs. `onSaved` runs after everything went through (the
 * caller closes this and reloads); `onChanged` runs when something was saved but a later step failed, so the caller can
 * reload while this stays open with the reason. `onCancel` runs on Cancel, the close button and Esc. Mount it only while
 * it should be open.
 */
export function CustomizeClassDialog({ cls, onSaved, onChanged, onCancel }: { cls: TeacherClass; onSaved: () => void; onChanged: () => void; onCancel: () => void }) {
  const t = useT();
  const uid = useId();
  const current = themeFor(cls.id, cls.theme);
  const [name, setName] = useState(cls.name);
  const [theme, setTheme] = useState<ClassTheme>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = name.trim();
    if (!v) return setError(t("teacher.classes.giveName"));
    setBusy(true);
    setError(null);
    let wrote = false;
    try {
      if (v !== cls.name) {
        await renameClass(cls.id, v);
        wrote = true;
      }
      if (theme !== current) {
        await setClassTheme(cls.id, theme);
        wrote = true;
      }
    } catch (err) {
      setError(classroomError(t, err));
      setBusy(false);
      if (wrote) onChanged();
      return;
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Modal
      title={<h2 className="text-lg font-semibold">{t("classroom.tc.customizeTitle")}</h2>}
      onClose={onCancel}
      locked={busy}
      className="w-[min(30rem,calc(100vw-2rem))]"
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <div className="space-y-1">
            <label htmlFor={`${uid}-name`} className="block text-sm font-medium">
              {t("teacher.classes.className")}
            </label>
            <input id={`${uid}-name`} value={name} maxLength={NAME_LIMITS.className} autoComplete="off" className={`${FIELD_CLASS} w-full`} onChange={(e) => setName(e.target.value)} />
          </div>

          <div role="radiogroup" aria-labelledby={`${uid}-theme`} className="space-y-2">
            <p id={`${uid}-theme`} className="text-sm font-medium">
              {t("classroom.tc.themeLabel")}
            </p>
            <div className="flex flex-wrap gap-3">
              {CLASS_THEMES.map((id) => {
                const s = THEME_STYLE[id];
                const chosen = theme === id;
                return (
                  <label key={id} className="relative cursor-pointer">
                    <input type="radio" name={`${uid}-theme`} value={id} checked={chosen} className="peer sr-only" aria-label={t(THEME_NAME[id])} onChange={() => setTheme(id)} />
                    <span
                      aria-hidden="true"
                      title={t(THEME_NAME[id])}
                      className={`grid size-11 place-items-center rounded-full border border-ink/20 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                        chosen ? "ring-[3px] ring-ink ring-offset-2" : "hover:ring-2 hover:ring-ink/40 hover:ring-offset-2"
                      }`}
                      style={{ backgroundColor: s.bg, color: s.fg }}
                    >
                      {chosen && <CheckIcon className="size-5" />}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} className={buttonClass("quiet", "sm")} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
