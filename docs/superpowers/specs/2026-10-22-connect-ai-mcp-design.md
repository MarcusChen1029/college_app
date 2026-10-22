# Connect AI (MCP server) — design

Date: 2026-10-22. Status: approved direction in chat; owner skipped the remaining questions and asked to build.

## Intent
Senior-plan students connect their own ChatGPT or Claude to the tracker, then track applications by talking:
"I submitted Rice today", "add Northwestern as ED", "mark my Brown recommendations done", "what's due in two weeks?".
The AI reads and updates the same data the website shows, so the app and the chat never disagree.
It is a paid (Senior) feature aimed at students who already pay for an AI.

## Decisions (owner)
- Who: **Senior plan only.** Signed-in students only (browser-only data can't be reached).
- AIs: ChatGPT and Claude. If a student's ChatGPT plan blocks custom connectors or write actions, that's their plan's limit; we don't work around it.
- The AI **must never read or change portal usernames/passwords** (`student_colleges.portal_*`, `student_profiles.portals`).
- The AI **cannot remove a college** from My list.
- Essays: the AI can add and update (title, link, status), **cannot delete**.
- Activities: the AI can add, update **and delete**.
- A new page **Connect AI** explains and sets up the connection.

## Calls made by Claude (owner can override)
- MCP endpoint lives in the existing Next.js app: `web/app/mcp/route.ts` → `https://<site>/mcp`. Library: `mcp-handler@2` + `@modelcontextprotocol/server@2` + `zod@4` (stateless Streamable HTTP, works on Vercel).
- Sign-in: **Supabase Auth OAuth 2.1 server (beta)** with dynamic client registration on. Consent page hosted by us at `/oauth/consent`.
- Token check: `supabase.auth.getClaims(token)` (asymmetric signing keys). Require the `client_id` claim (proves the token came from the OAuth server, not a website session). Audience-binding via a custom access-token hook is a follow-up, not v1.
- Data access per request uses a supabase-js client carrying the student's bearer token, so existing RLS (`own profile`, `own list`) does the isolation. No service-role key anywhere.
- Senior check runs inside every tool (reads `student_profiles.plan`); non-Senior gets a tool error with an upgrade link, not an HTTP 403 (403 makes clients loop re-auth).
- The AI cannot change the subscription plan, the reminder-email setting, or portal data.
- Rules the website enforces apply to the AI too, reusing `lib/` logic: plan list limit (`canAddMore`), Submitted only when the checklist is complete (`progress`), ED-at-two-colleges warning, decisions only after submission.
- Tool annotations: reads `readOnlyHint: true`; `delete_activity` `destructiveHint: true`; other writes `destructiveHint: false`.

## Tools (v1)
Read (readOnly):
- `get_profile` — GPA, SAT/ACT (+sections), English tests, international, target regions, plan. No portals.
- `get_applications` — every listed college: slug, name, plan (ED/EA/…), status, checklist (incl. essays with id/title/url/status), notes, next deadline, fit label + reason; plus interested slugs.
- `get_upcoming_deadlines(days = 30)` — listed colleges' dates, respecting each college's chosen plan (same filter as My list).
- `get_activities` — Common App activities + honors, UC entries, with ids.
- `get_resume_settings`.
- `search_colleges(query?, region?)` — public summaries (name, slug, location, admit rates, SAT range, test policy, tiers).
- `get_college(slug)` — the full sourced detail as Markdown (reuse `lib/ai-context.ts` detail section), with source links.
- `get_context_pack` — the full "Copy for AI" Markdown for the student.

Write:
- `update_profile(patch)` — gpa, sat, act, sat/act sections, English test scores, international, target regions. Validate with `lib/scores.ts` scales.
- `add_college(slug, plan?)` — fails cleanly when already listed or over the plan limit.
- `set_interested(slug, interested)`.
- `update_application(slug, { plan?, status?, notes? })` — plan must be one the college offers; status transitions follow website rules; returns warnings (e.g. two EDs).
- `update_checklist(slug, patch)` — recommendations, transcript, test_scores, english_test (booleans), test_plan, english_plan, no_essays.
- `add_essay(slug, title, url?, status?)`, `update_essay(slug, essay_id, patch)` — URLs must be http(s) (`safeLink`).
- `add_activity(kind, fields)`, `update_activity(kind, id, patch)`, `delete_activity(kind, id)` — kind ∈ `common_app_activity | common_app_honor | uc_entry`; enforce `CA_LIMITS` / `UC_LIMITS` counts and field lengths.
- `update_resume_settings(patch)`.

Not exposed: remove college, delete essay, change plan, reminder emails, portals.

## Pages
- `/connect-ai` (nav link "Connect AI"):
  - what it does, with example prompts; what the AI can and can't do (mirror the lists above);
  - Senior gate (signed out → sign in; non-Senior → upgrade link);
  - the MCP URL with a copy button; step-by-step for Claude (Settings → Connectors → Add custom connector) and ChatGPT (developer mode / custom connector);
  - honest plan note: Claude works on all plans (Free = one custom connector); ChatGPT custom connectors with write actions are limited to some plans (Business/Enterprise/Edu at time of writing), and Plus/Pro may be read-only;
  - "Connected AIs" list (`supabase.auth.oauth.listGrants`) with Disconnect (`revokeGrant`).
- `/oauth/consent?authorization_id=…`: if signed out → Google sign-in returning to this URL; `getAuthorizationDetails`; if it already returns a redirect, follow it; show client name and the can/can't lists; non-Senior → explain + upgrade link, Approve disabled; Approve/Deny → follow the returned redirect URL.
- Pricing: Senior card gets a "Connect AI" bullet.

## Constraints
- Next 16 (`cacheComponents: true`): read `web/node_modules/next/dist/docs/` before writing route handlers/pages.
- `.well-known` metadata: serve RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`, `authorization_servers: ["<SUPABASE_URL>/auth/v1"]`.
- Never invent college data; tools return what the DB has and say "not published" otherwise.
- Match neighbouring code style (comment density, naming, Tailwind patterns).

## Known risks / follow-ups
- Supabase OAuth server is beta; whether RLS `auth.uid()` resolves for OAuth-issued tokens must be tested right after the owner enables it.
- The plan column is student-editable until payments exist, so the Senior gate is honor-system for now (same as list limits).
- An OAuth token is a normal `authenticated` JWT; anyone holding it could call Supabase REST directly and read portal columns. Tokens sit with OpenAI/Anthropic, so risk is low; the fix (follow-up) is moving portal data to a table whose RLS rejects tokens with a `client_id` claim.
- ChatGPT plan rules change often; re-check before launch.

## Owner setup (Supabase dashboard, once)
Documented step by step in `CONNECT_AI_SETUP.md`: enable OAuth Server + dynamic client registration, set authorization path `/oauth/consent`, switch to asymmetric JWT signing keys, add site URLs to redirect allow-list, then run the end-to-end check with Claude.
