"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { newId } from "@/lib/activities";
import { isSubmitted } from "@/lib/application";
import { safeLink } from "@/lib/checklist";
import {
  campusesOf,
  campusKey,
  EMPTY_LOGIN,
  hiddenLoginCount,
  openUrl,
  regionOfCollege,
  savedCount,
  systemsForRegion,
  type CustomPortal,
  type Login,
  type PortalData,
  type PortalRegion,
  type PortalSystem,
} from "@/lib/portals";
import { activeRegions, regionLabel, type RegionCode } from "@/lib/regions";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";

const noop = () => () => {};

/** Looks up a per-system translation (name or hint); falls back to the English text when the key is missing. */
const sysText = (t: TFunction, kind: "name" | "hint", key: string, fallback: string) => {
  const k = `portals.${kind}.${key}` as MessageKey;
  const v = t(k);
  return v === k ? fallback : v;
};
const regionName = (t: TFunction, code: string) => {
  const k = `portals.region.${code}` as MessageKey;
  const v = t(k);
  return v === k ? regionLabel(code) : v;
};
const input = "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? t("common.copied") : t("common.copy")}
    </button>
  );
}

/**
 * One portal as a collapsible box. The name opens the portal in a new tab; clicking anywhere
 * else on the box shows the saved login for checking or editing (saved on blur).
 */
function LoginRow({
  name,
  hint,
  official,
  login,
  onSave,
  onRemove,
  onRename,
  indent,
}: {
  name: string;
  hint?: string;
  official?: string | null;
  login: Login;
  onSave: (l: Login) => void;
  onRemove?: () => void;
  onRename?: (name: string) => void;
  indent?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(!name && !!onRename);
  const [show, setShow] = useState(false);
  const save = (patch: Partial<Login>) => {
    const next = { ...login, ...patch };
    if (next.url !== login.url || next.username !== login.username || next.password !== login.password) onSave(next);
  };
  const link = safeLink(openUrl(login, official ?? null));
  const label = name || t("portals.untitled");
  return (
    <li className={indent ? "ml-6" : ""}>
      <div className={`rounded-xl border ${open ? "border-blue-300 bg-blue-50/40" : "border-zinc-200"}`}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={open ? t("portals.hideLogin", { label }) : t("portals.showLogin", { label })}
          className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-700 hover:underline"
              onClick={(e) => e.stopPropagation()}
              title={t("portals.open", { label })}
            >
              {label} ↗
            </a>
          ) : (
            <span className="font-semibold">{label}</span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{login.username || (link ? t("portals.noLogin") : t("portals.noLinkOrLogin"))}</span>
          <span aria-hidden className="text-zinc-400">
            {open ? "▾" : "▸"}
          </span>
        </div>
        {open && (
          <div className="space-y-2 border-t border-zinc-100 px-3 pb-3 pt-2">
            {hint && <p className="text-xs text-zinc-500">{hint}</p>}
            {onRename && (
              <input
                className={`${input} w-full font-semibold`}
                defaultValue={name}
                placeholder={t("portals.namePlaceholder")}
                aria-label={t("portals.nameLabel")}
                autoFocus={!name}
                onBlur={(e) => e.target.value.trim() !== name && onRename(e.target.value.trim())}
              />
            )}
            <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1.5fr]">
              <input
                type="url"
                className={input}
                defaultValue={login.url}
                placeholder={official ?? t("portals.linkPlaceholder")}
                aria-label={t("portals.linkFor", { label })}
                onBlur={(e) => save({ url: e.target.value.trim() })}
              />
              <div className="flex items-center gap-1">
                <input
                  className={`${input} flex-1`}
                  defaultValue={login.username}
                  placeholder={t("portals.usernamePlaceholder")}
                  autoComplete="off"
                  aria-label={t("portals.usernameFor", { label })}
                  onBlur={(e) => save({ username: e.target.value.trim() })}
                />
                <CopyButton value={login.username} label={t("portals.copyUsername", { label })} />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type={show ? "text" : "password"}
                  className={`${input} flex-1`}
                  defaultValue={login.password}
                  placeholder={t("portals.passwordPlaceholder")}
                  autoComplete="new-password"
                  aria-label={t("portals.passwordFor", { label })}
                  onBlur={(e) => save({ password: e.target.value })}
                />
                <button type="button" className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100" onClick={() => setShow((v) => !v)}>
                  {show ? t("portals.hide") : t("portals.show")}
                </button>
                <CopyButton value={login.password} label={t("portals.copyPassword", { label })} />
              </div>
            </div>
            {onRemove && (
              <button type="button" className={buttonClass("danger", "sm")} onClick={onRemove}>
                {t("common.remove")}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

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
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const data: PortalData = student.profile.portals ?? {};
  const save = (patch: Partial<PortalData>) => student.updateProfile({ portals: { ...data, ...patch } });
  const setSystem = (key: string, login: Login | null) => {
    const systems = { ...data.systems };
    if (login) systems[key] = login;
    else delete systems[key];
    save({ systems });
  };
  const setCampus = (key: string, login: Login | null) => {
    const campuses = { ...data.campuses };
    if (login) campuses[key] = login;
    else delete campuses[key];
    save({ campuses });
  };
  const custom = data.custom ?? [];
  const setCustom = (next: CustomPortal[]) => save({ custom: next });

  // The countries the student is applying to (all of them while none is chosen), in profile order.
  const regions = activeRegions(student.profile.targetRegions);
  const visible: readonly string[] = regions;

  // A college's portal joins this page once its application is submitted.
  const submitted = student.list.flatMap((e) => {
    const college = colleges.find((c) => c.slug === e.slug);
    return college && isSubmitted(e.status) ? [{ entry: e, college }] : [];
  });

  const hiddenCount =
    hiddenLoginCount(data, regions) + submitted.filter(({ entry, college }) => entry.portal.username.trim() && !visible.includes(regionOfCollege(college))).length;

  const systemRows = (s: PortalSystem) => {
    const added = campusesOf(data, s);
    const remaining = (s.campuses ?? []).filter((c) => !added.includes(c));
    return [
      <LoginRow key={s.key} name={sysText(t, "name", s.key, s.name)} hint={sysText(t, "hint", s.key, s.hint)} official={s.url} login={data.systems?.[s.key] ?? EMPTY_LOGIN} onSave={(l) => setSystem(s.key, l)} />,
      ...added.map((c) => (
        <LoginRow
          key={campusKey(s.key, c)}
          indent
          name={c}
          login={data.campuses![campusKey(s.key, c)]}
          onSave={(l) => setCampus(campusKey(s.key, c), l)}
          onRemove={() => setCampus(campusKey(s.key, c), null)}
        />
      )),
      remaining.length > 0 && (
        <li key={`${s.key}-add`} className="ml-6">
          <select
            className={`${input} text-xs`}
            value=""
            aria-label={t("portals.addCampusLabel", { name: sysText(t, "name", s.key, s.name) })}
            onChange={(e) => e.target.value && setCampus(campusKey(s.key, e.target.value), EMPTY_LOGIN)}
          >
            <option value="">{t("portals.addCampus")}</option>
            {remaining.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </li>
      ),
    ];
  };

  // The optional systems (testing, aid, visas) and custom portals of one country, or of "ANY".
  const optionalBlock = (region: PortalRegion) => {
    const optional = systemsForRegion(region).filter((s) => s.group === "optional");
    const added = optional.filter((s) => data.systems?.[s.key]);
    const left = optional.filter((s) => !data.systems?.[s.key]);
    const mine = custom.filter((p) => (p.region ?? "ANY") === region);
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
            {sysText(t, "name", s.key, s.name)}
          </option>
        ))}
        <option value="custom">{t("portals.somethingElse")}</option>
      </select>
    );
    const body =
      added.length === 0 && mine.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {region === "ANY" ? t("portals.anyHelp") : t("portals.countryHelp")}
        </p>
      ) : (
        <ul className="space-y-2">
          {added.map((s) => (
            <LoginRow
              key={s.key}
              name={sysText(t, "name", s.key, s.name)}
              hint={sysText(t, "hint", s.key, s.hint)}
              official={s.url}
              login={data.systems![s.key]}
              onSave={(l) => setSystem(s.key, l)}
              onRemove={() => window.confirm(t("portals.removeConfirm", { name: sysText(t, "name", s.key, s.name) })) && setSystem(s.key, null)}
            />
          ))}
          {mine.map((p) => (
            <LoginRow
              key={p.id}
              name={p.name}
              login={p}
              onRename={(name) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, name } : x)))}
              onSave={(l) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, ...l } : x)))}
              onRemove={() => window.confirm(t("portals.removeCustomConfirm", { name: p.name || t("portals.thisPortal") })) && setCustom(custom.filter((x) => x.id !== p.id))}
            />
          ))}
        </ul>
      );
    return { menu, body };
  };

  const countrySection = (region: RegionCode) => {
    const inCountry = submitted.filter(({ college }) => regionOfCollege(college) === region);
    const applications = systemsForRegion(region).filter((s) => s.group === "application");
    const { menu, body } = optionalBlock(region);
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
                    onSave={(portal) => student.update(college.slug, { portal })}
                  />
                ))}
              </ul>
            )}
          </Group>

          <Group title={t("portals.groupApplication")}>
            {applications.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("portals.noSystems", { region: regionName(t, region) })}</p>
            ) : (
              <ul className="space-y-2">{applications.flatMap(systemRows)}</ul>
            )}
          </Group>

          <Group title={t("portals.groupOther")} aside={menu}>
            {body}
          </Group>
        </div>
      </Section>
    );
  };

  const any = optionalBlock("ANY");

  return (
    <div className="space-y-6">
      <p className={`rounded-lg border px-3 py-2 text-xs ${toneClass("soon")}`}>
        {student.auth ? t("portals.noticeAccount") : t("portals.noticeBrowser")}
        {" · "}
        {(() => {
          const n = savedCount(data) + submitted.filter(({ entry }) => entry.portal.username.trim()).length;
          return n === 1 ? t("portals.loginsSavedOne", { n }) : t("portals.loginsSavedMany", { n });
        })()}
      </p>

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
