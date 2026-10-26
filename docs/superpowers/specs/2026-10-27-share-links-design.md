# Share links: parent read-only view + portfolio link (roadmap #7 and #10)

Date: 2026-10-27. Status: **built, migration 0032 written but NOT applied** to the Supabase project, and the smoke
test `supabase/patches/2026-10-27_share_links_smoke_test.sql` has not been run. The owner was asleep and asked
for decisions to be made without asking; every decision below is marked **Decision** so it can be revisited.

## What it is

One mechanism, two kinds of secret link a student can hand out:

| Kind | URL | Who it is for | Made from |
|---|---|---|---|
| `parent` | `/share/parent/<token>` | a parent or guardian, read-only progress | Settings > "Share with a parent" |
| `portfolio` | `/share/portfolio/<token>` | anyone (coach, program, employer) | Tools > Résumé > "Share as a portfolio link" |

**Decision:** a tokenized link, not a third account role. Migration 0025's role switch assumes student/teacher only,
and parents should not need an account.

## Data model (migration `0032_share_links.sql`)

`share_links(id, student_id -> auth.users, kind 'parent'|'portfolio', token_hash bytea unique, label, created_at,
revoked_at, last_viewed_at)`.

- Tokens: 32 random bytes from `extensions.gen_random_bytes`, base64url without padding (43 chars). Only
  `sha256(token)` is stored, as in 0031. The token exists in clear once: the return value of `create_share_link`.
- **At most one active link per kind per student**, enforced by a partial unique index
  `(student_id, kind) where revoked_at is null`. Creating a link revokes the previous active one of that kind first,
  so "New link" is also the answer to "I lost the link".
- RLS: owner-only select / insert / update policies. **Decision:** table privileges are narrower than the policies:
  `authenticated` gets `SELECT (id, kind, label, created_at, revoked_at, last_viewed_at)` only (never `token_hash`),
  and no insert/update privilege at all; all writes go through the RPCs (so a client can't choose a weak token or
  un-revoke a link). `anon` has no table access.
- No expiry. **Decision:** parents check in for months; the student turns the link off (or replaces it) instead.
  Links also stop working if the owner stops being a student (role switch) or deletes the account (cascade).

## RPCs (all `SECURITY DEFINER`, `set search_path = ''`)

| Function | Granted to | Behaviour |
|---|---|---|
| `create_share_link(p_kind, p_label default null)` -> text | authenticated | students only; revokes the old active link of that kind; returns the token |
| `revoke_share_link(p_id)` | authenticated | revokes one of the caller's own links; anything else is a no-op |
| `parent_view(p_token, p_today default null)` -> jsonb | anon, authenticated | NULL for an unknown / revoked / wrong-kind / malformed token; stamps `last_viewed_at` |
| `portfolio_view(p_token)` -> jsonb | anon, authenticated | same, for portfolio links |
| `share_link_student`, `share_jsonb_array` | nobody (internal) | token lookup; jsonb array guard |

Invalid tokens always return NULL with no error detail, so a caller cannot tell "never existed" from "revoked".
`p_today` is the viewer's local date clamped to +-2 days of the server's, as in 0023.

### Parent view: returned fields (explicit list)

- `student`: `name` (profile display name, else the résumé header's full name), `school` and `grad_year` (from the
  résumé header; **Decision:** the profile has no grad-year column, the résumé header is the only place it lives).
- `updated_at`: latest change to the profile or list.
- `colleges[]`: `name` (institution or custom name only), `custom`, `status` (covers decisions/results), `plan`
  (ED/EA/RD...), `checklist` rebuilt key by key (`recommendations`, `transcript`, `test_scores`, `english_test`,
  `no_essays`, `test_plan`, `english_plan`, and `essay_list` reduced to `{status}` per essay), `deadlines[]`
  (`due_date`, `kind`, `label`, `plan`, from `upcoming_deadlines_for`, next 400 days).
- `recommenders`: `{total, submitted}` and `scholarships`: `{total, submitted, awarded}`, counts only.
  **Decision:** 0026/0027 are written but not applied to prod, so these are computed with dynamic SQL behind
  `to_regclass(...)` checks: 0032 applies cleanly with or without them and the counts are `null` until they exist.

Never returned: email, `portals`, `portal_url` / `portal_username` / `portal_password`, `notes`, `aid_offer_usd`,
essays (titles, links, text), `resume` (beyond school/grad year/name), transcript tables, test scores, custom
college details other than the name, any user id.

### Portfolio view: returned fields (explicit list)

- `header`: `fullName` (résumé header, else display name), `school`, `gradYear`.
- `options`: `source`, `showHours`, `showScores` (same defaults as `DEFAULT_OPTIONS` in `web/lib/resume.ts`).
- `activities`: only the lists the résumé's `source` uses. Common App activities: `type, position, organization,
  description, grades, timing, hoursPerWeek, weeksPerYear`; honors: `title, grades, levels`; UC entries:
  `category, name, organization, description, grades, awardLevel, fromCommonApp (boolean), hoursPerWeek,
  weeksPerYear`. Hours are null when the résumé hides hours.
- `scores`: only when the résumé shows scores: `gpa, sat, act, satSections, english`.

**Decision (contact info):** email, phone and location are **never** returned, even though the résumé header holds
them. The résumé has no "show contact" switch, a portfolio link can be forwarded anywhere, and most users are minors.
A student who wants to be contacted can put it in the message they send with the link.

**Decision (what the portfolio shows):** exactly what the student's own résumé shows (same source / hours / scores
switches), rendered through the same `buildResume`, so "what you see on the résumé page is what they see".

## Web

- `web/lib/share-links.ts` (pure, tested in `share-links.test.ts`): token shape check, `shareUrl`, `lastViewedText`,
  `normalizeParentView` / `normalizePortfolioView` (re-pick the documented fields on the client too, so a future
  server change can't leak an extra field onto the page), `parentSummary`, `parentDeadlines`, parent status labels.
- `web/lib/share-api.ts`: typed RPC wrappers; the view fetchers return null on any error.
- `web/components/ShareLinkPanel.tsx`: create / copy / "New link" / "Turn off", shows "Link on since ... · Last
  opened ...". The URL is shown once right after creating and never stored.
  - Settings (students only): parent link, anchor `/settings#share`.
  - **Decision:** the portfolio control lives on Tools > Résumé (`/tools/resume`), not Writing > Activities, because
    the portfolio is the résumé; it renders only for a signed-in student.
- Pages `web/app/share/parent/[token]` and `web/app/share/portfolio/[token]`, under `web/app/share/layout.tsx`:
  outside the `(app)` group, `robots: noindex, nofollow, nocache`, `referrer: no-referrer` (the token must not leak
  through a Referer), print-friendly (Print button; header/footer are already `print:hidden`). The server checks the
  token's shape and answers a malformed one with "This link is no longer active" without any request; a well-formed
  token is looked up in the browser with the publishable key (no service role). Unknown, revoked and network errors
  all show the same inactive state.
- **Decision:** the site header (logo + nav) still shows on share pages: the root layout owns it and splitting the
  root layout into route groups is a bigger change than this feature. `RoleGate` now ignores `/share/*`, so a
  signed-in visitor without a role (or a teacher) is not redirected away from a link.

## Known limits / follow-ups

- **Role switch suspends, not revokes.** The views check `is_role(owner, 'student')` on every request, so switching
  to teacher makes all of a student's links return "no longer active", and switching back to student makes the same
  (unrevoked) links work again. This is intentional: the role switch keeps the other side's data. A student who wants
  a link dead for good should turn it off before switching.

- The token is in the URL path, so it appears in hosting access logs (Vercel). Acceptable for a revocable, read-only
  link; same exposure as any "anyone with the link" share.
- No rate limiting on `parent_view` / `portfolio_view`; 256-bit tokens make guessing infeasible.
- Custom colleges' own deadlines are not shown (the shared `upcoming_deadlines_for` only covers catalogue colleges).
- Not verified against a real database: apply 0032 on a branch or after review, then run the smoke test.
