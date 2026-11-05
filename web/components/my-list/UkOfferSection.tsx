"use client";

import { UK_OFFER_TYPES, UK_REPLIES, type Checklist, type UkOfferType, type UkReply } from "@/lib/checklist";
import { useT } from "@/lib/i18n/client";
import type { ListEntry } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { canSetReply, INSURANCE_RULE_SOURCE, replyConflicts, UK_CONDITIONS_MAX, ukConditions, ukOfferType, ukReplyBy, ukReplyOf } from "@/lib/uk-offers";
import { SELECT, Section } from "../ChecklistPanel";

type Props = {
  entry: ListEntry;
  /** Every college on the list, to enforce one Firm and one Insurance and to name the college that holds each. */
  list: readonly { entry: ListEntry; college: CollegeSummary }[];
  set: (patch: Partial<Checklist>) => void;
};

const FIELD = "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs";

/** Where a UK offer is recorded: its type, conditions (private), and the UCAS reply with its reply-by date. Shown for admitted or enrolled UK colleges. */
export function UkOfferSection({ entry, list, set }: Props) {
  const t = useT();
  const c = entry.checklist;
  const offer = ukOfferType(c);
  const reply = ukReplyOf(c);
  const entries = list.map((l) => l.entry);
  const nameOf = (slug: string) => list.find((l) => l.entry.slug === slug)?.college.name ?? slug;
  const replyLabel = (r: UkReply) => t(`application.ukOffer.${r}`);
  const conflicts = replyConflicts(entries);
  const holderOf = (r: UkReply) => entries.find((e) => e.slug !== entry.slug && ukReplyOf(e.checklist) === r);
  const conflictFor = (r: "firm" | "insurance") => (conflicts[r].length > 1 ? conflicts[r] : null);

  return (
    <Section title={t("application.ukOffer.title")} done={reply === "firm" || reply === "insurance"} className="md:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          {t("application.ukOffer.offerType")}
          <select
            className={SELECT}
            value={offer ?? ""}
            onChange={(e) => set({ uk_offer: (e.target.value || null) as UkOfferType | null })}
          >
            <option value="">{t("application.ukOffer.offerNone")}</option>
            {UK_OFFER_TYPES.map((o) => (
              <option key={o} value={o}>
                {t(`application.ukOffer.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          {t("application.ukOffer.reply")}
          <select className={SELECT} value={reply ?? ""} onChange={(e) => set({ uk_reply: (e.target.value || null) as UkReply | null })}>
            <option value="">{t("application.ukOffer.replyNone")}</option>
            {UK_REPLIES.map((r) => {
              // The college's own current reply stays selectable so a conflicting old value is still shown.
              const allowed = r === reply || canSetReply(entries, entry.slug, r);
              return (
                <option key={r} value={r} disabled={!allowed}>
                  {r !== "decline" && !allowed && holderOf(r)
                    ? t("application.ukOffer.taken", { reply: replyLabel(r), college: nameOf(holderOf(r)!.slug) })
                    : replyLabel(r)}
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 sm:col-span-2">
          <span>
            {t("application.ukOffer.conditions")} <span className="text-zinc-500">({t("application.ukOffer.conditionsPrivate")})</span>
          </span>
          <textarea
            className={FIELD}
            rows={2}
            maxLength={UK_CONDITIONS_MAX}
            value={ukConditions(c)}
            onChange={(e) => set({ uk_conditions: e.target.value.slice(0, UK_CONDITIONS_MAX) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          {t("application.ukOffer.replyBy")}
          <input type="date" className={FIELD} value={ukReplyBy(c) ?? ""} onChange={(e) => set({ uk_reply_by: e.target.value || null })} />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-zinc-600">{t("application.ukOffer.replyByHelp")}</p>
      <p className="mt-1 text-xs text-zinc-600">{t("application.ukOffer.changeHelp")}</p>
      {INSURANCE_RULE_SOURCE !== null && (
        <p className="mt-1 text-xs text-zinc-600">
          {t("application.ukOffer.unconditionalRule")}{" "}
          <a href={INSURANCE_RULE_SOURCE} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            {t("application.ukOffer.ruleSource")}
          </a>
        </p>
      )}
      {(["firm", "insurance"] as const).map((r) => {
        const slugs = conflictFor(r);
        return slugs ? (
          <p key={r} role="alert" className="mt-1 text-xs font-medium text-zinc-900">
            {t("application.ukOffer.conflict", { reply: replyLabel(r), colleges: slugs.map(nameOf).join(", ") })}
          </p>
        ) : null;
      })}
    </Section>
  );
}
