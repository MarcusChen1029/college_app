// Words the student's admission-test choice (lib/test-plan.ts) in the current language, for the profile cards,
// the setup summary, the teacher view and the AI context.
import type { StudentProfile } from "../fit.ts";
import { ACT_SCALE, SAT_SCALE, sectionSummary, type TestDetails } from "../scores.ts";
import { testChoice } from "../test-plan.ts";
import { HTML_LANG, type Locale } from "./core.ts";
import type { TFunction } from "./index.ts";

/** "Dec 2026" / "2026年12月" for a stored YYYY-MM. */
export function planMonthText(locale: Locale, ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(HTML_LANG[locale], { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** One line for the saved choice, e.g. "SAT planned, Dec 2026". Empty when no choice is stored and there is no score to read one from. */
export function testPlanText(t: TFunction, locale: Locale, tests: TestDetails | undefined): string {
  const choice = testChoice({ tests });
  if (!choice) return "";
  if (choice === "planned") {
    const planned = tests?.plan?.planned;
    if (!planned) return "";
    const test = planned.test.toUpperCase();
    return planned.month ? t("profile.test.sum.plannedMonth", { test, month: planMonthText(locale, planned.month) }) : t("profile.test.sum.planned", { test });
  }
  return t(`profile.test.sum.${choice}`);
}

export type TestCardView = { label: string; value: string | number | null; sub?: string; small?: boolean };

/** What the "Admission test" card and the setup summary show for the student's current choice. */
export function testCardView(t: TFunction, locale: Locale, p: StudentProfile): TestCardView {
  const choice = testChoice(p);
  const tests = p.tests;
  const title = t("profile.test.title");
  switch (choice) {
    case "sat":
      return { label: "SAT", value: p.sat ?? null, sub: sectionSummary(SAT_SCALE, tests?.sat) };
    case "act":
      return { label: "ACT", value: p.act ?? null, sub: sectionSummary(ACT_SCALE, tests?.act) };
    case "both":
      return { label: "SAT + ACT", value: p.sat ?? p.act ?? null, sub: p.act == null ? undefined : p.sat == null ? "ACT" : `ACT ${p.act}` };
    case "planned": {
      const planned = tests?.plan?.planned;
      const sub = planned?.month ? t("profile.test.plannedShortMonth", { month: planMonthText(locale, planned.month) }) : t("profile.test.plannedShort");
      return { label: title, value: (planned?.test ?? "sat").toUpperCase(), sub };
    }
    case "none":
      return { label: title, value: t("profile.test.notTakingValue"), sub: t("profile.test.notTakingSub"), small: true };
    default:
      return { label: title, value: null };
  }
}
