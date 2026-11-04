"""Validate data/application_steps_2026_27/*.json and build the extra-steps JSON used by the checklist.

Usage: python -I scripts/build_application_steps.py [--check]
  --check  validate and build in memory; exit 1 if any file is invalid or either committed JSON differs (nothing is written)

One file per UK, Canadian and Australian university (named like its data/colleges/<slug>.json). A file lists the steps
beyond the shared application (university forms, written work, portfolios, interviews, tests), each with an official
source URL and a verified-on date. "researched": false means nobody has checked yet: the app then says
"Extra steps not checked yet" and links the admissions page, it never says there are none.
The output is written twice with identical content: web/lib/data/application-steps.json (read by
web/lib/application-steps.ts) and supabase/functions/_shared/application-steps.json (read by the reminder function).
Every error names the file. Nothing is written while any file is invalid.
"""
import datetime, glob, importlib.util, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "data/application_steps_2026_27")
COLLEGES_DIR = os.path.join(ROOT, "data/colleges")
CYCLE_DIR = os.path.join(ROOT, "data/cycle_2026_27")
OUTS = [os.path.join(ROOT, "web/lib/data/application-steps.json"),
        os.path.join(ROOT, "supabase/functions/_shared/application-steps.json")]

COUNTRIES = {"GB", "CA", "AU"}
# Mirror of STEP_KINDS in web/lib/checklist.ts.
STEP_KINDS = ["supplementary_form", "university_form", "written_work", "portfolio", "interview", "test"]
TOP_KEYS = {"slug", "researched", "checked_on", "admissions_url", "steps"}
STEP_KEYS = {"id", "kind", "name", "courses", "deadline", "source_url", "verified_on"}
ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")

_spec = importlib.util.spec_from_file_location("build_seed", os.path.join(ROOT, "scripts/build_seed.py"))
build_seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_seed)  # only for uid(): program ids must equal the seed's


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_text(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def is_date(v):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return False
    try:
        datetime.date.fromisoformat(v)
        return True
    except ValueError:
        return False


def is_https(v):
    return isinstance(v, str) and v.startswith("https://") and len(v) > len("https://")


def college_index(colleges_dir=COLLEGES_DIR, cycle_dir=CYCLE_DIR):
    """slug -> {country, programs (raw dicts, with their file slug), labels (deadline labels of the cycle file)}."""
    index = {}
    for path in sorted(glob.glob(os.path.join(colleges_dir, "*.json"))):
        c = read_json(path)
        cycle_path = os.path.join(cycle_dir, os.path.basename(path))
        cycle = read_json(cycle_path) if os.path.exists(cycle_path) else {}
        index[c["slug"]] = {
            "country": c.get("country_code", "US"),
            "programs": c.get("programs", []),
            "labels": {d.get("label") for d in cycle.get("deadlines", []) if d.get("label")},
        }
    return index


def validate(rec, fname, index):
    """Errors for one file (empty = valid). fname is the file name without .json."""
    where = f"application_steps_2026_27/{fname}.json"
    errors = []
    if not isinstance(rec, dict):
        return [f"{where}: top level must be an object"]
    extra, missing = set(rec) - TOP_KEYS, TOP_KEYS - set(rec)
    if extra:
        errors.append(f"{where}: unknown field(s) {sorted(extra)}")
    if missing:
        errors.append(f"{where}: missing field(s) {sorted(missing)}")
        return errors
    slug = rec["slug"]
    if slug != fname:
        errors.append(f"{where}: slug {slug!r} does not match the file name")
    college = index.get(slug)
    if college is None:
        errors.append(f"{where}: slug {slug!r} is not a data/colleges slug")
        return errors
    if college["country"] not in COUNTRIES:
        errors.append(f"{where}: {slug} is a {college['country']} college; only GB, CA and AU colleges have a steps file")
        return errors
    country = college["country"]
    researched, checked_on, steps = rec["researched"], rec["checked_on"], rec["steps"]
    if not isinstance(researched, bool):
        errors.append(f"{where}: researched must be true or false")
    elif researched and not is_date(checked_on):
        errors.append(f"{where}: researched: true needs checked_on as YYYY-MM-DD")
    elif not researched and (steps != [] or checked_on is not None):
        errors.append(f"{where}: researched: false needs steps == [] and checked_on == null")
    if not is_https(rec["admissions_url"]):
        errors.append(f"{where}: admissions_url must start with https://")
    if not isinstance(steps, list):
        errors.append(f"{where}: steps must be a list")
        return errors
    course_slugs = {p.get("slug") for p in college["programs"]}
    seen, ca_tests = set(), 0
    for i, s in enumerate(steps):
        at = f"{where}: steps[{i}]"
        if not isinstance(s, dict):
            errors.append(f"{at}: must be an object")
            continue
        if set(s) != STEP_KEYS:
            errors.append(f"{at}: fields must be exactly {sorted(STEP_KEYS)}")
            continue
        if not isinstance(s["id"], str) or not ID_RE.fullmatch(s["id"]):
            errors.append(f"{at}: id {s['id']!r} must match ^[a-z0-9_]{{1,40}}$")
        elif s["id"] in seen:
            errors.append(f"{at}: duplicate id {s['id']!r}")
        else:
            seen.add(s["id"])
        if s["kind"] not in STEP_KINDS:
            errors.append(f"{at}: kind {s['kind']!r} is not one of {STEP_KINDS}")
        if not isinstance(s["name"], str) or not 1 <= len(s["name"]) <= 120:
            errors.append(f"{at}: name must be 1-120 characters")
        c = s["courses"]
        if c != "all":
            if not isinstance(c, list) or not c or not all(isinstance(x, str) for x in c):
                errors.append(f"{at}: courses must be \"all\" or a non-empty list of course slugs")
            else:
                for x in c:
                    if x not in course_slugs:
                        errors.append(f"{at}: course {x!r} is not a program slug of {slug}")
        d = s["deadline"]
        if d is not None and d not in college["labels"]:
            errors.append(f"{at}: deadline {d!r} is not the label of a deadline in data/cycle_2026_27/{slug}.json")
        if not is_https(s["source_url"]):
            errors.append(f"{at}: source_url must start with https://")
        if not is_date(s["verified_on"]):
            errors.append(f"{at}: verified_on must be YYYY-MM-DD")
        if s["kind"] == "test":
            if country == "GB":
                errors.append(f"{at}: UK admissions tests come from programs.admissions_test")
            elif country == "CA":
                ca_tests += 1
    if ca_tests > 1:
        errors.append(f"{where}: a Canadian college may have at most one step of kind \"test\" (the checklist keeps only the first)")
    return errors


def load_all(src_dir=SRC_DIR, index=None):
    """-> (records by slug, errors). Every GB/CA/AU college must have exactly one file."""
    index = index if index is not None else college_index()
    records, errors = {}, []
    for path in sorted(glob.glob(os.path.join(src_dir, "*.json"))):
        fname = os.path.splitext(os.path.basename(path))[0]
        try:
            rec = read_json(path)
        except ValueError as e:
            errors.append(f"application_steps_2026_27/{fname}.json: not valid JSON ({e})")
            continue
        errs = validate(rec, fname, index)
        errors.extend(errs)
        if not errs:
            records[fname] = rec
    for slug, c in sorted(index.items()):
        if c["country"] in COUNTRIES and not os.path.exists(os.path.join(src_dir, f"{slug}.json")):
            errors.append(f"application_steps_2026_27/{slug}.json: missing (every {c['country']} college needs a steps file)")
    return records, errors


def build(records, index):
    out = {}
    for slug in sorted(records):
        r, c = records[slug], index[slug]
        out[slug] = {
            "country": c["country"],
            "researched": r["researched"],
            "admissionsUrl": r["admissions_url"],
            "steps": [{"id": s["id"], "kind": s["kind"], "name": s["name"], "courses": s["courses"],
                       "deadlineLabel": s["deadline"], "sourceUrl": s["source_url"], "verifiedOn": s["verified_on"]}
                      for s in r["steps"]],
            "courses": [{"id": build_seed.uid("prog", slug, str(p["slug"])), "slug": p["slug"], "name": p["name"],
                         "ucasCode": p.get("ucas_code"), "aLevelOffer": p.get("a_level_offer"), "ibOffer": p.get("ib_offer"),
                         "apOffer": p.get("ap_offer"), "atar": p.get("atar"), "admissionsTest": p.get("admissions_test"),
                         "applicationDeadline": p.get("application_deadline")}
                        for p in c["programs"]],
        }
    return out


def render(out):
    return json.dumps(out, ensure_ascii=False, indent=1) + "\n"


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    check = "--check" in argv
    index = college_index()
    records, errors = load_all(SRC_DIR, index)
    if errors:
        print(f"{len(errors)} problem(s) in data/application_steps_2026_27:")
        for e in errors:
            print(f"  {e}")
        return 1
    text = render(build(records, index))
    researched = sum(1 for r in records.values() if r["researched"])
    summary = f"{len(records)} universities, {researched} researched"
    if check:
        stale = [os.path.relpath(p, ROOT) for p in OUTS if not os.path.exists(p) or read_text(p) != text]
        if stale:
            print(f"{', '.join(stale)} out of date; rerun without --check")
            return 1
        print(f"OK: {summary}")
        return 0
    for p in OUTS:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print(f"wrote {len(OUTS)} files ({len(text)} bytes each, {summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
