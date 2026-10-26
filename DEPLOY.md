# Deploying College Tracker

Supabase project: `college-tracker` (ref `eyvmtaggayqizllaseiu`, region ap-northeast-1).

## 1. Pending database changes (run once in Supabase → SQL Editor)

The Supabase connector can't run UPDATE/DELETE from cloud sessions, so these are applied by hand:

1. `supabase/patches/2026-10-20_tier_review.sql`: tier review v1 (replaces all `institution_tiers` rows and adds a rationale to each)
2. `supabase/migrations/0006_pg_net_schema.sql`: moves `pg_net` out of `public` (clears the security-advisor warning)

Both are safe to re-run.

## 2. Vercel (web app)

1. Vercel dashboard → **Add New → Project → Import** the GitHub repo `MarcusChen1029/college_app`.
2. **Root Directory:** `web`. The framework preset is detected as Next.js; keep the default build command.
3. **Environment variables** (Production + Preview), from `web/.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://eyvmtaggayqizllaseiu.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` key in `web/.env.example`
4. Deploy, then note the production URL (e.g. `https://college-tracker.vercel.app`). Pick the branch to deploy: merge `claude/inspiring-hypatia-817lp8` into `main` first, or set it as the production branch.

## 3. Supabase sign-in (Authentication settings)

- **Authentication → URL Configuration**
  - Site URL: your Vercel production URL
  - Redirect URLs: `https://<your-domain>/**`, `https://*-<your-vercel-team>.vercel.app/**` (preview deploys), `http://localhost:3000/**`
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
