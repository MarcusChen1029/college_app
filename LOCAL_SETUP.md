# College Tracker — Local Setup & Handoff

Everything you need to run, fix, and continue this project on your own machine.
Branch with all the work: `claude/inspiring-hypatia-817lp8` (merge it into `main` when ready).

---

## 1. Fix the Vercel error first ("A server error occurred. Reload to try again.")

**Cause (confirmed):** the deployed app has no Supabase environment variables. I reproduced the exact
same error locally by building without them; the server log says
`Error: Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Supabase's logs show no requests from Vercel at all, which matches.

**Fix:**
1. Vercel → your project → **Settings → Environment Variables**. Add both, for **Production and Preview**:

   | Name (exactly) | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://eyvmtaggayqizllaseiu.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_5B39sQnRwgy3LaFOZrDFZg_eeCoJaoS` |

   Watch the names: not `..._ANON_KEY`, and no trailing spaces.
2. **Settings → General → Root Directory** must be `web`.
3. **Deployments → ⋯ → Redeploy**. This is required: `NEXT_PUBLIC_*` values are baked in at build
   time, so adding them doesn't affect an already-built deployment.
4. Make sure Vercel builds the branch that has the code (`claude/inspiring-hypatia-817lp8`, or `main` after merging).

---

## 2. Run it locally

Requirements: **Node.js 20+** (developed on Node 22), npm, git. Python 3 only if you edit college data.

```bash
git clone https://github.com/MarcusChen1029/college_app.git
cd college_app
git checkout claude/inspiring-hypatia-817lp8

cd web
cp .env.example .env.local      # already contains the Supabase URL + publishable key
npm install
npm run dev                     # → http://localhost:3000
```

Other commands (run inside `web/`):

| Command | What it does |
|---|---|
| `npm test` | unit tests (fit labels, GPA estimate) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | type check |
| `npm run build && npm start` | production build + server (same as Vercel) |

Pages: `/` colleges list · `/colleges/mit` detail · `/compare?c=mit,purdue` · `/application/list` (My colleges) · `/settings` (sign in, reminders).

**Signing in locally:** "Continue with Google" returns to the page you were on (for example `http://localhost:3000/settings`), which only works
once the Google provider is set up and that URL is allowed in Supabase (see §4).

---

## 3. Project map

```
data/colleges/<slug>.json       CDS numbers per college (+ source URLs)
data/cycle_2026_27.json         deadlines, test policy, English reqs, costs, tiers (+ reasons), majors
scripts/build_seed.py           validates data → writes supabase/seed/10_colleges.sql
supabase/migrations/0001-0006   database schema (all applied to the live project)
supabase/patches/               one-off SQL already run (data gaps, tier review)
supabase/functions/deadline-reminders/   daily reminder email function (deployed)
web/                            Next.js 16 app (App Router, Tailwind 4)
  lib/data.ts                   server-side reads from Supabase (cached for hours)
  lib/student-store.ts          profile + my list (localStorage, or Supabase when signed in)
  lib/fit.ts                    reach / target / safety logic
PLAN.md                         full plan + status      DEPLOY.md   deploy details
```

Supabase project: **college-tracker** (ref `eyvmtaggayqizllaseiu`, region Tokyo).

---

## 4. Remaining setup (Supabase dashboard)

**a. Sign-in URLs:** Authentication → URL Configuration
- Site URL: your Vercel URL (e.g. `https://your-app.vercel.app`)
- Redirect URLs: `https://your-app.vercel.app/**` and `http://localhost:3000/**`

**b. Google sign-in:** Authentication → Sign In / Providers → Google. Steps for the Google OAuth
client (redirect URI `https://eyvmtaggayqizllaseiu.supabase.co/auth/v1/callback`) are in `DEPLOY.md` §3.

**c. Deadline reminder emails:** Edge Functions → Secrets → add:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | a Resend API key (free account at resend.com; verify your sending domain first) |
| `REMINDER_FROM` | `College Tracker <reminders@your-verified-domain>` |
| `APP_URL` | your Vercel URL |

The daily job (14:07 UTC) is already scheduled. Until these secrets exist it only does dry runs and sends nothing.
To test it, run this in the SQL Editor:

```sql
select net.http_post(
  url := 'https://eyvmtaggayqizllaseiu.supabase.co/functions/v1/deadline-reminders',
  headers := jsonb_build_object('content-type','application/json',
    'x-cron-secret', (select value from private.app_config where key = 'reminders_cron_secret')),
  body := '{"dryRun": true}'::jsonb);
select status_code, content from net._http_response order by id desc limit 1;
```

---

## 5. Updating college data

1. Edit `data/colleges/<slug>.json` or `data/cycle_2026_27.json` (keep a source URL for every number).
2. `python3 scripts/build_seed.py`: checks the data and regenerates `supabase/seed/10_colleges.sql`.
3. Don't run the full seed on the live project: deleting a college also deletes it from every student's list (the generated
   file now refuses to run once any student has a list). Load new colleges with
   `python3 scripts/build_seed.py --insert-only --only slug1,slug2 --out file.sql`, and change existing ones with a targeted
   UPDATE patch in `supabase/patches/`.

The site caches college data for a few hours; redeploy on Vercel to see changes immediately.

---

## 6. Status

Done:
- 10 colleges with sources and tiers (review v1 applied).
- Browse / detail / compare / my list pages.
- Email sign-in with a synced list and application checklist.
- Reminder email backend.

Data gaps:
- Berkeley's CDS score/GPA/factor sections (its Google Sheet couldn't be read).
- NYU doesn't publish waitlist or ED counts.

Next:
- Finish §1 and §4.
- Then Phase 3: bulk import of all US colleges from IPEDS / College Scorecard (see `PLAN.md`).

### Gotchas learned
- In the dashboard SQL Editor, UPDATE/DELETE work fine. Through AI connectors they may need manual approval.
- `NEXT_PUBLIC_*` env vars change only on a **new build**: always redeploy after editing them.
- This Next.js version (16) has breaking changes; read `web/node_modules/next/dist/docs/` before upgrading patterns.
