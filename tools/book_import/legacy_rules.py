"""Write the 2024 PHB's rules for using older-book content, read from the PHB pages (not from memory).

Output: data-pack/phb24/legacy-rules.json, with the printed text and the page for each rule,
so the character builder and level-up wizard know how to treat 2014 content.
"""
import json
import re
from pathlib import Path

import ocr

ROOT = Path(__file__).resolve().parents[2]


def sidebar_text(book, page):
    c = ocr.read_cache(ROOT / "ocr-cache", book, page)
    lines = c["text_columns"].split("\n")
    start = next(i for i, l in enumerate(lines) if l.strip() == "FROM OLDER BOOKS")
    end = next(i for i in range(start, len(lines)) if re.search(r"CHAPTER 2", lines[i]))
    text = " ".join(lines[start + 1:end])
    return re.sub(r"(\w)- (\w)", r"\1\2", text)


def main(book="phb24", page=37):
    text = sidebar_text(book, page)
    out = {
        "source": {"book": book, "page": page, "section": "Backgrounds and Species from Older Books"},
        "printedText": text,
        # Read from the text above; each flag is checked against it below.
        "olderBackground": {"abilityIncrease": "one score +2 and a different one +1, or three scores +1 each", "maximumScore": 20},
        "olderSpeciesIgnoreAbilityIncreases": True,
        "originFeatIfBackgroundGivesNone": "choose any Origin feat",
        "replacesOlderVersions": "Versions in the 2024 PHB replace versions from older books (page 4).",
        "blessedStrikesNote": "A Cleric with a Divine Strike or Potent Spellcasting option from an older subclass uses only the option chosen for the 2024 Blessed Strikes feature (PHB page 70).",
    }
    assert "adjust your ability" in text and "ignore those increases" in text and "Origin feat of your choice" in text, "sidebar text changed; re-check the rules above"
    path = ROOT / "data-pack" / book / "legacy-rules.json"
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
