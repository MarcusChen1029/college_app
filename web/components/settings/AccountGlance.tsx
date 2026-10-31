"use client";

// /settings for a student: the strip of four views, drawn as the student's Trakur pass and its stubs (the site's ticket
// stationery): the pass is the plan, in navy, then a stub each for the account, the password vault and reminders. Each
// cell is a tab that shows its view and records it in the URL (settings-tabs.ts). It only reads what the page already
// has (the plan, the vault's lock, the reminder switch, the language).

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { LOCALE_NAMES } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { fmtPassDate } from "@/lib/payments-view";
import { activeWindow, FREE_LIMIT, taipeiToday } from "@/lib/plans";
import { useVault } from "@/lib/portal-vault-client";
import { useStudent } from "@/lib/student-store";
import { openTab, SETTINGS_TABS, type SettingsTab } from "./settings-tabs";

// Every cell is notched at its corners, so where two cells meet the notches make the round bite of a ticket's tear line
// (the home page's and the pricing pass's stationery); the dotted borders are the perforation. Inline because this
// project's stylesheets all go through Tailwind as global CSS (no CSS modules).
const NOTCH = [
  "radial-gradient(circle 12px at 0 0, #0000 98%, #000) 0 0 / 51% 51% no-repeat",
  "radial-gradient(circle 12px at 100% 0, #0000 98%, #000) 100% 0 / 51% 51% no-repeat",
  "radial-gradient(circle 12px at 0 100%, #0000 98%, #000) 0 100% / 51% 51% no-repeat",
  "radial-gradient(circle 12px at 100% 100%, #0000 98%, #000) 100% 100% / 51% 51% no-repeat",
].join(", ");
const NOTCHED = { mask: NOTCH, WebkitMask: NOTCH };

// Perforations: on a phone the pass spans the row and the three stubs tear off below it; from lg it is one ticket,
// pass then stubs. Full literal classes (Tailwind scans the source).
const CELL_EDGE: Record<SettingsTab, string> = {
  payments: "col-span-3 lg:col-span-1",
  account: "border-t-[3px] lg:border-l-[3px] lg:border-t-0",
  passwords: "border-l-[3px] border-t-[3px] lg:border-t-0",
  reminders: "border-l-[3px] border-t-[3px] lg:border-t-0",
};

export const tabId = (tab: SettingsTab) => `settings-tab-${tab}`;
export const panelId = (tab: SettingsTab) => `settings-panel-${tab}`;

export function AccountGlance({ tab }: { tab: SettingsTab }) {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const vault = useVault();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = activeWindow(student.planWindows, taipeiToday());
  const reminders = student.profile.reminderEmails ?? true;

  // The vault cell says what the vault row says: a grey bar while the check runs, the failure when it fails.
  let vaultValue: ReactNode;
  if (vault.status === "unavailable") vaultValue = t("misc.settings.vaultUnavailable");
  else if (vault.lock === "none") vaultValue = t("misc.settings.vaultNone");
  else if (vault.lock === "locked") vaultValue = t("misc.settings.vaultLocked");
  else if (vault.lock === "unlocked") vaultValue = t("misc.settings.vaultOpen");
  else if (vault.status === "error") vaultValue = <span className="text-urgent">{t("misc.settings.vaultError")}</span>;
  else
    vaultValue = (
      <>
        <span aria-hidden className="mt-1 block h-5 w-28 rounded bg-zinc-200" />
        <span className="sr-only">{t("misc.settings.vaultChecking")}</span>
      </>
    );

  const cells: Record<SettingsTab, { label: string; value: ReactNode; sub: string | null }> = {
    account: {
      label: t("settings.account"),
      value: t("settings.typeStudent"),
      sub: t("misc.settings.langSub", { lang: LOCALE_NAMES[locale] }),
    },
    payments: {
      label: t("payments.panel.title"),
      value: active ? t("payments.passFor", { year: active.entry_year }) : t("payments.planName.free"),
      sub: active ? t("misc.settings.until", { date: fmtPassDate(active.until, locale) }) : t("misc.settings.freeSub", { n: FREE_LIMIT }),
    },
    passwords: { label: t("misc.settings.tabPasswords"), value: vaultValue, sub: null },
    reminders: {
      label: t("misc.settings.tabReminders"),
      value: reminders ? t("misc.settings.on") : t("misc.settings.off"),
      sub: reminders ? t("misc.settings.remindersSub") : null,
    },
  };

  // Arrow keys move along the tabs (and open the one reached), Home and End jump to the ends.
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = SETTINGS_TABS.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    openTab(SETTINGS_TABS[to], true);
    refs.current[to]?.focus();
  };

  return (
    <div role="tablist" aria-label={t("misc.settings.glance")} className="grid grid-cols-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
      {SETTINGS_TABS.map((id, i) => {
        const c = cells[id];
        const on = tab === id;
        const pass = id === "payments";
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(id)}
            aria-selected={on}
            aria-controls={panelId(id)}
            tabIndex={on ? 0 : -1}
            onClick={() => openTab(id)}
            onKeyDown={(e) => onKey(e, i)}
            style={NOTCHED}
            className={`relative block border-dotted border-blue-300 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-4 ${CELL_EDGE[id]} ${
              pass
                ? "bg-ink px-5 py-4 text-white hover:bg-blue-950 focus-visible:outline-blue-200 sm:px-7 sm:py-5"
                : `px-3 py-3 focus-visible:outline-blue-600 sm:px-6 sm:py-5 ${on ? "bg-blue-100" : "bg-blue-50 hover:bg-blue-100/60"}`
            }`}
          >
            <span className={`block text-[13px] leading-snug sm:text-sm ${pass ? "text-blue-100" : on ? "font-semibold text-ink" : "text-zinc-600"} ${on && pass ? "font-semibold" : ""}`}>
              {c.label}
            </span>
            <span className={`mt-1 block font-display font-bold leading-snug ${pass ? "text-xl text-white sm:text-2xl" : "text-base text-ink sm:text-lg"}`}>{c.value}</span>
            {c.sub && <span className={`mt-0.5 text-sm ${pass ? "block text-blue-100" : "hidden text-zinc-600 sm:block"}`}>{c.sub}</span>}
            {on && <span aria-hidden className={`absolute inset-x-4 bottom-0 h-[3px] rounded-full ${pass ? "bg-blue-200" : "bg-ink"}`} />}
          </button>
        );
      })}
    </div>
  );
}
