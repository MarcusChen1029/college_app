"use client";

import { useState } from "react";
import { cleanCustom, type CustomCollege } from "@/lib/custom-college";
import { buttonClass, toneClass } from "@/lib/ui";
import { Modal } from "./Modal";

const INPUT = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-zinc-500">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

/** Form for a college that isn't in our data. onAdd returns false when the plan's college limit is reached. */
export function AddCustomCollege({ onAdd, onClose }: { onAdd: (c: CustomCollege) => boolean; onClose: () => void }) {
  const [form, setForm] = useState<CustomCollege>({ name: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CustomCollege>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanCustom(form);
    if (!c.ok) return setError(c.error);
    if (!onAdd(c.value)) return setError("Your plan's college limit is reached. Remove a college or upgrade to add more.");
    onClose();
  };

  return (
    <Modal title={<h2 className="text-lg font-semibold">Add a college we don&apos;t have</h2>} onClose={onClose} className="w-[min(30rem,calc(100vw-2rem))]">
      <form onSubmit={submit} className="space-y-3">
        <Field label="College name *">
          <input className={INPUT} value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input className={INPUT} value={form.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="State / region">
            <input className={INPUT} value={form.region ?? ""} onChange={(e) => set({ region: e.target.value })} />
          </Field>
        </div>
        <Field label="Country">
          <input className={INPUT} value={form.country ?? ""} onChange={(e) => set({ country: e.target.value })} />
        </Field>
        <Field label="Application deadline">
          <input type="date" className={INPUT} value={form.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
        <Field label="Website">
          <input className={INPUT} value={form.website ?? ""} onChange={(e) => set({ website: e.target.value })} placeholder="example.edu/admissions" />
        </Field>
        <p className="text-xs text-zinc-500">We have no tier, admit rate or score data for this college, so it won&apos;t get a fit label. You can still track its plan, status and checklist.</p>
        {error && <p className={`rounded border px-2 py-1 text-xs ${toneClass("urgent")}`}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass("quiet", "sm")} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass("primary", "sm")}>
            Add to my list
          </button>
        </div>
      </form>
    </Modal>
  );
}
