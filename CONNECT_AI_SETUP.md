# Connect AI: owner setup

Connect AI lets a Senior-plan student link ChatGPT or Claude to their tracker account (an MCP server at `https://<site>/mcp`).
Sign-in uses Supabase's OAuth 2.1 server, which is in beta and is off by default. The code is already in the repo; this page is the
one-time dashboard setup and the first end-to-end test. Design: `docs/superpowers/specs/2026-10-22-connect-ai-mcp-design.md`.

Status of what has been checked (2026-10-22): the code builds, the unit tests pass, `/mcp` answers 401 with a `WWW-Authenticate`
header, and both `/.well-known/oauth-protected-resource` URLs return the right JSON. **Not yet tested:** the whole OAuth round trip,
and whether row-level security recognises OAuth-issued tokens. That is what steps 1 to 4 below are for.

## 1. Switch Supabase on (dashboard, project `college-tracker`)

1. Open https://supabase.com/dashboard/project/eyvmtaggayqizllaseiu.
2. **Authentication, JWT Signing Keys** (left menu under Authentication, in "Configuration" on some dashboards).
   - If it shows a legacy HS256 secret as the current key, click **Create a new key** / **Migrate JWT secret**, choose an
     **asymmetric** algorithm (ECC P-256 / ES256 is fine), then make it the **Current key**. The old key can stay as "previously used".
   - The server checks tokens with `getClaims()`, which only verifies locally with asymmetric keys. With a symmetric secret it still
     works, but makes a network call on every request.
3. **Authentication, OAuth Server** (may be listed under "Authentication, OAuth Apps / OAuth Server" while in beta).
   - Turn on **Enable the Supabase OAuth Server**.
   - **Authorization Path**: `/oauth/consent` (this is the page `web/app/(app)/oauth/consent`).
   - Turn on **Allow Dynamic OAuth Apps** (dynamic client registration). Claude and ChatGPT register themselves, so without this
     they can't connect.
   - Save.
   - Supabase builds the authorization URL on the **Site URL** (step 4), so the consent page always opens on the Site URL host
     (production), whichever site you started from. Test the full flow against the deployed site, not localhost.
4. **Authentication, URL Configuration**:
   - **Site URL**: your production URL, e.g. `https://<your-vercel-domain>`.
   - **Redirect URLs**: add `https://<your-vercel-domain>/**` and `http://localhost:3000/**`. Signing in from the consent page returns to
     `/oauth/consent?authorization_id=...`, which must match one of these.
5. If you don't see the OAuth Server section at all, your project or dashboard doesn't have the beta yet; check Supabase's
   "OAuth 2.1 Server" docs page for the current wording, or ask Supabase support.

## 2. Make sure the site has its settings

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be set in Vercel (already required for the site). Nothing
new is needed: there is no service-role key anywhere. Redeploy after merging.

## 3. Try it with Claude

1. Sign in on the site with Google and, on the **Pricing** page, choose **Senior** (until payments exist, the plan is just a setting).
2. Open **Connect AI** in the top menu. Copy the connector address (it ends in `/mcp`).
3. In Claude: **Settings, Connectors, Add custom connector**. Name `College Tracker`, paste the address, **Add**, then **Connect**.
4. Claude opens your site at `/oauth/consent`. You should see "Connect Claude to College Tracker?" with the can / can't lists. Click **Approve**.
   You are sent back to Claude.
5. In a new chat, ask: **"What's on my college list?"** Then try: **"Add Rice as Early Decision"**, and **"What's due in the next 30 days?"**
6. Check the website: **My application, My list** should show the change. On **Connect AI**, "Connected AIs" lists Claude with a
   **Disconnect** button. After disconnecting, Claude's next call should fail and prompt it to sign in again. This is expected
   but unverified: every `/mcp` call asks Supabase (`getUser`) whether the token's session still exists, and Disconnect deletes that
   session. If Claude can still read your data after disconnecting, report that back.

For ChatGPT the steps are on the Connect AI page. ChatGPT limits custom connectors that can make changes to some plans and changes
its rules often, so re-check OpenAI's help pages first.

## 4. If tools return empty data or errors (RLS check)

The tools read your rows with a client that carries the OAuth access token, relying on the existing policies (`own profile`, `own list`),
which use `auth.uid()`. Whether `auth.uid()` resolves for tokens issued by the OAuth server is **not verified**.

Symptoms: Claude connects fine but `get_profile` says the plan isn't Senior (even though it is), or `get_applications` shows an empty
list while the website shows colleges.

Check it from the SQL editor (replace the user id with yours; this simulates a token's claims):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<your-user-id>","role":"authenticated","client_id":"test"}', true);
select auth.uid(), (select count(*) from public.ai_student_colleges);
rollback;
```

- Count matches your list: policies work for these claims, so look at the token itself (is the connector really sending `Authorization: Bearer`?).
- `auth.uid()` is null or the count is 0: report back with the output. Don't loosen the policies; the fix is on the code side
  (for example, a small read-through function).

Also report back: the exact error text Claude shows, and the Vercel function log line for the `/mcp` request (Vercel, Logs).

## 5. Known limits (also in the design doc)

- Not verified end to end: sign-in through Supabase's OAuth server, token claims (`client_id`, `sub`), RLS with OAuth tokens,
  and that Disconnect cuts access immediately.
- Saves from the AI use optimistic concurrency on `updated_at` (retry up to 3 times, then "Your data changed while saving; try again.").
  The website's own saves are still last-write-wins; an open tab reloads from the account when you return to it (at most every 30 s).
- The Senior check reads `plan` (through `ai_student_profiles`), which students can edit until payments exist. Same honor system as the list limits.
- An OAuth token is a normal signed-in token for the Supabase API, but the database treats it as an AI connection (it has a `client_id`
  claim): it reaches only the views `ai_student_profiles` / `ai_student_colleges` and the transcript tables, never an RPC, and, once
  migration 0043 is applied, never the base profile/list tables. So even a token used outside the tools can't read saved-login
  usernames, links or passwords (passwords are locked with the student's vault passphrase and kept in a table no user token can read).
  The MCP tools themselves never select, return or write them.
- The token is not bound to this site as its audience yet (follow-up: a custom access-token hook).
