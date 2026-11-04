#!/usr/bin/env python3
"""Build supabase/seed/10_colleges.sql from data/colleges/*.json + data/cycle_*.json.

Deterministic UUIDs (uuid5) make the seed idempotent: it deletes the listed
institutions (cascading to all child rows) and re-inserts them.

Current-cycle data comes from data/cycle_2026_27.json plus one file per college in
data/cycle_2026_27/<slug>.json (the entry object itself; a per-college file wins).

Usage: python3 scripts/build_seed.py [--check] [--only slug,slug] [--insert-only] [--out PATH]
  --check        only validate the data, do not write SQL
  --only         limit the output to these slugs
  --insert-only  omit the leading delete (for colleges not yet in the database)
                 Without it the SQL starts with a guard that refuses to run once student_colleges has rows,
                 because the delete cascades to students' saved lists.
  --out          write here instead of supabase/seed/10_colleges.sql

Deadline rows of colleges already in the database (no re-seed; their ids are positional, uid("dl", slug, str(i))):
  --dump-deadlines --only <slugs> --out <json>
                 the deadline rows (and the sources they use) as the builder computed them BEFORE intake and course
                 rows existed: no course rows, intake always null, the new deadline rules not applied. Taken from the
                 files on the commit that is live, it is the baseline for --deadlines-only.
  --deadlines-only --baseline <json> --only <slugs> --out <sql>
                 begin; inserts (on conflict (id) do nothing) of sources and deadline rows whose id is not in the
                 baseline (appended rows, course rows); one update per baseline row changed in place; commit;
                 Refuses (writes nothing) when a baseline row is missing or moved, or a baseline source's URL changed.
"""
import json, sys, uuid, glob, os, datetime, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = uuid.UUID("6f1c0e5e-3b7a-4d7e-9a51-0c0e11e9e000")
CYCLE = "2026-27"
ACCESSED = "2026-10-20"
SCORE_TESTS = {"sat", "act", "toefl", "ielts", "duolingo", "pte"}
FACTOR_MAP = {"VI": "very_important", "I": "important", "C": "considered", "NC": "not_considered"}

def uid(*parts):
    return str(uuid.uuid5(NS, "/".join(parts)))

def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)) and not isinstance(v, str):
        return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

def arr(xs):
    return "array[" + ",".join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"

def insert(table, row):
    return (table, row)

def render(stmts):
    """Group consecutive (table, row) pairs into multi-row inserts; pass strings through."""
    out, i = [], 0
    while i < len(stmts):
        s = stmts[i]
        if isinstance(s, str):
            out.append(s); i += 1; continue
        table, rows = s[0], []
        while i < len(stmts) and not isinstance(stmts[i], str) and stmts[i][0] == table:
            rows.append(stmts[i][1]); i += 1
        cols = [k for k in rows[0] if any(r.get(k) is not None for r in rows)]
        lit = lambda r, k: str(r[k]) if isinstance(r.get(k), RawSQL) else q(r.get(k))
        # Hoist columns that are identical in every row out of the VALUES list to keep the payload small.
        const = [k for k in cols if len(rows) > 1 and len({lit(r, k) for r in rows}) == 1]
        if const and not any(k.endswith("_date") or k in ("accessed_on", "retrieved_on", "application_deadline") for k in cols):
            var = [k for k in cols if k not in const]
            head = ", ".join(lit(rows[0], k) + ("::uuid" if k.endswith("_id") or k == "id" else "") for k in const)
            uuidish = lambda k: k.endswith("_id") or k == "id"
            vals = ",\n ".join("(" + ", ".join(lit(r, k) + ("::uuid" if uuidish(k) and r.get(k) is not None else "")
                                              for k in var) + ")" for r in rows)
            out.append(f"insert into {table} ({', '.join(const + var)})\nselect {head}, v.* from (values\n {vals}) v;")
        else:
            vals = ",\n ".join("(" + ", ".join(lit(r, k) for k in cols) + ")" for r in rows)
            out.append(f"insert into {table} ({', '.join(cols)}) values\n {vals};")
    return out

class RawSQL(str):
    pass

# Allowed values, mirroring the check constraints / lookup tables in supabase/migrations + seed/00_lookups.sql
ENUMS = {
    "country": {"US", "GB", "CA", "AU"},  # rows in public.countries the app has a region for (web/lib/regions.ts)
    "setting": {"urban", "suburban", "rural"},
    "control": {"public", "private_nonprofit", "private_forprofit"},
    "academic_calendar": {"semester", "quarter", "trimester", "4-1-4", "other"},
    "source_kind": {"cds", "admissions_site", "financial_aid_site", "ipeds", "scorecard", "other"},
    "factor": {"rigor", "class_rank", "gpa", "test_scores", "essay", "recommendations", "interview",
               "extracurriculars", "talent_ability", "character", "first_generation", "alumni_relation",
               "geographic_residence", "state_residency", "religious_affiliation", "racial_ethnic_status",
               "volunteer_work", "work_experience", "demonstrated_interest"},
    "test": {"SAT_TOTAL", "SAT_ERW", "SAT_MATH", "ACT_COMPOSITE", "ACT_ENGLISH", "ACT_MATH"},
    "test_policy": {"required", "recommended", "optional", "flexible", "blind"},
    "interview": {"not_offered", "optional_informational", "optional_evaluative", "required", "by_invitation"},
    "deadline_kind": {"application", "priority", "scholarship", "financial_aid", "interview_signup", "deposit", "other"},
    "plan": {"ED", "ED2", "EA", "REA", "RD", "ROLLING"},
    "english_test": {"TOEFL_IBT", "TOEFL_IBT_2026", "IELTS", "DUOLINGO", "PTE", "CAMBRIDGE"},
    "english_status": {"required_option", "recommended_option", "accepted", "not_accepted"},
    "english_policy": {"required_nonnative", "recommended", "not_required", "required_all_international"},
    "aid_policy": {"need_blind_full_need", "need_aware_full_need", "need_aware_limited", "merit_only", "none"},
    "category": {"general", "computer_science", "engineering", "business", "biology_life_sci", "pre_med",
                 "economics", "math_physics", "humanities", "arts_design", "nursing"},
    "admit_model": {"direct_major", "school_college", "undeclared_open", "pre_major_competitive"},
    "internal_transfer": {"open", "moderate", "hard", "very_hard", "not_possible"},
    "intake": {"s1", "s2"},  # deadlines.intake: Australian Semester 1 / Semester 2 (migration 00NN_uk_ca_au_steps)
}

# Deadline columns, in table order (0001_init.sql + program_id / intake from 00NN_uk_ca_au_steps.sql).
DEADLINE_COLS = ["id", "institution_id", "cycle", "kind", "plan_key", "label", "due_date", "notification_date",
                 "notification_note", "notes", "source_id", "program_id", "intake"]
SOURCE_COLS = ["id", "institution_id", "kind", "title", "url", "cds_year", "accessed_on"]
# B3: a written clock time ("18:00", "11:59 p.m.") in a UK / Canadian / Australian row also needs the Taiwan time.
CLOCK_TIME = re.compile(r"\b\d{1,2}:\d{2}\b")
TIME_CHECKED = {"GB", "CA", "AU"}
# Course-level application_deadline values in Australia are Semester 1 2027 dates; Semester 2 goes in the cycle file.
AU_S1_WINDOW = ("2026-08-01", "2027-02-28")

def enum(slug, kind, v, nullable=True):
    if v is None and nullable:
        return
    check(v in ENUMS[kind], f"{slug}: {kind} {v!r} not allowed")

errors = []
def check(cond, msg):
    if not cond:
        errors.append(msg)

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None

PROGRAM_COLS = ["name", "award", "ucas_code", "apply_via", "duration_years", "a_level_offer", "ib_offer", "ib_points",
                "ap_offer", "atar", "required_subjects", "admissions_test", "interviewed_pct", "success_pct", "intake",
                "intl_fee_gbp", "intl_fee_cad", "intl_fee_aud",
                "application_deadline", "ielts_overall", "ielts_component", "toefl_note", "english_note", "notes",
                "source_url", "retrieved_on"]
# (min, max) sanity bounds for numeric program fields; mirrors the check constraints in 0015_programs.sql + 0035
PROGRAM_RANGES = {"duration_years": (1, 8), "ib_points": (0, 45), "interviewed_pct": (0, 100), "success_pct": (0, 100),
                  "intake": (1, 100000), "intl_fee_gbp": (1000, 200000), "intl_fee_cad": (1000, 200000),
                  "intl_fee_aud": (1000, 200000), "atar": (30, 99.95), "ielts_overall": (0, 9), "ielts_component": (0, 9)}
# the one fee column (and country-only fields) each country may use
FEE_COL = {"GB": "intl_fee_gbp", "CA": "intl_fee_cad", "AU": "intl_fee_aud"}

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def iso_date(v):
    try:
        return datetime.date.fromisoformat(v) and len(v) == 10
    except (TypeError, ValueError):
        return False

def program_row(slug, iid, p, country):
    ps = p.get("slug")
    where = f"{slug}/{ps}"
    for k in ("slug", "name", "source_url", "retrieved_on"):
        check(bool(p.get(k)), f"{where}: program missing {k}")
    check(isinstance(ps, str) and re.fullmatch(r"[a-z0-9-]+", ps) is not None, f"{where}: program slug must match [a-z0-9-]+")
    unknown = set(p) - set(PROGRAM_COLS) - {"slug"}
    check(not unknown, f"{where}: unknown program keys {sorted(unknown)}")
    check(str(p.get("source_url", "")).startswith("http"), f"{where}: source_url must be an http(s) URL")
    for k in ("retrieved_on", "application_deadline"):
        if p.get(k) is not None:
            check(iso_date(p[k]), f"{where}: {k} {p[k]!r} is not an ISO date (YYYY-MM-DD)")
    for k, (lo, hi) in PROGRAM_RANGES.items():
        v = p.get(k)
        if v is not None:
            check(isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi, f"{where}: {k} {v!r} outside {lo}..{hi}")
    for k in ("duration_years", "ib_points", "intake", "intl_fee_gbp", "intl_fee_cad", "intl_fee_aud"):
        check(p.get(k) is None or isinstance(p[k], int), f"{where}: {k} must be an integer")
    if p.get("ielts_overall") is not None and p.get("ielts_component") is not None:
        check(p["ielts_component"] <= p["ielts_overall"], f"{where}: ielts_component above ielts_overall")
    for k in set(FEE_COL.values()) - {FEE_COL.get(country)}:
        check(p.get(k) is None, f"{where}: {k} is not the fee currency of {country}")
    check(p.get("ucas_code") is None or country == "GB", f"{where}: ucas_code on a non-UK course")
    check(p.get("atar") is None or country == "AU", f"{where}: atar on a non-Australian course")
    check(p.get("ucas_code") is None or re.fullmatch(r"[A-Z0-9]{4}", p["ucas_code"]) is not None, f"{where}: ucas_code {p.get('ucas_code')!r} is not 4 characters")
    return {"id": uid("prog", slug, str(ps)), "institution_id": iid, "slug": ps, **{k: p.get(k) for k in PROGRAM_COLS}}

# The site shows `short_name ?? name` everywhere (home, map, lists, compare). Two colleges must never show the
# same text, and a college must never be labelled with a region code (the UI also has US/UK/CA/AU region switches).
REGION_LABELS = {"US", "USA", "UK", "GB", "CA", "AU"} | ENUMS["country"]

def check_display_names(colleges):
    """Fail on duplicate display names (case-insensitive) or a display name equal to a region code."""
    seen = {}
    for c in colleges:
        shown = (c.get("short_name") or c["name"]).strip()
        key = " ".join(shown.lower().split())
        check(key not in seen, f"display name {shown!r} is shown by both {seen.get(key)} and {c['slug']}; give one a distinct short_name")
        seen.setdefault(key, c["slug"])
        check(shown.upper() not in REGION_LABELS, f"{c['slug']}: display name {shown!r} is a region code; use a real short_name")

# The full seed deletes institutions, and that delete cascades to every student's saved list (student_colleges).
# So a full seed refuses to run once any student has saved a college; insert-only builds don't delete and skip this.
SEED_GUARD = """do $$
begin
  if exists (select 1 from public.student_colleges) then
    raise exception 'Full seed refused: it deletes institutions, which also deletes students'' saved colleges (student_colleges has rows). Add new colleges with build_seed.py --insert-only --only <slugs>, and change existing ones with an UPDATE patch in supabase/patches/.';
  end if;
end $$;"""

def source_rows(slug, iid, c, cy):
    """key -> sources row. CDS-side keys and cycle-side keys share one namespace per college."""
    rows, seen = {}, {}
    for key, s in list(c.get("sources", {}).items()) + list(cy.get("sources", {}).items()):
        if key in seen:  # same key in both files is fine only if it is the same document
            check(seen[key] == s["url"], f"{slug}: source key {key!r} points to two different URLs")
            continue
        seen[key] = s["url"]
        enum(slug, "source_kind", s.get("kind"), nullable=False)
        rows[key] = {"id": uid("src", slug, key), "institution_id": iid, "kind": s["kind"], "title": s.get("title"),
                     "url": s["url"], "cds_year": s.get("cds_year"), "accessed_on": s.get("accessed", ACCESSED)}
    return rows

def check_deadline_rules(slug, i, country, d):
    """Intake and B3 time rules for one cycle-file deadline row (not applied to --dump-deadlines baselines)."""
    where = f"{slug}: deadline {i} ({d.get('label')!r})"
    intake = d.get("intake")
    if country == "AU":
        check(d.get("kind") != "application" or intake is not None,
              f"{where}: an Australian application row needs \"intake\": \"s1\" (Semester 1) or \"s2\" (Semester 2)")
        check(intake is None or intake in ENUMS["intake"], f"{where}: intake {intake!r} not allowed (use \"s1\" or \"s2\")")
    else:
        check(intake is None, f"{where}: intake is only for Australian colleges")
    if country in TIME_CHECKED:
        text = " ".join(x for x in (d.get("label"), d.get("notes")) if x)
        check(not CLOCK_TIME.search(text) or "Taiwan" in text,
              f"{where}: gives a clock time but no Taiwan time; write it in the label, e.g. "
              f"\"..., 18:00 UK time (02:00 on 14 Jan, Taiwan)\"")

def deadline_rows(slug, iid, country, cy, src_ids, legacy=False):
    """The college's own deadline rows, ids by position. legacy=True computes them as before intake existed."""
    rows = []
    for i, d in enumerate(cy.get("deadlines", [])):
        enum(slug, "deadline_kind", d.get("kind"), nullable=False)
        enum(slug, "plan", d.get("plan"))
        if d.get("due") and d.get("notify"):
            check(d["notify"] >= d["due"], f"{slug}: notification before deadline ({d})")
        if not legacy:
            check_deadline_rules(slug, i, country, d)
        rows.append({
            "id": uid("dl", slug, str(i)), "institution_id": iid, "cycle": CYCLE, "kind": d["kind"],
            "plan_key": d.get("plan"), "label": d.get("label"), "due_date": d.get("due"),
            "notification_date": d.get("notify"), "notification_note": d.get("note"),
            "notes": d.get("notes"), "source_id": src_ids.get(d["src"]) if d.get("src") else None,
            "program_id": None, "intake": None if legacy else d.get("intake")})
    return rows

def course_deadline_rows(slug, iid, country, c, cy, src_ids):
    """One application row per program with an application_deadline; the id depends on the program slug, not a position.
    A college application row with the same due date (and, in Australia, the same intake) lends its label, notes and
    source; otherwise the label is "Course deadline: <name>" and the source is the program's own page.
    Returns (rows, {"course/<program slug>": sources row}) ."""
    apps = [d for d in cy.get("deadlines", []) if d.get("kind") == "application"]
    rows, sources = [], {}
    for p in c.get("programs", []):
        due, ps = p.get("application_deadline"), str(p.get("slug"))
        if not due:
            continue
        intake = "s1" if country == "AU" else None
        if country == "AU":
            check(AU_S1_WINDOW[0] <= due <= AU_S1_WINDOW[1],
                  f"{slug}/{ps}: application_deadline {due}: AU course deadlines are Semester 1; "
                  f"put a Semester 2 date in the cycle file with intake s2")
        match = next((d for d in apps if d.get("due") == due and d.get("intake") == intake), None)
        if match and match.get("label"):
            label, notes = f"{p['name']}: {match['label']}", match.get("notes")
            sid = src_ids.get(match["src"]) if match.get("src") else None
        else:
            label, notes = f"Course deadline: {p['name']}", None
            sid = uid("src", slug, "course", ps)
            sources[f"course/{ps}"] = {"id": sid, "institution_id": iid, "kind": "admissions_site",
                                       "title": f"Course page: {p['name']}", "url": p.get("source_url"), "cds_year": None,
                                       "accessed_on": p.get("retrieved_on")}
        rows.append({
            "id": uid("dl", slug, "course", ps), "institution_id": iid, "cycle": CYCLE, "kind": "application",
            "plan_key": None, "label": label, "due_date": due, "notification_date": None, "notification_note": None,
            "notes": notes, "source_id": sid, "program_id": uid("prog", slug, ps), "intake": intake})
    return rows, sources

def annotate(slug, c, srcs, rows):
    """{"sources", "deadlines"} for one college: the rows plus the sources they use (srcs: key -> sources row), each
    tagged with slug and ref ("deadlines[3]" / "course cs") or key, for error messages and the baseline file."""
    by_id = {r["id"]: (k, r) for k, r in srcs.items()}
    prog_slug = {uid("prog", slug, str(p.get("slug"))): p.get("slug") for p in c.get("programs", [])}
    used = []
    for r in rows:
        if r["source_id"] in by_id and r["source_id"] not in used:
            used.append(r["source_id"])
    out_rows, n = [], 0
    for r in rows:
        if r["program_id"]:
            ref = f"course {prog_slug.get(r['program_id'], r['program_id'])}"
        else:
            ref, n = f"deadlines[{n}]", n + 1
        out_rows.append({"slug": slug, "ref": ref, **{k: r[k] for k in DEADLINE_COLS}})
    return {"sources": [{"slug": slug, "key": by_id[i][0], **{k: by_id[i][1][k] for k in SOURCE_COLS}} for i in used],
            "deadlines": out_rows}

def deadline_set(slug, iid, country, c, cy, legacy=False):
    """One college's deadline rows (+ course rows unless legacy) and the sources they use, as annotate() returns them."""
    srcs = source_rows(slug, iid, c, cy)
    src_ids = {k: r["id"] for k, r in srcs.items()}
    rows = deadline_rows(slug, iid, country, cy, src_ids, legacy)
    course, course_srcs = ([], {}) if legacy else course_deadline_rows(slug, iid, country, c, cy, src_ids)
    return annotate(slug, c, {**srcs, **course_srcs}, rows + course)

class PatchError(Exception):
    pass

def _row_sig(r):
    """Content keys that find a baseline row again at another position (one may be edited, rarely both)."""
    return [s for s in ((r["kind"], r["plan_key"], "label", r["label"], r["due_date"]) if r["label"] else None,
                        (r["kind"], r["plan_key"], "notes", r["notes"], r["due_date"]) if r["notes"] else None) if s]

def deadlines_patch(baseline, new, only=None):
    """SQL that brings the live deadline rows of a baseline (what is live) to `new` (what the files say now), as
    begin; inserts of new ids (on conflict do nothing); updates of baseline rows changed in place; commit;
    Raises PatchError when a baseline row is missing or moved, or a baseline source key's URL changed."""
    keep = (lambda r: r["slug"] in only) if only else (lambda r: True)
    base_dl = {r["id"]: r for r in baseline["deadlines"] if keep(r)}
    base_src = {r["id"]: r for r in baseline["sources"] if keep(r)}
    new_dl = {r["id"]: r for r in new["deadlines"]}
    new_src = {r["id"]: r for r in new["sources"]}
    problems = []
    unknown = sorted({r["slug"] for r in new["deadlines"]} - {r["slug"] for r in baseline["deadlines"]} - set(baseline.get("slugs", [])))
    if unknown:
        problems.append(f"slugs not in the baseline: {unknown} (a baseline is needed to tell live rows from new ones)")
    for i, b in base_dl.items():
        if i not in new_dl:
            problems.append(f"{b['slug']}: baseline {b['ref']} {b['label']!r} (id {i}) is missing; rows were removed or "
                            f"reordered. Ids are positional: restore it and append new rows at the end.")
    for i, b in base_src.items():
        cur = new_src.get(i)
        if cur is not None and cur["url"] != b["url"]:
            problems.append(f"{b['slug']}: source key {b['key']!r} changed URL ({b['url']} -> {cur['url']}); "
                            f"keep the old key and add a new source key for the new page.")
    # a baseline row whose content now sits under another id was moved (e.g. a row inserted above it)
    by_sig = {}
    for r in new["deadlines"]:
        if r["program_id"] is None:
            for s in _row_sig(r):
                by_sig.setdefault((r["slug"], s), []).append(r["id"])
    for i, b in base_dl.items():
        cur = new_dl.get(i)
        if cur is None or all(cur[k] == b[k] for k in ("kind", "plan_key", "label", "due_date", "notes")):
            continue
        elsewhere = sorted({j for s in _row_sig(b) for j in by_sig.get((b["slug"], s), []) if j != i})
        if elsewhere:
            problems.append(f"{b['slug']}: baseline {b['ref']} {b['label']!r} moved to id {elsewhere[0]}; ids are "
                            f"positional: keep rows in place and append new rows at the end.")
    if problems:
        raise PatchError("\n".join(problems))

    val = lambda r, cols: ", ".join(q(r[k]) for k in cols)
    src_ins = [r for r in new["sources"] if r["id"] not in base_src]
    dl_ins = [r for r in new["deadlines"] if r["id"] not in base_dl]
    upd = [r for r in new["deadlines"] if r["id"] in base_dl and any(r[k] != base_dl[r["id"]][k] for k in DEADLINE_COLS)]
    out = ["begin;",
           "-- GENERATED by scripts/build_seed.py --deadlines-only; edit data/*.json, not this file.",
           "-- Needs migration 00NN_uk_ca_au_steps first (deadlines.program_id / deadlines.intake; programs already live).",
           f"-- {len(src_ins)} source inserts, {len(dl_ins)} deadline inserts "
           f"({sum(1 for r in dl_ins if r['program_id'])} course rows), {len(upd)} deadline updates.",
           "-- Inserts never overwrite a row (on conflict (id) do nothing); each update sets every column of one row."]
    for r in src_ins:
        out.append(f"insert into public.sources ({', '.join(SOURCE_COLS)}) values ({val(r, SOURCE_COLS)}) on conflict (id) do nothing;")
    for r in dl_ins:
        out.append(f"insert into public.deadlines ({', '.join(DEADLINE_COLS)}) values ({val(r, DEADLINE_COLS)}) on conflict (id) do nothing;")
    for r in upd:
        sets = ", ".join(f"{k} = {q(r[k])}" for k in DEADLINE_COLS if k != "id")
        out.append(f"update public.deadlines set {sets} where id = {q(r['id'])};")
    out.append("commit;")
    return "\n".join(out) + "\n"

def write_deadlines_patch(baseline, new, out_path, only=None):
    """deadlines_patch() written to out_path; nothing is written when it raises."""
    sql = deadlines_patch(baseline, new, only)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)
    return sql

def build(only=None, insert_only=False, legacy=False, collect=None):
    """The seed SQL. legacy=True builds deadline rows as before intake / course rows existed (for --dump-deadlines);
    collect, a dict, receives {"slugs", "sources", "deadlines"} of the built colleges' deadline rows."""
    colleges = [load_json(p) for p in sorted(glob.glob(os.path.join(ROOT, "data/colleges/*.json")))]
    cycle = load_json(os.path.join(ROOT, "data/cycle_2026_27.json"))
    for p in sorted(glob.glob(os.path.join(ROOT, "data/cycle_2026_27/*.json"))):
        cycle[os.path.splitext(os.path.basename(p))[0]] = load_json(p)
    slugs = [c["slug"] for c in colleges]
    check(len(slugs) == len(set(slugs)), "duplicate slugs in data/colleges")
    check_display_names(colleges)
    if only:
        check(not set(only) - set(slugs), f"--only: unknown slugs {sorted(set(only) - set(slugs))}")
        colleges = [c for c in colleges if c["slug"] in only]
    if collect is not None:
        collect.update({"slugs": [c["slug"] for c in colleges], "sources": [], "deadlines": []})
    out = ["-- GENERATED by scripts/build_seed.py — edit data/*.json, not this file.", "begin;"]
    if not insert_only:
        out.append(SEED_GUARD)
        out.append("delete from institutions where slug in (" + ", ".join(q(c["slug"]) for c in colleges) + ");")

    for c in colleges:
        slug = c["slug"]
        cy = cycle.get(slug, {})
        check(slug in cycle, f"{slug}: no cycle data")
        iid = uid("inst", slug)
        for k in ("setting", "control", "academic_calendar"):
            enum(slug, k, c.get(k))
        check(c.get("country_code", "US") in ENUMS["country"], f"{slug}: country_code {c.get('country_code')!r} not allowed")
        ug, intl = c.get("undergrad_enrollment"), c.get("intl_undergrads")
        out.append(f"\n-- ── {c['name']} ──")
        out.append(insert("institutions", {
            "id": iid, "slug": slug, "name": c["name"], "short_name": c.get("short_name"), "country_code": c.get("country_code", "US"),
            "state_region": c.get("state_region"), "city": c.get("city"),
            "latitude": c.get("latitude"), "longitude": c.get("longitude"),
            "setting": c.get("setting"), "control": c.get("control"),
            "website": c.get("website"), "admissions_url": c.get("admissions_url"),
            "ipeds_unit_id": c.get("ipeds_unit_id"), "undergrad_enrollment": ug,
            "pct_international_ug": round(100 * intl / ug, 2) if ug and intl else None,
            "student_faculty_ratio": c.get("student_faculty_ratio"), "academic_calendar": c.get("academic_calendar"),
        }))

        # sources: CDS-side keys + cycle-side keys share one namespace per college
        country = c.get("country_code", "US")
        srcs = source_rows(slug, iid, c, cy)
        src_ids = {k: r["id"] for k, r in srcs.items()}
        for r in srcs.values():
            out.append(insert("sources", r))
        S = lambda k: src_ids.get(k) if k else None

        # admission stats (+ optional extra years)
        st = c.get("stats")
        for s in ([st] if st else []) + c.get("stats_extra", []):
            a, ad = s.get("applicants"), s.get("admits")
            check(a is None or ad is None or ad <= a, f"{slug}: admits > applicants")
            dist = s.get("gpa_distribution")
            if dist:
                tot = sum(dist.values())
                check(95 <= tot <= 101, f"{slug}: GPA distribution sums to {tot}")
            src = S(s.get("source"))
            out.append(insert("admission_stats", {
                "institution_id": iid, "cds_year": s["cds_year"], "applicants": a, "admits": ad,
                "enrolled": s.get("enrolled"), "ed_applicants": s.get("ed_applicants"), "ed_admits": s.get("ed_admits"),
                "intl_applicants": s.get("intl_applicants"), "intl_admits": s.get("intl_admits"),
                "in_state_applicants": s.get("in_state_applicants"), "in_state_admits": s.get("in_state_admits"),
                "out_state_applicants": s.get("out_state_applicants"), "out_state_admits": s.get("out_state_admits"),
                "waitlist_offered": s.get("waitlist_offered"), "waitlist_accepted": s.get("waitlist_accepted"),
                "waitlist_admitted": s.get("waitlist_admitted"),
                "pct_submit_sat": s.get("pct_submit_sat"), "pct_submit_act": s.get("pct_submit_act"),
                "gpa_avg": s.get("gpa_avg"), "pct_reporting_gpa": s.get("pct_reporting_gpa"),
                "gpa_distribution": dist, "notes": s.get("notes"), "source_id": src,
                "source_note": None if s.get("source") == "cds" else "admissions_site",
            }))

        cds_year = st["cds_year"] if st else None
        # scores may come from a different source/year than stats (e.g. CDS C1 + IPEDS percentiles)
        score_src = c.get("sources", {}).get(c.get("scores_source", "cds"), {})
        score_year = score_src.get("cds_year") or cds_year
        for test, vals in c.get("scores", {}).items():
            enum(slug, "test", test, nullable=False)
            if all(v is None for v in vals):
                continue
            p25, p50, p75 = vals
            check([v for v in vals if v is not None] == sorted(v for v in vals if v is not None), f"{slug}: {test} percentiles out of order")
            out.append(insert("test_score_percentiles", {"institution_id": iid, "cds_year": score_year, "test": test,
                                                         "p25": p25, "p50": p50, "p75": p75, "source_id": S(c.get("scores_source", "cds"))}))
        for factor, imp in c.get("factors", {}).items():
            enum(slug, "factor", factor, nullable=False)
            check(imp in FACTOR_MAP, f"{slug}: factor {factor} importance {imp!r} not allowed")
            out.append(insert("admission_factors", {"institution_id": iid, "cds_year": cds_year, "factor": factor,
                                                    "importance": FACTOR_MAP[imp], "source_id": S(c.get("factors_source", "cds"))}))

        # test policy: admissions site wins over CDS C8
        tp = cy.get("test_policy") or c.get("cds_test_policy")
        # SAT/ACT policy only exists for US colleges; UK courses carry their admissions test on the program row
        check(tp is not None or c.get("country_code", "US") != "US", f"{slug}: no test policy")
        if tp:
            enum(slug, "test_policy", tp.get("policy"), nullable=False)
            out.append(insert("test_policies", {"institution_id": iid, "cycle": CYCLE, "policy": tp["policy"],
                                                "notes": tp.get("notes"),
                                                "source_id": S(tp.get("src")) or (S("cds") if not cy.get("test_policy") else None)}))

        r = cy.get("requirements")
        if r:
            enum(slug, "interview", r.get("interview"))
            check(isinstance(r.get("teacher_recs"), (int, type(None))), f"{slug}: teacher_recs must be an integer")
            out.append(insert("application_requirements", {
                "institution_id": iid, "cycle": CYCLE, "platforms": RawSQL(arr(r.get("platforms", []))),
                "supplemental_essays": r.get("supplemental_essays"), "teacher_recs": r.get("teacher_recs"),
                "counselor_rec": r.get("counselor_rec"), "interview": r.get("interview"), "portfolio": r.get("portfolio"),
                "app_fee_usd": r.get("app_fee_usd"), "fee_waiver": r.get("fee_waiver"),
                "css_profile_required": r.get("css_profile_required"), "fafsa_required": r.get("fafsa_required"),
                "midyear_report": r.get("midyear_report"), "notes": r.get("notes"), "source_id": S(r.get("src"))}))

        # ids are positional (uid("dl", slug, str(i))): rows are only ever appended to a cycle file's list
        dls = deadline_rows(slug, iid, country, cy, src_ids, legacy)
        for r in dls:
            out.append(insert("deadlines", r))

        ep = cy.get("english_policy")
        if ep:
            enum(slug, "english_policy", ep.get("policy"), nullable=False)
            out.append(insert("english_policies", {"institution_id": iid, "policy": ep["policy"],
                                                   "waiver_notes": ep.get("waiver_notes"), "source_id": S(ep.get("src"))}))
        for e in cy.get("english", []):
            enum(slug, "english_test", e.get("test"), nullable=False)
            enum(slug, "english_status", e.get("status"), nullable=False)
            out.append(insert("english_requirements", {
                "institution_id": iid, "test_key": e["test"], "status": e["status"], "min_total": e.get("min"),
                "recommended_total": e.get("rec"), "min_subscores": e.get("subs"), "notes": e.get("notes"),
                "source_id": S(e.get("src"))}))

        # score-reporting codes: numeric for SAT/ACT/TOEFL; null code + note = pick the school by name
        for test, sc in cy.get("score_codes", {}).items():
            check(test in SCORE_TESTS, f"{slug}: unknown score-code test {test}")
            code = sc.get("code")
            if code is not None:
                ok = code.isdigit() if test in ("sat", "act") else code.isalnum()  # some ETS (TOEFL) codes are alphanumeric
                check(isinstance(code, str) and len(code) == 4 and ok, f"{slug}: {test} code {code!r} is not a 4-character code")
                check(S(sc.get("src")) is not None, f"{slug}: {test} code has no source")
            else:
                check(bool(sc.get("note")), f"{slug}: {test} has no code and no note")
            out.append(insert("score_codes", {"institution_id": iid, "test_key": test, "code": code,
                                              "notes": sc.get("note"), "source_id": S(sc.get("src"))}))

        # cost: cycle (admissions/aid site) overrides CDS fields; aid policy from cycle
        cost = dict(c.get("cost") or {})
        cc = cy.get("cost") or {}
        aid = cy.get("aid") or {}
        if cc:
            cost_src = S(cc.get("src"))
            cost = {**cost, **{k: v for k, v in cc.items() if k != "src"},
                    "notes": "; ".join(x for x in [cc.get("notes"), cost.get("notes")] if x)}
        else:
            cost_src = S(cost.get("source", "cds")) if cost else None
        enum(slug, "aid_policy", aid.get("intl_aid_policy"))
        if cost or aid:
            intl_need = aid.get("intl_need_aid", cost.get("intl_need_aid"))
            notes = "; ".join(x for x in [cost.get("notes"), aid.get("notes")] if x) or None
            out.append(insert("cost_aid", {
                "institution_id": iid, "year": cost.get("year", "2026-2027"),
                "tuition_usd": cost.get("tuition_usd"), "tuition_out_of_state_usd": cost.get("tuition_out_of_state_usd"),
                "tuition_intl_usd": cost.get("tuition_intl_usd"), "required_fees_usd": cost.get("required_fees_usd"),
                "intl_extra_fees_usd": cost.get("intl_extra_fees_usd"), "room_board_usd": cost.get("room_board_usd"),
                "books_usd": cost.get("books_usd"), "other_usd": cost.get("other_usd"),
                "total_coa_usd": cost.get("total_coa_usd"),
                "intl_aid_policy": aid.get("intl_aid_policy"), "intl_need_aid": intl_need,
                "intl_merit_aid": cost.get("intl_merit_aid"),
                "intl_need_aid_awarded": cost.get("intl_need_aid_awarded"), "intl_avg_award_usd": cost.get("intl_avg_award_usd"),
                "meets_full_need": aid.get("meets_full_need"), "merit_scholarships": aid.get("merit_scholarships"),
                "merit_separate_app": aid.get("merit_separate_app"), "notes": notes,
                "source_id": cost_src or S(aid.get("src"))}))

        notes = cy.get("tier_notes", {})
        for cat, tier in cy.get("tiers", {}).items():
            enum(slug, "category", cat, nullable=False)
            ok = tier in ("S", "A", "B", "C", "D") or (cat == "general" and tier[:1] in "SABCD" and tier[1:] in ("+", "++"))
            check(ok, f"{slug}: bad tier {tier} for {cat} (only general may use +/++)")
            why = notes.get(cat)
            if cat == "general" and st:
                sat = c.get("scores", {}).get("SAT_TOTAL") or [None] * 3
                rate = round(100 * st["admits"] / st["applicants"], 1) if st.get("applicants") and st.get("admits") else None
                why = f"Admit rate {rate}%" + (f"; SAT middle 50% {sat[0]}-{sat[2]}" if sat[0] else "") if rate else why
            out.append(insert("institution_tiers", {"institution_id": iid, "category_key": cat, "tier_code": tier,
                                                    "rationale": why or "Editorial judgment (v1, reviewed 2026-10-20)"}))
        check("general" in cy.get("tiers", {}), f"{slug}: missing general tier")

        for m in cy.get("majors", []):
            enum(slug, "category", m.get("category"))
            enum(slug, "admit_model", m.get("admit_model"), nullable=False)
            enum(slug, "internal_transfer", m.get("internal_transfer"))
            out.append(insert("major_admissions", {
                "id": uid("major", slug, m["program"]), "institution_id": iid, "program": m["program"],
                "category_key": m.get("category"), "admit_model": m["admit_model"], "capped": m.get("capped", False),
                "internal_transfer": m.get("internal_transfer"), "notes": m.get("notes")}))

        # course-level data (UK/UCAS style); optional "programs" array in data/colleges/<slug>.json
        pslugs = [p.get("slug") for p in c.get("programs", [])]
        check(len(pslugs) == len(set(pslugs)), f"{slug}: duplicate program slugs")
        for p in c.get("programs", []):
            out.append(insert("programs", program_row(slug, iid, p, c.get("country_code", "US"))))

        # course deadline rows reference their program (composite FK), so they follow the programs insert
        course, course_srcs = ([], {}) if legacy else course_deadline_rows(slug, iid, country, c, cy, src_ids)
        for r in course_srcs.values():
            out.append(insert("sources", r))
        for r in course:
            out.append(insert("deadlines", r))
        if collect is not None:
            got = annotate(slug, c, {**srcs, **course_srcs}, dls + course)
            collect["sources"] += got["sources"]
            collect["deadlines"] += got["deadlines"]

    out.append("commit;")
    return "\n".join(render(out)) + "\n"

def fail(msg):
    print(msg)
    sys.exit(1)

def deadlines_main(only):
    """--dump-deadlines and --deadlines-only (see the module docstring)."""
    out = arg("--out")
    if not only or not out:
        fail("--dump-deadlines / --deadlines-only need --only <slugs> and --out <path>")
    col = {}
    dump = "--dump-deadlines" in sys.argv
    build(only, insert_only=True, legacy=dump, collect=col)  # validates these colleges like --check does
    if errors:
        fail("Validation errors:\n  " + "\n  ".join(errors))
    if dump:
        doc = {"generated_by": "scripts/build_seed.py --dump-deadlines (legacy rows: no course rows, intake null)",
               "cycle": CYCLE, **col}
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"wrote {out} ({len(col['deadlines'])} deadline rows, {len(col['sources'])} sources, {len(col['slugs'])} colleges)")
        return
    path = arg("--baseline")
    if not path:
        fail("--deadlines-only needs --baseline <json> (written by --dump-deadlines)")
    baseline = load_json(path)
    try:
        sql = write_deadlines_patch(baseline, col, out, only)
    except PatchError as e:
        fail(f"Refused, nothing written:\n{e}")
    print(f"wrote {out} ({len(sql)} bytes)")

if __name__ == "__main__":
    only = arg("--only")
    if "--dump-deadlines" in sys.argv or "--deadlines-only" in sys.argv:
        deadlines_main(only.split(",") if only else None)
        sys.exit(0)
    sql = build(only.split(",") if only else None, "--insert-only" in sys.argv)
    if errors:
        print("Validation errors:\n  " + "\n  ".join(errors))
        sys.exit(1)
    if "--check" in sys.argv:
        print("OK")
        sys.exit(0)
    path = arg("--out") or os.path.join(ROOT, "supabase/seed/10_colleges.sql")
    open(path, "w", encoding="utf-8").write(sql)
    print(f"wrote {path} ({len(sql)} bytes)")
