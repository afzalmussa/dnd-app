"""Parse magic item entries from the DMG treasure chapter.

Layout: a capitals name, then 'Wondrous item, rare (requires attunement by a spellcaster)', then the text.
"""
import re

from parsers.classes import slug
from parsers.origins import load_lines, tidy

TYPE_LINE = re.compile(
    r"^(Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous item)\s*(?:\(([^)]*)\))?\s*,\s*"
    r"(common|uncommon|rare|very rare|legendary|artifact|rarity[^(]*|varies[^(]*)\s*(?:\((requires attunement[^)]*)\)?)?\s*$",
    re.IGNORECASE)
RARITIES = {"common", "uncommon", "rare", "very rare", "legendary", "artifact"}


def parse_magic_items(cache_dir, book, ruleset, first, last):
    fixes, items = [], []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    anchors = [i for i in range(1, len(lines)) if TYPE_LINE.match(lines[i])]
    for n, a in enumerate(anchors):
        flags = []
        m = TYPE_LINE.match(lines[a])
        # A long name wraps onto a second capitals line ("AMULET OF PROOF AGAINST DETECTION" / "AND LOCATION").
        start = a - 1
        while start - 1 >= 0 and lines[start - 1].isupper() and len(lines[start - 1]) > 3 and not TYPE_LINE.match(lines[start - 1]) and a - start < 3:
            start -= 1
        raw_name = " ".join(lines[start:a])
        name = raw_name.title().replace("'S", "'s")
        if not lines[a - 1].isupper():
            flags.append(f"name line '{lines[a - 1]}' is not capitals; the name may be wrong")
        rarity = m.group(3).strip().lower()
        end = anchors[n + 1] - 1 if n + 1 < len(anchors) else len(lines)
        # the next item's name may itself be two lines
        while end - 1 > a and lines[end - 1].isupper() and len(lines[end - 1]) > 3 and n + 1 < len(anchors) and anchors[n + 1] - end < 3:
            end -= 1
        text = tidy(lines[a + 1:end])
        weight = re.search(r"weighs? (\d+|\d+/\d+|one|two|three|four|five|ten) pounds?", text)
        w = None
        if weight:
            words = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "ten": "10"}
            w = f"{words.get(weight.group(1), weight.group(1))} lb."
        if rarity not in RARITIES and not rarity.startswith(("rarity", "varies")):
            flags.append(f"rarity '{rarity}' is not one of the usual rarities")
        attune = m.group(4)
        items.append({
            "id": f"item.{slug(name)}.{book}", "kind": "item", "name": name, "category": "magic",
            "source": {"book": book, "ruleset": ruleset, "page": pages[a], "ocrUsed": pages[a] in ocr_pages, "flags": flags},
            "cost": None, "weight": w, "attunement": bool(attune), "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240],
            "text": text,
            "magic": {"itemType": m.group(1).title() if m.group(1).lower() != "wondrous item" else "Wondrous item",
                      "baseItem": (m.group(2) or None), "rarity": rarity.capitalize() if rarity in RARITIES else rarity.capitalize(),
                      "attunementRequirement": (re.sub(r"^requires attunement\s*", "", attune, flags=re.I).strip() or None) if attune else None},
        })
    return items, fixes
