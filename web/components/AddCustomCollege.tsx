"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { cleanCustom, type CustomCollege } from "@/lib/custom-college";
import { buttonClass, toneClass } from "@/lib/ui";
import { Modal } from "./Modal";

const INPUT = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";

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
  const t = useT();
  const [form, setForm] = useState<CustomCollege>({ name: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CustomCollege>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanCustom(form);
    if (!c.ok) return setError(c.error);
    if (!onAdd(c.value)) return setError(t("application.custom.limit"));
    onClose();
  };

  return (
    <Modal title={<h2 className="text-lg font-semibold">{t("application.custom.title")}</h2>} onClose={onClose} className="w-[min(30rem,calc(100vw-2rem))]">
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("application.custom.name")}>
          <input className={INPUT} value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("application.custom.city")}>
            <input className={INPUT} value={form.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label={t("application.custom.region")}>
            <input className={INPUT} value={form.region ?? ""} onChange={(e) => set({ region: e.target.value })} />
          </Field>
        </div>
        <Field label={t("application.custom.country")}>
          <input className={INPUT} value={form.country ?? ""} onChange={(e) => set({ country: e.target.value })} />
        </Field>
        <Field label={t("application.custom.deadline")}>
          <input type="date" className={INPUT} value={form.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
        <Field label={t("application.custom.website")}>
          <input className={INPUT} value={form.website ?? ""} onChange={(e) => set({ website: e.target.value })} placeholder="example.edu/admissions" />
        </Field>
        <p className="text-xs text-zinc-500">{t("application.custom.note")}</p>
        {error && <p className={`rounded border px-2 py-1 text-xs ${toneClass("urgent")}`}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass("quiet", "sm")} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className={buttonClass("primary", "sm")}>
            {t("application.custom.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
