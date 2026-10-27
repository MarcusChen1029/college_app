# Research brief: supplemental essays + international financial documents (2026-27)

Shared by every research agent in the 2026-10-27 wave. One JSON file per college:
`data/supplements_2026_27/<slug>.json` (slug = the file name in `data/colleges/`).
`scripts/build_supplements.py` validates these files and generates the app data.

## What to find, per college

1. **Supplemental essays / short answers for the 2026-27 application cycle (fall 2027 entry)**: every
   college-specific written question a first-year applicant answers on top of the Common App personal
   statement (or the college's own application). Exact prompt text, word or character limit, required
   or optional, who must answer (all applicants, one school/college, honors, a specific major), and
   "choose N of these" groups.
2. **International financial documents**: what an international first-year applicant must submit to prove
   funding for the I-20 (Certification of Finances form, bank statement, sponsor letter, CSS Profile is
   NOT this), when (with the application, after admission, before the I-20), and any published date.

## Sources (never invent)

- Official only: the college's own admissions / international admissions / financial aid pages, or its
  official application (Common App / Coalition / own portal) page if public. Third-party sites
  (CollegeVine, Shemmassian, Reddit, College Essay Guy, blogs) may be used to *find* the official page,
  never as the source.
- Prompts must be the 2026-27 cycle. If the college only shows last cycle's prompts, set `"cycle": "2025-26"`
  and say so in `notes`; the app will label them as last year's. If you can't find any official
  statement, use `"supplements": "unknown"`. Don't guess "none": `"none"` needs a source that says the
  college has no supplemental questions (for example, a requirements page that lists only the personal statement).
- Copy prompt text exactly (no paraphrase, no added quotes). Keep a long multi-paragraph prompt whole.
- If search tools are unavailable or out of credits, fetch pages directly (curl / WebFetch). Don't render
  PDFs as images. Read them as text.

## File format

```json
{
  "slug": "purdue",
  "cycle": "2026-27",
  "supplements": "required",
  "shared_set": null,
  "prompts": [
    {
      "key": "why-major",
      "prompt": "Exact prompt text as published.",
      "word_limit": 250,
      "char_limit": null,
      "required": true,
      "applies_to": null,
      "choose": null,
      "category": "why_major",
      "source": 1
    }
  ],
  "intl_finance": {
    "document": "Certification of Finances form + bank statement",
    "when": "after_admission",
    "deadlines": [{ "label": "Financial documents for the I-20", "date": "2027-05-01", "note": null }],
    "notes": null,
    "source": 2
  },
  "sources": [
    { "n": 1, "url": "https://...", "title": "Purdue Admissions: Essay Prompts", "accessed": "2026-10-27" }
  ],
  "notes": "What could not be confirmed and why."
}
```

Field rules:
- `supplements`: `"required"` (at least one required prompt for everyone or for a group the student may
  belong to), `"optional_only"` (only optional prompts), `"none"` (sourced: no supplements), `"unknown"`.
- `shared_set`: `"uc-piq"` for the University of California campuses (same 8 Personal Insight Questions,
  answer 4 of them, 350 words each; put the 8 prompts in the file of every UC campus), otherwise `null`.
- `prompts[].key`: kebab-case, unique within the file, stable (e.g. `why-us`, `why-major`, `community`, `short-1`).
- `word_limit` / `char_limit`: integers, or null if not stated. Never convert one into the other.
- `required`: false for optional prompts. A prompt only for some applicants is still `required: true`,
  with `applies_to` saying who (e.g. "Honors College applicants", "College of Engineering applicants").
- `choose`: `{ "group": "A", "pick": 1 }` when the applicant picks N prompts from a set (every prompt in
  the set has the same group letter), else null.
- `category` (used to tell a student "one draft can cover several colleges"), exactly one of:
  `why_us` (why this college), `why_major` (why this major/program), `community` (a community you belong to /
  will contribute to), `activity` (expand on an activity or work), `challenge` (obstacle, failure, growth),
  `identity` (background, perspective, diversity), `intellectual` (an idea, curiosity, learning),
  `short_answer` (short lists / favourites / 50-word answers), `other`.
- `intl_finance`: null if the college publishes nothing for international first-years. `when`:
  `"with_application"`, `"after_admission"`, `"before_i20"` or `"unknown"`. `deadlines[].date` is
  `YYYY-MM-DD` or null with a `note` (e.g. "within 2 weeks of the deposit"). Never compute a date.
- `sources[].accessed`: the date you read the page (YYYY-MM-DD). Every prompt and `intl_finance` names a source `n`.
- `notes`: plain sentences on gaps; empty string if none.
