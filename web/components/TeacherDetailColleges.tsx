import { CHECKLIST, ESSAY_STATUSES, isDone, progress } from "@/lib/checklist";
import { fmtDate } from "@/lib/format";
import { daysUntil, SOON_DAYS, type DetailCollege, type StudentDetail } from "@/lib/roster";
import { daysLabel, statusLabel } from "@/lib/roster-view";

const essayStatus = Object.fromEntries(ESSAY_STATUSES) as Record<string, string>;

function CollegeCard({ college: c, now }: { college: DetailCollege; now: Date }) {
  const { done, total } = progress(c.checklist);
  const essays = (c.checklist.essay_list ?? []).filter((e) => e.title || e.status !== "not_started");
  return (
    <li className="space-y-3 rounded-2xl border border-zinc-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">
            {c.name} {c.custom && <span className="align-middle text-xs font-normal text-zinc-500">(custom)</span>}
          </h3>
          <p className="text-sm text-zinc-500">{c.plan ? `Plan: ${c.plan}` : "No plan chosen"}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{statusLabel(c.status, c.checklist)}</span>
      </div>

      <div>
        <h4 className="text-sm font-semibold">
          Checklist <span className="font-normal text-zinc-500">({done}/{total} done)</span>
        </h4>
        <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {CHECKLIST.map(([key, label]) => (
            <li key={key} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className={isDone(key, c.checklist) ? "font-semibold text-emerald-700" : "text-zinc-500"}>{isDone(key, c.checklist) ? "Done" : "Not done"}</span>
            </li>
          ))}
        </ul>
      </div>

      {essays.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Essays for this college</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {essays.map((e, i) => (
              <li key={e.id ?? i}>
                {e.title || (e.id ? "Untitled essay" : "Essay")} <span className="text-zinc-500">({essayStatus[e.status] ?? e.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold">Deadlines ahead</h4>
        {c.deadlines.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">None coming up.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm">
            {c.deadlines.map((d) => {
              const days = daysUntil(d.dueDate, now);
              return (
                <li key={`${d.kind}-${d.dueDate}-${d.label}`} className={days <= SOON_DAYS ? "font-medium text-rose-700" : ""}>
                  {fmtDate(d.dueDate)} <span className="text-xs">({daysLabel(days)})</span> - {d.label}
                  {d.plan ? ` (${d.plan})` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

export function CollegesPanel({ detail, now }: { detail: StudentDetail; now: Date }) {
  if (detail.colleges.length === 0) return <p className="text-sm text-zinc-500">{detail.displayName} hasn&apos;t added any colleges yet.</p>;
  return (
    <ul className="space-y-4">
      {detail.colleges.map((c) => (
        <CollegeCard key={c.slug} college={c} now={now} />
      ))}
    </ul>
  );
}
