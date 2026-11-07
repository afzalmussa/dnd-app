"""Import the PHB multiclassing rules (pages 43 and 44) into data-pack/phb24/multiclassing.json.

Read from the pages, not from memory:
  - the prerequisite (a score of at least 13 in the primary ability of the new class and current classes)
  - which classes count fully, by half or by a third towards the spell slot table
  - the Multiclass Spellcaster table. Its scan has dropped numbers, so each row is checked against the
    full-caster class tables already imported (Cleric, Wizard, Sorcerer, Bard, Druid); a row that the
    printed table and the class tables disagree on is listed in "problems".

Usage: python multiclass.py
"""
import json
import re
from pathlib import Path

import ocr

ROOT = Path(__file__).resolve().parents[2]
BOOK = "phb24"
FIRST, LAST = 43, 44
DIGIT = {"l": "1", "I": "1", "O": "0"}


def lines_of(pages):
    out = []
    for p in pages:
        c = ocr.read_cache(ROOT / "ocr-cache", BOOK, p)
        out += [l.strip() for l in c["text_columns"].split("\n") if l.strip()]
    return out


def tokens(line):
    return ["".join(DIGIT.get(ch, ch) for ch in t) for t in line.split()]


def printed_rows(lines):
    """Rows of the Multiclass Spellcaster table as printed: [(level or None, [slots...])]."""
    start = next(i for i, l in enumerate(lines) if l.startswith("Level 1 2 3"))
    rows = []
    for l in lines[start + 1:start + 22]:
        toks = tokens(l)
        if not toks or not all(t.isdigit() for t in toks):
            break
        rows.append([int(t) for t in toks])
    return rows


def names_after(lines, marker):
    i = next(i for i, l in enumerate(lines) if marker in l)
    text = " ".join(lines[i:i + 2])
    m = re.search(r"in the (.+?) classes?", text)
    return [n.strip() for n in re.split(r",\s*(?:and\s+)?|\s+and\s+", m.group(1))] if m else []


def main():
    lines = lines_of(range(FIRST, LAST + 1))
    problems = []

    # Prerequisite
    text = " ".join(lines)
    pm = re.search(r"score\s+of at least (\d+) in the primary ability", text)
    prerequisite = {"minimumScore": int(pm.group(1)) if pm else None,
                    "rule": "At least this score in the primary ability of the new class and of each current class."}
    if not pm:
        problems.append("prerequisite score not found in the text")

    # Which classes count how much
    full = names_after(lines, "All your levels in the")
    half = names_after(lines, "Half your levels")
    third = re.search(r"One third of your (\w+) or (\w+) levels.*?if you have the (.+?) or (.+?) subclass", text)
    caster_rule = {"full": full, "half": half,
                   "third": {"classes": [third.group(1), third.group(2)], "subclasses": [third.group(3), third.group(4)]} if third else None}
    if not full or not half or not third:
        problems.append("spell slot counting rule not fully read from the text")

    # The slot table: printed rows, checked against the imported full-caster class tables
    printed = printed_rows(lines)
    classes = json.loads((ROOT / "data-pack" / BOOK / "classes.json").read_text(encoding="utf-8"))
    casters = [c for c in classes if (c.get("spellcasting") or {}).get("casterType") == "full"]
    table = []
    for level in range(1, 21):
        votes = {}
        for c in casters:
            slots = c["progression"][level - 1]["spellSlots"]
            if slots:
                key = tuple(n or 0 for n in slots[:9]) + (0,) * (9 - len(slots[:9]))
                votes[key] = votes.get(key, 0) + 1
        best = max(votes.items(), key=lambda kv: kv[1], default=(None, 0))
        if best[0] is None or best[1] < 2:
            problems.append(f"level {level}: the full-caster class tables do not agree on a slot row")
            table.append({"level": level, "slots": [0] * 9, "agreeing": best[1]})
            continue
        table.append({"level": level, "slots": list(best[0]), "agreeing": best[1]})
        row = printed[level - 1] if level - 1 < len(printed) else None
        if row:
            nums = row[1:] if level > 1 and row and row[0] == level else row  # the first row has lost its level number
            shown = [n for n in best[0] if n]
            if nums != shown[:len(nums)] or len(nums) > len(shown):
                problems.append(f"level {level}: printed row {nums} differs from the class tables {shown}")

    out = {
        "source": {"book": BOOK, "pages": [FIRST, LAST]},
        "prerequisite": prerequisite,
        "casterLevelRule": caster_rule,
        "proficiencyBonus": "Based on total character level.",
        "hitDice": "Pool dice of the same size; track different sizes separately.",
        "proficiencies": "A new class grants only some of its starting proficiencies (see each class description).",
        "slotTable": table,
        "problems": problems,
    }
    path = ROOT / "data-pack" / BOOK / "multiclassing.json"
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    from parsers.artificer import register_multiclass
    register_multiclass(ROOT)  # Tasha's Artificer counts as a half caster too (if its import has been run)
    print(f"Wrote {path}; {len(problems)} problem(s)")
    for p in problems:
        print(" -", p)
    print("full:", full, "half:", half, "third:", caster_rule["third"], "prerequisite:", prerequisite["minimumScore"])


if __name__ == "__main__":
    main()
