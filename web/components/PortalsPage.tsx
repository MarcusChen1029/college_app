"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { newId } from "@/lib/activities";
import { isSubmitted } from "@/lib/application";
import { safeLink } from "@/lib/checklist";
import { campusesOf, campusKey, EMPTY_LOGIN, openUrl, savedCount, SYSTEMS, type CustomPortal, type Login, type PortalData, type PortalSystem } from "@/lib/portals";
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
  const [open, setOpen] = useState(!name && !!onRename);
  const [show, setShow] = useState(false);
  const save = (patch: Partial<Login>) => {
    const next = { ...login, ...patch };
    if (next.url !== login.url || next.username !== login.username || next.password !== login.password) onSave(next);
  };
  const link = safeLink(openUrl(login, official ?? null));
  const label = name || "Untitled portal";
  return (
    <li className={indent ? "ml-6" : ""}>
      <div className={`rounded-xl border ${open ? "border-blue-300 bg-blue-50/40" : "border-zinc-200"}`}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} login for ${label}`}
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
              title={`Open ${label}`}
            >
              {label} ↗
            </a>
          ) : (
            <span className="font-semibold">{label}</span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{login.username || (link ? "No login saved" : "No link or login saved")}</span>
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
                placeholder="Portal name, e.g. Scholarship portal"
                aria-label="Portal name"
                autoFocus={!name}
                onBlur={(e) => e.target.value.trim() !== name && onRename(e.target.value.trim())}
              />
            )}
            <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1.5fr]">
              <input
                type="url"
                className={input}
                defaultValue={login.url}
                placeholder={official ?? "Portal link"}
                aria-label={`Link for ${label}`}
                onBlur={(e) => save({ url: e.target.value.trim() })}
              />
              <div className="flex items-center gap-1">
                <input
                  className={`${input} flex-1`}
                  defaultValue={login.username}
                  placeholder="Username / email"
                  autoComplete="off"
                  aria-label={`Username for ${label}`}
                  onBlur={(e) => save({ username: e.target.value.trim() })}
                />
                <CopyButton value={login.username} label={`username for ${label}`} />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type={show ? "text" : "password"}
                  className={`${input} flex-1`}
                  defaultValue={login.password}
                  placeholder="Password"
                  autoComplete="new-password"
                  aria-label={`Password for ${label}`}
                  onBlur={(e) => save({ password: e.target.value })}
                />
                <button type="button" className="shrink-0 rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100" onClick={() => setShow((v) => !v)}>
                  {show ? "Hide" : "Show"}
                </button>
                <CopyButton value={login.password} label={`password for ${label}`} />
              </div>
            </div>
            {onRemove && (
              <button type="button" className="text-xs text-zinc-500 hover:text-rose-600" onClick={onRemove}>
                Remove
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

const OPTIONAL = SYSTEMS.filter((s) => s.group === "optional");

export function PortalsPage({ colleges }: { colleges: CollegeSummary[] }) {
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

  // A college's portal joins this page once its application is submitted.
  const submitted = student.list.flatMap((e) => {
    const college = colleges.find((c) => c.slug === e.slug);
    return college && isSubmitted(e.status) ? [{ entry: e, college }] : [];
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
        <li key={`${s.key}-add`} className="ml-6">
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

  const optionalAdded = OPTIONAL.filter((s) => data.systems?.[s.key]);
  const optionalLeft = OPTIONAL.filter((s) => !data.systems?.[s.key]);

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {student.auth ? "Saved to your account" : "Saved in this browser only"} without extra encryption. Use passwords you don&apos;t use anywhere else.
        {" · "}
        {(() => {
          const n = savedCount(data) + submitted.filter(({ entry }) => entry.portal.username.trim()).length;
          return `${n} ${n === 1 ? "login" : "logins"} saved`;
        })()}
      </p>

      <Section title="Submitted colleges">
        {submitted.length === 0 ? (
          <p className="text-sm text-zinc-500">
            A college&apos;s applicant portal shows up here once you mark it Submitted on{" "}
            <Link href="/application/list" className="text-blue-600 underline">
              My list
            </Link>
            . Its login usually arrives by email after you apply.
          </p>
        ) : (
          <ul className="space-y-2">
            {submitted.map(({ entry, college }) => (
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

      <Section title="Application systems">
        <ul className="space-y-2">{SYSTEMS.filter((s) => s.group === "application").flatMap(systemRows)}</ul>
      </Section>

      <Section
        title="Other"
        aside={
          <select
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            value=""
            aria-label="Add a portal"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") setCustom([...custom, { ...EMPTY_LOGIN, id: newId(), name: "" }]);
              else if (v) setSystem(v, EMPTY_LOGIN);
            }}
          >
            <option value="">+ Add portal</option>
            {optionalLeft.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
            <option value="custom">Something else…</option>
          </select>
        }
      >
        {optionalAdded.length === 0 && custom.length === 0 ? (
          <p className="text-sm text-zinc-500">Testing and aid sites (College Board, ACT, TOEFL, CSS Profile…), scholarships, housing — add only the ones you use.</p>
        ) : (
          <ul className="space-y-2">
            {optionalAdded.map((s) => (
              <LoginRow
                key={s.key}
                name={s.name}
                hint={s.hint}
                official={s.url}
                login={data.systems![s.key]}
                onSave={(l) => setSystem(s.key, l)}
                onRemove={() => window.confirm(`Remove ${s.name}?`) && setSystem(s.key, null)}
              />
            ))}
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
