# AI subscribers: pitch, prompt packs, open Connect AI, freshness, public lookup, weekly changes

Date: 2026-11-02. Source: llm-council verdict of the same day (5 advisors, anonymous peer review, opus chairman).
Owner instruction: build council items 2-7; keep item 1 (production ECPay + funnel events) as a reminder only
(memory `ai-subscriber-plan`). The owner skipped the question round ("you can start building"), so every
choice below not quoted from the council is the builder's call and is marked **(call)**.

## Intent

People who already pay for ChatGPT, Claude or Gemini think "my AI already does this". It doesn't: it guesses
deadlines and admit rates, forgets the list between chats, can't email before a deadline and can't fill a
portal. The site's pitch has to say that in plain words, the free tier has to let people *feel* the AI
features before paying, and the AI features have to lean on what only this site has: sourced facts with dates,
and the student's saved list.

## Goals
1. Home page says "AI guesses, we cite the source" and shows (not tells) the Connect AI flow.
2. "Copy for AI" becomes the free entry point: ready-made prompts that work with any chatbot, free ChatGPT
   included, plus a preview of what the pass adds.
3. Connect AI page explains itself to everyone (not just pass holders): which AI plans can connect (sourced,
   dated table), what data goes to the AI vendor, a note for under-18s and parents. Free accounts get a small
   trial.
4. Freshness is visible: a "last checked" date per college and a public data-updates log.
5. A free, no-login, read-only connector answers one college at a time with sources, and points to the
   tracker ("add it to your list").
6. "What changed this week": an MCP tool now, and an opt-in weekly email.

## Non-goals
- No in-app AI / server-side LLM calls (council: unanimous).
- No production payments work (owner kept it for later).
- No submission to the Claude / ChatGPT directories by the agent (outward-facing; steps are documented for
  the owner instead).
- No real screen recording (needs the owner's AI account); the animated demo stands in **(call)**.

## Anti-goals (a failure even if it "works")
- Any invented college fact in marketing copy or the demo. The demo uses only the student's own list actions
  (status, checklist), never stats or deadlines **(call)**.
- Builder words on student-facing screens: MCP, OAuth, context pack, BYO-AI. Say "connect ChatGPT or Claude".
- A plan-support table that states something the research could not confirm. Unconfirmed = "Not confirmed",
  with the check date.
- Weakening the existing guardrails (no portal passwords, no deletes of colleges/essays, no "submitted"
  before the checklist is complete) or the teacher exclusions.

## Constraints
- Next 16 App Router (`web/AGENTS.md`: read `web/node_modules/next/dist/docs/` before Next code),
  `cacheComponents`, i18n via `web/lib/i18n/messages/*.ts` with zh-TW typed against en and
  `i18n.test.ts` (no missing/unused keys). Data, stored values and portal values stay English.
- Design language: the award-polish system (home "printed timetable", app-screen layer, tones in
  `web/lib/ui.ts`, no raw red/amber/green classes; custom classes that share elements with utilities go in
  `@layer components`). Home is judged 7.7; a new section must not lower it.
- Migrations: next free number checked on the LIVE project (`list_migrations`) right before writing it;
  applying a migration or deploying an Edge Function needs the owner's OK (memory `auto-ship-to-main`).
  Code must keep working if the migration is not applied yet.
- Checks before every merge: `npx tsc --noEmit && npm run lint && npm test` in web/ (run through
  PowerShell, not the RTK-hooked shell, and read exit codes).

## Facts this builds on (origin/main c88ae0f)
- Home: `web/app/page.tsx`; hero h1 hard-coded `:299-303`, sub `home.hero.body`; sections `:288-503`;
  feature list `MENU` `:224-248`; no AI mention anywhere.
- Copy for AI: `buildContextPack` `web/lib/ai-context.ts:331-350` (Free = profile + list table; pass adds
  activities and per-college details with numbered sources "(accessed …)"); button
  `web/components/AiContextButton.tsx` (pass check client-side `:56`), on My list and `/connect-ai`
  (`CopyContextCard.tsx`). `/api/college-details` has no auth or plan check (data is public on college
  pages anyway). No pre-written prompts exist.
- Connect AI page: `ConnectAi.tsx`; Free sees only a pass panel (`:68-77`); setup steps per vendor in
  `misc.ts:117-126` (already notes ChatGPT write limits).
- MCP: `web/app/mcp/route.ts` (`withMcpAuth`, required), plan gate for every tool at
  `web/lib/mcp/tools.ts:103` inside `guarded()`; read tools vs write/delete tools listed in `tools.ts`.
  No usage counting, no public path.
- Sources: `public.sources.accessed_on` (date, not null) per source; college page lists sources with
  "accessed {date}" (`app/(app)/colleges/[slug]/page.tsx:967-977`, `SourceItem.tsx`). Note:
  `build_seed.py:233` fills a missing `accessed` with 2026-10-20.
- No change-history table; `updated_at` columns exist on student rows (`0001:303-310`).
- Weekly teacher digest pattern: migration 0029 + `_shared/teacher-digest.ts` + `deadline-reminders`,
  dry run without `RESEND_API_KEY` / `APP_URL`.

## Research that shapes this (docs/superpowers/research/2026-11-02-ai-connector-plans.md)
- Claude: custom connectors on every plan (Free = one), writes allowed; **Claude accounts require age 18+**.
- ChatGPT: full connectors with writes confirmed only on Business / Enterprise / Edu (web only); Pro is
  read/fetch; Free, Go and Plus not confirmed (sources conflict). The only one of the three open to 13-17.
- Gemini: consumer custom MCP only for 18+, US, English; not for Taiwanese students.
- Consequence: for most students (under 18, Taiwan), **Copy for AI is the AI path that works**; Connect AI
  serves 18+ students and parents. Copy, CTAs and the setup page say so plainly; Copy for AI comes first.
- Directories: Claude needs a paid plan to submit (claude.ai/directory/manage); ChatGPT needs an org owner,
  identity verification and a demo account (platform.openai.com/plugins). Owner actions.

## Design

### 1. Home "Ask your AI" section (Goal 1)
- New section after the "every number has a source" slips, same visual system. Copy (en / zh-TW):
  - Eyebrow: "Works with the AI you already pay for" / 「用你已經付費的 AI」
  - Headline: "AI guesses. We cite the source." / 「AI 會猜，我們附官方來源。」
  - Body: "Every number on 454 colleges links to its official page, and we email you before each deadline.
    Already using ChatGPT or Claude? Tell it "I submitted Rice today" and your list updates itself." /
    「454 所大學、每個數字都有出處，截止前 email 提醒你。已經在用 ChatGPT 或 Claude？跟它說『我今天交了 Rice』，清單自己更新。」
    (the 454 count comes from the existing home stats, not a literal **(call)**)
  - CTAs: "Copy my list for AI" -> `/my-list#ai` ; "Connect ChatGPT or Claude" -> `/connect-ai`.
- Demo: a scripted two-turn chat beside a mini tracker card. Turn 1: "I submitted Rice today." -> AI:
  "Done. Rice is marked Submitted. Still open: mid-year report." -> the card's Rice row ticks to Submitted.
  Turn 2: "What's left this week?" -> a short list from the same mock list. Plays once when scrolled into
  view; `prefers-reduced-motion` shows the final state. Labelled "Example" so nobody reads it as real data.
- `MENU` gets an "Ask your AI" item linking to `/connect-ai`.

### 2. Prompt packs (Goal 2)
- `web/lib/ai-prompts.ts`: a typed list of prompts, each `{ id, needsPass }` with en/zh-TW text in the
  i18n dictionaries. The copied text = prompt + blank line + the context pack. Prompts **(call)**:
  1. "What's due in the next 14 days, and what's still missing for each?" (free)
  2. "Check my plans for conflicts: more than one Early Decision, Restrictive Early Action rules." (free)
  3. "Is my list balanced? Sort it into reach / target / likely using my scores and each college's admit
     rate." (pass: needs per-college stats)
  4. "Find supplemental essay prompts that overlap so I can reuse drafts." (pass: needs supplements)
  5. "Compare cost and aid for international students across my list." (pass)
  6. "Make me a plan for this week." (free)
  Each prompt tells the AI to answer in the UI language and to use only the data given, citing the
  numbered sources when present.
- UI `AiPromptPack`: cards with one-click copy, on My list (anchor `#ai`) and `/connect-ai`. On Free, pass
  prompts open a preview: the real pass-level detail block for one college on the student's list (first
  ~10 lines from `/api/college-details`), then "Get the pass" -> `/pricing` **(call)**.
- MCP: register the same prompts as MCP prompts (Claude shows them in its UI) **(call)**.

### 3. Connect AI page for everyone (Goal 3)
- Everyone sees: intro, examples, can / can't, setup steps, the plan table, the "your data" note. The
  connector address and the connected-apps list stay for signed-in accounts.
- Plan table: `web/lib/ai-plans.ts` from `docs/superpowers/research/2026-11-02-ai-connector-plans.md`;
  rows vendor x plan with custom connector (yes / no / not confirmed), changes allowed (yes / read only /
  not confirmed), source link, "checked 2026-11-02". The existing vendor notes in `misc.ts` must agree with
  it.
- "Your data and age" note: what the AI can see (and can't: portal passwords), that it is sent to the AI
  company under its own terms, each vendor's minimum age (from the research, sourced), "under 18: decide
  with a parent", how to disconnect (here + in the AI app), link to the privacy page.
- Public lookup address (section 5) shown for people without an account.

### 4. Free trial of Connect AI (Goal 3, phase B: needs a migration)
- Free accounts can connect. Read tools work (their list is capped at 5 anyway); `get_context_pack`
  returns the Free-level pack. Write and delete tools: 3 successful changes per account, then the existing
  pass message. Every write result on Free says how many free changes are left **(call: writes, not calls,
  because one chat turn makes several reads)**.
- Server-owned counter: `student_profiles.ai_trial_writes_used` guarded like the plan columns, changed only
  by a SECURITY DEFINER RPC that increments atomically and returns what's left. If the RPC or column is
  missing (migration not applied), Free stays fully blocked as today.
- Connect AI page on Free: "Try it free: 3 changes, then the pass", with the count left.

### 5. Freshness (Goal 4)
- College page: "Last checked {date}" near the top (= latest `accessed_on` of that college's sources),
  linking to the sources list.
- Public page `/data-updates` (en / zh-TW, in sitemap, footer link): entries from
  `web/lib/data/refresh-log.json` `{ date, title, summary, count? }`, newest first, written from the
  repo's own record of past loads (CLAUDE.md status sections); a test checks shape and order. New data
  loads add an entry.
- MCP `get_college` and the context pack already carry per-source dates; add the "last checked" date to
  `get_college`'s header.

### 6. Public lookup connector (Goal 5)
- `web/app/public/mcp/route.ts` **(call: path outside `/mcp` so OAuth discovery for the private server
  never applies)**: no auth, two read-only tools: `search_colleges` (≤10 results) and `get_college` (one
  college, same sourced formatter as the pass details), each ending with the college page URL and "Save it
  to your list with a free account at …".
- Best-effort per-IP limit in memory (per server instance) **(call)**; data is already public, so the limit
  only protects cost.
- `/llms.txt`: what the site is, the public connector URL, key pages, the sources rule.
- Directory submission steps for the owner go in `docs/` (not submitted by the agent).

### 7. What changed this week (Goal 6)
- Pure `web/lib/weekly-changes.ts`: from the student's rows and today, list (a) applications, checklist
  items, essays and activities updated in the last 7 days (current values; no history exists), (b)
  deadlines in the next 14 days with what's missing, (c) overdue items, (d) data refreshes for their
  colleges (sources accessed in the window, refresh-log entries in the window). Tested.
- MCP tool `get_weekly_changes` (read) + a prompt card "What changed this week?".
- Phase B: opt-in weekly email for students (Settings > reminders), sent by `deadline-reminders` like the
  teacher digest, dry run until the Resend secrets are set; needs a migration (opt-in column + weekly log).

## Rollout
- PR 1 (no DB change): sections 1, 2, 3, 5, 6, 7-tool. Auto-shipped to main.
- PR 2 (migration + Edge Function): sections 4 and 7-email. Migration written after checking the live
  number; applied and the function deployed only with the owner's OK; merged after that.

## Left to the builder
Component structure, animation details, exact table styling, rate-limit numbers, test layout.
