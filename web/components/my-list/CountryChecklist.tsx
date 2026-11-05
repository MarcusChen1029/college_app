"use client";

import Link from "next/link";
import { collegeSteps } from "@/lib/application-steps";
import { checklistItems, safeLink, type Checklist, type CollegeContext, type ChecklistItem } from "@/lib/checklist";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { UCAS_PS_ANCHOR, UCAS_REFERENCE_ANCHOR } from "@/lib/ucas-shared";
import type { ListEntry } from "@/lib/student-store";
import type { ExpiryWarning } from "@/lib/english-expiry";
import type { CollegeSummary } from "@/lib/types";
import { Check, EnglishTestSection, Section, TestScoresSection } from "../ChecklistPanel";

type Props = {
  entry: ListEntry;
  college: CollegeSummary;
  ctx: CollegeContext;
  /** Used only for the English-test hint ("usually only for international applicants"). */
  international: boolean;
  englishWarning?: ExpiryWarning | null;
  set: (patch: Partial<Checklist>) => void;
};

const LINK = "text-blue-700 underline";

/**
 * The checklist sections of a UK, Canadian or Australian college, from the same item list that drives progress
 * (checklistItems), so what is shown is what is counted. `set` spreads the stored checklist, so keys hidden here survive.
 */
export function CountryChecklist({ entry, college, ctx, international, englishWarning = null, set }: Props) {
  const t = useT();
  const c = entry.checklist;
  // Steps for other courses are filtered out of ctx until a course is picked; this asks the whole record.
  const hasCourseSteps = collegeSteps(college.slug)?.steps.some((s) => s.courses !== "all") ?? false;
  const needCourse = ctx.course == null && (ctx.country === "GB" || hasCourseSteps);
  const adminUrl = ctx.admissionsUrl ? safeLink(ctx.admissionsUrl) : null;

  const render = (item: ChecklistItem) => {
    switch (item.key) {
      case "course_choice":
        return (
          <Section key={item.key} title={item.detail ? t("application.country.courseChosen", { name: item.detail }) : t("application.country.pickCourseRow")} done={item.done} />
        );
      case "ucas_ps":
      case "ucas_reference": {
        const href = item.key === "ucas_ps" ? `/materials/essays#${UCAS_PS_ANCHOR}` : `/application/recommenders#${UCAS_REFERENCE_ANCHOR}`;
        return (
          <Section key={item.key} title={t(`application.country.${item.key}`)} done={item.done} hint={t("application.country.sharedHint")}>
            <Check checked={item.done} disabled onChange={() => {}}>
              {t(`application.country.${item.key}`)}
            </Check>
            <Link href={href} className={`${LINK} text-xs`}>
              {t(item.key === "ucas_ps" ? "application.country.changeOnEssays" : "application.country.changeOnRecommenders")}
            </Link>
          </Section>
        );
      }
      case "admissions_test":
        return (
          <Section key={item.key} title={t("application.country.admissions_test")} done={item.done} hint={item.detail}>
            <Check checked={item.done} onChange={(v) => set({ admissions_test: v })}>
              {t("application.country.taken")}
            </Check>
          </Section>
        );
      case "transcript":
        return (
          <Section key={item.key} title={t(ctx.country === "AU" ? "application.country.transcriptAU" : "application.country.transcriptCA")} done={item.done}>
            <Check checked={!!c.transcript} onChange={(v) => set({ transcript: v })}>
              {t("application.cl.transcriptSent")}
            </Check>
          </Section>
        );
      case "english_test":
        return <EnglishTestSection key={item.key} c={c} set={set} college={college} international={international} warning={englishWarning} />;
      case "test_scores":
        return <TestScoresSection key={item.key} c={c} set={set} college={college} hint={item.detail} />;
      default: {
        const step = item.step;
        if (!step) return null;
        const link = safeLink(step.sourceUrl);
        return (
          <Section
            key={item.key}
            title={t(`application.country.kind.${step.kind}` as MessageKey)}
            done={item.done}
            hint={step.deadlineLabel ? t("application.country.stepDue", { label: step.deadlineLabel }) : null}
          >
            <Check checked={item.done} onChange={(v) => set({ extra_steps: { ...c.extra_steps, [step.id]: v } })}>
              {step.name}
            </Check>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className={`${LINK} text-xs`}>
                {t("application.country.officialPage")}
              </a>
            )}
          </Section>
        );
      }
    }
  };

  return (
    <>
      {checklistItems(c, ctx).map(render)}
      {(!ctx.researched || needCourse) && (
        <div className="space-y-1 text-xs text-zinc-600 md:col-span-2">
          {!ctx.researched && (
            <p>
              {t("application.country.notChecked")}
              {adminUrl && (
                <>
                  {" · "}
                  <a href={adminUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {t("application.country.checkSite")}
                  </a>
                </>
              )}
            </p>
          )}
          {needCourse && <p>{t("application.country.pickCourse")}</p>}
        </div>
      )}
    </>
  );
}
