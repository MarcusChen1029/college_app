# Deploying College Tracker

Supabase project: `college-tracker` (ref `eyvmtaggayqizllaseiu`, region ap-northeast-1).

## 1. Pending database changes (run once in Supabase → SQL Editor)

The Supabase connector can't run UPDATE/DELETE from cloud sessions, so these are applied by hand:

1. `supabase/patches/2026-10-20_tier_review.sql`: tier review v1 (replaces all `institution_tiers` rows and adds a rationale to each)
2. `supabase/migrations/0006_pg_net_schema.sql`: moves `pg_net` out of `public` (clears the security-advisor warning)

Both have already been applied. Don't re-run the tier review: it replaces every `institution_tiers` row, so it would wipe the tiers of
every college added after 2026-10-20.

## 2. Vercel (web app)

1. Vercel dashboard → **Add New → Project → Import** the GitHub repo `MarcusChen1029/college_app`.
2. **Root Directory:** `web`. The framework preset is detected as Next.js; keep the default build command.
3. **Environment variables** (Production + Preview), from `web/.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://eyvmtaggayqizllaseiu.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` key in `web/.env.example`
   - `NEXT_PUBLIC_EXTENSION_ID` = `omnpdpbgbbdbnnaimhppoclimbeeognl`: the Common App filler extension's id. `/extension/connect` only sends a sign-in token back to this extension; without it the page says "Extension sign-in isn't set up yet". Baked in at build time, so redeploy after setting it.
4. Deploy, then note the production URL (e.g. `https://college-tracker.vercel.app`). Pick the branch to deploy: merge `claude/inspiring-hypatia-817lp8` into `main` first, or set it as the production branch.

## 3. Supabase sign-in (Authentication settings)

- **Authentication → URL Configuration**
  - Site URL: your Vercel production URL
  - Redirect URLs: `https://<your-domain>/**` and `http://localhost:3000/**` only.
  - **Never add a `*.vercel.app` wildcard** (such as `https://*-<team>.vercel.app/**`). Anyone can create a Vercel project whose
    address matches it, send a student a sign-in link that returns to that address, and take over the student's account
    (including their saved logins). Test sign-in on the production domain or on a preview domain you own.
- **Authentication → Sign In / Providers → Google:** turn it on. It needs a Google OAuth client:
  1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials → OAuth client ID → type **Web application** (set up the OAuth consent screen first if asked: app name, support email, "External").
  2. Authorized JavaScript origins: your Vercel URL and `http://localhost:3000`.
  3. Authorized redirect URI: `https://eyvmtaggayqizllaseiu.supabase.co/auth/v1/callback`
  4. Paste the Client ID and Client secret into the Supabase Google provider and save.
  5. While the consent screen is in "Testing", only test users you add can sign in; publish it for everyone.
- Sign-in is Google only, so Supabase's auth email sender (SMTP settings) isn't needed for it. Reminder emails are sent separately (§4).

## 4. Deadline reminder emails

Already deployed: the Edge Function `deadline-reminders`, plus a daily `pg_cron` job at 14:07 UTC. Until the secrets below exist it only does a dry run (nothing is sent).

Set these in **Edge Functions → Secrets**:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key (can be the same one used for SMTP) |
| `REMINDER_FROM` | e.g. `College Tracker <reminders@yourdomain.com>` (domain verified in Resend) |
| `APP_URL` | your Vercel production URL (used for links in the email) |

Students control reminders in **Settings** (`/settings`, Reminders card) (on by default; reminders go out 14, 3 and 1 days before each deadline). Sent reminders are recorded in `reminder_log`, so nobody gets the same reminder twice.

To test without waiting for the cron job (SQL editor):

```sql
select net.http_post(
  url := 'https://eyvmtaggayqizllaseiu.supabase.co/functions/v1/deadline-reminders',
  headers := jsonb_build_object('content-type','application/json',
    'x-cron-secret', (select value from private.app_config where key = 'reminders_cron_secret')),
  body := '{"dryRun": true}'::jsonb);
-- then: select status_code, content from net._http_response order by id desc limit 1;
```

Remove `"dryRun": true` to send for real.

## Encryption keys: old saved portal passwords, and Google tokens (read before touching Vercel env vars)

Saved portal passwords are now locked in each student's browser with their own vault passphrase (migration 0045); no
server key can open them, and none is needed for new ones. `PORTAL_ENCRYPTION_KEY` (or, while that is unset,
`GOOGLE_TOKEN_ENCRYPTION_KEY`) is only needed until every old server-sealed row (`v1.` prefix in `portal_passwords.sealed`)
has been handed over: the first time a student with old rows unlocks their vault, the site opens those rows with this key
and re-locks them into the vault. The key's fingerprint is recorded in `portal_vault_meta`; a deployment with any other key
refuses the handover (503 `key_mismatch`) instead of touching data. So:
- **Never change or delete that key until no `v1.` row is left.** Check with
  `select left(sealed, 3), count(*) from portal_passwords group by 1;` (only `e1.` rows left = handover finished).
  Without the key, remaining old rows can't be opened again.
- When only `e1.` rows remain, a follow-up change removes the handover code and `PORTAL_ENCRYPTION_KEY` can be deleted from Vercel.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` stays: Google Docs refresh tokens still use it. To rotate it while old rows remain, first set
  `PORTAL_ENCRYPTION_KEY` (Production) to the *current* `GOOGLE_TOKEN_ENCRYPTION_KEY` value and redeploy; after that the two
  keys are independent.
- Keep a copy of the key in a password manager until then; Vercel is the only other place it exists.
