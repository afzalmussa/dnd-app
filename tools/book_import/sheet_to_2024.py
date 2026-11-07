"""Compare the players' 2014 Aurora sheets with the 2024 rules, using the imported data pack.

Reads PDFs/<name>.pdf form fields (local only) and writes reports/sample-characters-2024.md.
It lists what changes under the 2024 PHB and which choices only the player can make.
The report holds player names, so it stays in the git-ignored reports folder.

Usage: python sheet_to_2024.py "Auriviel Inferno" "Thrandur Lorgin" "Ordizon"
"""
import difflib
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
CLASS_NAMES = ("Barbarian", "Cleric", "Wizard")


def read_fields(pdf):
    fields = {}
    for page in pymupdf.open(pdf):
        for w in page.widgets() or []:
            if w.field_value not in (None, "", "Off"):
                fields.setdefault(w.field_name, w.field_value)
    return fields


def load(book, kind):
    f = ROOT / "data-pack" / book / f"{kind}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def core(name):
    """'School of Divination' -> 'divination', 'Path of the Wild Heart' -> 'wild heart'."""
    return re.sub(r"^(school of|path of the|path of|college of|circle of the|domain)\s+", "", name.lower()).replace(" domain", "").strip()


def best_subclass(name, subclasses):
    def score(a, b):  # "divination" and "diviner" share their first five letters, so they count as the same school
        return 0.8 if len(a) >= 5 and a[:5] == b[:5] else difflib.SequenceMatcher(None, a, b).ratio()

    scored = [(score(core(name), core(s["name"])), s) for s in subclasses]
    ratio, hit = max(scored, key=lambda t: t[0], default=(0, None))
    return hit if ratio >= 0.6 else None


def report_for(pdf, classes, subclasses):
    f = read_fields(pdf)
    build = f.get("details_build", "")
    m = re.match(r"Level (\d+) (.+?) (Barbarian|Cleric|Wizard)(?:,\s*(.+))?$", build)
    out = [f"## {f.get('details_character_name', pdf.stem)} ({f.get('details_player', '?')})", f"Sheet: {build}; background {f.get('details_background')}", ""]
    if not m:
        return out + ["Build line not understood.", ""]
    level, species, cname, sub = int(m.group(1)), m.group(2), m.group(3), m.group(4) or ""
    cls = next(c for c in classes if c["name"] == cname)
    row = cls["progression"][level - 1]

    out.append("### What changes under the 2024 rules")
    out.append(f"- Species ({species}): ability score increases are ignored; only the background's increases count (PHB p.37).")
    out.append(f"- Background ({f.get('details_background')}): from an older book, so it has no ability scores. Choose one score +2 and another +1, or three scores +1 each (max 20), and an Origin feat of your choice (PHB p.37).")
    out.append("- Ability scores on the sheet include 2014 species increases; the player must re-enter base scores. The sheet's 'score' and 'modifier' fields are swapped in the Aurora export.")
    out.append(f"- Class table at level {level} from the imported 2024 {cname}: proficiency bonus +{row['proficiencyBonus']}, "
               + ", ".join(f"{k} {v}" for k, v in row["columns"].items() if v is not None)
               + (f", spell slots {[s for s in row['spellSlots'] if s]}" if row["spellSlots"] else "") + ".")
    sheet_pb = f.get("details_proficiency_bonus")
    out.append(f"- Sheet proficiency bonus {sheet_pb}: " + ("matches." if sheet_pb == f"+{row['proficiencyBonus']}" else "DOES NOT match the 2024 table."))
    prepared_sheet = f.get("spellcasting_prepare:%s:1" % cname)
    if prepared_sheet and "Prepared Spells" in row["columns"]:
        out.append(f"- Prepared spells: sheet says {prepared_sheet}, the 2024 {cname} table gives {row['columns']['Prepared Spells']} at level {level}.")
    gained = [(r["level"], ", ".join(r["featuresPrinted"])) for r in cls["progression"][:level] if r["featuresPrinted"]]
    out.append("- 2024 class features up to this level: " + "; ".join(f"L{lv} {names}" for lv, names in gained))
    if cname == "Cleric":
        out.append("- Cleric: Divine Order choice at level 1, Blessed Strikes at level 7 replaces Divine Strike (an older subclass's option is used only if chosen for Blessed Strikes, PHB p.70).")

    out.append("")
    out.append("### Subclass")
    hit = best_subclass(sub, subclasses) if sub else None
    if not sub:
        out.append("- None on the sheet.")
    elif hit:
        feats = ", ".join(f"L{x['level']} {x['name']}" for x in hit["features"] if x["level"] <= level)
        out.append(f"- '{sub}' matches imported subclass '{hit['name']}' ({hit['source']['book']}, {hit['source']['ruleset']}): {feats}.")
        late = [x["name"] for x in hit["features"] if x.get("printedLevel", x["level"]) < 3]
        if late:
            out.append(f"- Table rule: {', '.join(late)} are printed below level 3 and are granted at level 3.")
        if hit["source"]["flags"] or any(x["source"]["flags"] for x in hit["features"]):
            out.append("- The import flagged part of this subclass; check the report before relying on it.")
    else:
        out.append(f"- '{sub}' is not in the imported books (it is probably from the 2014 PHB, which is not imported).")
    out.append("")
    out.append("### Choices only the player can make")
    out.append("- Background ability increases (+2/+1 or +1/+1/+1) and Origin feat.")
    out.append("- Weapon Mastery weapons" if cname == "Barbarian" else "- Prepared spells under the 2024 counts" if cname != "Barbarian" else "")
    if cname == "Wizard":
        out.append("- Spellbook: 2024 Wizards start with six level 1 spells and add two per level.")
    out.append("")
    return out


def main(names):
    classes = load("phb24", "classes")
    subclasses = load("phb24", "subclasses") + load("xge", "subclasses") + load("tce", "subclasses")
    lines = ["# Sample characters under the 2024 rules", "", "Generated from the local sheets and the data pack. Contains player names; do not commit.", ""]
    for name in names:
        lines += report_for(ROOT / "PDFs" / f"{name}.pdf", classes, subclasses)
    out = ROOT / "reports" / "sample-characters-2024.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["Auriviel Inferno", "Thrandur Lorgin", "Ordizon"])
