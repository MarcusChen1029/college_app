"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { PLANS, type PlanKey } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

const noop = () => () => {};

export function PricingPlans() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [justChose, setJustChose] = useState<PlanKey | null>(null);
  const current = mounted && student.ready ? student.plan.key : null;
  const listed = student.list.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.key;
          const featured = p.key === "junior";
          const over = p.limit != null && listed > p.limit;
          return (
            <section
              key={p.key}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                isCurrent ? "border-blue-500 ring-2 ring-blue-500/30" : featured ? "border-blue-200" : "border-zinc-200"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">Most popular</span>
              )}
              <h2 className="font-display text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-zinc-500">{p.blurb}</p>
              <p className="mt-5 flex items-baseline gap-1">
                {p.priceTwd === 0 ? (
                  <span className="font-display text-4xl font-bold">Free</span>
                ) : (
                  <>
                    <span className="font-display text-4xl font-bold tabular-nums">NT${p.priceTwd}</span>
                    <span className="text-sm text-zinc-500">/ month</span>
                  </>
                )}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-done">✓</span>
                  <span>
                    <strong>{p.limit == null ? "Unlimited" : `Up to ${p.limit}`}</strong> colleges in My list
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-done">✓</span>Checklist, essays, portal logins and school codes
                </li>
                <li className="flex gap-2">
                  <span className="text-done">✓</span>Deadline reminders by email
                </li>
                <li className="flex gap-2">
                  <span className="text-done">✓</span>
                  {p.fullAiContext ? (
                    <span>
                      <strong>Copy for AI, full:</strong> every college&apos;s deadlines, English minimums, essays, cost and aid, with a source link
                      for each number
                    </span>
                  ) : (
                    <span>Copy for AI: your profile and list summary, ready to paste into ChatGPT, Claude or Gemini</span>
                  )}
                </li>
                {p.connectAi && (
                  <li className="flex gap-2">
                    <span className="text-done">✓</span>
                    <span>
                      <strong>Connect AI:</strong> link your own ChatGPT or Claude and update your applications by chat
                    </span>
                  </li>
                )}
              </ul>
              {over && !isCurrent && (
                <p className={`mt-4 rounded-md border p-2 text-xs ${toneClass("soon")}`}>
                  You have {listed} colleges. You&apos;ll keep them, but can&apos;t add more until you&apos;re under {p.limit}.
                </p>
              )}
              <button
                className={`mt-5 ${buttonClass(isCurrent ? "secondary" : "primary")}`}
                disabled={isCurrent || current == null}
                onClick={() => {
                  student.setPlan(p.key);
                  setJustChose(p.key);
                }}
              >
                {isCurrent ? "Current plan" : `Choose ${p.name}`}
              </button>
            </section>
          );
        })}
      </div>

      {justChose && current === justChose && (
        <p className={`rounded-md border p-3 text-sm ${toneClass("done")}`} role="status">
          You&apos;re on the {PLANS.find((p) => p.key === justChose)!.name} plan.{" "}
          <Link href="/application/list" className="underline">
            Go to My list
          </Link>
        </p>
      )}

      <p className="text-xs text-zinc-500">
        Payments aren&apos;t set up yet, so every plan is free to choose for now.{" "}
        {mounted && student.ready && !student.auth && "Your plan is saved in this browser; sign in to keep it on every device."}
      </p>
    </div>
  );
}
