"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { ReminderToggle } from "@/components/AccountPanel";
import { ConnectedExtensions } from "@/components/ConnectedExtensions";
import { DeleteAccount } from "@/components/DeleteAccount";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { MyCounselors } from "@/components/MyCounselors";
import { PaymentsPanel } from "@/components/PaymentsPanel";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { AccountGlance, panelId, tabId } from "@/components/settings/AccountGlance";
import { readHash, subscribeHash, tabForHash, type SettingsTab } from "@/components/settings/settings-tabs";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { TeacherDigestToggle } from "@/components/TeacherDigestToggle";
import { VaultSettings } from "@/components/VaultSettings";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass, PAGE_TITLE } from "@/lib/ui";

const noop = () => () => {};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-zinc-600">{label}</dt>
      <dd className="mt-0.5 break-words text-base font-semibold text-ink">{children}</dd>
    </div>
  );
}

function LanguageRow() {
  const t = useT();
  return (
    <SettingsRow id="language" headingId="language-heading" title={t("settings.language")} description={<p>{t("settings.languageHint")}</p>}>
      <LanguageSwitch variant="settings" />
    </SettingsRow>
  );
}

/**
 * Everything about the account, one area per row. A student sees one view at a time, chosen in the strip at the top
 * (account; plan and payments; passwords and extensions; reminders and sharing), kept in the URL hash so links and Back
 * work (settings-tabs.ts). Teachers keep one page: who is signed in, the weekly summary, language, the role switch, delete.
 */
export function SettingsPage() {
  const student = useStudent();
  const t = useT();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // Wait for the session check too, so a signed-in load never flashes the signed-out card.
  const ready = mounted && student.ready && student.sessionChecked;
  const signedIn = !!student.auth;
  const scrolled = useRef(false);
  // The view in the URL; the old area anchors (#passwords, #reminders...) open the view that holds them.
  const tab = tabForHash(useSyncExternalStore(subscribeHash, readHash, () => ""));

  // The cards render after load, so the browser's own anchor jump (e.g. #reminders) misses them. Scroll once only.
  useEffect(() => {
    if (!ready || scrolled.current) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    scrolled.current = true;
    el.scrollIntoView();
  }, [ready, signedIn, student.role]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className={PAGE_TITLE}>{t("settings.title")}</h1>
        {ready && student.auth?.email && <p className="text-base text-zinc-700 [overflow-wrap:anywhere]">{t("misc.settings.signedInAs", { email: student.auth.email })}</p>}
      </div>
      {!ready ? (
        <>
          <div className="h-24 animate-pulse rounded-3xl bg-zinc-100" />
          <LanguageRow />
        </>
      ) : student.auth ? (
        <SignedIn tab={tab} />
      ) : (
        <SignedOut />
      )}
    </div>
  );
}

function SignedOut() {
  const t = useT();
  return (
    <div>
      <SettingsRow headingId="signin-heading" title={t("settings.signInTitle")} description={<p>{t("settings.signInNote")}</p>}>
        <GoogleSignIn returnTo="/settings" />
      </SettingsRow>
      <LanguageRow />
    </div>
  );
}

function SignedIn({ tab }: { tab: SettingsTab }) {
  const student = useStudent();
  const t = useT();
  const auth = student.auth!;
  const teacher = student.role === "teacher";
  const username = auth.email?.split("@")[0] ?? "";
  const tp = student.teacherProfile;

  const account = (
    <SettingsRow
      id="account"
      headingId="account-heading"
      title={t("settings.account")}
      description={<p>{t("misc.settings.accountDesc")}</p>}
      aside={
        <button className={buttonClass("secondary", "sm")} onClick={() => student.signOut()}>
          {t("account.signOut")}
        </button>
      }
    >
      <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
        <Row label={t("settings.username")}>{username}</Row>
        <Row label={t("settings.email")}>{auth.email}</Row>
        <Row label={t("settings.accountType")}>
          {teacher ? t("settings.typeTeacher") : student.role === "student" ? t("settings.typeStudent") : t("settings.typeNone")}
        </Row>
        {teacher ? (
          <>
            {tp?.displayName && <Row label={t("settings.name")}>{tp.displayName}</Row>}
            {tp?.school && <Row label={t("settings.school")}>{tp.school}</Row>}
          </>
        ) : (
          <Row label={t("settings.applyingFrom")}>{student.profile.international ? t("settings.abroad") : t("settings.theUS")}</Row>
        )}
      </dl>
      {!teacher && (
        <p className="mt-5 border-t border-zinc-200 pt-4 text-[15px] leading-relaxed text-zinc-700">
          {t("settings.savedBefore")}
          {student.syncing ? t("settings.syncing") : ""}
          {t("settings.savedMiddle")}{" "}
          <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
            {t("settings.profileLink")}
          </Link>
          {t("settings.savedAfter")}
        </p>
      )}
      {student.error && (
        <p role="alert" className="mt-3 text-sm text-urgent">
          {student.error}
        </p>
      )}
    </SettingsRow>
  );

  if (student.role !== "student") {
    return (
      <div>
        {account}
        {teacher && (
          <SettingsRow id="digest" headingId="digest-heading" title={t("settings.digest")} description={<p>{t("misc.settings.digestDesc")}</p>}>
            <TeacherDigestToggle />
          </SettingsRow>
        )}
        <LanguageRow />
        <RoleSwitcher />
        <DeleteAccount />
      </div>
    );
  }

  // Every view stays mounted (the others are hidden), so each area loads and behaves exactly as on one long page.
  const view = (id: SettingsTab, children: ReactNode) => (
    <div role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id)} hidden={tab !== id}>
      {children}
    </div>
  );
  return (
    <>
      <AccountGlance tab={tab} />
      {view(
        "account",
        <>
          {account}
          <LanguageRow />
          <RoleSwitcher />
          <DeleteAccount />
        </>,
      )}
      {view("payments", <PaymentsPanel />)}
      {view(
        "passwords",
        <>
          <VaultSettings />
          <ConnectedExtensions />
        </>,
      )}
      {view(
        "reminders",
        <>
          <SettingsRow id="reminders" headingId="reminders-heading" title={t("settings.reminders")} description={<p>{t("misc.settings.remindersDesc")}</p>}>
            <ReminderToggle />
          </SettingsRow>
          <MyCounselors />
          <ShareLinkPanel kind="parent" id="share" layout="row" />
        </>,
      )}
    </>
  );
}
