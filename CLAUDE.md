# CLAUDE.md — College Application Tracker

Context for Claude Code sessions in this repo. Read this first, then `PLAN.md` for the full plan.

## What this is
A college application tracker for students (many of them international). It stores US colleges with
general and subject **tiers (S/A/B/C/D)**, official **Common Data Set (CDS)** stats (SAT/ACT 25/50/75,
GPA average + band distribution, admit rates incl. ED/international), **ED/EA/REA/RD deadlines**,
**English test requirements** (TOEFL old 0–120 and new 1–6 scale, IELTS, Duolingo, PTE, Cambridge),
test policy, application requirements, cost & international aid, how majors are admitted, and a
**source URL for every fact**. Demo = 10 colleges: MIT, Stanford, Harvard, CMU, UC Berkeley, Michigan,
Georgia Tech, UIUC, NYU, Purdue. Plan: all US colleges next, then UK/CA/AU.

## Stack & services
- **Supabase** project `college-tracker`, ref `eyvmtaggayqizllaseiu` (ap-northeast-1). Org is on the free plan.
  - URL `https://eyvmtaggayqizllaseiu.supabase.co`, publishable key in `web/.env.example` (safe to expose).
  - Reference tables: public read-only via RLS. `student_profiles` / `student_colleges` / `reminder_log`: per-user RLS (tested).
  - View `college_summary` (security_invoker) feeds the list/compare pages.
  - Edge Function `deadline-reminders` + pg_cron job `deadline-reminders` (14:07 UTC daily). Auth via
    `x-cron-secret` header checked by `public.check_cron_secret()` against `private.app_config`.
    Sends via Resend; **dry-run until secrets `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL` are set.**
- **web/**: Next.js **16** (App Router, `cacheComponents: true`), React 19, Tailwind 4, supabase-js 2.118.
  **Next 16 has breaking changes. Read `web/node_modules/next/dist/docs/` before writing Next code** (see `web/AGENTS.md`).
  - Server data reads are in `web/lib/data.ts`: `await connection()` then a `"use cache"` + `cacheLife("hours")` function.
    Builds never touch Supabase; pages wrap data in `<Suspense>`.
  - Student state: `web/lib/student-store.ts` (`useSyncExternalStore`). localStorage when signed out, Supabase when
    signed in (Google OAuth via Supabase, PKCE, client-side only, no proxy/middleware). Local data is merged into the account on first sign-in.
  - Fit labels: `web/lib/fit.ts` (uses the international admit rate when the student is international). GPA percentile estimate: `web/lib/gpa.ts`.
- **Data pipeline:** `data/colleges/<slug>.json` (CDS) + `data/cycle_2026_27.json` (current cycle, tiers, tier_notes,
  `_tier_rules`) → `python3 scripts/build_seed.py` (validates) → `supabase/seed/10_colleges.sql` (idempotent: deletes + reinserts those colleges).

## Commands
```bash
cd web && npm install && npm run dev        # http://localhost:3000 (needs web/.env.local = copy of .env.example)
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build   # run all before committing
python3 scripts/build_seed.py               # after editing data/*.json
```

## Rules for this repo
- **Never invent data.** Every number needs an official source (CDS, admissions or financial-aid site), recorded in `sources`.
  If it can't be confirmed, leave it null and note why. Mark estimates as estimates (e.g. GPA percentiles).
- Edit `data/*.json`, not the generated SQL. Keep `scripts/build_seed.py --check` passing.
- Schema changes = a new file in `supabase/migrations/` (next number: **0010**) **and** apply it to the project.
- **Supabase MCP quirk:** INSERT/SELECT/DDL via `execute_sql`/`apply_migration` work. UPDATE/DELETE/DROP wait for the
  owner's approval and time out after 60 s if nobody approves. Approve the prompt when it appears, or put the SQL in
  `supabase/patches/` and have the owner run it in the dashboard SQL Editor.
- Tiers: S = top ~5 nationally in the field, A ≈ 6–15, B ≈ 16–40, C ≈ 41–100, D beyond. No tier if there's no undergrad
  program in that field. Always write a reason in `tier_notes`.
- Commit messages: conventional style (`feat:`, `fix:`, `data:`, `docs:`).

## Current status (2026-10-20)
Done: schema + RLS, 10 colleges seeded, tier review v1, data gaps patched, web app (list/detail/compare/my-list/account),
sign-in + synced list + checklist, reminder function + cron. All SQL patches have been run on the live DB.

**Open issue (Vercel):** the deployed site shows "A server error occurred". Cause confirmed: env vars are missing in Vercel.
Fix: add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production + Preview), set Root Directory `web`,
then **redeploy** (NEXT_PUBLIC_* are baked in at build time).

Owner still needs to set (Supabase dashboard): Auth Site URL + redirect URLs (`https://<vercel-domain>/**`,
`http://localhost:3000/**`), custom SMTP (Resend), and the reminder function secrets. Details in `LOCAL_SETUP.md` / `DEPLOY.md`.

## Next tasks (suggested order)
1. Help the owner verify the Vercel fix and Google sign-in end to end (Google provider must be enabled in Supabase first; see `DEPLOY.md` §3).
2. Add a friendly error/config page: when env vars are missing, show a clear message instead of the generic error
   (e.g. check in `app/layout.tsx` and add `app/error.tsx`).
3. Fill data gaps: Berkeley CDS C7/C9/C11. Its CDS is a multi-tab Google Sheet: download it as .xlsx manually and parse it.
4. Phase 3: bulk-import base rows for all US colleges from College Scorecard / IPEDS (name, location, size, admit rate,
   SAT ranges, cost), marked as such. CDS details can then be added school by school.
