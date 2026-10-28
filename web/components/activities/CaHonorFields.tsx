"use client";

import { CA_LIMITS, caHonorIssues, type CaHonor, type HonorLevel } from "@/lib/activities";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { Checks, gradeOptions, labels, TextField, wide } from "./fields";

export const HONOR_KEYS: Record<HonorLevel, MessageKey> = {
  school: "writing.honorLevel.school",
  state_regional: "writing.honorLevel.state_regional",
  national: "writing.honorLevel.national",
  international: "writing.honorLevel.international",
};

export function CaHonorFields({ h, set }: { h: CaHonor; set: (p: Partial<CaHonor>) => void }) {
  const t = useT();
  const issues = caHonorIssues(h);
  const missing = (f: keyof CaHonor) => issues.some((i) => i.field === f && i.kind === "missing");
  return (
    <>
      <div className={wide}>
        <TextField
          label={t("writing.honorTitle")}
          value={h.title}
          max={CA_LIMITS.honorTitle}
          onSave={(title) => set({ title })}
          validate={(title) => (title.length > CA_LIMITS.honorTitle ? t("writing.ca.err.tooLong", { max: CA_LIMITS.honorTitle, n: title.length }) : null)}
          missing={missing("title")}
        />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={h.grades} onChange={(grades) => set({ grades })} missing={missing("grades")} />
      <Checks<HonorLevel> label={t("writing.honorLevels")} options={labels(HONOR_KEYS, t)} value={h.levels} onChange={(levels) => set({ levels })} missing={missing("levels")} />
    </>
  );
}
