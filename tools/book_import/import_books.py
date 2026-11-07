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
from parsers.classes import letters, parse_class, slug
from parsers.backgrounds import parse_backgrounds
from parsers.gear import parse_gear, parse_gear_table
from parsers.equipment import parse_armor, parse_weapons
from parsers.legacy import parse_legacy_feats, parse_subclasses_2014
from parsers.origins import parse_feats, parse_species
from parsers.spells import parse_spells
from parsers.subclasses import parse_subclasses
from report import background_section, feat_section, item_section, species_section, subclass_section, write_report
from validate import compare_caster_slots, fill_slots_by_agreement, validate_background, validate_class, validate_feat, validate_item, validate_species, validate_subclass, validate_spell

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
    if kind not in ("", "classes", "spells", "feats", "species", "subclasses", "backgrounds", "equipment"):
        sys.exit("Implemented so far: classes, subclasses, spells, feats, species, backgrounds, equipment.")
    wanted = [n for n in names.split(",") if n] if kind == "classes" else []
    wanted = wanted or (list(sections.get("classes", {})) if kind in ("", "classes") else [])

    survey.survey(args.book, force_ocr=set(sections.get("force_ocr", [])))  # skips pages already cached
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

    if kind in ("", "backgrounds") and "backgrounds" in sections:
        feat_pairs = [(f["id"], f["name"]) for f in feats] or [
            (f["id"], f["name"]) for f in json.loads((ROOT / "data-pack" / args.book / "feats.json").read_text(encoding="utf-8"))]
        bgs, b_fixes = parse_backgrounds(ROOT / "ocr-cache", args.book, book["ruleset"], sections["backgrounds"]["first"], sections["backgrounds"]["last"], feat_pairs, doc)
        fixes += b_fixes
        bp = {b["id"]: validate_background(b) for b in bgs}
        extras.append(background_section(bgs, bp))
        (ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (ROOT / "data-pack" / args.book / "backgrounds.json").write_text(json.dumps(bgs, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Backgrounds: {len(bgs)} parsed, {sum(1 for b in bgs if b['source']['flags'] or bp[b['id']])} flagged")
    if kind in ("", "equipment") and "equipment" in sections:
        damage_types = {(d["name"] if isinstance(d, dict) else d).lower() for d in json.loads((ROOT / "app/src/shared/coreRules.json").read_text(encoding="utf-8"))["damageTypes"]}
        items = []
        w, w_fixes, w_err = parse_weapons(doc, ROOT / "ocr-cache", args.book, book["ruleset"], sections["equipment"]["weapons"], damage_types)
        a, a_fixes, a_err = parse_armor(doc, ROOT / "ocr-cache", args.book, book["ruleset"], sections["equipment"]["armor"])
        tools, t_fixes = parse_gear(ROOT / "ocr-cache", args.book, book["ruleset"], "tool", *sections["equipment"]["tools"])
        gear, g_fixes = parse_gear(ROOT / "ocr-cache", args.book, book["ruleset"], "gear", *sections["equipment"]["gear"])
        # The Adventuring Gear table gives each gear item's weight (and a second copy of its cost to check).
        table_fixes = []
        table = parse_gear_table(doc, sections["equipment"]["gear_table"], table_fixes)
        have = {letters(g["name"]): g for g in gear}
        orphans = table.pop("__orphans__", [])
        for o in orphans:
            # A table row whose name the scan lost: the only gear entry missing from the table that sorts between its neighbours.
            lo, hi = letters(o["after"] or ""), letters(o["before"] or "ZZZZ")
            fits = [g for k, g in have.items() if k not in {letters(t) for t in table} and lo < k < hi]
            if len(fits) == 1:
                table[fits[0]["name"]] = {"weight": o["weight"], "cost": o["cost"], "weightGarbled": False, "byPosition": True}
        for tname, row in table.items():
            g = have.get(letters(tname))
            if g is None:
                g = {"id": f"item.{slug(tname)}.{args.book}", "kind": "item", "name": tname, "category": "gear",
                     "source": {"book": args.book, "ruleset": book["ruleset"], "page": sections["equipment"]["gear_table"], "ocrUsed": False,
                                "flags": ["only in the Adventuring Gear table; no description entry was found"]},
                     "cost": row["cost"], "weight": None, "attunement": False, "summary": "", "text": ""}
                gear.append(g)
                have[letters(tname)] = g
            g["weight"] = row["weight"] if row["weight"] != "Varies" else None
            g["weightNote"] = "Varies" if row["weight"] == "Varies" else ("blank in the table (negligible)" if row["weight"] is None and not row["weightGarbled"] else None)
            if row.get("byPosition"):
                g["source"]["flags"].append("the table row's name was lost in the scan; matched to this item by alphabetical position. Check the page")
            if row["weightGarbled"]:
                g["source"]["flags"].append("weight is garbled in the scan; check page " + str(sections["equipment"]["gear_table"]))
            if g["cost"] and row["cost"] and g["cost"] != row["cost"]:
                g["source"]["flags"].append(f"cost is {g['cost']} in the entry but {row['cost']} in the table; check the page")
        items, fixes = w + a + tools + gear, fixes + w_fixes + a_fixes + t_fixes + g_fixes + table_fixes
        ip = {i["id"]: validate_item(i) for i in items}
        extras.append("".join(f"<p class='bad'>{e}</p>" for e in w_err + a_err) + item_section(items, ip))
        (ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (ROOT / "data-pack" / args.book / "items.json").write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Equipment (weapons, armor, tools, gear): {len(items)} parsed, {sum(1 for i in items if i['source']['flags'] or ip[i['id']])} flagged")

    # 2014 books (Xanathar's, Tasha's): subclasses are matched to the PHB class of the same name.
    phb_classes = {}
    phb_file = ROOT / "data-pack" / "phb24" / "classes.json"
    if phb_file.exists():
        phb_classes = {c["id"]: c for c in json.loads(phb_file.read_text(encoding="utf-8"))}
    if kind in ("", "subclasses") and "legacy_subclasses" in sections:
        subs, sub_problems, top = [], {}, []
        for s_ in sections["legacy_subclasses"]:
            found, sub_fixes, errs = parse_subclasses_2014(ROOT / "ocr-cache", args.book, book["ruleset"], s_["class"].title(), s_["article"], s_["first"], s_["last"], s_.get("names"))
            subs += found
            fixes += sub_fixes
            top += errs
            for sub in found:
                cls = phb_classes.get(sub["classId"])
                sub_problems[sub["id"]] = validate_subclass(sub, cls) if cls else ["PHB class not imported yet; levels not checked"]
        extras.append("".join(f"<p class='bad'>{e}</p>" for e in top) + subclass_section(subs, sub_problems))
        (ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (ROOT / "data-pack" / args.book / "subclasses.json").write_text(json.dumps(subs, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Subclasses: {len(subs)} parsed, {sum(1 for x in subs if x['source']['flags'] or sub_problems[x['id']] or any(f['source']['flags'] for f in x['features']))} with flags")
    if kind in ("", "feats") and "legacy_feats" in sections:
        lf, lf_fixes = parse_legacy_feats(ROOT / "ocr-cache", args.book, book["ruleset"], sections["legacy_feats"]["first"], sections["legacy_feats"]["last"])
        fixes += lf_fixes
        # 2024 PHB: "the versions of things in this book replace versions from older books".
        # A legacy feat with the same name as a 2024 feat is marked as replaced by it.
        phb_feats_file = ROOT / "data-pack" / "phb24" / "feats.json"
        if phb_feats_file.exists():
            phb_feats = json.loads(phb_feats_file.read_text(encoding="utf-8"))
            for f in lf:
                same = next((p_ for p_ in phb_feats if letters(p_["name"]) == letters(f["name"])), None)
                f["supersededBy"] = same["id"] if same else None
                if same:
                    f["source"]["flags"].append(f"replaced by the 2024 PHB feat {same['name']}; the 2024 version is the one to use")
        extras.append(feat_section(lf, {}))
        (ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (ROOT / "data-pack" / args.book / "feats.json").write_text(json.dumps(lf, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Feats: {len(lf)} parsed, {sum(1 for f in lf if f['source']['flags'])} flagged")

    if classes and kind in ("", "classes", "subclasses"):
        subs, sub_problems, top = [], {}, []
        for cls, name in zip(classes, wanted):
            s_ = sections["classes"][name]
            found, sub_fixes, errs = parse_subclasses(ROOT / "ocr-cache", args.book, book["ruleset"], cls["name"], s_["first"], s_["last"])
            subs += found
            fixes += sub_fixes
            top += errs
            for sub in found:
                sub_problems[sub["id"]] = validate_subclass(sub, cls)
        extras.append("".join(f"<p class='bad'>{e}</p>" for e in top) + subclass_section(subs, sub_problems))
        (ROOT / "data-pack" / args.book).mkdir(parents=True, exist_ok=True)
        (ROOT / "data-pack" / args.book / "subclasses.json").write_text(json.dumps(subs, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Subclasses: {len(subs)} parsed, {sum(1 for x in subs if x['source']['flags'] or sub_problems[x['id']])} flagged")

    fill_slots_by_agreement(classes, fixes)
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
