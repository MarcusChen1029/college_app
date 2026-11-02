# AI Subscribers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site attractive to people who already pay for an AI: say "AI guesses, we cite", make Copy for AI the free hero with ready prompts, open the Connect AI page to everyone, show data freshness, add a free public lookup connector and a "what changed this week" tool; later a Connect AI trial and a weekly email.

**Architecture:** All new logic is pure TypeScript in `web/lib/*` with `node --test` tests; pages/components consume it. The private MCP server (`/mcp`) gains a prompt list and one read tool; a second, unauthenticated MCP route (`/public/mcp`) reuses the existing college formatter. PR 1 has no database change. PR 2 (Tasks 8-10) adds one migration and an Edge Function change, applied only with the owner's OK.

**Tech Stack:** Next.js 16 App Router (`cacheComponents`), React 19, Tailwind 4, supabase-js, `mcp-handler` + `@modelcontextprotocol/sdk`, zod, Node test runner. Deno Edge Function for email.

**Spec:** `docs/superpowers/specs/2026-11-02-ai-subscribers-design.md` (read it; it holds the copy, the research facts and the anti-goals). Research: `docs/superpowers/research/2026-11-02-ai-connector-plans.md`.

## Global Constraints

- Worktree: `C:\Users\user\Desktop\college\.claude\worktrees\ai-subscribers`, branch `feat/ai-subscribers`. Never edit the main checkout.
- Next 16 has breaking changes: read the relevant page under `web/node_modules/next/dist/docs/` before writing Next code (`web/AGENTS.md`).
- Every new UI string goes through `web/lib/i18n/messages/*.ts` with an en and a zh-TW (`Translation<typeof en>`) entry; `web/lib/i18n.test.ts` must pass (no missing/unused keys). College data, stored values and portal values stay English.
- Student-facing copy never says MCP, OAuth, context pack, BYO-AI, connector address is fine. Say "connect ChatGPT or Claude".
- Never invent a college fact. The home demo uses only list actions (status, checklist), never stats or deadlines, and is labelled "Example".
- Plan-support facts come only from the research file; anything it marks unconfirmed shows "Not confirmed", with "checked 2026-11-02".
- Do not weaken existing guardrails (`web/lib/mcp/rules.ts`), teacher exclusions, or the vault/payments logic.
- Styling: existing tokens and helpers (`web/lib/ui.ts`: `toneClass`, `buttonClass`, …; `globals.css`). No raw red/amber/green/rose/emerald classes; never leave `bg-white`/`border-zinc-*` next to a tone or button class; custom classes that share an element with utilities go in `@layer components`. No dark mode.
- Checks (run from `web/` through the PowerShell tool, read the exit code, not RTK text): `npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npm test }`. Tests are `web/lib/*.test.ts` run by `node --test lib/*.test.ts`.
- Commit messages: conventional (`feat:`, `fix:`, `docs:`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Signed-out visitor and Free account on `/connect-ai`: the page must render fully (no crash on a missing plan/grant list) and never show a connector address that won't work for them. Pinned in Task 3.
2. Empty list (0 colleges) when copying a prompt: the copy must still succeed and the prompt must still be useful (the pack says the list is empty). Pinned in Task 2.
3. A Free user on a pass-only prompt with no US college on their list: the preview must say there's nothing to preview instead of fetching an empty slug. Pinned in Task 2.
4. Public connector abuse: unknown slug, huge or empty query, many requests from one IP: clean tool errors, ≤10 results, 429-style tool error after the limit. Pinned in Task 5.
5. Dates at the Taipei day boundary for "last 7 days" / "next 14 days": use `taipeiToday()` like the rest of the MCP code, compare ISO date strings. Pinned in Task 6.

---

### Task 1: Home "Ask your AI" section with animated example chat

**Files:**
- Create: `web/components/home/AskYourAi.tsx` (server wrapper: copy + CTAs), `web/components/home/AiChatDemo.tsx` (client: the animation)
- Modify: `web/app/page.tsx` (insert the section after the "every number has a source" slips, ~`:337-352`; add an "Ask your AI" item to `MENU` `:224-248`), `web/lib/i18n/messages/home.ts` (en `:5`-area and zh-TW `:90`-area)

**Interfaces:**
- Produces: `<AskYourAi />` (no props; reads strings with `await getT()`), `<AiChatDemo labels={...} />` (client; all strings passed in as props so it stays dictionary-agnostic).

- [ ] **Step 1: Read the current home page and its components** (`web/app/page.tsx`, `web/components/home/*`, `Reveal`) and the award-polish notes in the spec constraints. Match the section rhythm, eyebrow/heading/body classes and `data-reveal` usage of the neighbouring sections.
- [ ] **Step 2: Add the copy** to `home.ts` (en + zh-TW), keys under `home.ai.*`: `eyebrow`, `title`, `body`, `ctaCopy`, `ctaConnect`, `exampleLabel`, `demo.user1`, `demo.ai1`, `demo.user2`, `demo.ai2`, `demo.rowRice`, `demo.rowNorthwestern`, `demo.statusSubmitted`, `demo.statusInProgress`, `menu.title`, `menu.body`. Values: the exact copy in spec §1 (headline "AI guesses. We cite the source." / 「AI 會猜，我們附官方來源。」). The body's college count must use the same live count the home stats already use (find it in `page.tsx`/`home-stats`), passed as a `{count}` placeholder, not the literal 454. Add a line that the AI part works best with Copy for AI on any chatbot and that Claude needs 18+ (keep it short, e.g. in the small print under the CTAs: "Copy for AI works with any chatbot, free ChatGPT included. Connecting needs ChatGPT or Claude (Claude is 18+).").
- [ ] **Step 3: Build `AiChatDemo`.** Two turns, typed out character by character (user) and revealed (AI), the mini tracker card beside it flips Rice from In progress to Submitted when turn 1's answer appears. Starts once when ≥40% in view (IntersectionObserver). `prefers-reduced-motion: reduce` or no IntersectionObserver → render the final state immediately. Visible "Example" label. No college facts (spec anti-goal). Animate only `opacity`/`transform`.
- [ ] **Step 4: Build `AskYourAi`** with the two CTAs: "Copy my list for AI" → `/my-list#ai` (primary), "Connect ChatGPT or Claude" → `/connect-ai` (secondary), via `buttonClass`.
- [ ] **Step 5: Insert into `page.tsx` and add the `MENU` item** linking to `/connect-ai`.
- [ ] **Step 6: Run the checks** (Global Constraints). Expected: exit 0, i18n test green.
- [ ] **Step 7: Commit** `feat(home): "AI guesses, we cite" section with an example chat`.

### Task 2: Prompt packs for Copy for AI, with a pass preview, also as MCP prompts

**Files:**
- Create: `web/lib/ai-prompts.ts`, `web/lib/ai-prompts.test.ts`, `web/lib/i18n/messages/ai.ts`, `web/components/AiPromptPack.tsx`, `web/lib/mcp/prompts.ts`
- Modify: `web/lib/i18n/sections.ts` (register `ai`), `web/components/MyList.tsx` (`:184`, add the pack under an `id="ai"` anchor next to `AiContextButton`), `web/components/CopyContextCard.tsx` (show the pack), `web/lib/mcp/tools.ts` (`registerTools` calls `registerPrompts(server)`), `web/components/AiContextButton.tsx` only if a shared helper for building the pack text is needed (extract `useContextPackText()` rather than duplicating its fetch logic)

**Interfaces:**
- Produces (`web/lib/ai-prompts.ts`):
  - `export type AiPromptId = "due14" | "conflicts" | "balance" | "essayOverlap" | "costAid" | "weekPlan" | "weekly"`
  - `export type AiPrompt = { id: AiPromptId; needsPass: boolean; mcpOnly: boolean }`
  - `export const AI_PROMPTS: readonly AiPrompt[]` in the order above; `needsPass` true for `balance`, `essayOverlap`, `costAid`; `mcpOnly` true only for `weekly` (Task 6 gives it its tool)
  - `export function withPrompt(prompt: string, pack: string): string` → `` `${prompt.trim()}\n\n---\n\n${pack}` ``
  - `export function previewLines(detail: string, max = 10): string[]` → the first `max` non-empty lines
  - `export function previewSlug(list: { slug: string; countryCode: string | null }[]): string | null` → first listed college whose country is US or null-country treated as US; null when none
- Produces (`web/lib/mcp/prompts.ts`): `export function registerPrompts(server: McpServer): void` registering every `AI_PROMPTS` entry (title + English body from the `ai.ts` en dictionary) via `server.registerPrompt`.
- i18n keys (`ai.ts`): `ai.pack.title`, `ai.pack.intro`, `ai.pack.copy`, `ai.pack.copied`, `ai.pack.passTag`, `ai.pack.previewTitle`, `ai.pack.previewBody`, `ai.pack.previewNone`, `ai.pack.getPass`, and per prompt `ai.prompt.<id>.title` + `ai.prompt.<id>.body`. Bodies (en, final wording yours, meaning fixed): due14 "What's due in the next 14 days on my list, and what's still missing for each? Group by date."; conflicts "Check my application plans for conflicts: more than one Early Decision, Restrictive or Single-Choice Early Action rules that clash with my other plans. Quote the rule you rely on."; balance "Is my list balanced? Sort my colleges into reach, target and likely using my scores and each college's admit rate (the international rate if I'm international). Explain each call in one line."; essayOverlap "Find supplemental essay prompts on my list that overlap enough to share one draft. Group them and say what each group asks."; costAid "Compare cost and aid for international students across my list: published cost, need-based and merit aid, and proof-of-funding documents."; weekPlan "Make me a plan for this week: the 5 most important things to do, in order, with why."; weekly "What changed on my list this week, and what needs attention next?". Every body ends with: "Use only the information below. When a fact has a numbered source, cite it. Answer in {language}." — `{language}` = "English" or "Traditional Chinese (Taiwan)" from the UI language.

- [ ] **Step 1: Write failing tests** in `web/lib/ai-prompts.test.ts`:
  - `AI_PROMPTS ids are unique and every id has en and zh-TW title and body` (import the `ai.ts` dictionaries)
  - `withPrompt joins with a separator`: `withPrompt(" Hi \n", "PACK") === "Hi\n\n---\n\nPACK"`
  - `withPrompt keeps working on an empty pack`: `withPrompt("Q", "") === "Q\n\n---\n\n"`
  - `previewLines skips blanks and caps`: `previewLines("a\n\n b\nc", 2)` deep-equals `["a", " b"]`
  - `previewSlug picks the first US college, null when none`: `[{slug:"oxford",countryCode:"GB"},{slug:"rice",countryCode:"US"}]` → `"rice"`; `[{slug:"oxford",countryCode:"GB"}]` → `null`; `[]` → `null`
  - `pass prompts are balance, essayOverlap, costAid; only weekly is mcpOnly`
- [ ] **Step 2: Run** `cd web; node --test lib/ai-prompts.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `ai-prompts.ts` and the `ai.ts` dictionaries**, register the section.
- [ ] **Step 4: Run the test** → PASS.
- [ ] **Step 5: Build `AiPromptPack`** (client): lists the non-`mcpOnly` prompts as cards; click → builds the student's pack exactly as `AiContextButton` does today (reuse, don't fork), copies `withPrompt(body, pack)`, shows `ai.pack.copied`. On Free, `needsPass` cards carry `ai.pack.passTag`; clicking one opens a small dialog: `previewSlug` of the list → fetch `/api/college-details` for that slug the same way `AiContextButton` does → show `previewLines` in a monospace block → `ai.pack.getPass` link to `/pricing`; no slug → `ai.pack.previewNone`. Pass holders copy every card directly. Empty list: copying still works (Review Focus 2).
- [ ] **Step 6: Place it** on My list under `id="ai"` (so `/my-list#ai` from Task 1 lands there) and in `CopyContextCard` on `/connect-ai`.
- [ ] **Step 7: Implement `registerPrompts`** and call it from `registerTools`. The MCP prompts carry the English body without the pack (the AI fetches data with tools); add "Use the tracker's tools for the data." in place of "Use only the information below".
- [ ] **Step 8: Run the checks** → exit 0.
- [ ] **Step 9: Commit** `feat(ai): ready-made prompts for Copy for AI and the connector, with a pass preview`.

### Task 3: Connect AI page for everyone: plan table, your-data-and-age note

**Files:**
- Create: `web/lib/ai-plans.ts`, `web/lib/ai-plans.test.ts`, `web/components/AiPlanTable.tsx`, `web/components/AiDataNote.tsx`
- Modify: `web/components/ConnectAi.tsx` (`:30-158`), `web/app/(app)/connect-ai/page.tsx` if metadata/description changes, `web/lib/i18n/messages/misc.ts` (`misc.connect.*`, incl. the vendor notes `:121`, `:125-126`, which must agree with the table)

**Interfaces:**
- Produces (`web/lib/ai-plans.ts`):
  - `export type Support = "yes" | "readOnly" | "no" | "notConfirmed"`
  - `export type PlanRow = { vendor: "ChatGPT" | "Claude" | "Gemini"; plan: string; connect: Support; changes: Support; note?: string; source: string }` (`plan` is the vendor's product name, stays English; `note` is an English data note shown as-is)
  - `export const CHECKED_ON = "2026-11-02"`
  - `export const AGE_RULES: { vendor: PlanRow["vendor"]; minAge: number; note: string; source: string }[]`
  - `export const PLAN_ROWS: readonly PlanRow[]`
- Consumes: Task 5's public URL path constant `PUBLIC_MCP_PATH` from `web/lib/connect-ai.ts` — define it there in this task as `export const PUBLIC_MCP_PATH = "/public/mcp";` (Task 5 imports it).

- [ ] **Step 1: Write failing tests** in `web/lib/ai-plans.test.ts`:
  - `every row has an https source on the vendor's own help or docs domain` (help.openai.com, platform.openai.com, developers.openai.com, support.claude.com, support.anthropic.com, docs.claude.com, docs.anthropic.com, support.google.com)
  - `rows match the research`: Claude Free `connect==="yes"` and note mentions one connector; ChatGPT Pro `changes==="readOnly"`; ChatGPT Free, Go, Plus `connect==="notConfirmed"`; ChatGPT Business `changes==="yes"`; Gemini consumer `note` mentions US and 18+
  - `AGE_RULES: Claude 18, ChatGPT 13, Gemini 18` (values from the research file; if the research gives ChatGPT's rule as "13, under 18 needs a parent", keep 13 and put the parent part in `note`)
  - `CHECKED_ON is an ISO date`
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** from `docs/superpowers/research/2026-11-02-ai-connector-plans.md` only (every row's source URL from there). Rows: ChatGPT Free, Go, Plus, Pro, Business, Enterprise/Edu; Claude Free, Pro/Max, Team, Enterprise, Education; Gemini consumer (personal account), Workspace account, Gemini Enterprise.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Rework `ConnectAi.tsx`** so every visitor sees, in order: intro; a short "No setup needed: Copy for AI works with any chatbot, free ChatGPT included" block linking to `CopyContextCard`/`AiPromptPack`; examples; can / can't; setup steps per vendor; `AiPlanTable` (labels: Yes / Read only / No / Not confirmed, "Checked {date}", source links); `AiDataNote`. The connector address, the copy-address button and the connected-apps list render only for signed-in pass holders (unchanged logic). Signed-out: the sign-in panel moves below the explanation. Free: the existing pass panel, below the explanation. Also show the public lookup address (`origin + PUBLIC_MCP_PATH`) to everyone with one line: "No account needed: add this address for sourced college lookups (no access to your list)." Must render with no session, no plan and no grants (Review Focus 1).
- [ ] **Step 6: `AiDataNote`** (en + zh-TW): what the AI can and can't see (reuse `AI_CAN`/`AI_CANNOT` wording, add "never your portal passwords"); data goes to the AI company under its own terms; the age rules from `AGE_RULES` ("Claude: 18+", "ChatGPT: 13+, under 18 with a parent's permission" as the research says); "Under 18? Decide with a parent, or use Copy for AI and paste only what you choose."; how to disconnect (here + in the AI app); link to the privacy page.
- [ ] **Step 7: Update the vendor notes** in `misc.ts` so they agree with the table (Claude note adds 18+; ChatGPT note: changes confirmed on Business/Enterprise/Edu, Pro read-only, Free/Go/Plus not confirmed).
- [ ] **Step 8: Run the checks** → exit 0.
- [ ] **Step 9: Commit** `feat(connect-ai): explain Connect AI to everyone, with a sourced plan table and a data/age note`.

### Task 4: Freshness: "last checked" per college and a public data-updates log

**Files:**
- Create: `web/lib/freshness.ts`, `web/lib/freshness.test.ts`, `web/lib/data/refresh-log.json`, `web/lib/refresh-log.ts`, `web/lib/refresh-log.test.ts`, `web/app/(app)/data-updates/page.tsx` (or the route group the other public info pages use, e.g. where `/help` lives), `web/lib/i18n/messages/updates.ts`
- Modify: `web/app/(app)/colleges/[slug]/page.tsx` (top area + the sources list `:967-977` gets `id="sources"` if it has none), `web/lib/i18n/messages/college.ts`, the site footer component (add "Data updates"), `web/app/sitemap.ts`, `web/lib/i18n/sections.ts`, `web/lib/mcp/tools.ts` (`get_college` header line)

**Interfaces:**
- Produces:
  - `export function lastChecked(sources: { accessed_on: string | null | undefined }[]): string | null` (latest ISO date; null when none) in `freshness.ts`
  - `export type RefreshEntry = { date: string; en: { title: string; summary: string }; zh: { title: string; summary: string }; count?: number }`, `export const REFRESH_LOG: readonly RefreshEntry[]` (newest first), `export function entriesSince(fromIso: string, log?: readonly RefreshEntry[]): RefreshEntry[]` (date ≥ from) in `refresh-log.ts`

- [ ] **Step 1: Write failing tests:**
  - `freshness.test.ts`: `lastChecked([{accessed_on:"2026-10-21"},{accessed_on:"2026-10-27"},{accessed_on:null}]) === "2026-10-27"`; `lastChecked([]) === null`
  - `refresh-log.test.ts`: `entries are newest first with ISO dates`; `every entry has non-empty en and zh title and summary`; `entriesSince("2026-10-27")` returns only entries dated ≥ 2026-10-27
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; write `refresh-log.json` from the repo's own record only (root `CLAUDE.md` status sections and dated notes): 2026-10-20 first 10 colleges; 2026-10-22 +90 popular US colleges and Oxford/UCL/Edinburgh; 2026-10-26 316 safety colleges (six waves); 2026-10-27 15 English, 10 Canadian, 10 Australian universities; 2026-10-27 supplemental essay prompts and international finance steps for 102 US colleges; 2026-10-27 display-name cleanup; 2026-10-28 application systems per college and 86 Common App members from commonapp.org; 2026-11-02 "76 more Common App members" ONLY if that commit is on origin/main (check `git log origin/main --oneline | Select-String "76 more"`; if absent, leave it out). Counts only where CLAUDE.md states them. zh-TW translations yours.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: College page:** under the title area, a small line "Last checked {date} · {n} sources" (link to `#sources`), from the sources the page already loads. Hide when `lastChecked` is null.
- [ ] **Step 6: `/data-updates` page:** server component, en/zh-TW by `getT()`/language, the log as a dated list, a short intro ("Every number links to its official source; this is when we loaded or re-checked data."), page metadata via the helpers in `web/lib/seo.ts`. Add to `sitemap.ts` and the footer.
- [ ] **Step 7: MCP `get_college`:** prepend `Last checked: {date} (latest source access date).` when available.
- [ ] **Step 8: Run the checks** → exit 0.
- [ ] **Step 9: Commit** `feat(data): last-checked dates on college pages and a public data-updates log`.

### Task 5: Free public lookup connector and llms.txt

**Files:**
- Create: `web/lib/mcp/college-format.ts` (helpers moved out of `tools.ts`: `findSummary`, `notFound`, `withSupplements`, `packLabels`, `dropChecklist` — exact names as they are now), `web/lib/mcp/public-tools.ts`, `web/lib/rate-limit.ts`, `web/lib/rate-limit.test.ts`, `web/app/public/mcp/route.ts`, `web/app/llms.txt/route.ts`, `docs/ai-directories.md`
- Modify: `web/lib/mcp/tools.ts` (import the moved helpers; behaviour unchanged)

**Interfaces:**
- Consumes: `PUBLIC_MCP_PATH` from `web/lib/connect-ai.ts` (Task 3), `lastChecked` (Task 4).
- Produces:
  - `export function makeLimiter(opts: { limit: number; windowMs: number }): (key: string, now: number) => boolean` (true = allowed; fixed window per key; evicts expired keys so memory stays bounded)
  - `export function registerPublicTools(server: McpServer, opts: { origin: string }): void` with tools `search_colleges` (`query` 1-100 chars required, optional `region`; ≤10 results; same fields as the private tool) and `get_college` (`slug`), both `annotations: { readOnlyHint: true, title }`. Each result ends with: `Track it: {origin}/colleges/{slug} — save it to your list with a free account.` (search: one line at the end pointing to `{origin}/colleges`).

- [ ] **Step 1: Write failing tests** in `rate-limit.test.ts`:
  - `allows up to limit then blocks within the window`: limit 3, window 1000 → calls at t=0,1,2 true, t=3 false
  - `resets after the window`: same limiter, t=1001 → true
  - `keys are independent`
  - `evicts old keys` (after the window passes, internal size returns to the live keys only; expose `size()` on the returned function or test through a second exported helper — your choice, keep it tested)
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** → **Step 4: Run** → PASS.
- [ ] **Step 5: Move the helpers** to `college-format.ts`; run `npm test` + `tsc` to prove the private tools still compile and pass.
- [ ] **Step 6: `registerPublicTools`:** reuse `getSummaries`, `getCollege`, `getLookups`, `detailSection` exactly as the private `get_college` does, with `dropChecklist` always applied (no student). Unknown slug → the same `notFound` message. Empty query → zod refuses.
- [ ] **Step 7: Route `web/app/public/mcp/route.ts`:** `createMcpHandler(...)` with no `withMcpAuth`, `serverInfo: { name: "trakur-college-lookup", version: "1.0.0" }`, instructions saying it is read-only public college data with sources and has no access to any student's list. Read `node_modules/mcp-handler` README for the `basePath`/route option needed when the route isn't `/mcp`, and verify with a real request (Step 9). Per-IP limit: 60 requests / 10 minutes (key = first `x-forwarded-for` value, else `"anon"`); over the limit → HTTP 429 JSON before reaching the handler.
- [ ] **Step 8: `llms.txt`:** plain text: one-paragraph description, the sources rule, key URLs (`/colleges`, `/compare`, `/data-updates`, `/connect-ai`, `/pricing`), the public connector URL with "no sign-in, read-only", the private connector URL "needs an account". Cache like other static routes.
- [ ] **Step 9: Verify end to end** with the dev server (port from `.claude/launch.json`, see Task 7): `curl -s -X POST http://localhost:<port>/public/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` lists exactly two tools; a `tools/call` of `get_college` with `{"slug":"rice"}` returns text containing `Track it:`; `{"slug":"nope"}` returns a not-found tool result; `/mcp` without a token still returns 401.
- [ ] **Step 10: `docs/ai-directories.md`:** the owner's steps for the Claude directory and ChatGPT plugin submission (from the research file), what each needs (paid Claude plan; OpenAI org owner, identity verification, a demo account without MFA, privacy policy URL), and which URL to submit (public vs private). Not submitted by the agent.
- [ ] **Step 11: Run the checks** → exit 0. **Step 12: Commit** `feat(mcp): free public college lookup connector and llms.txt`.

### Task 6: "What changed this week" MCP tool

**Files:**
- Create: `web/lib/weekly-changes.ts`, `web/lib/weekly-changes.test.ts`
- Modify: `web/lib/student-rows.ts` (`AI_COLLEGE_COLUMNS` + `AiCollegeRow` + `fromAiCollegeRow` gain `updated_at` / `updatedAt` — the view `ai_student_colleges` already has `updated_at` (`0041_security_hardening.sql:185`); confirm on the live project with a read-only `select column_name from information_schema.columns where table_name = 'ai_student_colleges'` via the Supabase MCP before relying on it), `web/lib/types.ts` (`ListEntry.updatedAt?: string` if `ListEntry` lives there), `web/lib/mcp/tools.ts` (new tool)

**Interfaces:**
- Consumes: `REFRESH_LOG`, `entriesSince` (Task 4); `upcomingDeadlines` from `web/lib/mcp/rules.ts` (read how `get_upcoming_deadlines` calls it); `taipeiToday()`.
- Produces:
  - `export type WeeklyChanges = { since: string; today: string; updated: { slug: string; name: string; status: string; plan: string | null; updatedOn: string; checklistDone: number; checklistTotal: number }[]; dueSoon: ReturnType<typeof upcomingDeadlines>; dataRefreshed: { slug: string; name: string; lastChecked: string }[]; siteUpdates: { date: string; title: string }[] }`
  - `export function buildWeeklyChanges(input: { today: string; days?: number; list: (ListEntry & { name: string })[]; deadlines: unknown /* same type get_upcoming_deadlines passes */; lastCheckedBySlug: Record<string, string | null>; log?: readonly RefreshEntry[] }): WeeklyChanges` — `since` = today minus `days` (default 7); `updated` = entries with `updatedAt` date ≥ since (date part, compared as ISO strings), newest first; `dueSoon` = the 14-day window from `upcomingDeadlines`; `dataRefreshed` = listed colleges whose `lastChecked` ≥ since; `siteUpdates` = `entriesSince(since)` English titles.

- [ ] **Step 1: Write failing tests** in `weekly-changes.test.ts` with a fixed `today = "2026-11-02"`:
  - `since is 7 days back`: `since === "2026-10-26"`
  - `includes a college updated on the boundary day and excludes one updated 2026-10-25T23:59:59+08:00` (store updatedAt as returned by Postgres, `2026-10-26T00:10:00+00:00` style; decide and document whether the date part is UTC or Taipei — use Taipei, matching `taipeiToday()`, and assert accordingly: `2026-10-25T16:30:00+00:00` is 2026-10-26 in Taipei → included)
  - `counts checklist progress` (2 of 3 ticked → `checklistDone 2, checklistTotal 3`)
  - `dataRefreshed lists only listed colleges checked in the window`
  - `siteUpdates come from the log` (pass a two-entry log; only the one ≥ since appears)
  - `empty list gives empty arrays, not an error`
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Tool `get_weekly_changes`** (read, `guarded`, input `{ days?: 1-31 }`): loads the list (with `updated_at`), summaries for names, deadlines (as `get_upcoming_deadlines`), sources' `lastChecked` per listed college (from `getCollege(slug)`'s sources), returns `json(buildWeeklyChanges(...))`. Description says history isn't kept, so it shows current values of things changed in the window.
- [ ] **Step 6: Run the checks** → exit 0. **Step 7: Commit** `feat(mcp): get_weekly_changes tool`.

### Task 7: Docs, browser verification and PR 1

**Files:**
- Modify: `CLAUDE.md` (new bullets: prompt packs, public connector `/public/mcp`, `/data-updates`, `refresh-log.json` must get an entry with every data load, `get_weekly_changes`), `docs/competitor-analysis-and-roadmap.md` (status of "#9 In-app AI helper": "replaced by bring-your-own-AI decision 2026-11-02, see spec"), `.claude/launch.json` in the worktree (untracked, never committed: an entry `web-ai` running `npm --prefix web run dev -- -p 3181`)

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** `git fetch origin; git merge origin/main` (main moves under us), then `cd web; npx next typegen` and the full checks + `npm run build` (no other dev server in this worktree).
- [ ] **Step 3:** Browser check with `preview_start {name:"web-ai"}`, signed out: home section animates and settles (and reduced-motion shows the final state), `/my-list#ai` scrolls to the pack and a free prompt copies, a pass prompt opens the preview, `/connect-ai` shows the table and note with no console errors, a college page shows "Last checked", `/data-updates` renders in both languages (`lang` cookie), `/llms.txt` serves text. Screenshot each. 375px width for home and connect-ai.
- [ ] **Step 4:** Push, open PR to `main`, merge per memory `auto-ship-to-main` after checks are green.

---

## PR 2 (needs the owner's OK before the migration is applied and the function deployed)

### Task 8: Migration: Connect AI trial counter and weekly email opt-in

**Files:**
- Create: `supabase/migrations/00NN_ai_trial_and_weekly.sql` (NN = next free number on the LIVE project: `list_migrations` + `git log origin/main -- supabase/migrations` right before writing)

Contents (decided):
- `student_profiles.ai_trial_writes_used smallint not null default 0 check (ai_trial_writes_used between 0 and 100)`; add it to the existing plan-column guard trigger (same pattern as `guard_plan_columns` in `0045_payments.sql:43-62`) so a client can't change it.
- `create function public.consume_ai_trial_write(p_limit smallint default 3) returns smallint` SECURITY DEFINER, `set search_path = ''`: `update public.student_profiles set ai_trial_writes_used = ai_trial_writes_used + 1 where user_id = (select auth.uid()) and ai_trial_writes_used < p_limit returning p_limit - ai_trial_writes_used` → returns the number left, or -1 when none left / no row. Grant execute to `authenticated` only. `p_limit` is clamped to 3 inside (callers can't raise it).
- Expose `ai_trial_writes_used` read-only through `ai_student_profiles` (recreate the view with the same definition + the column) — check 0043+ for the view's latest definition first.
- `student_profiles.weekly_digest boolean not null default false` (student-settable), `create table public.student_digest_log (user_id uuid references auth.users on delete cascade, week_start date, sent_at timestamptz default now(), primary key (user_id, week_start))` with RLS on and no client policies.
- `create function public.due_student_digests(p_today date)` SECURITY DEFINER, executable by `service_role` only, returning the users with `weekly_digest` on and no log row for this week (week starts Monday, Taipei), with their email.

- [ ] Write it; dry-run inside `begin; … rollback;` via `execute_sql` and prove with a catalog query that nothing persisted. Ask the owner to approve `apply_migration`. Commit `feat(db): Connect AI trial counter and weekly email opt-in`.

### Task 9: Connect AI free trial

**Files:** `web/lib/mcp/rules.ts`, `web/lib/mcp/tools.ts` (`guarded` `:95-115`), `web/lib/student-rows.ts`, `web/components/ConnectAi.tsx`, `web/lib/i18n/messages/misc.ts`, tests in `web/lib/mcp-rules.test.ts`

- [ ] Test first: `trialDecision({ isSenior, used, isWrite })` → `{ allow: true }` for senior; `{ allow: true }` for Free reads; `{ allow: true, trial: true }` for Free writes with used < 3; `{ allow: false }` for Free writes with used ≥ 3; Free + column missing (`used === undefined`) → `{ allow: false }` for everything (today's behaviour). Free `get_context_pack` uses `full: false`.
- [ ] `guarded` takes a `{ write: boolean }` option (set on every write/delete tool); for a trial write, call `consume_ai_trial_write` AFTER the handler succeeded, append "Free trial: {n} changes left. The admission-year pass removes the limit: {origin}/pricing" to the result. Free connect allowed in the OAuth consent page and the Connect AI page shows the address with "Try it free: 3 changes" and the count left.
- [ ] Checks, commit `feat(connect-ai): free trial of three changes`.

### Task 10: Weekly email for students

**Files:** `supabase/functions/_shared/student-digest.ts` (+ test the pure parts with `node --test` if it has no Deno APIs, like `_shared/pass.ts` + `pass-parity.test.ts`), `supabase/functions/deadline-reminders/index.ts`, Settings reminders section component + `messages/settings.ts`, `web/lib/student-store.ts` (load/save `weekly_digest`)

- [ ] Reuse `buildWeeklyChanges` logic (twin + parity test, as `pass.ts` does) to render a short email: updated this week, due in 14 days, data refreshed, link to the site. Sent on Mondays (Taipei) by the daily run when `due_student_digests` returns the user; idempotent via `student_digest_log`; dry run without `RESEND_API_KEY`/`APP_URL`.
- [ ] Settings toggle "Weekly summary email" (off by default).
- [ ] Checks; deploy the function only with the owner's OK; commit `feat(reminders): opt-in weekly summary email for students`.
