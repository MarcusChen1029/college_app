// The built supplements data (scripts/build_supplements.py) bound to the pure helpers in supplements.ts.
// Kept apart so supplements.ts stays importable by node tests, which can't import JSON without attributes.
import raw from "./data/supplements.json";
import { intlFinanceFor, promptsFor, supplementsFor, type CollegeSupplements, type SupplementsData } from "./supplements";

// Through unknown: the inferred JSON literal types (plain strings) are wider than the checked unions.
export const SUPPLEMENTS = raw as unknown as SupplementsData;

export const collegeSupplements = (slug: string): CollegeSupplements | null => supplementsFor(SUPPLEMENTS, slug);
export const collegePrompts = (slug: string) => promptsFor(SUPPLEMENTS, slug);
export const collegeIntlFinance = (slug: string) => intlFinanceFor(SUPPLEMENTS, slug);
