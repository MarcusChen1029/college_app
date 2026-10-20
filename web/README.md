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
- `/my-list`: your list with plan, status, notes and upcoming dates (stored in localStorage for now; moves to Supabase Auth plus `student_colleges` in phase 2)

Data access is in `lib/data.ts`. Every query runs after `connection()`, so builds never contact Supabase. Results are cached with `"use cache"` for hours.
