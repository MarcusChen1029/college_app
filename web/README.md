# College Tracker — web

Next.js 16 (App Router, Cache Components) + Tailwind 4, reading from the `college-tracker` Supabase project.

```bash
cp .env.example .env.local   # Supabase URL + publishable key (read-only reference data)
npm install
npm run dev                  # http://localhost:3000
npm test                     # fit + GPA-estimate unit tests
npm run build
```

Pages:

- `/`: filterable college list (general or subject tier, state, test policy, application plan, international aid) with reach/target/safety labels from your scores
- `/colleges/[slug]`: full profile, including CDS stats, an estimated GPA distribution, deadlines, English requirements, application requirements, cost & aid, how majors are admitted, admission factors and numbered sources
- `/compare?c=mit,purdue`: compare up to 4 colleges side by side
- `/application/list`: your list (My colleges; `/my-list` redirects here) with plan, status, application checklist, notes and upcoming dates
- `/settings`: account, reminders and teacher links (`/account` redirects here). Sign-in is a dialog (`openSignIn()`). Signed out, the profile and list stay in localStorage. Signed in, they're stored in `student_profiles` / `student_colleges` (per-user RLS), and anything saved locally is merged in on first sign-in.

Auth setup in the Supabase dashboard (Authentication → URL Configuration): set the Site URL to the deployed domain and add `http://localhost:3000/**` and `https://<your-domain>/**` to the redirect URLs. The built-in email sender is rate-limited (a few emails per hour), so configure custom SMTP before real users sign up.

Data access is in `lib/data.ts`. Every query runs after `connection()`, so builds never contact Supabase. Results are cached with `"use cache"` for hours.
