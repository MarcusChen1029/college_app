import { CA_TIMING, HONOR_LEVELS, UC_AWARD_LEVELS, UC_CATEGORIES, type CaActivity, type CaHonor, type UcEntry } from "@/lib/activities";
import type { StudentDetail } from "@/lib/roster";

const hours = (perWeek: number | null, perYear: number | null) =>
  [perWeek != null && `${perWeek} hrs/week`, perYear != null && `${perYear} weeks/year`].filter(Boolean).join(", ");
const grades = (g: string[] | undefined) => (g && g.length > 0 ? `Grades ${g.join(", ")}` : "");
const meta = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

function Block({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-lg font-bold">
        {title} <span className="text-sm font-normal text-zinc-500">({count})</span>
      </h3>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-zinc-500">{children}</p>;

function CaItem({ a, n }: { a: CaActivity; n: number }) {
  return (
    <li className="space-y-1 rounded-2xl border border-zinc-200 p-4 text-sm">
      <p className="font-semibold">
        {n}. {a.position || "Position not entered"}
        {a.organization && <span className="font-normal"> at {a.organization}</span>}
      </p>
      <p className="text-zinc-500">{meta(a.type, hours(a.hoursPerWeek, a.weeksPerYear), grades(a.grades), a.timing?.map((t) => CA_TIMING[t]).join(", "))}</p>
      {a.description && <p className="text-zinc-700">{a.description}</p>}
    </li>
  );
}

function HonorItem({ h, n }: { h: CaHonor; n: number }) {
  return (
    <li className="rounded-2xl border border-zinc-200 p-4 text-sm">
      <p className="font-semibold">
        {n}. {h.title || "Untitled honor"}
      </p>
      <p className="text-zinc-500">{meta(h.levels?.map((l) => HONOR_LEVELS[l]).join(", "), grades(h.grades))}</p>
    </li>
  );
}

function UcItem({ e }: { e: UcEntry }) {
  const form = UC_CATEGORIES[e.category];
  return (
    <li className="space-y-1 rounded-2xl border border-zinc-200 p-4 text-sm">
      <p className="font-semibold">
        {e.name || "Untitled entry"}
        {e.organization && <span className="font-normal"> at {e.organization}</span>}
      </p>
      <p className="text-zinc-500">{meta(form?.label ?? e.category, e.awardLevel && UC_AWARD_LEVELS[e.awardLevel], hours(e.hoursPerWeek, e.weeksPerYear), grades(e.grades))}</p>
      {e.description && <p className="text-zinc-700">{e.description}</p>}
    </li>
  );
}

export function ActivitiesPanel({ detail }: { detail: StudentDetail }) {
  const activities = detail.activities.commonApp?.activities ?? [];
  const honors = detail.activities.commonApp?.honors ?? [];
  const uc = detail.activities.uc ?? [];
  if (activities.length + honors.length + uc.length === 0) return <Empty>{detail.displayName} hasn&apos;t entered any activities or honors yet.</Empty>;

  return (
    <div className="space-y-8">
      <Block title="Common App activities" count={activities.length}>
        {activities.length === 0 ? (
          <Empty>None entered.</Empty>
        ) : (
          <ul className="space-y-3">
            {activities.map((a, i) => (
              <CaItem key={a.id} a={a} n={i + 1} />
            ))}
          </ul>
        )}
      </Block>
      <Block title="Common App honors" count={honors.length}>
        {honors.length === 0 ? (
          <Empty>None entered.</Empty>
        ) : (
          <ul className="space-y-3">
            {honors.map((h, i) => (
              <HonorItem key={h.id} h={h} n={i + 1} />
            ))}
          </ul>
        )}
      </Block>
      <Block title="UC application entries" count={uc.length}>
        {uc.length === 0 ? (
          <Empty>None entered.</Empty>
        ) : (
          <ul className="space-y-3">
            {uc.map((e) => (
              <UcItem key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
