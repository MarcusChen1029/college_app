"use client";

// /settings for a student: the strip of four views, each a tab that shows its state at a glance (who you are, the plan,
// the password vault, reminders). Choosing one shows that view only and records it in the URL (settings-tabs.ts).
// It only reads what the page already has (the plan, the vault's lock, the reminder switch, the language).

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { LOCALE_NAMES } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { fmtPassDate } from "@/lib/payments-view";
import { activeWindow, FREE_LIMIT, taipeiToday } from "@/lib/plans";
import { useVault } from "@/lib/portal-vault-client";
import { useStudent } from "@/lib/student-store";
import { openTab, SETTINGS_TABS, type SettingsTab } from "./settings-tabs";

// Dividers: a 2 x 2 grid on a phone, one row of four from lg. Full literal classes (Tailwind scans the source).
const CELL_EDGE = ["", "border-l", "border-t lg:border-l lg:border-t-0", "border-l border-t lg:border-t-0"];

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
  // "This device only" (read and ready) says so and how many passwords this browser holds; "Not set up" would be wrong
  // there, since the account has no vault on purpose.
  let vaultValue: ReactNode;
  let vaultSub: string | null = null;
  if (vault.status === "ready" && vault.mode === "device") {
    vaultValue = t("settings.storage.device");
    vaultSub = vault.deviceChecked && !vault.deviceAvailable ? t("portals.device.unavailable") : t("misc.settings.deviceSub", { n: vault.deviceCount });
  } else if (vault.status === "unavailable") vaultValue = t("misc.settings.vaultUnavailable");
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
    passwords: { label: t("misc.settings.tabPasswords"), value: vaultValue, sub: vaultSub },
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
    <div role="tablist" aria-label={t("misc.settings.glance")} className="grid grid-cols-2 overflow-hidden rounded-3xl bg-zinc-50 lg:grid-cols-4">
      {SETTINGS_TABS.map((id, i) => {
        const c = cells[id];
        const on = tab === id;
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
            className={`relative block border-zinc-200 px-5 py-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-6 sm:py-5 ${CELL_EDGE[i]} ${
              on ? "bg-white" : "hover:bg-zinc-100"
            }`}
          >
            <span className={`block text-sm ${on ? "font-semibold text-ink" : "text-zinc-600"}`}>{c.label}</span>
            <span className="mt-1 block font-display text-lg font-bold leading-snug text-ink">{c.value}</span>
            {c.sub && <span className="mt-0.5 block text-sm text-zinc-600">{c.sub}</span>}
            {on && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-ink" />}
          </button>
        );
      })}
    </div>
  );
}
