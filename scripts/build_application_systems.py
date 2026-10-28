"""Validate data/application_systems_2026_27.json, merge in each college's requirements.platforms, and build
web/lib/data/application-systems.json (which application systems each college uses).

Usage: python -I scripts/build_application_systems.py [--check]
  --check  validate and build in memory; exit 1 if anything is invalid or the committed JSON differs (nothing is written)

Sources of "college uses system":
  - data/application_systems_2026_27.json: hand-researched lists, one per system, each with an official source URL.
  - requirements.platforms in data/cycle_2026_27.json (keyed by slug) and data/cycle_2026_27/<file>.json:
    common_app -> commonapp, coalition -> coalition, uc_app -> uc; own and questbridge add nothing.
Output is keyed by the college's database slug (the "slug" field in data/colleges/<file>.json, else the file name),
like build_supplements.py. "routes" gives EVERY college in data/colleges/ exactly one application route (ROUTE_ORDER,
else "direct"): My list groups colleges by it. System keys are read from SYSTEMS in web/lib/portals.ts so the two cannot drift.
Every error names the file and the field. Nothing is written while anything is invalid.
The app reads the output through web/lib/application-systems-data.ts.
"""
import datetime, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data/application_systems_2026_27.json")
CYCLE_MAIN = os.path.join(ROOT, "data/cycle_2026_27.json")
CYCLE_DIR = os.path.join(ROOT, "data/cycle_2026_27")
COLLEGES_DIR = os.path.join(ROOT, "data/colleges")
PORTALS_TS = os.path.join(ROOT, "web/lib/portals.ts")
OUT = os.path.join(ROOT, "web/lib/data/application-systems.json")

PLATFORM_TO_SYSTEM = {"common_app": "commonapp", "coalition": "coalition", "uc_app": "uc"}
PLATFORMS_IGNORED = {"own", "questbridge"}
# A college that takes several routes is listed under the first of these it takes (most general first); none = "direct".
# Must list every kind: "route" system in web/lib/portals.ts (a test checks).
ROUTE_ORDER = ["commonapp", "coalition", "uc", "calstate", "applytexas", "ucas", "ouac", "educationplannerbc", "applyalberta", "sram", "uac", "vtac", "qtac", "satac", "tisc"]
TOP_KEYS = {"_about", "systems"}
SYSTEM_KEYS = {"source", "checked", "members"}
SYSTEM_OPTIONAL = {"notes"}


def is_date(v):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return False
    try:
        datetime.date.fromisoformat(v)
        return True
    except ValueError:
        return False


def system_keys(path=PORTALS_TS):
    """Every key: "..." entry of SYSTEMS in web/lib/portals.ts."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    start = text.index("export const SYSTEMS")
    end = text.index("\n];", start)
    return set(re.findall(r"\bkey:\s*\"([a-z0-9]+)\"", text[start:end]))


def college_slugs():
    """data/colleges file name -> the college's database slug (its "slug" field, else the file name)."""
    out = {}
    for p in glob.glob(os.path.join(COLLEGES_DIR, "*.json")):
        name = os.path.splitext(os.path.basename(p))[0]
        with open(p, encoding="utf-8") as f:
            out[name] = json.load(f).get("slug") or name
    return out


def validate(rec, keys, slugs):
    """All problems with the parsed source file, as human-readable strings (empty list = valid).
    `keys` = valid system keys; `slugs` = data/colleges file name -> database slug."""
    errors = []
    if not isinstance(rec, dict):
        return ["file: must be an object"]
    extra = sorted(set(rec) - TOP_KEYS)
    missing = sorted(TOP_KEYS - set(rec))
    if extra:
        errors.append(f"file: unknown field(s) {', '.join(extra)}")
    if missing:
        errors.append(f"file: missing field(s) {', '.join(missing)}")
        return errors
    if not isinstance(rec["_about"], str):
        errors.append("_about: must be text")
    if not isinstance(rec["systems"], dict):
        errors.append("systems: must be an object")
        return errors
    known = set(slugs) | set(slugs.values())
    for key, sysrec in sorted(rec["systems"].items()):
        w = f"systems.{key}"
        if key not in keys:
            errors.append(f"{w}: {key!r} is not a system key in SYSTEMS (web/lib/portals.ts)")
        if not isinstance(sysrec, dict):
            errors.append(f"{w}: must be an object")
            continue
        extra = sorted(set(sysrec) - SYSTEM_KEYS - SYSTEM_OPTIONAL)
        missing = sorted(SYSTEM_KEYS - set(sysrec))
        if extra:
            errors.append(f"{w}: unknown field(s) {', '.join(extra)}")
        if missing:
            errors.append(f"{w}: missing field(s) {', '.join(missing)}")
            continue
        if not isinstance(sysrec["source"], str) or not re.match(r"^https?://\S+$", sysrec["source"]):
            errors.append(f"{w}.source: must be an http(s) URL")
        if not is_date(sysrec["checked"]):
            errors.append(f"{w}.checked: must be a YYYY-MM-DD date")
        if "notes" in sysrec and not isinstance(sysrec["notes"], str):
            errors.append(f"{w}.notes: must be text")
        members = sysrec["members"]
        if not isinstance(members, list) or not members:
            errors.append(f"{w}.members: must be a non-empty list")
            continue
        seen = set()
        for i, m in enumerate(members):
            if not isinstance(m, str) or m not in known:
                errors.append(f"{w}.members[{i}]: {m!r} is not a college in data/colleges/")
                continue
            db = slugs.get(m, m)
            if db in seen:
                errors.append(f"{w}.members[{i}]: {m!r} is listed twice")
            seen.add(db)
    return errors


def platform_systems(platforms, where, errors):
    """The system keys one requirements.platforms list maps to."""
    out = []
    for p in platforms or []:
        if p in PLATFORMS_IGNORED:
            continue
        if p not in PLATFORM_TO_SYSTEM:
            errors.append(f"{where}: unknown platform {p!r}")
            continue
        out.append(PLATFORM_TO_SYSTEM[p])
    return out


def load_platforms(slugs, main_path=CYCLE_MAIN, dir_path=CYCLE_DIR):
    """(database slug -> set of system keys from requirements.platforms, errors as 'file: message')."""
    out, errors = {}, []
    known = set(slugs.values())

    def add(db, keys):
        if keys:
            out.setdefault(db, set()).update(keys)

    name = os.path.basename(main_path)
    try:
        with open(main_path, encoding="utf-8") as f:
            main = json.load(f)
    except (OSError, ValueError) as e:
        return out, [f"{name}: not valid JSON ({e})"]
    for slug, rec in main.items():
        if slug.startswith("_"):
            continue
        if slug not in known and slug not in slugs:
            errors.append(f"{name}: {slug!r} is not a college in data/colleges/")
            continue
        db = slugs.get(slug, slug)
        plats = (rec.get("requirements") or {}).get("platforms") if isinstance(rec, dict) else None
        add(db, platform_systems(plats, f"{name}: {slug}.requirements.platforms", errors))
    for path in sorted(glob.glob(os.path.join(dir_path, "*.json"))):
        fname = os.path.basename(path)
        file_slug = os.path.splitext(fname)[0]
        try:
            with open(path, encoding="utf-8") as f:
                rec = json.load(f)
        except (OSError, ValueError) as e:
            errors.append(f"{fname}: not valid JSON ({e})")
            continue
        db = slugs.get(file_slug, file_slug)
        if db not in known:
            errors.append(f"{fname}: no data/colleges/{file_slug}.json")
            continue
        plats = (rec.get("requirements") or {}).get("platforms") if isinstance(rec, dict) else None
        add(db, platform_systems(plats, f"{fname}: requirements.platforms", errors))
    return out, errors


def route_of(keys):
    """The one route a college is listed under: the first of ROUTE_ORDER it takes, else "direct"."""
    return next((r for r in ROUTE_ORDER if r in keys), "direct")


def build(rec, platforms, slugs):
    """(colleges: database slug -> sorted system keys, routes: every database slug -> route key, sources: system key -> URL)."""
    colleges = {slug: set(keys) for slug, keys in platforms.items()}
    for key, sysrec in rec["systems"].items():
        for m in sysrec["members"]:
            colleges.setdefault(slugs.get(m, m), set()).add(key)
    colleges = {slug: sorted(keys) for slug, keys in colleges.items() if keys}
    routes = {slug: route_of(colleges.get(slug, [])) for slug in sorted(set(slugs.values()) | set(colleges))}
    return colleges, routes, {k: v["source"] for k, v in rec["systems"].items()}


def render(colleges, routes, sources):
    """One college per line: small diffs, still valid JSON."""
    lines = ["{", '  "source": "data/application_systems_2026_27.json + requirements.platforms via scripts/build_application_systems.py",', '  "colleges": {']
    items = sorted(colleges.items())
    for i, (slug, keys) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f"    {json.dumps(slug)}: {json.dumps(keys, separators=(',', ':'))}{comma}")
    lines.append("  },")
    lines.append('  "routes": {')
    route_items = sorted(routes.items())
    for i, (slug, route) in enumerate(route_items):
        comma = "," if i < len(route_items) - 1 else ""
        lines.append(f"    {json.dumps(slug)}: {json.dumps(route)}{comma}")
    lines.append("  },")
    lines.append('  "sources": {')
    src_items = sorted(sources.items())
    for i, (key, url) in enumerate(src_items):
        comma = "," if i < len(src_items) - 1 else ""
        lines.append(f"    {json.dumps(key)}: {json.dumps(url, ensure_ascii=False)}{comma}")
    lines.append("  }")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    check = "--check" in sys.argv[1:]
    slugs = college_slugs()
    try:
        with open(SRC, encoding="utf-8") as f:
            rec = json.load(f)
    except (OSError, ValueError) as e:
        print(f"{os.path.basename(SRC)}: not valid JSON ({e})")
        sys.exit(1)
    name = os.path.basename(SRC)
    errors = [f"{name}: {m}" for m in validate(rec, system_keys(), slugs)]
    platforms, platform_errors = load_platforms(slugs)
    errors.extend(platform_errors)
    if errors:
        print(f"{len(errors)} problem(s) in application systems data:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    colleges, routes, sources = build(rec, platforms, slugs)
    missing = sorted(set(slugs.values()) - set(routes))
    if missing:  # build() routes every college, so this only trips if that ever changes
        print(f"no route for: {', '.join(missing)}")
        sys.exit(1)
    text = render(colleges, routes, sources)
    json.loads(text)  # sanity: the hand-assembled layout must parse
    counts = {}
    for keys in colleges.values():
        for k in keys:
            counts[k] = counts.get(k, 0) + 1
    summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "no systems"
    route_counts = {}
    for r in routes.values():
        route_counts[r] = route_counts.get(r, 0) + 1
    summary += "; routes: " + ", ".join(f"{r} {route_counts[r]}" for r in [*ROUTE_ORDER, "direct"] if r in route_counts)
    if check:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != text:
            print(f"{os.path.relpath(OUT, ROOT)} is out of date; rerun without --check")
            sys.exit(1)
        print(f"OK: {len(colleges)} colleges ({summary})")
        sys.exit(0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text)} bytes, {len(colleges)} colleges: {summary})")


if __name__ == "__main__":
    main()
