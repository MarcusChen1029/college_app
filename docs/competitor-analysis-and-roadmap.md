# Competitor analysis and feature roadmap

Written 2026-10-25. Read this before planning new features. Status of each roadmap item is tracked in the table at the bottom; update it when work lands.

## How this was made, and its limits
- Ten products were researched by subagents: Xello, SchooLinks, OverGrad, Unifrog, BridgeU, Cialfo, FolderWave, MaiaLearning, Naviance (PowerSchool), Parchment.
- Sources were vendor marketing pages, help centers and district guides, read through web fetch/search summaries (Firecrawl was out of credits). Treat every claim as vendor-reported.
- "Not found" means the page did not say, not that the feature does not exist. mymaia.com was not checked. OverGrad's help center is behind a login.
- Our own feature list comes from `CLAUDE.md` and the route list, not a code audit.
- Re-check a competitor's page before quoting it in anything public.

## Who they are (one-liners)
- **Xello** (xello.world): schools/districts only. Career + college planning for K-12, 3,500+ school profiles, course planner, scattergrams, Common App tasks inside Xello, AI advising assistant for staff. Xello Connect lets colleges reach students from grade 9.
- **SchooLinks** (schoolinks.com): districts. College/career/work-based learning, Common App sync with automatic document sending, admissions probability calculator, state compliance reporting (CCMR, ICAP). Staff AI "Sage" drafts recommendation letters.
- **OverGrad** (overgrad.com): schools, districts, community orgs; priced per enrolled student. Counselor "who needs help" list, bulk text/email, FAFSA and award-letter comparison, post-graduation tracking via National Student Clearinghouse, student AI career guide "Trek" (built on Claude), SIS sync (PowerSchool, Infinite Campus, Skyward, Synergy).
- **Unifrog** (unifrog.org): schools, strong in the UK and international schools. UCAS course choice and reference drafting, Common App essay tool, Gatsby benchmark careers plans, 20,000+ English-taught programs outside the US, scattergrams. No AI features found.
- **BridgeU** (bridge-u.com): international schools applying abroad. 26,000+ universities, Reach/Match/Safety matching, Common App and Parchment document sending, ManageBac sync, student AI "Bree". Claims no per-student fee (no price published). Owned by Manifest Global, as is Cialfo.
- **Cialfo** (cialfo.com): international schools. 15,000+ universities, cDocs sends to Common App and Parchment, Direct Apply to 1,200+ partner colleges, UCAS tracking, parent view, AI "Saige", marketplace for visa/test-prep/housing.
- **FolderWave** (folderwave.com): white-label "Pathway" portals for states/districts (for example MEFA Pathway). Profile + resume + portfolio, career games, scholarship tracker, cost and loan calculators, counselor portal. Mostly K-12 plus adult learners.
- **MaiaLearning** (maialearning.com): schools, districts, independent consultants; also sells to colleges (MaiaOffers). Conversational college search, MaiaChances admission odds, AI essay review, AI-drafted recommendations, bulk Common App/Parchment sending.
- **Naviance** (PowerSchool): the incumbent, about 8,500 schools. Scattergrams from each school's own outcomes, Common App one-and-done submission, EAB Match, individual plans, work-based learning, PowerBuddy AI.
- **Parchment** (parchment.com): not a planner. A transcript and credential exchange network (5,800+ K-12 districts, 6,100+ higher-ed institutions); SENDedu lets counselors send transcripts and letters to colleges free.

Nearly all of them are sold to schools or districts with no public price (demo or quote only). A family cannot just sign up.

## Comparison summary

### A. They have it, we did not
| Feature | Who |
|---|---|
| Common App sync, sending transcripts / recommendations / school forms | Xello, SchooLinks, Cialfo, BridgeU, OverGrad, Naviance, Maia, Unifrog, Parchment |
| Parent accounts | Xello, SchooLinks, OverGrad, Cialfo, Naviance, Unifrog, BridgeU (on request) |
| Career interest / personality assessments | Xello, SchooLinks, Naviance, BridgeU, Maia, FolderWave, OverGrad |
| Four-year course planner | Xello, Naviance, SchooLinks, Maia, FolderWave |
| Scattergrams | Naviance, Xello, SchooLinks, Unifrog |
| Admission-chance estimates | Maia, SchooLinks, OverGrad |
| Scholarship search; FAFSA, award-letter, cost tools | FolderWave, Xello, SchooLinks, Unifrog, OverGrad |
| Built-in AI for students | Maia, BridgeU, Cialfo, OverGrad, Naviance |
| AI essay review / AI-drafted recommendation letters | Maia, SchooLinks, Cialfo, Naviance |
| Counselor tasks, bulk email/SMS, caseload dashboard | OverGrad, Cialfo, SchooLinks, Naviance |
| SIS sync, district SSO, state compliance reports | Xello, SchooLinks, OverGrad, Naviance, Cialfo |
| Digital portfolio / credentials | Xello, Naviance, SchooLinks, Parchment |
| College-side tools (recruiting, direct apply) | Xello Connect, Maia, Cialfo |
| Much larger college databases | 15,000-27,000 institutions (Cialfo, BridgeU, Maia, Unifrog); Xello 3,500+; we have 100 |
| Full UCAS / non-US coverage | Unifrog, Cialfo, BridgeU (we have 3 UK colleges) |
| Translation (130+ languages) | Xello |
| Post-graduation tracking | OverGrad |

### B. We have it, none of them mentioned it
- A source URL on every fact.
- Subject tiers S-D with a written reason; general tier with +/++.
- Per-college English-test requirements (new TOEFL 1-6 scale, IELTS, Duolingo, PTE, Cambridge).
- International and ED admit rates, and fit labels that use the international rate for international students.
- Application portal tracking per college.
- How each college admits majors; international aid per college.
- Individual sign-up with no school contract; works signed out in localStorage.
- Student-controlled teacher access: link by code the student redeems; teachers never see portals, notes or aid offers; essay sharing is a toggle.
- Connect AI: the student's own AI reads and updates their tracker.
- One-click Google Doc per essay.
- Public pricing.

### C. They have it, we could build it (see roadmap)
Parent read-only view, teacher-assigned tasks, teacher email digest, recommender tracker, aid-offer comparison, scholarship tracker, in-app AI helper, class-level scattergrams, interest quiz, more colleges via IPEDS, translated UI, portfolio share link, course planner.

### D. They have it, we realistically cannot
- Common App / Parchment document sending and status sync (partner agreements and school FERPA waivers).
- SIS rostering, district SSO, state compliance reports, SOC 2 audits (enterprise contracts).
- Real scattergrams and trained admission-odds models (years of per-school outcomes, or 1M+ admission records).
- Two-sided college marketplaces (Direct Apply, MaiaOffers, Xello Connect).
- A transcript exchange network.
- Licensed content: Peterson's, Lightcast, Human eSources assessments, Roadtrip Nation videos.
- Enrollment tracking after graduation (National Student Clearinghouse).
- Human services and implementation teams.

Takeaway: we cannot win on integrations, licensed data or scale. We lead on sourced, international-aware, student-owned data, and most of what they have that we could add is cheap.

## Roadmap

Effort scale: S under 1 day, M 1-3 days, L about a week, XL several weeks. These are estimates based on the repo's usual shape (migration + RPC + page + tests), not measurements. Next migration number: 0026.

Facts found while sizing (2026-10-25):
- `student_colleges.aid_offer_usd` already exists ([0001_init.sql:271](../supabase/migrations/0001_init.sql)) and no file in `web/` uses it yet.
- The checklist has one "Recommendations" tick per college (`web/lib/checklist.ts`), no per-recommender tracking.
- There is no student-side scholarship tracking; only the per-college `merit_scholarships` flag exists.

| # | Item | Effort | Closes gap with | Notes | Status |
|---|---|---|---|---|---|
| **Phase 1: quick wins** | | | | | |
| 1 | Aid-offer comparison: input per college, shown beside published cost | S-M | OverGrad, SchooLinks, FolderWave | Column exists, likely no migration. Keep teacher exclusion from migration 0022. | todo |
| 2 | Recommender tracker: name, role, requested date, status per recommender | M | Naviance, SchooLinks, Xello (without the Common App sync) | New table + RLS, migration 0026. Student-only at first. | todo |
| 3 | Scholarship tracker: name, amount, deadline, link, status; deadlines feed reminder emails | M | FolderWave, Xello, SchooLinks | Migration 0027. Reuses `deadline-reminders`. | todo |
| 4 | "Copy my context for AI" button | S | In-app AI assistants | Reuses `web/lib/ai-context.ts` and Connect AI. | todo |
| **Phase 2: teacher and parent depth** | | | | | |
| 5 | Teacher assigns tasks to a class or student, with due dates and completion | M-L | OverGrad, Cialfo, SchooLinks | New tables + SECURITY DEFINER RPCs on `teacher_links` / `class_members`. Needs a privacy review like teacher notes. | todo |
| 6 | Teacher email digest | M | OverGrad, Cialfo | Builds on #5. Real sends blocked until Resend secrets are set (dry-run until then). | todo |
| 7 | Parent read-only view | L | 7 of 10 competitors | Tokenized link is simpler than a third role; migration 0025's role switch assumes student/teacher. Explicit column list; no portals, notes or aid. | todo |
| **Parallel track** | | | | | |
| 8 | Bulk US colleges from IPEDS / Scorecard (existing Phase 3 plan) | L for pipeline, then ongoing | Cialfo, BridgeU, Maia, Unifrog | Biggest visible gap (100 vs 15,000+). Mark baseline rows as baseline; use insert-only seeds so students' lists are not wiped. | todo |
| **Phase 3: backlog** | | | | | |
| 9 | In-app AI helper (essay feedback, list suggestions) | L | Maia, BridgeU, Cialfo, OverGrad, Naviance | Server-side API calls, rate limits, privacy stance for minors. Do #4 first. | todo |
| 10 | Shareable portfolio link from activities + resume | M | Xello, Naviance, SchooLinks | Private by default. | todo |
| 11 | Class-level scattergrams (anonymous aggregates) | L | Naviance, Xello, SchooLinks, Unifrog | Needs enough students; minimum group size to avoid identifying individuals. | todo |
| 12 | Translated UI (for example zh-TW) | L | Xello | Retrofits every page; only if students need it. | todo |
| 13 | Interest quiz based on O*NET | L | Xello, Naviance, SchooLinks, Maia | Check O*NET licensing first. Low value for a tracker. | todo |
| - | Four-year course planner | XL | Xello, Naviance | Skipped: school-specific, does not fit a student-owned tool. | skipped |

Suggested order: week 1 do #1-#4; weeks 2-3 do #5, #6, then #7; start #8 early in the background; treat #9-#13 as backlog until real usage shows what matters.

Reminders when implementing: every schema change is a new `supabase/migrations/` file and must be applied to the project; the "Supabase Preview" GitHub check fails for a known reason (see `CLAUDE.md`) and is not caused by these changes.
