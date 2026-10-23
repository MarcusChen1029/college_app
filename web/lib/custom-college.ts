// Colleges a student adds themselves because we don't have them. Stored on the list row
// (student_colleges.custom); shown with the same screens as a regular college, minus the data we lack.

import type { CollegeSummary, Deadline } from "./types.ts";

export type CustomCollege = {
  name: string;
  city?: string;
  region?: string;
  country?: string;
  website?: string;
  /** Application deadline, yyyy-mm-dd. */
  deadline?: string;
};

export const customSlug = (rowId: string) => `custom-${rowId}`;
export const isCustomSlug = (slug: string) => slug.startsWith("custom-");

/** Trims the form input; returns the cleaned college or the reason it can't be added. */
export function cleanCustom(input: CustomCollege): { ok: true; value: CustomCollege } | { ok: false; error: string } {
  const t = (s?: string) => s?.trim() || undefined;
  const name = t(input.name);
  if (!name) return { ok: false, error: "Enter the college's name." };
  let website = t(input.website);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      new URL(website);
    } catch {
      return { ok: false, error: "That website address doesn't look right." };
    }
  }
  const deadline = t(input.deadline);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { ok: false, error: "Use a valid deadline date." };
  return { ok: true, value: { name, city: t(input.city), region: t(input.region), country: t(input.country), website, deadline } };
}

/** The summary the list screens expect, with everything we don't know left empty. */
export function customSummary(rowId: string, c: CustomCollege): CollegeSummary {
  return {
    id: rowId,
    slug: customSlug(rowId),
    name: c.name,
    short_name: null,
    country_code: "",
    state_region: c.region ?? null,
    city: c.city ?? null,
    latitude: null,
    longitude: null,
    setting: null,
    control: null,
    undergrad_enrollment: null,
    pct_international_ug: null,
    general_tier: null,
    cds_year: null,
    applicants: null,
    admits: null,
    admit_rate: null,
    ed_admit_rate: null,
    intl_admit_rate: null,
    gpa_avg: null,
    sat_p25: null,
    sat_p50: null,
    sat_p75: null,
    act_p25: null,
    act_p50: null,
    act_p75: null,
    test_policy: null,
    english_policy: null,
    total_coa_usd: null,
    tuition_usd: null,
    tuition_out_of_state_usd: null,
    tuition_intl_usd: null,
    intl_aid_policy: null,
    tiers: {},
    plans: null,
    next_deadline: c.deadline ?? null,
  };
}

/** The custom deadline as a Deadline row, so "Upcoming dates" treats it like any other. */
export function customDeadline(rowId: string, c: CustomCollege): Deadline | null {
  if (!c.deadline) return null;
  return {
    id: `custom-${rowId}`,
    institution_id: rowId,
    cycle: "",
    kind: "custom",
    plan_key: null,
    label: "Application deadline",
    due_date: c.deadline,
    notification_date: null,
    notification_note: null,
    notes: null,
    source_id: null,
  };
}
