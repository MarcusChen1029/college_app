"use client";

import { UC_AWARD_LEVELS, UC_CATEGORIES, UC_CATEGORY_KEYS, UC_LIMITS, type UcAwardLevel, type UcCategory, type UcEntry } from "@/lib/activities";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { Checks, gradeOptions, input, NumberField, TextField, wide } from "./fields";

export const AWARD_KEYS: Record<UcAwardLevel, MessageKey> = {
  school: "writing.awardLevel.school",
  city: "writing.awardLevel.city",
  state: "writing.awardLevel.state",
  regional: "writing.awardLevel.regional",
  national: "writing.awardLevel.national",
  international: "writing.awardLevel.international",
};
export const UC_FORM_KEYS: Record<UcCategory, { label: MessageKey; name: MessageKey; organization?: MessageKey; extra?: MessageKey; description: MessageKey }> = {
  award: { label: "writing.uc.award.label", name: "writing.uc.award.name", extra: "writing.uc.award.extra", description: "writing.uc.award.description" },
  edprep: { label: "writing.uc.edprep.label", name: "writing.uc.edprep.name", description: "writing.uc.edprep.description" },
  extracurricular: { label: "writing.uc.extracurricular.label", name: "writing.uc.extracurricular.name", description: "writing.uc.extracurricular.description" },
  coursework: { label: "writing.uc.coursework.label", name: "writing.uc.coursework.name", description: "writing.uc.coursework.description" },
  volunteer: { label: "writing.uc.volunteer.label", name: "writing.uc.volunteer.name", extra: "writing.uc.volunteer.extra", description: "writing.uc.volunteer.description" },
  work: {
    label: "writing.uc.work.label",
    name: "writing.uc.work.name",
    organization: "writing.uc.work.organization",
    extra: "writing.uc.work.extra",
    description: "writing.uc.work.description",
  },
};

export function UcFields({ e, set }: { e: UcEntry; set: (p: Partial<UcEntry>) => void }) {
  const t = useT();
  const form = UC_CATEGORIES[e.category];
  const fk = UC_FORM_KEYS[e.category];
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">{t("writing.category")}</span>
        <select className={input} value={e.category} onChange={(ev) => set({ category: ev.target.value as UcCategory })}>
          {UC_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(UC_FORM_KEYS[k].label)}
            </option>
          ))}
        </select>
      </label>
      <TextField key={`name-${e.category}`} label={t(fk.name)} value={e.name} max={UC_LIMITS.name} onSave={(name) => set({ name })} />
      {/* Task 6 redesigns the UC tab; this only keeps the file compiling (work's second box is now `jobTitle`, an award has a list of levels). */}
      {fk.organization && <TextField label={t(fk.organization)} value={e.jobTitle} max={UC_LIMITS.name} onSave={(jobTitle) => set({ jobTitle })} />}
      {e.category === "award" && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{t("writing.levelOfRecognition")}</span>
            <select
              className={`${input} w-auto`}
              value={e.awardLevels[0] ?? ""}
              onChange={(ev) => set({ awardLevels: ev.target.value ? [ev.target.value as UcAwardLevel] : [] })}
            >
              <option value="">—</option>
              {(Object.keys(UC_AWARD_LEVELS) as UcAwardLevel[]).map((k) => (
                <option key={k} value={k}>
                  {t(AWARD_KEYS[k])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{t("writing.awardType")}</span>
            <select
              className={`${input} w-auto`}
              value={e.awardType ?? ""}
              onChange={(ev) => set({ awardType: (ev.target.value || null) as UcEntry["awardType"] })}
            >
              <option value="">—</option>
              <option value="academic">{t("writing.awardAcademic")}</option>
              <option value="non_academic">{t("writing.awardNonAcademic")}</option>
            </select>
          </label>
        </div>
      )}
      {fk.extra && (
        <div className={wide}>
          <TextField key={`extra-${e.category}`} label={t(fk.extra)} value={e.extra} max={UC_LIMITS.extra} rows={2} onSave={(extra) => set({ extra })} />
        </div>
      )}
      <div className={wide}>
        <TextField key={`desc-${e.category}`} label={t(fk.description)} value={e.description} max={UC_LIMITS.description} rows={4} onSave={(description) => set({ description })} />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={e.grades} onChange={(grades) => set({ grades })} />
      {form.hours && (
        <div className="flex gap-3">
          <NumberField label={t("writing.hoursWeek")} value={e.hoursPerWeek} max={168} onSave={(hoursPerWeek) => set({ hoursPerWeek })} />
          <NumberField label={t("writing.weeksYear")} value={e.weeksPerYear} max={52} onSave={(weeksPerYear) => set({ weeksPerYear })} />
        </div>
      )}
    </>
  );
}
