"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

function num(v: string, min: number, max: number) {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const input =
  "mt-1 block w-full rounded-xl border-2 border-zinc-200 bg-white px-3 py-2.5 text-base focus:border-blue-400 focus:outline-none";

export function StartWizard() {
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [step, setStep] = useState(0);
  const [international, setInternational] = useState<boolean | null>(null);
  const [gpa, setGpa] = useState("");
  const [sat, setSat] = useState("");
  const [act, setAct] = useState("");

  if (!mounted || !student.ready) return <div className="h-72 animate-pulse rounded-3xl bg-zinc-100" />;

  const gpaN = num(gpa, 0, 4);
  const satN = num(sat, 400, 1600);
  const actN = num(act, 1, 36);
  const scoresOk = (gpa === "" || gpaN != null) && (sat === "" || satN != null) && (act === "" || actN != null);

  function finish(to = "/colleges") {
    student.setProfile({ ...student.profile, international: international ?? false, gpa: gpaN, sat: satN, act: actN });
    router.push(to);
  }

  const stepLabel = ["About you", "Your scores", "All set"];

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
                aria-pressed={international === v}
                onClick={() => setInternational(v as boolean)}
                className={`rounded-2xl border-2 p-4 text-left font-semibold ${tint} ${
                  international === v ? "border-ink" : "border-transparent hover:border-blue-300"
                }`}
              >
                {label as string}
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={international == null}
              onClick={() => setStep(1)}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="text-2xl font-bold">What are your scores so far?</h2>
          <p className="mt-1 text-sm text-zinc-600">Leave blank anything you don&apos;t have. You can change these any time on your profile.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">
              GPA (unweighted, 0–4)
              <input className={input} inputMode="decimal" placeholder="3.9" value={gpa} onChange={(e) => setGpa(e.target.value)} />
            </label>
            <label className="text-sm font-medium">
              SAT (400–1600)
              <input className={input} inputMode="numeric" placeholder="1450" value={sat} onChange={(e) => setSat(e.target.value)} />
            </label>
            <label className="text-sm font-medium">
              ACT (1–36)
              <input className={input} inputMode="numeric" placeholder="33" value={act} onChange={(e) => setAct(e.target.value)} />
            </label>
          </div>
          {!scoresOk && <p className="mt-3 text-sm text-rose-600">One of those numbers is out of range. Check the ranges above.</p>}
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => setStep(0)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              Back
            </button>
            <button
              type="button"
              disabled={!scoresOk}
              onClick={() => setStep(2)}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-2xl font-bold">You&apos;re ready to browse.</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {student.auth
              ? `Saved to your account (${student.auth.email}).`
              : "Saved in this browser. Create a free account later to keep your list on every device."}
          </p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-4">
            {[
              ["Applying from", international ? "Abroad" : "The US"],
              ["GPA", gpaN ?? "—"],
              ["SAT", satN ?? "—"],
              ["ACT", actN ?? "—"],
            ].map(([k, v]) => (
              <li key={String(k)} className="rounded-2xl bg-blue-50 p-3">
                <span className="block text-xs text-zinc-500">{k}</span>
                <span className="font-display text-lg font-bold">{v}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => setStep(1)} className="text-sm font-semibold text-zinc-600 hover:text-blue-600">
              Back
            </button>
            <div className="flex items-center gap-4">
              {!student.auth && (
                <button type="button" onClick={() => finish("/profile")} className="text-sm font-semibold text-blue-700 underline underline-offset-4">
                  Save, then sign in
                </button>
              )}
              <button type="button" onClick={() => finish()} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                See my colleges
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
