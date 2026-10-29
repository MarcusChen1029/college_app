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
import { forgetPassword, lock as lockVault, useVault } from "@/lib/portal-vault-client";
import { activeRegions, regionLabel, type RegionCode } from "@/lib/regions";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
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
    <section className="rounded-3xl border-2 border-zinc-200 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </div>
  );
}

export function PortalsPage({ colleges }: { colleges: CollegeSummary[] }) {
  const t = useT();
  const student = useStudent();
  const vault = useVault();
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

  // The accounts that are not a way to apply (testing, aid, visas, STARS) and custom portals of one country, or of "ANY".
  const otherBlock = (region: PortalRegion) => {
    const added = othersAdded(region);
    const left = systemsForRegion(region).filter((s) => isOther(s) && !otherShown(s));
    const mine = customIn(region);
    const campuses = campusesIn(region);
    const menu = (
      <select
        className={buttonClass("primary", "sm")}
        value=""
        aria-label={region === "ANY" ? t("portals.addPortalLabel") : t("portals.addPortalLabelFor", { region: regionName(t, region) })}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") setCustom([...custom, { ...EMPTY_LOGIN, id: newId(), name: "", ...(region === "ANY" ? {} : { region }) }]);
          else if (v) setSystem(v, EMPTY_LOGIN);
        }}
      >
        <option value="">{t("portals.addPortal")}</option>
        {left.map((s) => (
          <option key={s.key} value={s.key}>
            {sysName(s)}
          </option>
        ))}
        <option value="custom">{t("portals.somethingElse")}</option>
      </select>
    );
    const body =
      added.length === 0 && mine.length === 0 && campuses.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {region === "ANY" ? t("portals.anyHelp") : t("portals.countryHelp")}
        </p>
      ) : (
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
    return { menu, body };
  };

  const countrySection = (region: RegionCode) => {
    const inCountry = submittedIn(region);
    const { menu, body } = otherBlock(region);
    return (
      <Section key={region} title={regionName(t, region)}>
        <div className="space-y-5">
          <Group title={t("portals.groupSubmitted")}>
            {inCountry.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {t("portals.submittedEmptyPre")}
                <Link href="/application/list" className="text-blue-600 underline">
                  {t("portals.myList")}
                </Link>
                {t("portals.submittedEmptyPost")}
              </p>
            ) : (
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
            )}
          </Group>

          <Group title={t("portals.groupOther")} aside={menu}>
            {body}
          </Group>
        </div>
      </Section>
    );
  };

  const any = otherBlock("ANY");

  return (
    <div className="space-y-6">
      <p className={`rounded-lg border px-3 py-2 text-xs ${toneClass("soon")}`}>
        {signedIn ? t("portals.noticeAccount") : t("portals.noticeBrowser")}
        {" · "}
        {(() => {
          const n = savedCount(data) + submitted.filter(({ entry }) => entry.portal.username.trim()).length;
          return n === 1 ? t("portals.loginsSavedOne", { n }) : t("portals.loginsSavedMany", { n });
        })()}
      </p>

      {signedIn && vault.lock === "unlocked" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
          <p className="min-w-0 flex-1" role="status">
            {vault.moved !== null && vault.moved > 0 && (
              <span className="font-semibold">
                {vault.moved === 1 ? t("portals.vault.movedOne", { n: vault.moved }) : t("portals.vault.movedMany", { n: vault.moved })}{" "}
              </span>
            )}
            {t("portals.vault.unlockedNote")}
          </p>
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => lockVault()}>
            {t("portals.vault.lockNow")}
          </button>
        </div>
      )}

      {!signedIn && student.localPasswordCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
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
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
          {hiddenCount === 1 ? t("portals.hiddenOnePre", { n: hiddenCount }) : t("portals.hiddenManyPre", { n: hiddenCount })}
          <Link href="/profile" className="text-blue-600 underline">
            {t("portals.yourProfile")}
          </Link>
          {t("portals.hiddenPost")}
        </p>
      )}

      {regions.map(countrySection)}

      <Section title={t("portals.anyCountry")} aside={any.menu}>
        {any.body}
      </Section>
    </div>
  );
}
