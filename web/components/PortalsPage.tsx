"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { newId } from "@/lib/activities";
import { isSubmitted } from "@/lib/application";
import { collegeRoute, requiresStars } from "@/lib/application-systems-data";
import { customSummary } from "@/lib/custom-college";
import {
  campusesOf,
  campusKey,
  collegeProgressKey,
  customProgressKey,
  EMPTY_LOGIN,
  hiddenLoginCount,
  progressNote,
  progressState,
  regionOfCollege,
  routeGroups,
  savedCount,
  starsPatches,
  systemsForRegion,
  withoutProgress,
  withProgress,
  type CustomPortal,
  type Login,
  type PortalData,
  type PortalRegion,
  type PortalSystem,
} from "@/lib/portals";
import { collegeSlot, portalSlot } from "@/lib/portal-slots";
import { forgetPassword } from "@/lib/portal-vault-client";
import { activeRegions, regionLabel, type RegionCode } from "@/lib/regions";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, LABEL, PANEL, SECTION_TITLE } from "@/lib/ui";
import { PaperPlane } from "./Doodles";
import { EmptyState } from "./EmptyState";
import { LoginRow, sysText, type RowProgress } from "./LoginRow";
import { StatusPill } from "./StatusPill";
import { useStarsSync } from "./useStarsSync";

const noop = () => () => {};

const regionName = (t: TFunction, code: string) => {
  const k = `portals.region.${code}` as MessageKey;
  const v = t(k);
  return v === k ? regionLabel(code) : v;
};

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className={SECTION_TITLE}>{title}</h2>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  );
}

/** A labelled block inside a country's section. */
function Group({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className={LABEL}>{title}</h3>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </div>
  );
}

export function PortalsPage({ colleges }: { colleges: CollegeSummary[] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  useStarsSync(student);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const data: PortalData = student.profile.portals ?? {};
  const commit = (next: PortalData) => student.updateProfile({ portals: next });
  // The Done / Not done mark of one row (its key: see PortalData.progress).
  const mark = (key: string): RowProgress => ({
    state: progressState(data, key),
    note: progressNote(data, key),
    onDone: (done) => commit(done === null ? withoutProgress(data, [key]) : withProgress(data, key, { done })),
    onNote: (note) => commit(withProgress(data, key, { note })),
  });
  const signedIn = !!student.auth;
  // A removed login takes its saved password (in the encrypted store) with it, but only once the profile save that
  // removes the login has succeeded: a refused or failed save keeps both.
  const setSystem = (key: string, login: Login | null) => {
    const systems = { ...data.systems };
    if (login) systems[key] = login;
    else delete systems[key];
    if (login) return void commit({ ...data, systems });
    void commit(withoutProgress({ ...data, systems }, [key])).then((ok) => ok && forgetPassword(portalSlot("system", key)));
  };
  const setCampus = (key: string, login: Login | null) => {
    const campuses = { ...data.campuses };
    if (login) campuses[key] = login;
    else delete campuses[key];
    if (login) return void commit({ ...data, campuses });
    void commit(withoutProgress({ ...data, campuses }, [key])).then((ok) => ok && forgetPassword(portalSlot("campus", key)));
  };
  const custom = data.custom ?? [];
  const setCustom = (next: CustomPortal[]) => commit({ ...data, custom: next });
  const removeCustom = (id: string) => {
    void commit(withoutProgress({ ...data, custom: custom.filter((x) => x.id !== id) }, [customProgressKey(id)])).then(
      (ok) => ok && forgetPassword(portalSlot("custom", id)),
    );
  };

  // The countries the student is applying to (all of them while none is chosen), in profile order.
  const regions = activeRegions(student.profile.targetRegions);
  const visible: readonly string[] = regions;

  const listed = student.list.flatMap((e) => {
    const college = e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((c) => c.slug === e.slug);
    return college ? [{ entry: e, college }] : [];
  });
  // A college's portal joins this page once its application is submitted.
  const submitted = listed.filter(({ entry }) => isSubmitted(entry.status));
  const submittedIn = (region: RegionCode) => submitted.filter(({ college }) => regionOfCollege(college) === region);
  // The application systems themselves (Common App, UC...) live on My list, one group per route.
  const routesOnList = routeGroups(
    listed.map(({ entry, college }) => ({ slug: college.slug, custom: !!entry.custom })),
    collegeRoute,
  ).map((g) => g.route);
  // STARS shows here by itself while a college on the list asks for it; otherwise it is in the + Add portal menu.
  const starsListed = listed.some(({ entry }) => !entry.custom && requiresStars(entry.slug));

  const sysName = (s: PortalSystem) => sysText(t, "name", s.key, s.name);
  // Accounts that are not a way to apply: testing, aid, visas and STARS (an add-on to the application).
  const isOther = (s: PortalSystem) => s.group === "optional" || s.kind === "addon";
  const otherShown = (s: PortalSystem) => !!data.systems?.[s.key] || (s.key === "stars" && starsListed);
  // A saved application-system login with no group on My list (e.g. Coalition) stays reachable here.
  const leftoverRoute = (s: PortalSystem) => s.kind === "route" && !!data.systems?.[s.key] && !routesOnList.includes(s.key);
  const othersAdded = (region: PortalRegion) => systemsForRegion(region).filter((s) => (isOther(s) && otherShown(s)) || leftoverRoute(s));
  const customIn = (region: PortalRegion) => custom.filter((p) => (p.region ?? "ANY") === region);
  // Campus logins the student saved earlier (UCLA, UT Austin MyStatus...); no new ones can be added here.
  const campusesIn = (region: PortalRegion) => systemsForRegion(region).flatMap((s) => campusesOf(data, s).map((c) => ({ s, c })));

  // Marking the STARS account done also ticks STARS on every listed college that asks for it; un-marking leaves those ticks alone.
  const markStars = (): RowProgress => {
    const base = mark("stars");
    return {
      ...base,
      onDone: (done) => {
        base.onDone(done);
        if (done !== true) return;
        const entries = listed.map(({ entry }) => ({ slug: entry.slug, checklist: entry.checklist }));
        for (const p of starsPatches(entries, requiresStars)) student.update(p.slug, { checklist: p.checklist });
      },
    };
  };

  const hiddenCount =
    hiddenLoginCount(data, regions, routesOnList) + submitted.filter(({ entry, college }) => entry.portal.username.trim() && !visible.includes(regionOfCollege(college))).length;

  // The accounts that are not a way to apply (testing, aid, visas, STARS) and custom portals of one country, or of "ANY";
  // null while there are none, so an empty country shows nothing.
  const otherRows = (region: PortalRegion) => {
    const added = othersAdded(region);
    const mine = customIn(region);
    const campuses = campusesIn(region);
    if (added.length === 0 && mine.length === 0 && campuses.length === 0) return null;
    return (
        <ul className="space-y-2">
          {added.map((s) => (
            <LoginRow
              key={s.key}
              name={sysName(s)}
              hint={sysText(t, "hint", s.key, s.hint)}
              official={s.url}
              login={data.systems?.[s.key] ?? EMPTY_LOGIN}
              slot={portalSlot("system", s.key)}
              signedIn={signedIn}
              onSave={(l) => setSystem(s.key, l)}
              onRemove={s.key === "stars" && starsListed ? undefined : () => window.confirm(t("portals.removeConfirm", { name: sysName(s) })) && setSystem(s.key, null)}
              progress={s.key === "stars" ? markStars() : mark(s.key)}
            />
          ))}
          {campuses.map(({ s, c }) => (
            <LoginRow
              key={campusKey(s.key, c)}
              name={`${c} (${sysName(s)})`}
              login={data.campuses![campusKey(s.key, c)]}
              slot={portalSlot("campus", campusKey(s.key, c))}
              signedIn={signedIn}
              onSave={(l) => setCampus(campusKey(s.key, c), l)}
              onRemove={() => setCampus(campusKey(s.key, c), null)}
              progress={mark(campusKey(s.key, c))}
            />
          ))}
          {mine.map((p) => (
            <LoginRow
              key={p.id}
              name={p.name}
              login={p}
              slot={portalSlot("custom", p.id)}
              signedIn={signedIn}
              onRename={(name) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, name } : x)))}
              onSave={(l) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, ...l } : x)))}
              onRemove={() => window.confirm(t("portals.removeCustomConfirm", { name: p.name || t("portals.thisPortal") })) && removeCustom(p.id)}
              progress={mark(customProgressKey(p.id))}
            />
          ))}
        </ul>
    );
  };

  // One "+ Add portal" for the whole page: every account not added yet, grouped by country (then "Any country"); each
  // group ends with "Something else…", which makes a portal of the student's own in that country (or in none, for Any).
  const seen = new Set<string>();
  const addGroups: { region: PortalRegion; systems: PortalSystem[] }[] = [];
  for (const region of [...regions, "ANY"] as PortalRegion[]) {
    const systems = systemsForRegion(region).filter((s) => isOther(s) && !otherShown(s) && !seen.has(s.key));
    systems.forEach((s) => seen.add(s.key));
    addGroups.push({ region, systems });
  }
  const addMenu = (
    <select
      className={buttonClass("secondary", "sm")}
      value=""
      aria-label={t("portals.addPortalLabel")}
      onChange={(e) => {
        const v = e.target.value;
        const group = addGroups.find((g) => v === `custom:${g.region}`);
        if (group) {
          const region = group.region;
          setCustom([...custom, { ...EMPTY_LOGIN, id: newId(), name: "", ...(region === "ANY" ? {} : { region }) }]);
        } else if (v) setSystem(v, EMPTY_LOGIN);
      }}
    >
      <option value="">{t("portals.addPortal")}</option>
      {addGroups.map((g) => (
        <optgroup key={g.region} label={g.region === "ANY" ? t("portals.anyCountry") : regionName(t, g.region)}>
          {g.systems.map((s) => (
            <option key={s.key} value={s.key}>
              {sysName(s)}
            </option>
          ))}
          <option value={`custom:${g.region}`}>{t("portals.somethingElse")}</option>
        </optgroup>
      ))}
    </select>
  );

  // Where the logins live, said once beside the Add control in a neutral tone (not a warning).
  const savedNote = (
    <p className="basis-full text-sm text-zinc-700">
      {signedIn ? t("portals.noticeAccount") : t("portals.noticeBrowser")}
      {" · "}
      {(() => {
        const n = savedCount(data) + submitted.filter(({ entry }) => entry.portal.username.trim()).length;
        return n === 1 ? t("portals.loginsSavedOne", { n }) : t("portals.loginsSavedMany", { n });
      })()}
    </p>
  );

  // A country shows up once it holds something: a submitted college's portal, or an account added for it.
  const countrySection = (region: RegionCode) => {
    const inCountry = submittedIn(region);
    const others = otherRows(region);
    if (inCountry.length === 0 && !others) return null;
    const both = inCountry.length > 0 && !!others;
    return (
      <Section key={region} title={regionName(t, region)}>
        {/* With both groups, they sit side by side on a wide screen, so a country is one short band. */}
        <div className={`grid gap-5 ${both ? "xl:grid-cols-2 xl:gap-6" : ""}`}>
          {inCountry.length > 0 && (
            <Group title={t("portals.groupSubmitted")}>
              <ul className="space-y-2">
                {inCountry.map(({ entry, college }) => (
                  <LoginRow
                    key={college.slug}
                    name={college.short_name ?? college.name}
                    hint={t("portals.submittedHint")}
                    login={entry.portal}
                    slot={collegeSlot(entry)}
                    signedIn={signedIn}
                    onSave={(portal) => student.update(college.slug, { portal })}
                    status={
                      !entry.custom && requiresStars(college.slug) ? (
                        <StatusPill tone={entry.checklist.stars ? "done" : "soon"}>{entry.checklist.stars ? t("portals.starsOk") : t("portals.starsMissing")}</StatusPill>
                      ) : undefined
                    }
                    progress={mark(collegeProgressKey(college.slug))}
                  />
                ))}
              </ul>
            </Group>
          )}
          {others && <Group title={t("portals.groupOther")}>{others}</Group>}
        </div>
      </Section>
    );
  };

  const anyRows = otherRows("ANY");
  const sections = [
    ...regions.map(countrySection),
    anyRows && (
      <Section key="ANY" title={t("portals.anyCountry")}>
        {anyRows}
      </Section>
    ),
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {!signedIn && student.localPasswordCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-ink">
          <p className="min-w-0 flex-1">
            {student.localPasswordCount === 1
              ? t("portals.legacyLocalOne", { n: student.localPasswordCount })
              : t("portals.legacyLocalMany", { n: student.localPasswordCount })}
          </p>
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => student.forgetLocalPasswords()}>
            {t("portals.legacyLocalRemove")}
          </button>
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-ink">
          {hiddenCount === 1 ? t("portals.hiddenOnePre", { n: hiddenCount }) : t("portals.hiddenManyPre", { n: hiddenCount })}
          <Link href="/profile" className="text-blue-700 underline">
            {t("portals.yourProfile")}
          </Link>
          {t("portals.hiddenPost")}
        </p>
      )}

      {sections.length === 0 ? (
        <EmptyState
          art={<PaperPlane className="h-16 w-auto" />}
          title={t("portals.emptyTitle")}
          actions={
            <>
              {addMenu}
              {savedNote}
            </>
          }
        >
          {t("portals.submittedEmptyPre")}
          <Link href="/application/list" className="font-semibold text-blue-700 underline underline-offset-4">
            {t("portals.myList")}
          </Link>
          {t("portals.submittedEmptyPost")} {t("portals.countryHelp")}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[15px] text-ink">{t("portals.countryHelp")}</p>
            {addMenu}
            {savedNote}
          </div>
          {sections}
        </>
      )}
    </div>
  );
}
