"use client";

import { useT } from "@/lib/i18n/client";
import { CA_TIMING, HONOR_LEVELS, UC_AWARD_LEVELS, UC_CATEGORIES, type CaActivity, type CaHonor, type UcEntry } from "@/lib/activities";
import { caRole, ucName } from "@/lib/resume";
import type { StudentDetail } from "@/lib/roster";
import type { TFunction } from "@/lib/i18n";

const hours = (t: TFunction, perWeek: number | null, perYear: number | null) =>
  [perWeek != null && t("teacher.activities.hoursWeek", { n: perWeek }), perYear != null && t("teacher.activities.weeksYear", { n: perYear })].filter(Boolean).join(", ");
const grades = (t: TFunction, g: string[] | undefined) => (g && g.length > 0 ? t("teacher.activities.grades", { list: g.join(", ") }) : "");
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
  const t = useT();
  // The role is shown only when the student answered yes to "Did you have a specific position or leadership role?".
  const role = caRole(a);
  const title = a.leadership === true ? role || t("teacher.activities.noPosition") : a.organization || t("teacher.activities.untitledEntry");
  return (
    <li className="space-y-1 rounded-2xl border border-zinc-200 p-4 text-sm">
      <p className="font-semibold">
        {n}. {title}
        {a.leadership === true && a.organization && <span className="font-normal"> {t("teacher.activities.at", { org: a.organization })}</span>}
      </p>
      <p className="text-zinc-500">{meta(a.sport ? `${a.type}: ${a.sport}` : a.type, hours(t, a.hoursPerWeek, a.weeksPerYear), grades(t, a.grades), a.timing && CA_TIMING[a.timing])}</p>
      {a.description && <p className="text-zinc-700">{a.description}</p>}
    </li>
  );
}

function HonorItem({ h, n }: { h: CaHonor; n: number }) {
  const t = useT();
  return (
    <li className="rounded-2xl border border-zinc-200 p-4 text-sm">
      <p className="font-semibold">
        {n}. {h.title || t("teacher.activities.untitledHonor")}
      </p>
      <p className="text-zinc-500">{meta(h.levels?.map((l) => HONOR_LEVELS[l]).join(", "), grades(t, h.grades))}</p>
    </li>
  );
}

function UcItem({ e }: { e: UcEntry }) {
  const t = useT();
  const form = UC_CATEGORIES[e.category];
  // Work: job title at workplace. Education prep: the program (or the name typed for Other).
  const work = e.category === "work" && e.jobTitle.trim() !== "";
  return (
    <li className="space-y-1 rounded-2xl border border-zinc-200 p-4 text-sm">
      <p className="font-semibold">
        {(work ? e.jobTitle : ucName(e)) || t("teacher.activities.untitledEntry")}
        {work && e.name && <span className="font-normal"> {t("teacher.activities.at", { org: e.name })}</span>}
      </p>
      <p className="text-zinc-500">{meta(form?.label ?? e.category, e.awardLevels.map((l) => UC_AWARD_LEVELS[l]).join(", "), hours(t, e.hoursPerWeek, e.weeksPerYear), grades(t, e.grades))}</p>
      {e.description && <p className="text-zinc-700">{e.description}</p>}
    </li>
  );
}

export function ActivitiesPanel({ detail }: { detail: StudentDetail }) {
  const t = useT();
  const activities = detail.activities.commonApp.activities;
  const honors = detail.activities.commonApp.honors;
  const uc = detail.activities.uc;
  if (activities.length + honors.length + uc.length === 0) return <Empty>{t("teacher.activities.empty", { name: detail.displayName })}</Empty>;

  return (
    <div className="space-y-8">
      <Block title={t("teacher.activities.caActivities")} count={activities.length}>
        {activities.length === 0 ? (
          <Empty>{t("teacher.activities.none")}</Empty>
        ) : (
          <ul className="space-y-3">
            {activities.map((a, i) => (
              <CaItem key={a.id} a={a} n={i + 1} />
            ))}
          </ul>
        )}
      </Block>
      <Block title={t("teacher.activities.caHonors")} count={honors.length}>
        {honors.length === 0 ? (
          <Empty>{t("teacher.activities.none")}</Empty>
        ) : (
          <ul className="space-y-3">
            {honors.map((h, i) => (
              <HonorItem key={h.id} h={h} n={i + 1} />
            ))}
          </ul>
        )}
      </Block>
      <Block title={t("teacher.activities.ucEntries")} count={uc.length}>
        {uc.length === 0 ? (
          <Empty>{t("teacher.activities.none")}</Empty>
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
