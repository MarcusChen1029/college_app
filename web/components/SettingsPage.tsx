"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ReminderToggle } from "@/components/AccountPanel";
import { ConnectedExtensions } from "@/components/ConnectedExtensions";
import { DeleteAccount } from "@/components/DeleteAccount";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { MyCounselors } from "@/components/MyCounselors";
import { PaymentsPanel } from "@/components/PaymentsPanel";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { TeacherDigestToggle } from "@/components/TeacherDigestToggle";
import { VaultSettings, type CollegeNames } from "@/components/VaultSettings";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const card = "rounded-2xl border border-zinc-200 p-6";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 py-2 text-sm">
      <dt className="w-32 shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

/** Everything about the account: language, username, email, student/teacher, reminders, counselors and the role switch. */
export function SettingsPage({ collegeNames }: { collegeNames?: CollegeNames } = {}) {
  const student = useStudent();
  const t = useT();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // Wait for the session check too, so a signed-in load never flashes the signed-out card.
  const ready = mounted && student.ready && student.sessionChecked;
  const signedIn = !!student.auth;
  const scrolled = useRef(false);

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
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">{t("settings.title")}</h1>
      <section id="language" aria-labelledby="language-heading" className={`${card} scroll-mt-4`}>
        <h2 id="language-heading" className="mb-1 text-xl font-bold">
          {t("settings.language")}
        </h2>
        <p className="mb-3 text-sm text-zinc-500">{t("settings.languageHint")}</p>
        <LanguageSwitch variant="settings" />
      </section>
      {!ready ? <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" /> : student.auth ? <SignedIn collegeNames={collegeNames} /> : <SignedOut />}
    </div>
  );
}

function SignedOut() {
  const t = useT();
  return (
    <section aria-labelledby="signin-heading" className={`${card} space-y-3`}>
      <h2 id="signin-heading" className="text-xl font-bold">{t("settings.signInTitle")}</h2>
      <GoogleSignIn returnTo="/settings" />
      <p className="text-xs text-zinc-500">{t("settings.signInNote")}</p>
    </section>
  );
}

function SignedIn({ collegeNames }: { collegeNames?: CollegeNames }) {
  const student = useStudent();
  const t = useT();
  const auth = student.auth!;
  const teacher = student.role === "teacher";
  const username = auth.email?.split("@")[0] ?? "";
  const tp = student.teacherProfile;

  return (
    <>
      <section aria-labelledby="account-heading" className={card}>
        <h2 id="account-heading" className="text-xl font-bold">{t("settings.account")}</h2>
        <dl className="mt-2 divide-y divide-zinc-100">
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
          <p className="mt-3 text-sm text-zinc-500">
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
        <button className={`mt-4 ${buttonClass("secondary")}`} onClick={() => student.signOut()}>
          {t("account.signOut")}
        </button>
      </section>
      {student.role === "student" && (
        <section id="reminders" aria-labelledby="reminders-heading" className={`${card} scroll-mt-4`}>
          <h2 id="reminders-heading" className="mb-3 text-xl font-bold">{t("settings.reminders")}</h2>
          <ReminderToggle />
        </section>
      )}
      {teacher && (
        <section id="digest" aria-labelledby="digest-heading" className={`${card} scroll-mt-4`}>
          <h2 id="digest-heading" className="mb-3 text-xl font-bold">{t("settings.digest")}</h2>
          <TeacherDigestToggle />
        </section>
      )}
      {student.role === "student" && <MyCounselors />}
      {student.role === "student" && <ShareLinkPanel kind="parent" id="share" />}
      {student.role === "student" && <PaymentsPanel />}
      {student.role === "student" && <VaultSettings collegeNames={collegeNames} />}
      {student.role === "student" && <ConnectedExtensions />}
      <RoleSwitcher />
      <DeleteAccount />
    </>
  );
}
