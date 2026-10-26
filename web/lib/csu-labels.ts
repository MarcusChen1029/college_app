// Cal State Apply's own wording for a grade level, kept apart from csu-fill.ts so the extension's page code can use it without the maps.

/** The Add Grade Level form's option: "9th Grade" (7th to 12th). */
export const csuGradeLevelLabel = (n: number) => `${n}th Grade`;
/** The Year dropdown's option for the school year starting in `startYear`: "2023-2024". */
export const csuYear = (startYear: number) => `${startYear}-${startYear + 1}`;
/** The course form's Grade Level option for a grade level that exists on the school: "9th Grade • 2023-2024". */
export const csuGradeLevelOption = (r: { gradeLevel: number; year: string }) => `${csuGradeLevelLabel(r.gradeLevel)} • ${r.year}`;
