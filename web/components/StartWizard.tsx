"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { openSignIn } from "@/components/SignInDialog";
import { useLocale, useT } from "@/lib/i18n/client";
import { testCardView } from "@/lib/i18n/test-plan-text";
import { cleanRegions } from "@/lib/regions";
import { ENGLISH_TEST_KEYS, ENGLISH_TESTS } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { GpaEditor } from "./ProfileForm";
import { RegionsEditor, regionName } from "./ProfileCards";
import { EnglishEditor, TestChoiceEditor, testLabel } from "./TestScoresForm";

const noop = () => () => {};

const stepLabel = ["profile.start.step0", "profile.start.step1", "profile.start.step2", "profile.start.step3"] as const;

/** The score editors save on blur, so the field being edited is committed before a step changes. */
function commitFocus() {
  (document.activeElement as HTMLElement | null)?.blur();
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-2xl border-2 border-zinc-200 p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

export function StartWizard() {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [step, setStep] = useState(0);
  const [international, setInternational] = useState<boolean | null>(null);

  if (!mounted || !student.ready) return <div className="h-72 animate-pulse rounded-3xl bg-zinc-100" />;

  const { profile } = student;
  // Redoing setup starts from what is already saved.
  const from = international ?? profile.international ?? null;
  const regions = cleanRegions(profile.targetRegions);
  const englishKey = ENGLISH_TEST_KEYS.find((k) => profile.tests?.english?.[k]?.total != null);
  const english = englishKey ? profile.tests!.english![englishKey]! : null;
  const test = testCardView(t, locale, profile);

  const go = (to: number) => {
    commitFocus();
    setStep(to);
  };
  const finish = (to = "/colleges") => {
    commitFocus();
    router.push(to);
  };
  // The dialog host lives in the root layout, so it survives the navigation; open it once /profile is showing.
  const saveThenSignIn = () => {
    finish("/profile");
    // returnTo is read when the dialog opens, so wait until the URL really is /profile (give up after ~10s).
    let tries = 0;
    const timer = setInterval(() => {
      if (window.location.pathname === "/profile") {
        clearInterval(timer);
        openSignIn();
      } else if (++tries > 100) clearInterval(timer);
    }, 100);
  };

  return (
    <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-[6px_6px_0_0_#cdeafc] sm:p-8">
      <ol className="mb-6 flex gap-2" aria-label={t("profile.start.progress")}>
        {stepLabel.map((l, i) => (
          <li
            key={l}
            aria-current={i === step ? "step" : undefined}
            className={`flex-1 rounded-full px-3 py-1 text-center text-xs font-semibold ${
              i === step ? "bg-ink text-white" : i < step ? "bg-blue-200 text-ink" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {t(l)}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <h2 className="text-2xl font-bold">{t("profile.start.fromTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-600">{t("profile.start.fromHint")}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              [false, t("profile.start.inUS"), "bg-sun/60"],
              [true, t("profile.start.abroad"), "bg-mint/60"],
            ].map(([v, label, tint]) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={from === v}
                onClick={() => setInternational(v as boolean)}
                className={`rounded-2xl border-2 p-4 text-left font-semibold ${tint} ${from === v ? "border-ink" : "border-transparent hover:border-blue-300"}`}
              >
                {label as string}
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={from == null}
              onClick={() => {
                student.updateProfile({ international: from ?? false });
                go(1);
              }}
              className={buttonClass("primary")}
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="text-2xl font-bold">{t("profile.start.regionsTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-600">{t("profile.start.regionsHint")}</p>
          <div className="mt-5">
            <RegionsEditor />
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => go(0)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              {t("common.back")}
            </button>
            <button type="button" onClick={() => go(2)} className={buttonClass("primary")}>
              {t("common.next")}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-2xl font-bold">{t("profile.start.statsTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-600">{t("profile.start.statsHint")}</p>
          <div className="mt-5 space-y-4">
            <Block title="GPA">
              <GpaEditor />
            </Block>
            <Block title={t("profile.test.title")}>
              <TestChoiceEditor />
            </Block>
            <Block title={t("profile.englishTest")}>
              <EnglishEditor />
            </Block>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => go(1)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              {t("common.back")}
            </button>
            <button type="button" onClick={() => go(3)} className={buttonClass("primary")}>
              {t("common.next")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-2xl font-bold">{t("profile.start.readyTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {student.auth
              ? t("profile.start.savedAccount", { email: student.auth.email ?? "" })
              : t("profile.start.savedBrowser")}
          </p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            {[
              [t("profile.start.applyingFrom"), profile.international ? t("profile.start.valAbroad") : t("profile.start.valUS")],
              [t("profile.start.regions"), regions.length ? regions.map((c) => regionName(t, c)).join(", ") : t("profile.start.valAll")],
              ["GPA", profile.gpa ?? "—", profile.gpaWeighted != null ? t("profile.gpaWeightedShort", { gpa: profile.gpaWeighted }) : ""],
              [test.label, test.value ?? "—", test.sub],
              [englishKey ? testLabel(t, englishKey, ENGLISH_TESTS[englishKey].label) : t("profile.englishTest"), english?.total ?? "—"],
            ].map(([k, v, sub]) => (
              <li key={String(k)} className="rounded-2xl bg-blue-50 p-3">
                <span className="block text-xs text-zinc-500">{k}</span>
                <span className="font-display text-lg font-bold">{v}</span>
                {sub ? <span className="block truncate text-xs text-zinc-500">{sub}</span> : null}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => go(2)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              {t("common.back")}
            </button>
            <div className="flex items-center gap-4">
              {!student.auth && (
                <button type="button" onClick={saveThenSignIn} className="text-sm font-semibold text-blue-700 underline underline-offset-4">
                  {t("profile.start.saveSignIn")}
                </button>
              )}
              <button type="button" onClick={() => finish()} className={buttonClass("primary")}>
                {t("profile.start.seeColleges")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
