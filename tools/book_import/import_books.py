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
from report import write_report
from validate import compare_caster_slots, validate_class

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
    kind, _, names = (args.only or "classes:").partition(":")
    wanted = [n for n in names.split(",") if n] or list(sections.get("classes", {}))
    if kind != "classes":
        sys.exit("Only 'classes' is implemented so far.")

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

    problems = {e["id"]: validate_class(e) for e in classes}
    for eid, extra in compare_caster_slots(classes).items():
        problems[eid] += extra

    out = ROOT / "data-pack" / args.book
    out.mkdir(parents=True, exist_ok=True)
    (out / "classes.json").write_text(json.dumps(classes, indent=1, ensure_ascii=False), encoding="utf-8")
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / f"fixes-{args.book}.json").write_text(json.dumps(fixes, indent=1, ensure_ascii=False), encoding="utf-8")
    write_report(ROOT / "reports" / f"import-report-{args.book}.html", args.book, classes, problems, fixes)
    for e in classes:
        n = len(e["source"]["flags"]) + len(problems[e["id"]])
        print(f"{e['name']}: {n} flag(s)")
    print(f"Report: reports/import-report-{args.book}.html")


if __name__ == "__main__":
    main()
