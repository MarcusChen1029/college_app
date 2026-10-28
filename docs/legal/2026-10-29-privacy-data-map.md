# Privacy Policy data map (2026-10-29)

Every data item on `/privacy` and where it lives, so the owner (or a lawyer) can check the page against the code.
Checked against origin/main `9271eec`; migrations are `supabase/migrations/00NN_*.sql`. Text lives in
`web/lib/i18n/messages/privacy.ts` (same comments above each key), `security.ts` and `legal.ts`.

**Status: DRAFT, not legal advice.** Review before relying on it.

## What we collect (`privacy.collect.*`)

| Page item | Data | Where | Who else can read it |
|---|---|---|---|
| account | email, Google account id; Supabase keeps Google profile (name, picture) and sign-in records (IP, browser) | `auth.users`, `auth.identities`, `auth.sessions` (Supabase Auth default, not our code); our code reads id + email only (`web/lib/student-store.ts`) | Supabase |
| role | student / teacher; teacher name, school, digest setting | `user_roles` (0020), `teacher_profiles` (0020, 0029) | a student sees a teacher's name/school when linking (`preview_code`, `my_teachers`, 0021) |
| profile | GPA (unweighted, weighted), SAT, ACT, section scores and dates, English tests, international, target regions, fields of study, interested colleges, plan, reminder settings | `student_profiles`: `gpa_unweighted`, `gpa_weighted` (0037), `sat_total`, `act_composite`, `test_details` (0010), `is_international`, `target_regions` (0014), `study_fields` (0036), `interested` (0010), `plan` (0009), `reminder_emails`, `reminder_days` (0005) | linked teachers (`teacher_roster`, `teacher_student`, 0023); portfolio link (scores, 0038); AI tools; class charts anonymised (0033) |
| list | colleges incl. custom ones, plan, status/decisions, checklist, essay titles/links/status, private notes, aid offers | `student_colleges`: `institution_id`, `custom` (0017), `plan_key`, `status`, `checklist` (incl. `essay_list`), `notes`, `aid_offer_usd` (0001) | teachers (no notes/aid; essay titles+links only while `share_essays`); parent link (no notes/aid/essay titles); AI tools (incl. notes, not aid) |
| logins | url, username, password (plain text) + done marks | `student_colleges.portal_url/_username/_password` (0007), `student_profiles.portals` (0013) | owner only through RLS; excluded from teacher RPCs, share views, extension RPCs, emails, Copy for AI, AI tools. Any token of the user (incl. an AI connection token) can read them via RLS |
| transcript | schools, courses, grades, notes | `transcript_schools` (0030, `school_code` 0034), `transcript_courses` (0030) | Chrome extension (`extension_transcript`); AI tools (read/write/delete) |
| writing | activities and honors; essay status + Google Doc link (no essay text); résumé header (name, email, phone, location, school, grad year) | `student_profiles.activities` (0011, v2 0038), `.essays` (0018), `.resume` (0012) | teachers get raw activities and (if sharing) essays; portfolio link (curated activities, never email/phone/location); extension (activities scope, 0039); AI tools (incl. résumé email/phone/location) |
| people | recommenders; scholarships | `recommenders` (0026), `scholarships` (0027) | parent link shows counts only; scholarship name/provider appear in the student's own reminder emails |
| teacher | links, classes, tasks, completions, teacher notes, failed code attempts | `teacher_links`, `classes`, `join_codes`, `class_members`, `code_attempts` (0021), `teacher_notes` (0024), `teacher_tasks`, `task_completions` (0028) | the linked teacher; notes only their author |
| share | token hash, label, created / revoked / last viewed | `share_links` (0032) | anyone with the link sees `parent_view` / `portfolio_view` fields |
| email | sent-reminder records | `reminder_log` (0005), `scholarship_reminder_log` (0027), `teacher_digest_log` (0029) | Resend receives address + content (`supabase/functions/deadline-reminders/index.ts`) |
| extension | token hash, label, scopes, created / last used / expires / revoked | `extension_tokens` (0031, 0039); raw token in `chrome.storage.local` (`extension/src/auth.ts`) | - |
| google | encrypted refresh token; essay title sent to Drive | `google_tokens.refresh_token_encrypted` (0016), `web/lib/google-docs.ts`, `web/lib/google-server.ts` | service_role only |
| ai | AI app grants | Supabase Auth OAuth server (auth schema, not our migrations) | the AI company receives tool results |

## Browser storage (`privacy.storage.p2`)

| Item | Key | File |
|---|---|---|
| signed-out data (incl. logins, plain) | localStorage `college-tracker:v1` | `web/lib/student-store.ts` |
| sign-in session | localStorage `sb-eyvmtaggayqizllaseiu-auth-token` | supabase-js default (`web/lib/supabase-browser.ts`) |
| interest quiz answers (never sent) | localStorage `interest-quiz-v1` | `web/lib/interest-quiz.ts` |
| language | cookie `lang` (1 year) | `web/lib/i18n/core.ts` |
| Google Docs connect | cookie `gdocs_oauth` (10 min, httpOnly) | `web/app/api/google/start/route.ts` |

No analytics, ads or tracking code (searched for gtag, posthog, sentry, plausible, @vercel/analytics and others).

## Facts the pages rely on

- Supabase project in ap-northeast-1 (Tokyo). No Vercel region is set in the repo.
- `reminder_emails` defaults to `true` (live default checked 2026-10-29).
- `teacher_links.share_essays` defaults to `true`.
- `private.activities_backup_0038` exists live (saved 2026-10-28) and has **no foreign key**, so deleting an account does not delete its row there.
- No self-service account deletion or data export exists.
- Share links have no expiry; extension tokens expire after 90 days.

## Owner to-do before relying on these pages

1. Fill `OPERATOR_NAME` and `CONTACT_EMAIL` in `web/lib/legal.ts`. Until then the pages say the name and address are coming. Google's OAuth verification needs a reachable contact.
2. Account deletion is "contact us". When you delete an account by hand, also delete its row in `private.activities_backup_0038` (the page promises this), and revoke its Google token at Google if you can.
3. Answer privacy requests within 15 days (see / copy) and 30 days (correct / stop / delete): the page states Taiwan PDPA Art. 13 timelines.
4. The `/security` wording matches main. If `fix/security-hardening` ships (encrypted portal passwords, AI-token containment, share-link expiry, essay sharing off by default, extension sign-out revoking, Delete account), update `security.ts`, `privacy.ts` and `LEGAL_UPDATED`.
5. Mismatches in existing UI text found during the audit (not changed here): the "join a teacher" text (`settings.counselors.whatTheySee`) doesn't mention that teachers see your email and last-active time; the Connect AI consent list (`web/lib/connect-ai.ts`) doesn't mention the transcript, which AI tools can read, edit and delete, and its "can't see your portal passwords" line holds only for the tools, not for the token itself.
6. Changed in this branch to make a page statement true: the Connect AI page now shows the "Connected" list with Disconnect on every plan (before, only on Senior, so a student who left Senior could not disconnect an app).
7. The live database has a `student_profiles.app_essays` column with no repo migration and no code using it (empty as of 2026-10-29). If anything starts writing essay text there, update "we don't store the essay text".
