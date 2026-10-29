"use client";

// The College match card's glimpse: how many colleges /tools/match would list as reach, target and safety for the
// student's saved field. The same rules as recommend() in lib/field-match.ts: each college's field strength (scored on
// the server with scoreField), a second field blended in with combine(), the RECOMMEND_THRESHOLD, the student's target
// regions (all regions in the data when none are chosen) and computeFit for the band. With no saved field it shows the
// card's drawing instead of guessing one.
import { GradCap } from "@/components/Doodles";
import { combine, RECOMMEND_THRESHOLD, type FieldScore } from "@/lib/field-match";
import { computeFit, type Fit, type FitInput } from "@/lib/fit";
import { cleanStudyFields, type FieldKey } from "@/lib/fields";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { cleanRegions } from "@/lib/regions";
import { useStudent } from "@/lib/student-store";
import { fitDotClass } from "@/lib/ui";

/** A college the glimpse can count: its region, what computeFit needs, and its strength in each field it is rated in. */
export type GlimpseCollege = { country: string; fit: FitInput; s: Partial<Record<FieldKey, number>> };

const BAND: Record<Fit, "reach" | "target" | "safety"> = { super_reach: "reach", reach: "reach", target: "target", safety: "safety" };
const BANDS = ["reach", "target", "safety"] as const;
const ok = (strength: number): FieldScore => ({ status: "ok", strength, confidence: null, depth: "unknown", grads: null, share: null, tier: [] });

export function MatchGlimpse({ colleges, present }: { colleges: GlimpseCollege[]; present: string[] }) {
  const t = useT();
  const student = useStudent();
  const profile = student.profile;
  const [main, second] = cleanStudyFields(profile.studyFields);
  if (!student.ready || !main) return <MatchDrawing />;

  const targeted = cleanRegions(profile.targetRegions).filter((c) => present.includes(c));
  const regions = targeted.length ? targeted : present;
  const counts = { reach: 0, target: 0, safety: 0 };
  for (const c of colleges) {
    if (!regions.includes(c.country)) continue;
    const s1 = c.s[main];
    if (s1 == null) continue;
    const s2 = second && second !== main ? c.s[second] : undefined;
    const score = second && second !== main ? combine(ok(s1), s2 == null ? null : ok(s2)) : ok(s1);
    if (score.strength == null || score.strength < RECOMMEND_THRESHOLD) continue;
    const fit = computeFit(profile, c.fit);
    if (fit) counts[BAND[fit.fit]]++;
  }
  const field = (k: FieldKey) => t(`match.field.${k}` as MessageKey);

  return (
    <div aria-hidden className="w-36 shrink-0 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{second && second !== main ? `${field(main)} + ${field(second)}` : field(main)}</p>
      <ul className="mt-2 space-y-1 text-[13px]">
        {BANDS.map((b) => (
          <li key={b} className="flex items-center gap-1.5">
            <span className={`inline-block size-2 shrink-0 rounded-full ${fitDotClass(b)}`} />
            <span className="font-bold tabular-nums">{counts[b]}</span>
            <span className="truncate">{t(`match.bucket.${b}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchDrawing() {
  return (
    <div aria-hidden className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white">
      <GradCap className="w-14" />
    </div>
  );
}
