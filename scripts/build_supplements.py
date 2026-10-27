"""Validate data/supplements_2026_27/*.json and build web/lib/data/supplements.json.

Usage: python -I scripts/build_supplements.py [--check]
  --check  validate and build in memory; exit 1 if any file is invalid or the committed JSON differs (nothing is written)

Data contract: docs/superpowers/research/2026-10-27-supplements-brief.md (one file per college, named like its
data/colleges/<file>.json). A few college files are named differently from the college's database slug (the "slug"
field inside them, e.g. cmu.json -> carnegie-mellon); the output is keyed by that database slug, which the app uses,
and a supplements file's own "slug" may be either form.
Every error names the file and the field. Nothing is written while any file is invalid.
The app reads the output through web/lib/supplements.ts (pure helpers) and web/lib/supplements-data.ts (the import).
"""
import datetime, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "data/supplements_2026_27")
COLLEGES_DIR = os.path.join(ROOT, "data/colleges")
OUT = os.path.join(ROOT, "web/lib/data/supplements.json")

CYCLE = "2026-27"
CYCLES = {"2026-27", "2025-26"}  # 2025-26 = last year's prompts, labelled as such in the app
SUPPLEMENTS = {"required", "optional_only", "none", "unknown"}
SHARED_SETS = {None, "uc-piq"}
CATEGORIES = {"why_us", "why_major", "community", "activity", "challenge", "identity", "intellectual", "short_answer", "other"}
WHEN = {"with_application", "after_admission", "before_i20", "unknown"}

TOP_KEYS = {"slug", "cycle", "supplements", "shared_set", "prompts", "intl_finance", "sources", "notes"}
PROMPT_KEYS = {"key", "prompt", "word_limit", "char_limit", "required", "applies_to", "choose", "category", "source"}
FINANCE_KEYS = {"document", "when", "deadlines", "notes", "source"}
DEADLINE_KEYS = {"label", "date", "note"}
SOURCE_KEYS = {"n", "url", "title", "accessed"}
KEY_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
GROUP_RE = re.compile(r"^[A-Z]{1,2}$")
# applies_to names a subset of applicants. "All applicants", "All first-year applicants (choose one…)" or "Optional…"
# describe everyone; "All applicants except X" is a real subset and stays allowed.
EVERYONE_RE = re.compile(r"^\s*(?:all\s+(?:first[- ]year\s+|freshman\s+)?(?:applicants|students)\b(?!\s+except)|optional\b)", re.I)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def is_text(v):
    return isinstance(v, str) and v.strip() != "" and v == v.strip()


def is_date(v):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return False
    try:
        datetime.date.fromisoformat(v)
        return True
    except ValueError:
        return False


def keys_exact(obj, allowed, where, errors):
    """Every listed key must be present (null allowed where the brief allows it) and no others."""
    if not isinstance(obj, dict):
        errors.append(f"{where}: must be an object")
        return False
    extra = sorted(set(obj) - allowed)
    missing = sorted(allowed - set(obj))
    if extra:
        errors.append(f"{where}: unknown field(s) {', '.join(extra)}")
    if missing:
        errors.append(f"{where}: missing field(s) {', '.join(missing)}")
    return not extra and not missing


def validate(rec, file_slug, college_slugs):
    """All problems with one parsed file, as human-readable strings (empty list = valid).
    `college_slugs` maps a data/colleges file name to the college's database slug."""
    errors = []
    if not keys_exact(rec, TOP_KEYS, "file", errors):
        return errors
    db_slug = college_slugs.get(file_slug)
    if db_slug is None:
        errors.append(f"slug: no data/colleges/{file_slug}.json")
    if rec["slug"] not in {file_slug, db_slug}:
        errors.append(f"slug: {rec['slug']!r} matches neither the file name {file_slug!r} nor the college's slug {db_slug!r}")
    if rec["cycle"] not in CYCLES:
        errors.append(f"cycle: {rec['cycle']!r} is not one of {sorted(CYCLES)}")
    if rec["supplements"] not in SUPPLEMENTS:
        errors.append(f"supplements: {rec['supplements']!r} is not one of {sorted(SUPPLEMENTS)}")
    if rec["shared_set"] not in SHARED_SETS:
        errors.append(f"shared_set: {rec['shared_set']!r} must be null or 'uc-piq'")
    if not isinstance(rec["notes"], str):
        errors.append("notes: must be a string (empty if no gaps)")

    # Sources first, so references can be checked.
    source_ns = set()
    if not isinstance(rec["sources"], list):
        errors.append("sources: must be a list")
    else:
        for i, s in enumerate(rec["sources"]):
            w = f"sources[{i}]"
            if not keys_exact(s, SOURCE_KEYS, w, errors):
                continue
            if not is_int(s["n"]) or s["n"] < 1:
                errors.append(f"{w}.n: must be a positive integer")
            elif s["n"] in source_ns:
                errors.append(f"{w}.n: {s['n']} is used twice")
            else:
                source_ns.add(s["n"])
            if not isinstance(s["url"], str) or not re.match(r"^https?://\S+$", s["url"]):
                errors.append(f"{w}.url: must be an http(s) URL")
            if not is_text(s["title"]):
                errors.append(f"{w}.title: must be non-empty text")
            if not is_date(s["accessed"]):
                errors.append(f"{w}.accessed: must be a YYYY-MM-DD date")

    def check_source(v, w):
        if not is_int(v):
            errors.append(f"{w}: must be a source number")
        elif v not in source_ns:
            errors.append(f"{w}: source {v} is not in sources")

    prompts = rec["prompts"]
    if not isinstance(prompts, list):
        errors.append("prompts: must be a list")
        prompts = []
    keys, groups = set(), {}
    for i, p in enumerate(prompts):
        w = f"prompts[{i}]"
        if not keys_exact(p, PROMPT_KEYS, w, errors):
            continue
        w = f"prompts[{i}] ({p['key']})" if isinstance(p["key"], str) else w
        if not isinstance(p["key"], str) or not KEY_RE.match(p["key"]):
            errors.append(f"{w}.key: must be kebab-case (a-z, 0-9, -)")
        elif p["key"] in keys:
            errors.append(f"{w}.key: duplicate key")
        else:
            keys.add(p["key"])
        if not is_text(p["prompt"]):
            errors.append(f"{w}.prompt: must be non-empty text without leading/trailing spaces")
        for lim in ("word_limit", "char_limit"):
            v = p[lim]
            if v is not None and (not is_int(v) or v <= 0):
                errors.append(f"{w}.{lim}: must be a positive integer or null")
        if not isinstance(p["required"], bool):
            errors.append(f"{w}.required: must be true or false")
        if p["applies_to"] is not None and not is_text(p["applies_to"]):
            errors.append(f"{w}.applies_to: must be null or non-empty text")
        elif isinstance(p["applies_to"], str) and EVERYONE_RE.match(p["applies_to"]):
            # The app files any prompt with applies_to under "only for some applicants"; everyone = null.
            errors.append(f"{w}.applies_to: {p['applies_to'][:60]!r} means every applicant or 'optional'; use null (and required/choose)")
        if p["category"] not in CATEGORIES:
            errors.append(f"{w}.category: {p['category']!r} is not one of {sorted(CATEGORIES)}")
        check_source(p["source"], f"{w}.source")
        ch = p["choose"]
        if ch is not None:
            if not keys_exact(ch, {"group", "pick"}, f"{w}.choose", errors):
                continue
            if not isinstance(ch["group"], str) or not GROUP_RE.match(ch["group"]):
                errors.append(f"{w}.choose.group: must be a capital letter like 'A'")
            elif not is_int(ch["pick"]) or ch["pick"] < 1:
                errors.append(f"{w}.choose.pick: must be a positive integer")
            else:
                groups.setdefault(ch["group"], []).append((w, p))

    for g, members in sorted(groups.items()):
        picks = {p["choose"]["pick"] for _, p in members}
        if len(picks) > 1:
            errors.append(f"choose group {g}: prompts disagree on pick ({sorted(picks)})")
            continue
        pick = picks.pop()
        if pick >= len(members):
            errors.append(f"choose group {g}: pick {pick} needs more than {pick} prompts in the group (has {len(members)})")
        if len({p["required"] for _, p in members}) > 1:
            errors.append(f"choose group {g}: prompts disagree on required")
        if len({p["applies_to"] for _, p in members}) > 1:
            errors.append(f"choose group {g}: prompts disagree on applies_to")

    status = rec["supplements"]
    good_prompts = [p for p in prompts if isinstance(p, dict) and isinstance(p.get("required"), bool)]
    if status in ("none", "unknown") and prompts:
        errors.append(f"supplements: {status!r} must have an empty prompts list")
    # 'required' with no prompts is allowed: the college says an essay is required but publishes the prompt only
    # inside the application (e.g. Boston University). The app shows one generic required essay for it.
    if status == "required" and prompts and not any(p["required"] for p in good_prompts):
        errors.append("supplements: 'required' needs at least one prompt with required: true")
    if status == "required" and not prompts and not rec["sources"]:
        errors.append("supplements: 'required' without prompts still needs a source saying an essay is required")
    if status == "optional_only" and (not prompts or any(p["required"] for p in good_prompts)):
        errors.append("supplements: 'optional_only' needs prompts, all with required: false")
    if rec["shared_set"] == "uc-piq" and not prompts:
        errors.append("shared_set: 'uc-piq' files carry the 8 Personal Insight Questions")

    fin = rec["intl_finance"]
    if fin is not None and keys_exact(fin, FINANCE_KEYS, "intl_finance", errors):
        if not is_text(fin["document"]):
            errors.append("intl_finance.document: must be non-empty text")
        if fin["when"] not in WHEN:
            errors.append(f"intl_finance.when: {fin['when']!r} is not one of {sorted(WHEN)}")
        if fin["notes"] is not None and not isinstance(fin["notes"], str):
            errors.append("intl_finance.notes: must be text or null")
        check_source(fin["source"], "intl_finance.source")
        if not isinstance(fin["deadlines"], list):
            errors.append("intl_finance.deadlines: must be a list")
        else:
            for i, d in enumerate(fin["deadlines"]):
                w = f"intl_finance.deadlines[{i}]"
                if not keys_exact(d, DEADLINE_KEYS, w, errors):
                    continue
                if not is_text(d["label"]):
                    errors.append(f"{w}.label: must be non-empty text")
                if d["date"] is not None and not is_date(d["date"]):
                    errors.append(f"{w}.date: must be YYYY-MM-DD or null")
                if d["note"] is not None and not is_text(d["note"]):
                    errors.append(f"{w}.note: must be text or null")
                if d["date"] is None and d["note"] is None:
                    errors.append(f"{w}: a deadline without a date needs a note")
    return errors


def college_slugs():
    """data/colleges file name -> the college's database slug (its "slug" field, else the file name)."""
    out = {}
    for p in glob.glob(os.path.join(COLLEGES_DIR, "*.json")):
        name = os.path.splitext(os.path.basename(p))[0]
        with open(p, encoding="utf-8") as f:
            out[name] = json.load(f).get("slug") or name
    return out


def load_all(src_dir=SRC_DIR, slugs=None):
    """(records by database slug, errors as 'file: message')."""
    slugs = college_slugs() if slugs is None else slugs
    out, errors = {}, []
    for path in sorted(glob.glob(os.path.join(src_dir, "*.json"))):
        name = os.path.basename(path)
        file_slug = os.path.splitext(name)[0]
        try:
            with open(path, encoding="utf-8") as f:
                rec = json.load(f)
        except (OSError, ValueError) as e:
            errors.append(f"{name}: not valid JSON ({e})")
            continue
        problems = validate(rec, file_slug, slugs)
        errors.extend(f"{name}: {m}" for m in problems)
        if not problems:
            db_slug = slugs[file_slug]
            if db_slug in out:
                errors.append(f"{name}: a second file for {db_slug!r}")
                continue
            out[db_slug] = rec
    return out, errors


def render(records):
    """One college per line: small diffs, still valid JSON. The slug is the key, so it is not repeated."""
    lines = ["{", f'  "cycle": {json.dumps(CYCLE)},', '  "source": "data/supplements_2026_27/*.json via scripts/build_supplements.py",', '  "colleges": {']
    items = sorted(records.items())
    for i, (slug, rec) in enumerate(items):
        body = {k: rec[k] for k in ("cycle", "supplements", "shared_set", "prompts", "intl_finance", "sources", "notes")}
        comma = "," if i < len(items) - 1 else ""
        lines.append(f"    {json.dumps(slug)}: {json.dumps(body, ensure_ascii=False, separators=(',', ':'))}{comma}")
    lines.append("  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    check = "--check" in sys.argv[1:]
    records, errors = load_all()
    if errors:
        print(f"{len(errors)} problem(s) in data/supplements_2026_27:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    text = render(records)
    json.loads(text)  # sanity: the hand-assembled layout must parse
    counts = {}
    for r in records.values():
        counts[r["supplements"]] = counts.get(r["supplements"], 0) + 1
    summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "no files"
    last_year = sum(1 for r in records.values() if r["cycle"] != CYCLE)
    if check:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != text:
            print(f"{os.path.relpath(OUT, ROOT)} is out of date; rerun without --check")
            sys.exit(1)
        print(f"OK: {len(records)} colleges ({summary}; {last_year} with last year's prompts)")
        sys.exit(0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text)} bytes, {len(records)} colleges: {summary}; {last_year} with last year's prompts)")


if __name__ == "__main__":
    main()
