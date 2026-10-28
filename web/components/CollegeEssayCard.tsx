"use client";

// Writing > Essays: one listed college. Its supplemental prompts (lib/supplements.ts) appear as ready-made essays;
// essays the student added by hand keep working underneath and can be tied to a prompt instead of duplicating it.
import Link from "next/link";
import { useState } from "react";
import { Pill } from "@/components/badges";
import { StatusPill } from "@/components/StatusPill";
import { isDone, newEssay, type Checklist, type Essay } from "@/lib/checklist";
import { isCustomSlug } from "@/lib/custom-college";
import { docTitle, slotDocTitle } from "@/lib/google-doc-title";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n";
import {
  essaySlots,
  includeSlot,
  isBlank,
  isLastYear,
  isSharedSet,
  linkEssay,
  openWork,
  pickedCount,
  removeSlot,
  slotPrompts,
  slotTitle,
  supplementStatus,
  updateSlot,
  type ChoiceGroup,
  type CollegeSupplements,
  type Slot,
  type SupplementPrompt,
} from "@/lib/supplements";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
import { EssayRow, type GoogleAccess, type GoogleDocs } from "./EssayRow";
import { categoryLabel, limitLabel, whoLabel } from "./supplement-text";

const PROMPT_CARD = "rounded-xl border border-zinc-200 p-3";
const SUBHEAD = "text-xs font-semibold uppercase tracking-wide text-zinc-500";
const ADD_BUTTON = "rounded-md border border-dashed border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:border-zinc-400 hover:text-zinc-900";
const LONG_PROMPT = 280;

/** Prompt text, clamped to three lines when long, with a toggle. */
function PromptText({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_PROMPT;
  // Empty = the college requires an essay but publishes the prompt only inside its application.
  if (!text) return <p className="text-sm text-zinc-500">{t("supplements.promptInApp")}</p>;
  return (
    <div className="text-sm text-zinc-600">
      <p className={`whitespace-pre-line ${long && !open ? "line-clamp-3" : ""}`}>{text}</p>
      {long && (
        <button type="button" className="text-xs text-blue-700 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("supplements.showLess") : t("supplements.showMore")}
        </button>
      )}
    </div>
  );
}

/** "Why this major", or "Short answer 2" when the college asks several of one kind, in the visitor's language. */
function displayTitle(t: TFunction, prompts: readonly SupplementPrompt[], p: SupplementPrompt) {
  const same = prompts.filter((x) => x.category === p.category);
  return same.length > 1 ? `${categoryLabel(t, p)} ${same.indexOf(p) + 1}` : categoryLabel(t, p);
}

function PromptBadges({ t, p, intlMatch }: { t: TFunction; p: SupplementPrompt; intlMatch?: boolean }) {
  return (
    <>
      <Pill>{limitLabel(t, p)}</Pill>
      {!p.required && <Pill>{t("supplements.kind.optional")}</Pill>}
      {p.applies_to && <Pill tone="blue">{whoLabel(t, p.applies_to)}</Pill>}
      {intlMatch && <StatusPill tone="soon">{t("supplements.appliesToYou")}</StatusPill>}
    </>
  );
}

/** The student's international flag matches a prompt only for international applicants. */
const intlMatches = (p: SupplementPrompt, international: boolean) => international && !!p.applies_to && /international/i.test(p.applies_to);

export function CollegeEssayCard({
  checklist: c,
  college,
  rec,
  international,
  onChange,
  google,
}: {
  checklist: Checklist;
  college: CollegeSummary;
  rec: CollegeSupplements | null;
  international: boolean;
  onChange: (checklist: Checklist) => void;
  google?: GoogleAccess;
}) {
  const t = useT();
  const status = supplementStatus(rec);
  const shared = isSharedSet(rec);
  // A college that requires an essay without publishing its text gets one generic required slot.
  const prompts = slotPrompts(rec);
  const view = essaySlots(c, prompts);
  const work = openWork(view);
  const list = c.essay_list ?? [];
  const set = (patch: Partial<Checklist>) => onChange({ ...c, ...patch });
  const setManual = (id: string, patch: Partial<Essay>) => set({ essay_list: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const manualDocs: GoogleDocs | undefined = google && {
    connected: google.connected,
    connect: google.connect,
    create: (essayTitle, index) => google.createNamed(docTitle(college, essayTitle, index)),
  };
  const slotDocs = (p: SupplementPrompt): GoogleDocs | undefined =>
    google && { connected: google.connected, connect: google.connect, create: () => google.createNamed(slotDocTitle(college, slotTitle(prompts, p))) };

  // Every essay on the plan: included prompts (stored or not yet) and the hand-added ones.
  const planned = [...view.slots.filter((s) => s.included).map((s) => s.essay?.status ?? "not_started"), ...view.manual.map((e) => e.status)];
  const finals = planned.filter((s) => s === "final").length;
  const done = !!c.no_essays || (isDone("essays", c) && work.slots === 0 && work.unpickedGroups.length === 0);
  const hasPrompts = prompts.length > 0;
  const toWrite = view.slots.filter((s) => s.included && s.kind !== "optional").length;

  const removeWithConfirm = (s: Slot) => {
    const name = displayTitle(t, prompts, s.prompt);
    if (!isBlank(s.essay) && !window.confirm(t("supplements.confirmRemove", { name }))) return;
    onChange(removeSlot(c, prompts, s.prompt.key));
  };

  const slotRow = (s: Slot) => {
    const name = displayTitle(t, prompts, s.prompt);
    const essay = s.essay ?? { id: `slot-${s.prompt.key}`, title: slotTitle(prompts, s.prompt), url: "", status: "not_started" as const };
    return (
      <EssayRow
        key={s.prompt.key}
        essay={essay}
        index={0}
        label={name}
        badge={<PromptBadges t={t} p={s.prompt} intlMatch={intlMatches(s.prompt, international)} />}
        detail={<PromptText text={s.prompt.prompt} />}
        docs={slotDocs(s.prompt)}
        onChange={(patch) => onChange(updateSlot(c, prompts, s.prompt.key, { ...(patch.status ? { status: patch.status } : {}), ...(patch.url !== undefined ? { url: patch.url } : {}) }))}
        onRemove={s.kind === "required" ? undefined : () => removeWithConfirm(s)}
        removeLabel={t("supplements.removeSlot")}
      />
    );
  };

  /** A prompt that isn't on the plan yet: its text and one button to add it. */
  const offerRow = (s: Slot, action: string) => (
    <li key={s.prompt.key} className={`${PROMPT_CARD} space-y-1.5`}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {displayTitle(t, prompts, s.prompt)}
        <PromptBadges t={t} p={s.prompt} intlMatch={intlMatches(s.prompt, international)} />
      </div>
      <PromptText text={s.prompt.prompt} />
      <button type="button" className={ADD_BUTTON} onClick={() => onChange(includeSlot(c, prompts, s.prompt.key))}>
        {action}
      </button>
    </li>
  );

  const required = view.slots.filter((s) => s.kind === "required");
  const conditional = view.slots.filter((s) => s.kind === "conditional");
  const optional = view.slots.filter((s) => s.kind === "optional");
  const choiceGroups = view.groups.filter((g) => g.kind === "choice");
  // Choose-N sets inside the conditional/optional sections keep their pick limit; loose prompts get one button each.
  const conditionalGroups = view.groups.filter((g) => g.kind === "conditional");
  const optionalGroups = view.groups.filter((g) => g.kind === "optional");
  const conditionalLoose = conditional.filter((s) => !s.prompt.choose);
  const optionalLoose = optional.filter((s) => !s.prompt.choose);
  // Every prompt depends on the student's school or major (Cornell, UIUC, Boston College): open the list and say so.
  const allConditional = required.length === 0 && choiceGroups.length === 0 && conditional.length > 0;
  const conditionalChosen = conditional.some((s) => s.included);

  const groupBox = (g: ChoiceGroup) => {
    const picked = pickedCount(view, g.group);
    const slots = view.slots.filter((s) => s.prompt.choose?.group === g.group);
    return (
      <li key={g.group} className={`${PROMPT_CARD} space-y-2`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">{t("supplements.chooseN", { pick: g.pick, total: g.prompts.length })}</span>
          <span className={`text-xs tabular-nums ${picked >= g.pick ? "font-medium text-done" : "text-zinc-500"}`}>{t("supplements.chosen", { n: picked, pick: g.pick })}</span>
          {g.kind === "optional" && <Pill>{t("supplements.kind.optional")}</Pill>}
          {g.prompts[0].applies_to && <Pill tone="blue">{whoLabel(t, g.prompts[0].applies_to)}</Pill>}
        </div>
        <ul className="space-y-2">
          {slots.map((s) => (
            <li key={s.prompt.key} className="space-y-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={t("supplements.answerAria", { name: displayTitle(t, prompts, s.prompt) })}
                  checked={s.included}
                  disabled={!s.included && picked >= g.pick}
                  onChange={() => (s.included ? removeWithConfirm(s) : onChange(includeSlot(c, prompts, s.prompt.key)))}
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {displayTitle(t, prompts, s.prompt)}
                    <Pill>{limitLabel(t, s.prompt)}</Pill>
                  </span>
                  {!s.included && <PromptText text={s.prompt.prompt} />}
                </span>
              </label>
              {s.included && <ul className="pl-6">{slotRow(s)}</ul>}
            </li>
          ))}
        </ul>
      </li>
    );
  };

  // Unclaimed prompts a hand-added essay could be tied to.
  const open = view.slots.filter((s) => isBlank(s.essay));
  const manualList = (
    <>
      {view.manual.length > 0 && (
        <ul className="space-y-2">
          {view.manual.map((e, i) => (
            <EssayRow
              key={e.id}
              essay={e}
              index={i}
              onChange={(patch) => setManual(e.id, patch)}
              onRemove={() => set({ essay_list: list.filter((x) => x.id !== e.id) })}
              docs={manualDocs}
              detail={
                hasPrompts && open.length > 0 ? (
                  <div className="pl-7">
                    <select
                      className="min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600"
                      value=""
                      aria-label={t("supplements.linkToAria", { n: i + 1 })}
                      onChange={(ev) => ev.target.value && onChange(linkEssay(c, prompts, e.id, ev.target.value))}
                    >
                      <option value="">{t("supplements.linkTo")}</option>
                      {open.map((s) => (
                        <option key={s.prompt.key} value={s.prompt.key}>
                          {displayTitle(t, prompts, s.prompt)} · {limitLabel(t, s.prompt)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
      <button type="button" className={ADD_BUTTON} onClick={() => set({ essay_list: [...list, newEssay()] })}>
        {t("writing.addEssay")}
      </button>
    </>
  );

  /** For colleges whose only "essays" item is a fact (none / UC / optional only): one explicit tick. */
  const markDone = (label: string) =>
    c.no_essays ? (
      <span className="flex items-center gap-2 text-sm">
        <StatusPill tone="done">{t("supplements.markedDone")}</StatusPill>
        <button type="button" className="text-xs text-zinc-500 hover:text-urgent" onClick={() => set({ no_essays: false })}>
          {t("supplements.undo")}
        </button>
      </span>
    ) : (
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => set({ no_essays: true })}>
        {label}
      </button>
    );

  const sourceUrl = rec?.sources[0]?.url;

  return (
    <section id={`essays-${college.slug}`} className="rounded-3xl border-2 border-zinc-200 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? "bg-done text-white" : "border border-zinc-300"}`}
          aria-label={done ? t("writing.essaysDoneAria") : t("writing.essaysNotDoneAria")}
        >
          {done ? "✓" : ""}
        </span>
        <h2 className="text-xl font-bold">
          {/* A college the student typed in has no page of ours. */}
          {isCustomSlug(college.slug) ? (
            college.name
          ) : (
            <Link href={`/colleges/${college.slug}`} className="hover:underline">
              {college.name}
            </Link>
          )}
        </h2>
        {planned.length > 0 && !c.no_essays && <span className="text-xs tabular-nums text-zinc-500">{t("writing.finalCount", { done: finals, total: planned.length })}</span>}
        {hasPrompts && !c.no_essays && (toWrite > 0 || work.unpickedGroups.length > 0) && (
          <span className="text-xs text-zinc-500">
            {[toWrite > 0 && t("supplements.toWrite", { n: toWrite }), ...work.unpickedGroups.map((g) => t("supplements.toChoose", { n: g.pick }))].filter(Boolean).join(" · ")}
          </span>
        )}
        {rec && rec.sources.length > 0 && (
          <Link href={`/colleges/${college.slug}#supplemental-essays`} className="text-xs text-blue-700 hover:underline">
            {t("supplements.collegePage")}
          </Link>
        )}
        {isLastYear(rec) && (
          <span className="ml-auto">
            <StatusPill tone="soon" title={t("supplements.lastYearHint")}>
              {t("supplements.lastYear", { cycle: rec!.cycle })}
            </StatusPill>
          </span>
        )}
        {(status === "not_researched" || status === "unknown") && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
            <input type="checkbox" checked={!!c.no_essays} onChange={(e) => set({ no_essays: e.target.checked })} />
            {t("writing.noEssaysRequired")}
          </label>
        )}
      </div>

      <div className="space-y-3">
        {/* What we know, stated once. */}
        {(status === "not_researched" || status === "unknown") && !c.no_essays && <p className="text-sm text-zinc-500">{t("supplements.unknownWriting")}</p>}
        {status === "none" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {t("supplements.noneFact")}{" "}
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                  ↗
                </a>
              )}
            </p>
            {markDone(t("supplements.noneMarkDone"))}
          </div>
        )}
        {shared && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <a href="#uc-essays" className="text-blue-600 hover:underline">
                {t("supplements.ucUses")}
              </a>
            </p>
            {markDone(t("supplements.noneMarkDone"))}
          </div>
        )}
        {status === "optional_only" && !shared && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-zinc-600">{t("supplements.optionalOnly")}</p>
            {markDone(t("supplements.skipOptional"))}
          </div>
        )}
        {isLastYear(rec) && <p className="text-xs text-zinc-500">{t("supplements.lastYearHint")}</p>}
        {status === "required" && c.no_essays && (
          <p className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toneClass("soon")}`}>
            <span className="flex-1">{t("supplements.markedNoneButRequired")}</span>
            <button type="button" className="text-xs font-semibold underline" onClick={() => set({ no_essays: false })}>
              {t("supplements.undo")}
            </button>
          </p>
        )}

        {hasPrompts && !(c.no_essays && status === "optional_only") && (
          <>
            {(required.length > 0 || choiceGroups.length > 0) && (
              <ul className="space-y-2">
                {required.map(slotRow)}
                {choiceGroups.map(groupBox)}
              </ul>
            )}
            {conditional.length > 0 && (
              <details open={allConditional || conditionalChosen || conditional.some((s) => intlMatches(s.prompt, international))}>
                <summary className={`cursor-pointer ${SUBHEAD}`}>
                  {t("supplements.someApplicants")} ({conditional.length})
                </summary>
                {allConditional && !conditionalChosen && <p className="mt-1 text-sm text-zinc-600">{t("supplements.markWhichApply")}</p>}
                <ul className="mt-2 space-y-2">
                  {/* Sets first: an "all applicants except…" choice is the path most students take. */}
                  {conditionalGroups.map(groupBox)}
                  {conditionalLoose.map((s) => (s.included ? slotRow(s) : offerRow(s, t("supplements.appliesToMe"))))}
                </ul>
              </details>
            )}
            {optional.length > 0 && (
              <details open={status === "optional_only" || optional.some((s) => s.included)}>
                <summary className={`cursor-pointer ${SUBHEAD}`}>
                  {t("supplements.optionalHeading")} ({optional.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {optionalLoose.map((s) => (s.included ? slotRow(s) : offerRow(s, t("supplements.addThis"))))}
                  {optionalGroups.map(groupBox)}
                </ul>
              </details>
            )}
          </>
        )}

        {/* Hand-added essays. With prompts on file they sit under their own heading. */}
        {!(c.no_essays && (status === "not_researched" || status === "unknown")) && (
          <div className="space-y-2">
            {hasPrompts && view.manual.length > 0 && <h3 className={SUBHEAD}>{t("supplements.ownEssays")}</h3>}
            {!hasPrompts && view.manual.length === 0 && (status === "not_researched" || status === "unknown") && (
              <p className="text-sm text-zinc-500">{t("writing.noEssaysYet")}</p>
            )}
            {manualList}
          </div>
        )}
      </div>
    </section>
  );
}
