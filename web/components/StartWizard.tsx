"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { openSignIn } from "@/components/SignInDialog";
import { cleanRegions, regionLabel } from "@/lib/regions";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, SAT_SCALE, sectionSummary } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { GpaEditor } from "./ProfileForm";
import { RegionsEditor } from "./ProfileCards";
import { ActEditor, EnglishEditor, SatEditor } from "./TestScoresForm";

const noop = () => () => {};

const stepLabel = ["About you", "Regions", "Your stats", "All set"];

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
      <ol className="mb-6 flex gap-2" aria-label="Progress">
        {stepLabel.map((l, i) => (
          <li
            key={l}
            aria-current={i === step ? "step" : undefined}
            className={`flex-1 rounded-full px-3 py-1 text-center text-xs font-semibold ${
              i === step ? "bg-ink text-white" : i < step ? "bg-blue-200 text-ink" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <h2 className="text-2xl font-bold">Where are you applying from?</h2>
          <p className="mt-1 text-sm text-zinc-600">We use the international admit rate and English-test info when it applies to you.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              [false, "I live in the US", "bg-sun/60"],
              [true, "I’m applying from abroad", "bg-mint/60"],
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
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="text-2xl font-bold">Which countries are you applying to?</h2>
          <p className="mt-1 text-sm text-zinc-600">Colleges and Portals only show these. Pick as many as you like; you can change them on your profile.</p>
          <div className="mt-5">
            <RegionsEditor />
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => go(0)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              Back
            </button>
            <button type="button" onClick={() => go(2)} className={buttonClass("primary")}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-2xl font-bold">What are your stats so far?</h2>
          <p className="mt-1 text-sm text-zinc-600">Leave blank anything you don&apos;t have. These are saved as you type and match your profile.</p>
          <div className="mt-5 space-y-4">
            <Block title="GPA">
              <GpaEditor />
            </Block>
            <Block title="SAT">
              <SatEditor />
            </Block>
            <Block title="ACT">
              <ActEditor />
            </Block>
            <Block title="English test">
              <EnglishEditor />
            </Block>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => go(1)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              Back
            </button>
            <button type="button" onClick={() => go(3)} className={buttonClass("primary")}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-2xl font-bold">You&apos;re ready to browse.</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {student.auth
              ? `Saved to your account (${student.auth.email}).`
              : "Saved in this browser. Create a free account later to keep your list on every device."}
          </p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["Applying from", profile.international ? "Abroad" : "The US"],
              ["Regions", regions.length ? regions.map(regionLabel).join(", ") : "All"],
              ["GPA", profile.gpa ?? "—"],
              ["SAT", profile.sat ?? "—", sectionSummary(SAT_SCALE, profile.tests?.sat)],
              ["ACT", profile.act ?? "—", sectionSummary(ACT_SCALE, profile.tests?.act)],
              [englishKey ? ENGLISH_TESTS[englishKey].label : "English test", english?.total ?? "—"],
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
              Back
            </button>
            <div className="flex items-center gap-4">
              {!student.auth && (
                <button type="button" onClick={saveThenSignIn} className="text-sm font-semibold text-blue-700 underline underline-offset-4">
                  Save, then sign in
                </button>
              )}
              <button type="button" onClick={() => finish()} className={buttonClass("primary")}>
                See my colleges
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
