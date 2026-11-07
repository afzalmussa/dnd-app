"""Book import entry point.

Usage:
    python import_books.py --book phb24 --only classes:barbarian,cleric,wizard

Steps: survey pages (OCR where needed, cached) -> parse -> validate -> write data-pack and report.
"""
import argparse
import json
import sys
from pathlib import Path

import pymupdf

import survey
from parsers.classes import parse_class
from parsers.origins import parse_feats, parse_species
from parsers.spells import parse_spells
from report import feat_section, species_section, write_report
from validate import compare_caster_slots, validate_class, validate_feat, validate_species, validate_spell

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", required=True)
    ap.add_argument("--only", help="e.g. classes:barbarian,cleric,wizard")
    args = ap.parse_args()

    books = json.loads((HERE / "books.json").read_text(encoding="utf-8"))
    if args.book not in books:
        sys.exit(f"Unknown book '{args.book}'. Allowed: {', '.join(books)}")
    book = books[args.book]
    sections = json.loads((HERE / "sections.json").read_text(encoding="utf-8")).get(args.book, {})
    kind, _, names = (args.only or "").partition(":")
    if kind not in ("", "classes", "spells", "feats", "species"):
        sys.exit("Implemented so far: classes, spells, feats, species.")
    wanted = [n for n in names.split(",") if n] if kind == "classes" else []
    wanted = wanted or (list(sections.get("classes", {})) if kind in ("", "classes") else [])

    survey.survey(args.book)  # skips pages already cached
    doc = pymupdf.open(ROOT / "PDFs" / book["file"])
    known_skills = [s["name"] for s in json.loads((ROOT / "app/src/shared/coreRules.json").read_text(encoding="utf-8"))["skills"]]

    classes, fixes = [], []
    for name in wanted:
        s = sections["classes"][name]
        entry, class_fixes = parse_class(doc, ROOT / "ocr-cache", args.book, book["ruleset"], name,
                                         s["first"], s["last"], s["table"], known_skills)
        classes.append(entry)
        fixes += class_fixes

    spells, spell_problems = [], {}
    if kind in ("", "spells") and "spells" in sections:
        sp = sections["spells"]
        spells, spell_fixes = parse_spells(doc, ROOT / "ocr-cache", args.book, book["ruleset"], sp["first"], sp["last"])
        fixes += spell_fixes
        spell_problems = {s["id"]: validate_spell(s) for s in spells}

    feats, species, extras, extra_problems = [], [], [], {}
    if kind in ("", "feats") and "feats" in sections:
        feats, f_fixes = parse_feats(ROOT / "ocr-cache", args.book, book["ruleset"], sections["feats"]["first"], sections["feats"]["last"])
        fixes += f_fixes
        fp = {f["id"]: validate_feat(f) for f in feats}
        extras.append(feat_section(feats, fp))
        (out_dir := ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (out_dir / "feats.json").write_text(json.dumps(feats, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Feats: {len(feats)} parsed, {sum(1 for f in feats if f['source']['flags'] or fp[f['id']])} flagged")
    if kind in ("", "species") and "species" in sections:
        species, s_fixes, s_top = parse_species(ROOT / "ocr-cache", args.book, book["ruleset"], sections["species"]["first"], sections["species"]["last"])
        fixes += s_fixes
        sp_p = {s["id"]: validate_species(s) for s in species}
        extras.append(("".join(f"<p class='bad'>{p}</p>" for p in s_top)) + species_section(species, sp_p))
        (out_dir := ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (out_dir / "species.json").write_text(json.dumps(species, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Species: {len(species)} parsed, {sum(1 for s in species if s['source']['flags'] or sp_p[s['id']])} flagged")

    problems = {e["id"]: validate_class(e) for e in classes}
    for eid, extra in compare_caster_slots(classes).items():
        problems[eid] += extra

    out = ROOT / "data-pack" / args.book
    out.mkdir(parents=True, exist_ok=True)
    if classes:
        (out / "classes.json").write_text(json.dumps(classes, indent=1, ensure_ascii=False), encoding="utf-8")
    if spells:
        (out / "spells.json").write_text(json.dumps(spells, indent=1, ensure_ascii=False), encoding="utf-8")
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / f"fixes-{args.book}.json").write_text(json.dumps(fixes, indent=1, ensure_ascii=False), encoding="utf-8")
    write_report(ROOT / "reports" / f"import-report-{args.book}.html", args.book, classes, problems, fixes, spells, spell_problems, extras)
    for e in classes:
        n = len(e["source"]["flags"]) + len(problems[e["id"]])
        print(f"{e['name']}: {n} flag(s)")
    if spells:
        bad = sum(1 for x in spells if x["source"]["flags"] or spell_problems[x["id"]])
        print(f"Spells: {len(spells)} parsed, {bad} flagged")
    print(f"Report: reports/import-report-{args.book}.html")


if __name__ == "__main__":
    main()
