import { humanize, interestedNames, sectionScores } from "@/lib/roster-detail";
import type { StudentDetail } from "@/lib/roster";
import { regionLabel } from "@/lib/regions";
import { ACT_SCALE, ENGLISH_TESTS, SAT_SCALE, type EnglishTestKey, type ScoreScale, type SectionScores } from "@/lib/scores";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-2xl border border-zinc-200 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const Missing = () => <span className="text-zinc-400">Not entered</span>;

/** A headline score with the filled-in section scores underneath. */
function Score({ value, scale, sections }: { value: number | null; scale: ScoreScale; sections?: SectionScores }) {
  const parts = sectionScores(scale, sections);
  if (value == null && parts.length === 0) return <Missing />;
  return (
    <>
      {value != null && <p className="font-display text-xl font-bold">{value}</p>}
      {parts.length > 0 && <p className="text-zinc-600">{parts.map((p) => `${p.label} ${p.value}`).join(" · ")}</p>}
    </>
  );
}

export function OverviewPanel({ detail }: { detail: StudentDetail }) {
  const p = detail.profile;
  const english = p.englishTestKey && p.englishTestKey in ENGLISH_TESTS ? (p.englishTestKey as EnglishTestKey) : null;
  const englishLabel = english ? ENGLISH_TESTS[english].label : p.englishTestKey;
  const englishParts = english ? sectionScores(ENGLISH_TESTS[english], p.testDetails.english?.[english]?.sections) : [];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Item label="SAT">
        <Score value={p.satTotal} scale={SAT_SCALE} sections={p.testDetails.sat} />
      </Item>
      <Item label="ACT">
        <Score value={p.actComposite} scale={ACT_SCALE} sections={p.testDetails.act} />
      </Item>
      <Item label="GPA (unweighted)">{p.gpaUnweighted != null ? <p className="font-display text-xl font-bold">{p.gpaUnweighted}</p> : <Missing />}</Item>
      <Item label="English test">
        {englishLabel || p.englishScore != null ? (
          <>
            <p>
              {englishLabel ?? "Test not chosen"}
              {p.englishScore != null && <span className="font-display text-xl font-bold"> {p.englishScore}</span>}
            </p>
            {englishParts.length > 0 && <p className="text-zinc-600">{englishParts.map((s) => `${s.label} ${s.value}`).join(" · ")}</p>}
          </>
        ) : (
          <Missing />
        )}
      </Item>
      <Item label="Intended field">{p.intendedCategory ? humanize(p.intendedCategory) : <Missing />}</Item>
      <Item label="Target regions">{p.targetRegions.length > 0 ? p.targetRegions.map(regionLabel).join(", ") : <span className="text-zinc-400">Not chosen</span>}</Item>
      <Item label="International student">{p.isInternational ? "Yes" : "No"}</Item>
      <Item label="Needs financial aid">{p.needsAid ? "Yes" : "No"}</Item>
      <Item label="Profile last updated">{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : <span className="text-zinc-400">Never</span>}</Item>
    </dl>
  );
}

export function InterestedPanel({ detail }: { detail: StudentDetail }) {
  const names = interestedNames(detail);
  if (names.length === 0) return <p className="text-sm text-zinc-500">{detail.displayName} hasn&apos;t marked any colleges as interested.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">Colleges {detail.displayName} is considering but hasn&apos;t put on their list.</p>
      <ul className="flex flex-wrap gap-2">
        {names.map((n) => (
          <li key={n.slug} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-800">
            {n.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
