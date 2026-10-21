"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { safeLink } from "@/lib/checklist";
import {
  campusesOf,
  campusKey,
  EMPTY_LOGIN,
  GROUP_TITLES,
  openUrl,
  savedCount,
  SYSTEMS,
  type CustomPortal,
  type Login,
  type PortalData,
  type PortalGroup,
  type PortalSystem,
} from "@/lib/portals";
import { newId } from "@/lib/activities";
import { registerColleges, useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";

const noop = () => () => {};
const input = "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** One portal: link, username and password, each saved on blur. */
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
  const [show, setShow] = useState(false);
  const save = (patch: Partial<Login>) => {
    const next = { ...login, ...patch };
    if (next.url !== login.url || next.username !== login.username || next.password !== login.password) onSave(next);
  };
  const link = safeLink(openUrl(login, official ?? null));
  return (
    <li className={`py-3 ${indent ? "ml-6 border-l-2 border-blue-100 pl-4" : ""}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {onRename ? (
          <input
            className={`${input} font-semibold`}
            defaultValue={name}
            placeholder="Portal name"
            aria-label="Portal name"
            onBlur={(e) => e.target.value.trim() !== name && onRename(e.target.value.trim())}
          />
        ) : (
          <span className="font-semibold">{name}</span>
        )}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
            Open ↗
          </a>
        )}
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
        {onRemove && (
          <button type="button" className="ml-auto text-xs text-zinc-500 hover:text-rose-600" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1.5fr]">
        <input
          type="url"
          className={input}
          defaultValue={login.url}
          placeholder={official ?? "Portal link"}
          aria-label={`Link for ${name}`}
          onBlur={(e) => save({ url: e.target.value.trim() })}
        />
        <div className="flex items-center gap-1">
          <input
            className={`${input} flex-1`}
            defaultValue={login.username}
            placeholder="Username / email"
            autoComplete="off"
            aria-label={`Username for ${name}`}
            onBlur={(e) => save({ username: e.target.value.trim() })}
          />
          <CopyButton value={login.username} label={`username for ${name}`} />
        </div>
        <div className="flex items-center gap-1">
          <input
            type={show ? "text" : "password"}
            className={`${input} flex-1`}
            defaultValue={login.password}
            placeholder="Password"
            autoComplete="new-password"
            aria-label={`Password for ${name}`}
            onBlur={(e) => save({ password: e.target.value })}
          />
          <button type="button" className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100" onClick={() => setShow((v) => !v)}>
            {show ? "Hide" : "Show"}
          </button>
          <CopyButton value={login.password} label={`password for ${name}`} />
        </div>
      </div>
    </li>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-zinc-200 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  );
}

export function PortalsPage({ colleges }: { colleges: CollegeSummary[] }) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const data: PortalData = student.profile.portals ?? {};
  const save = (patch: Partial<PortalData>) => student.updateProfile({ portals: { ...data, ...patch } });
  const setSystem = (key: string, login: Login) => save({ systems: { ...data.systems, [key]: login } });
  const setCampus = (key: string, login: Login | null) => {
    const campuses = { ...data.campuses };
    if (login) campuses[key] = login;
    else delete campuses[key];
    save({ campuses });
  };
  const custom = data.custom ?? [];
  const setCustom = (next: CustomPortal[]) => save({ custom: next });

  const listed = student.list.flatMap((e) => {
    const college = colleges.find((c) => c.slug === e.slug);
    return college ? [{ entry: e, college }] : [];
  });

  const systemRows = (s: PortalSystem) => {
    const added = campusesOf(data, s);
    const remaining = (s.campuses ?? []).filter((c) => !added.includes(c));
    return [
      <LoginRow key={s.key} name={s.name} hint={s.hint} official={s.url} login={data.systems?.[s.key] ?? EMPTY_LOGIN} onSave={(l) => setSystem(s.key, l)} />,
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
        <li key={`${s.key}-add`} className="ml-6 border-l-2 border-blue-100 pb-3 pl-4">
          <select
            className={`${input} text-xs`}
            value=""
            aria-label={`Add a ${s.name} campus portal`}
            onChange={(e) => e.target.value && setCampus(campusKey(s.key, e.target.value), EMPTY_LOGIN)}
          >
            <option value="">+ Add a campus portal…</option>
            {remaining.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </li>
      ),
    ];
  };

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {student.auth ? "Saved to your account" : "Saved in this browser only"} without extra encryption. Use passwords you don&apos;t use anywhere else.
        {" · "}
        {savedCount(data) + listed.filter(({ entry }) => entry.portal.username.trim()).length} logins saved
      </p>

      <Section
        title="My colleges"
        aside={
          <Link href="/my-list" className="text-sm text-blue-600 underline">
            Open my list
          </Link>
        }
      >
        {listed.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No colleges on your list yet. Add some from the{" "}
            <Link href="/colleges" className="text-blue-600 underline">
              Colleges
            </Link>{" "}
            page; each one gets a portal row here.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {listed.map(({ entry, college }) => (
              <LoginRow
                key={college.slug}
                name={college.short_name ?? college.name}
                hint="Applicant status portal; the login usually arrives by email after you apply."
                login={entry.portal}
                onSave={(portal) => student.update(college.slug, { portal })}
              />
            ))}
          </ul>
        )}
      </Section>

      {(Object.keys(GROUP_TITLES) as PortalGroup[]).map((g) => (
        <Section key={g} title={GROUP_TITLES[g]}>
          <ul className="divide-y divide-zinc-100">{SYSTEMS.filter((s) => s.group === g).flatMap(systemRows)}</ul>
        </Section>
      ))}

      <Section
        title="Other"
        aside={
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => setCustom([...custom, { ...EMPTY_LOGIN, id: newId(), name: "" }])}
          >
            + Add portal
          </button>
        }
      >
        {custom.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Scholarships, interview scheduling, housing… anything else with a login.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {custom.map((p) => (
              <LoginRow
                key={p.id}
                name={p.name}
                login={p}
                onRename={(name) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, name } : x)))}
                onSave={(l) => setCustom(custom.map((x) => (x.id === p.id ? { ...x, ...l } : x)))}
                onRemove={() => window.confirm(`Remove "${p.name || "this portal"}"?`) && setCustom(custom.filter((x) => x.id !== p.id))}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
