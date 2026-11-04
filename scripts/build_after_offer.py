"""Validate data/after_offer_2026_27/{gb,ca,au}.json and build web/lib/data/after-offer.json.

Usage: python -I scripts/build_after_offer.py [--check]
  --check  validate and build in memory; exit 1 if any file is invalid or the committed JSON differs (nothing is written)

Each fact is a "when / how much" line shown under one after-offer step. It must carry a research_ref
("2026-11-04-<name>.md:<line>") and an `evidence` string that is an exact substring of that research line, tagged as read
from an official page. Anything the research marks snippet / inference / derived / unconfirmed stays out.
The app reads the output through web/lib/after-offer.ts. Every error names the file and the field.
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "data/after_offer_2026_27")
COLLEGES_DIR = os.path.join(ROOT, "data/colleges")
RESEARCH_DIR = os.path.join(ROOT, "docs/superpowers/research")
OUT = os.path.join(ROOT, "web/lib/data/after-offer.json")

# Mirror of AFTER_OFFER in web/lib/checklist.ts (web/lib/after-offer.test.ts checks the generated file against the real one).
AFTER_OFFER_KEYS = {
    "GB": ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_cas", "uk_visa_applied", "uk_visa_granted", "uk_accommodation"],
    "CA": ["ca_offer_accepted", "ca_deposit", "ca_pal", "ca_permit_applied", "ca_biometrics", "ca_permit_approved", "ca_housing"],
    "AU": ["au_offer_accepted", "au_deposit_oshc", "au_coe", "au_visa_applied", "au_visa_granted", "au_housing"],
}
FILES = {"GB": "gb.json", "CA": "ca.json", "AU": "au.json"}
VARIANTS = {"ca_pal": {"caq"}}
TOP_KEYS = {"country", "steps", "universities"}
UNI_KEYS = {"variants", "steps"}
FACT_KEYS = {"text", "link", "source_url", "verified_on", "research_ref", "evidence", "only_citizenship"}
REF_RE = re.compile(r"^2026-11-04-[a-z-]+\.md:\d+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CITIZEN_RE = re.compile(r"^[A-Z]{2}$")
OFFICIAL_TAGS = ("[gov]", "[uni]", "[page]", "official-scraped", "official-summary")
BANNED = ("[snippet]", "[inference]", "derived", "possibly outdated", "not found", "not confirmed", "unconfirmed", "[summary]", "[secondary]", "[agent]", "search summary")


def is_https(v):
    return isinstance(v, str) and v.startswith("https://") and len(v) > len("https://")


def read_line(ref, research_dir):
    """The research line a ref points at, as (line, error)."""
    name, _, num = ref.rpartition(":")
    path = os.path.join(research_dir, name)
    if not os.path.isfile(path):
        return None, f"research file {name} does not exist"
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    n = int(num)
    if not 1 <= n <= len(lines):
        return None, f"line {n} is outside {name} ({len(lines)} lines)"
    return lines[n - 1], None


def validate_fact(f, w, research_dir):
    if not isinstance(f, dict):
        return [f"{w}: must be an object"]
    errs = [f"{w}: unknown field {k}" for k in sorted(set(f) - FACT_KEYS)]
    errs += [f"{w}: missing field {k}" for k in sorted(FACT_KEYS - set(f))]
    if errs:
        return errs
    text = f["text"]
    if not isinstance(text, str) or not 1 <= len(text) <= 200:
        errs.append(f"{w}.text: must be 1-200 characters")
    if f["link"] is not None and not is_https(f["link"]):
        errs.append(f"{w}.link: must be null or an https URL")
    if not is_https(f["source_url"]):
        errs.append(f"{w}.source_url: must be an https URL")
    if not isinstance(f["verified_on"], str) or not DATE_RE.match(f["verified_on"]):
        errs.append(f"{w}.verified_on: must be YYYY-MM-DD")
    oc = f["only_citizenship"]
    if oc is not None and not (isinstance(oc, list) and oc and all(isinstance(c, str) and CITIZEN_RE.match(c) for c in oc)):
        errs.append(f"{w}.only_citizenship: must be null or a non-empty list of 2-letter codes")
    ref, ev = f["research_ref"], f["evidence"]
    if not isinstance(ref, str) or not REF_RE.match(ref):
        return errs + [f"{w}.research_ref: must look like 2026-11-04-<name>.md:<line>"]
    line, err = read_line(ref, research_dir)
    if err:
        return errs + [f"{w}.research_ref: {err}"]
    if not isinstance(ev, str) or not ev.strip():
        return errs + [f"{w}.evidence: required"]
    if ev not in line:
        errs.append(f"{w}.evidence: not an exact substring of {ref}")
    low = ev.lower()
    if not (any(t in low for t in OFFICIAL_TAGS) or "https://" in low):
        errs.append(f"{w}.evidence: carries no official tag ([gov], [uni], [page], official-scraped, official-summary) or https URL")
    for b in BANNED:
        if b in low:
            errs.append(f"{w}.evidence: contains {b!r}")
    # Never invent data: every number the shown text states must be in the evidence (thousands separators ignored).
    if isinstance(text, str):
        have = set(re.findall(r"\d+", ev.replace(",", "")))
        for n in re.findall(r"\d+", text.replace(",", "")):
            if n not in have:
                errs.append(f"{w}.text: number {n} does not appear in the evidence")
    return errs


def validate_steps(steps, country, w, research_dir):
    if not isinstance(steps, dict):
        return [f"{w}: must be an object"]
    errs = []
    for key, facts in steps.items():
        if key not in AFTER_OFFER_KEYS[country]:
            errs.append(f"{w}.{key}: not an after-offer step of {country}")
        if not isinstance(facts, list):
            errs.append(f"{w}.{key}: must be a list")
            continue
        for i, f in enumerate(facts):
            errs += validate_fact(f, f"{w}.{key}[{i}]", research_dir)
    return errs


def validate(rec, expected_country, slugs, research_dir=RESEARCH_DIR):
    """slugs: {college slug: country code}. Returns a list of errors."""
    if not isinstance(rec, dict):
        return ["file: must be an object"]
    errs = [f"unknown top-level field {k}" for k in sorted(set(rec) - TOP_KEYS)]
    errs += [f"missing top-level field {k}" for k in sorted(TOP_KEYS - set(rec))]
    if errs:
        return errs
    country = rec["country"]
    if country not in AFTER_OFFER_KEYS:
        return [f"country: {country!r} must be GB, CA or AU"]
    if country != expected_country:
        errs.append(f"country: {country} does not match the file ({expected_country})")
    errs += validate_steps(rec["steps"], country, "steps", research_dir)
    unis = rec["universities"]
    if not isinstance(unis, dict):
        return errs + ["universities: must be an object"]
    for slug, u in unis.items():
        w = f"universities.{slug}"
        if slugs.get(slug) != country:
            errs.append(f"{w}: no {country} college with this slug in data/colleges")
        if not isinstance(u, dict) or set(u) != UNI_KEYS:
            errs.append(f"{w}: must have exactly variants and steps")
            continue
        if not isinstance(u["variants"], dict):
            errs.append(f"{w}.variants: must be an object")
        else:
            for k, v in u["variants"].items():
                if k not in VARIANTS or v not in VARIANTS[k]:
                    errs.append(f"{w}.variants.{k}: {v!r} is not an allowed variant")
        errs += validate_steps(u["steps"], country, f"{w}.steps", research_dir)
    return errs


def camel_fact(f):
    return {"text": f["text"], "link": f["link"], "sourceUrl": f["source_url"], "verifiedOn": f["verified_on"], "onlyCitizenship": f["only_citizenship"]}


def camel_steps(steps):
    return {k: [camel_fact(f) for f in v] for k, v in steps.items() if v}


def build(records):
    out, unis = {}, {}
    for country, rec in records.items():
        out[country] = {"steps": camel_steps(rec["steps"])}
        for slug, u in rec["universities"].items():
            unis[slug] = {"variants": dict(u["variants"]), "steps": camel_steps(u["steps"])}
    out["universities"] = unis
    return out


def render(data):
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def college_countries():
    out = {}
    for p in glob.glob(os.path.join(COLLEGES_DIR, "*.json")):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        out[os.path.splitext(os.path.basename(p))[0]] = d.get("country_code", "US")
    return out


def main(argv):
    check = "--check" in argv
    slugs = college_countries()
    records, errs = {}, []
    for country, name in FILES.items():
        with open(os.path.join(SRC_DIR, name), encoding="utf-8") as f:
            rec = json.load(f)
        es = validate(rec, country, slugs)
        errs += [f"{name}: {e}" for e in es]
        if not es:
            records[country] = rec
    if errs:
        print("\n".join(errs), file=sys.stderr)
        return 1
    text = render(build(records))
    if check:
        cur = open(OUT, encoding="utf-8", newline="").read() if os.path.isfile(OUT) else None
        if cur != text:
            print(f"{OUT} is out of date; run python -I scripts/build_after_offer.py", file=sys.stderr)
            return 1
        print("ok")
        return 0
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
