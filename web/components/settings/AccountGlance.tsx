"use client";

// /settings for a student: the four states people come to check, in one strip at the top. Each cell links to its
// area below. It only reads what the page already has (the plan, the vault's lock, the reminder switch, the language).

import { LOCALE_NAMES } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { fmtPassDate } from "@/lib/payments-view";
import { activeWindow, FREE_LIMIT, taipeiToday } from "@/lib/plans";
import { useVault } from "@/lib/portal-vault-client";
import { useStudent } from "@/lib/student-store";

// Dividers: a 2 x 2 grid on a phone, one row of four from lg. Full literal classes (Tailwind scans the source).
const CELL_EDGE = ["", "border-l", "border-t lg:border-l lg:border-t-0", "border-l border-t lg:border-t-0"];

export function AccountGlance() {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const vault = useVault();
  const active = activeWindow(student.planWindows, taipeiToday());
  const reminders = student.profile.reminderEmails ?? true;

  const vaultText =
    vault.status === "unavailable"
      ? t("misc.settings.vaultUnavailable")
      : vault.lock === "none"
        ? t("misc.settings.vaultNone")
        : vault.lock === "locked"
          ? t("misc.settings.vaultLocked")
          : vault.lock === "unlocked"
            ? t("misc.settings.vaultOpen")
            : t("misc.settings.vaultChecking");

  const cells = [
    {
      href: "#payments",
      label: t("payments.panel.currentPlan"),
      value: active ? t("payments.passFor", { year: active.entry_year }) : t("payments.planName.free"),
      sub: active ? t("misc.settings.until", { date: fmtPassDate(active.until, locale) }) : t("misc.settings.freeSub", { n: FREE_LIMIT }),
    },
    { href: "#passwords", label: t("settings.vault.title"), value: vaultText, sub: null },
    { href: "#reminders", label: t("settings.reminders"), value: reminders ? t("misc.settings.on") : t("misc.settings.off"), sub: reminders ? t("misc.settings.remindersSub") : null },
    { href: "#language", label: t("settings.language"), value: LOCALE_NAMES[locale], sub: null },
  ];

  return (
    <nav aria-label={t("misc.settings.glance")} className="grid grid-cols-2 overflow-hidden rounded-3xl bg-zinc-50 lg:grid-cols-4">
      {cells.map((c, i) => (
        <a key={c.href} href={c.href} className={`block border-zinc-200 px-5 py-4 transition-colors hover:bg-zinc-100 sm:px-6 sm:py-5 ${CELL_EDGE[i]}`}>
          <span className="block text-sm text-zinc-600">{c.label}</span>
          <span className="mt-1 block font-display text-lg font-bold leading-snug text-ink">{c.value}</span>
          {c.sub && <span className="mt-0.5 block text-sm text-zinc-600">{c.sub}</span>}
        </a>
      ))}
    </nav>
  );
}
