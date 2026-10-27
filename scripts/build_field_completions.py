"""Build web/lib/data/field-completions.json for the field-aware recommender.

Usage: python3 scripts/build_field_completions.py <path-to-C2024_a.csv> [--check]
  --check  build in memory and exit 1 if the committed JSON differs (nothing is written)

Source: NCES IPEDS Completions C2024_A (academic year 2023-24), https://nces.ed.gov/ipeds/datacenter/data/C2024_A.zip.
Rows used: AWLEVEL 5 (bachelor's), MAJORNUM 1 (first major), CTOTALT. CIPCODE 99 is the institution's bachelor's total.
Colleges are matched by `ipeds_unit_id` in data/colleges/*.json. Only the CIP prefixes in web/lib/fields-cips.json are
stored (that file is owned by web/lib/fields.ts); a 2-digit prefix is its family total, a 4-digit one its series total.
Zero counts are omitted. Non-US colleges get their course names under "programs" (classified in the app by keyword).
"""
import csv, glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web/lib/data/field-completions.json")
CIPS_FILE = os.path.join(ROOT, "web/lib/fields-cips.json")
SOURCE = "NCES IPEDS Completions C2024_A, first-major bachelor's degrees (AWLEVEL 5, MAJORNUM 1, CTOTALT)"
SOURCE_URL = "https://nces.ed.gov/ipeds/datacenter/data/C2024_A.zip"
YEAR = "2023-24"


def prefix_of(code, prefix):
    # "52" matches "52.0801" (family); "52.08" matches "52.0801" (series).
    return code.startswith(prefix if "." in prefix else prefix + ".")


def load_colleges():
    us, programs = {}, {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data/colleges/*.json"))):
        with open(path, encoding="utf-8") as f:
            c = json.load(f)
        slug = c["slug"]
        if c.get("country_code", "US") == "US":
            if c.get("ipeds_unit_id"):
                us[str(c["ipeds_unit_id"])] = slug
        elif c.get("programs"):
            programs[slug] = [p["name"] for p in c["programs"]]
    return us, programs


def build(csv_path):
    with open(CIPS_FILE, encoding="utf-8") as f:
        prefixes = json.load(f)
    us, programs = load_colleges()
    colleges = {}
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["AWLEVEL"] != "5" or row["MAJORNUM"] != "1":
                continue
            slug = us.get(row["UNITID"])
            if not slug:
                continue
            n = int(row["CTOTALT"] or 0)
            rec = colleges.setdefault(slug, {"total": 0, "cip": {}})
            code = row["CIPCODE"]
            if code == "99":
                rec["total"] = n
                continue
            for p in prefixes:
                if prefix_of(code, p):
                    rec["cip"][p] = rec["cip"].get(p, 0) + n
    for rec in colleges.values():
        rec["cip"] = {k: v for k, v in sorted(rec["cip"].items()) if v}
    head = {"source": SOURCE, "source_url": SOURCE_URL, "academic_year": YEAR}
    # One college per line: small diffs, still valid JSON.
    lines = ["{"]
    for k, v in head.items():
        lines.append(f"  {json.dumps(k)}: {json.dumps(v)},")
    lines.append('  "colleges": {')
    items = sorted(colleges.items())
    for i, (slug, rec) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f"    {json.dumps(slug)}: {json.dumps(rec, separators=(',', ':'))}{comma}")
    lines.append("  },")
    lines.append('  "programs": {')
    items = sorted(programs.items())
    for i, (slug, names) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f"    {json.dumps(slug)}: {json.dumps(names, ensure_ascii=False)}{comma}")
    lines.append("  }")
    lines.append("}")
    missing = sorted(set(us.values()) - set(colleges))
    return "\n".join(lines) + "\n", len(colleges), len(programs), missing


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        sys.exit(2)
    text, n_us, n_prog, missing = build(args[0])
    json.loads(text)  # sanity: the hand-assembled layout must parse
    if missing:
        print(f"no completions for {len(missing)} US college(s): {', '.join(missing)}")
    if "--check" in sys.argv:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != text:
            print(f"{os.path.relpath(OUT, ROOT)} is out of date; rerun without --check")
            sys.exit(1)
        print("OK")
        sys.exit(0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text)} bytes, {n_us} US colleges, {n_prog} with programs)")


if __name__ == "__main__":
    main()
