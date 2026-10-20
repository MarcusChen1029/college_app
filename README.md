# College Application Tracker

Helps students research and track colleges. The demo has 10 US colleges. See [PLAN.md](PLAN.md).

| Path | What |
|---|---|
| `data/colleges/*.json` | Per-college extracts from the 2025-26 Common Data Set, with source URLs |
| `data/cycle_2026_27.json` | Current-cycle data: deadlines, test policy, English requirements, application requirements, cost/aid, tiers, how majors are admitted |
| `scripts/build_seed.py` | Validates the data and generates `supabase/seed/10_colleges.sql` (idempotent) |
| `supabase/migrations/` | Schema with RLS: public read-only reference data, per-user student tables |
| `web/` | Next.js app |

To update data: edit the JSON, run `python3 scripts/build_seed.py`, then apply `supabase/seed/*.sql` to the project.

**Start here:** [LOCAL_CLAUDE.md](LOCAL_CLAUDE.md) (continue with Claude Code locally) · [LOCAL_SETUP.md](LOCAL_SETUP.md) (run locally, fix Vercel, remaining setup). Deployment details: [DEPLOY.md](DEPLOY.md).
