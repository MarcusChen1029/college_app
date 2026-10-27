"""Build web/lib/data/outcomes.json: official graduation rates and earnings from the US Department of Education College Scorecard.

Usage: python3 -I scripts/build_outcomes.py <Most-Recent-Cohorts-Institution.csv> <Most-Recent-Cohorts-Field-of-Study.csv> [--check]
  --check  build in memory and exit 1 if the committed JSON differs (nothing is written)

Source: College Scorecard "Most Recent" data files, released 2026-10-15, https://collegescorecard.ed.gov/data/
  institution  https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip
  field study  https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_10152026.zip
Documentation: https://collegescorecard.ed.gov/assets/InstitutionDataDocumentation.pdf and .../FieldOfStudyDataDocumentation.pdf
(The raw CSVs are not committed. Download them into an empty directory outside the repo and pass their paths.)

Per US college (matched by `ipeds_unit_id` in data/colleges/*.json, so UNITID == IPEDS id):
  grad  C150_4_POOLED_SUPP  share of first-time, full-time students who finish within 150% of normal time (6 years for a
                            bachelor's), two entering classes pooled, suppressed by Scorecard for fewer than 30 students. Whole percent.
  e10   MD_EARN_WNE_P10     median earnings 10 years after starting (students who got federal aid, working, not enrolled), 2024 dollars
  e6    MD_EARN_WNE_P6      the same 6 years after starting (a newer entering cohort)
  f     field of study: bachelor's rows only (CREDLEV 3), EARN_MDN_5YR = median earnings 5 years after graduating, weighted
        by EARN_COUNT_WNE_5YR (graduates working and not enrolled). Stored per CIP prefix of web/lib/fields-cips.json
        (that file is owned by web/lib/fields.ts): prefix -> [graduates, sum of (program median x graduates)]. The sum is
        exact (integers), so web/lib/outcomes.ts can add and subtract prefixes the way fieldGrads() does for IPEDS
        completions and still get a graduates-weighted average of the programs' medians (a true median cannot be merged).
  id    the college's UNITID, for the link to its Scorecard page.
Suppressed or missing values (PS, PrivacySuppressed, NULL, NA, empty) are left out, never stored as 0. Any other
non-numeric value stops the script.
"""
import csv
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web/lib/data/outcomes.json")
CIPS_FILE = os.path.join(ROOT, "web/lib/fields-cips.json")

SOURCE = "U.S. Department of Education, College Scorecard"
SOURCE_URL = "https://collegescorecard.ed.gov/data/"
RELEASED = "2026-10-15"
FILES = {
    "institution": "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip",
    "field_of_study": "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_10152026.zip",
}
MEASURES = {
    "grad": "C150_4_POOLED_SUPP",
    "e10": "MD_EARN_WNE_P10",
    "e6": "MD_EARN_WNE_P6",
    "f": "EARN_MDN_5YR weighted by EARN_COUNT_WNE_5YR, bachelor's degrees (CREDLEV 3)",
}
MISSING = {"", "NULL", "NA", "PS", "PrivacySuppressed"}

csv.field_size_limit(10**9)


def num(value, what):
    """float, or None for a Scorecard missing/suppressed marker; anything else non-numeric is an error."""
    v = value.strip()
    if v in MISSING:
        return None
    try:
        return float(v)
    except ValueError:
        sys.exit(f"unexpected value {value!r} in {what}")


def prefix_of(code, prefix):
    # "52" matches "52.0801" (family); "52.08" matches "52.0801" (series). Same rule as build_field_completions.py.
    return code.startswith(prefix if "." in prefix else prefix + ".")


def load_colleges():
    us = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data/colleges/*.json"))):
        with open(path, encoding="utf-8") as f:
            c = json.load(f)
        if c.get("country_code", "US") == "US" and c.get("ipeds_unit_id"):
            uid = str(c["ipeds_unit_id"])
            if uid in us:
                sys.exit(f"ipeds_unit_id {uid} is used by both {us[uid]} and {c['slug']}")
            us[uid] = c["slug"]
    return us


def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def build(inst_path, fos_path):
    with open(CIPS_FILE, encoding="utf-8") as f:
        prefixes = json.load(f)
    us = load_colleges()
    colleges = {}

    for row in read_rows(inst_path):
        slug = us.get(row["UNITID"])
        if not slug:
            continue
        rec = colleges.setdefault(slug, {"id": int(row["UNITID"])})
        rate = num(row["C150_4_POOLED_SUPP"], f"C150_4_POOLED_SUPP of {slug}")
        if rate is not None:
            if not 0 <= rate <= 1:
                sys.exit(f"completion rate {rate} out of range for {slug}")
            rec["grad"] = int(round(rate * 100))
        for key, col in (("e10", "MD_EARN_WNE_P10"), ("e6", "MD_EARN_WNE_P6")):
            earn = num(row[col], f"{col} of {slug}")
            if earn is not None and earn > 0:
                rec[key] = int(round(earn))

    sums = {}  # slug -> prefix -> [sum(median * n), n]
    seen = set()
    for row in read_rows(fos_path):
        slug = us.get(row["UNITID"])
        if not slug or row["CREDLEV"] != "3":
            continue
        key = (row["UNITID"], row["CIPCODE"])
        if key in seen:
            sys.exit(f"duplicate bachelor's row for {slug} CIP {row['CIPCODE']}")
        seen.add(key)
        median = num(row["EARN_MDN_5YR"], f"EARN_MDN_5YR of {slug} {row['CIPCODE']}")
        n = num(row["EARN_COUNT_WNE_5YR"], f"EARN_COUNT_WNE_5YR of {slug} {row['CIPCODE']}")
        count = int(round(n)) if n is not None else 0
        if median is None or median <= 0 or count <= 0:
            continue
        code = row["CIPCODE"].zfill(4)
        dotted = f"{code[:2]}.{code[2:]}"
        for p in prefixes:
            if prefix_of(dotted, p):
                s = sums.setdefault(slug, {}).setdefault(p, [0.0, 0])
                s[0] += median * count
                s[1] += count
    for slug, per in sums.items():
        f = {p: [n, int(round(s))] for p, (s, n) in sorted(per.items()) if n > 0}
        if f:
            colleges[slug]["f"] = f

    # A college with only its id has nothing to show.
    colleges = {slug: rec for slug, rec in colleges.items() if len(rec) > 1}
    head = {
        "source": SOURCE,
        "source_url": SOURCE_URL,
        "released": RELEASED,
        "files": FILES,
        "measures": MEASURES,
    }
    # One college per line: small diffs, still valid JSON.
    lines = ["{"]
    for k, v in head.items():
        lines.append(f"  {json.dumps(k)}: {json.dumps(v)},")
    lines.append('  "colleges": {')
    items = sorted(colleges.items())
    for i, (slug, rec) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f"    {json.dumps(slug)}: {json.dumps(rec, separators=(',', ':'))}{comma}")
    lines.append("  }")
    lines.append("}")
    stats = {
        "us_colleges": len(us),
        "grad": sum(1 for r in colleges.values() if "grad" in r),
        "e10": sum(1 for r in colleges.values() if "e10" in r),
        "e6": sum(1 for r in colleges.values() if "e6" in r),
        "field_earnings": sum(1 for r in colleges.values() if "f" in r),
    }
    missing = sorted(set(us.values()) - set(colleges))
    return "\n".join(lines) + "\n", stats, missing


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    text, stats, missing = build(args[0], args[1])
    json.loads(text)  # sanity: the hand-assembled layout must parse
    print("coverage:", json.dumps(stats))
    if missing:
        print(f"no outcomes at all for {len(missing)} US college(s): {', '.join(missing)}")
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
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
