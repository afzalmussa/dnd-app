"""Parse spell entries from the PHB spell chapter.

Each spell looks like: NAME / "Level 2 Divination (Cleric, Wizard)" or "Evocation Cantrip (Wizard)" /
Casting Time / Range / Components / Duration / description.
"""
import difflib
import re

import ocr
from ocr_fixes import fix_text
from parsers.classes import slug

# Used only to check what the parser read, never to fill anything in.
SCHOOLS = {"Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"}
LABELS = ["Casting Time", "Range", "Components", "Duration"]
FOOTER = re.compile(r"CHAPTER\s*\d+\s*\S?\s*SPELLS|^\W*\d+\W*$", re.IGNORECASE)
LEVEL_LINE = re.compile(r"^Level\s+(\d)\s+([A-Za-z]+)\s*\((.+)\)\s*$")
CANTRIP_LINE = re.compile(r"^([A-Za-z]+)\s+Cantrip\s*\((.+)\)\s*$")
HIGHER = re.compile(r"^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\.\s*(.*)")


def tidy(lines):
    text = "\n".join(lines)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return re.sub(r"\s*\n\s*", " ", text).strip()


def read_fields(lines, start):
    """Read the four label lines from `start`; return (fields, index after the last field line)."""
    fields, current, i = {}, None, start
    while i < len(lines):
        m = re.match(r"^(Casting Time|Range|Components?|Duration):\s*(.*)", lines[i])
        if m:
            current = "Components" if m.group(1).startswith("Component") else m.group(1)
            fields[current] = [m.group(2)]
        elif current and current != "Duration" and len(fields) < 4:
            fields[current].append(lines[i])  # wrapped value line
        elif current == "Duration" and fields["Duration"] and not fields["Duration"][0].endswith(("minute", "minutes", "hour", "hours", "round", "day", "days")) and len(fields["Duration"]) == 1 and lines[i][:1].islower():
            fields[current].append(lines[i])
        else:
            break
        i += 1
    return {k: tidy(v) for k, v in fields.items()}, i


def parse_components(text):
    letters_part = text.split("(")[0]
    comp = {"v": bool(re.search(r"\bV\b", letters_part)), "s": bool(re.search(r"\bS\b", letters_part)),
            "m": bool(re.search(r"\bM\b", letters_part)), "material": None}
    m = re.search(r"\((.*)\)", text)
    if comp["m"] and m:
        comp["material"] = m.group(1)
    return comp


def parse_spells(doc, cache_dir, book, ruleset, first_page, last_page):
    fixes = []
    lines, pages, ocr_pages = [], [], set()
    for p in range(first_page, last_page + 1):
        c = ocr.read_cache(cache_dir, book, p)
        if not c:
            continue
        if c["method"] == "ocr":
            ocr_pages.add(p)
        for line in fix_text(c["text_columns"], p, fixes).split("\n"):
            if line.strip() and not FOOTER.search(line.strip()):
                lines.append(line.strip())
                pages.append(p)

    anchors = [i for i, l in enumerate(lines) if l.startswith("Casting Time:")]
    # The class list sometimes wraps onto a second line; join it back before reading.
    for i in range(len(lines) - 1):
        if "(" in lines[i] and ")" not in lines[i] and lines[i + 1].endswith(")") and "Casting Time" not in lines[i + 1]:
            lines[i] += " " + lines[i + 1]
            lines[i + 1] = ""
    keep = [i for i, l in enumerate(lines) if l]
    lines, pages = [lines[i] for i in keep], [pages[i] for i in keep]
    anchors = [i for i, l in enumerate(lines) if l.startswith("Casting Time:")]
    spells = []
    for n, a in enumerate(anchors):
        flags = []
        name_i, type_i = a - 2, a - 1
        name = lines[name_i].title() if name_i >= 0 else ""
        if not lines[name_i].isupper():
            flags.append(f"name line '{lines[name_i]}' is not capitals; name may be wrong")
        t = re.sub(r"^Level\s+[Il]\b", "Level 1", lines[type_i])
        if t != lines[type_i]:
            fixes.append({"page": pages[type_i], "rule": "spell-level-digit", "before": lines[type_i], "after": t})
        level = school = classes = None
        m = LEVEL_LINE.match(t)
        c = CANTRIP_LINE.match(t)
        if m:
            level, school, classes = int(m.group(1)), m.group(2), m.group(3)
        elif c:
            level, school, classes = 0, c.group(1), c.group(2)
        else:
            flags.append(f"type line not understood: '{t}'")
        fields, after = read_fields(lines, a)
        for label in LABELS:
            if not fields.get(label):
                flags.append(f"missing {label}")
        if school and school not in SCHOOLS:
            close = difflib.get_close_matches(school, SCHOOLS, n=1, cutoff=0.75)
            if close:
                fixes.append({"page": pages[type_i], "rule": "spell-school-fuzzy", "before": school, "after": close[0]})
                flags.append(f"school read as '{school}', matched to {close[0]}; check")
                school = close[0]
            else:
                flags.append(f"school '{school}' is not one of the eight schools")
        end = (anchors[n + 1] - 2) if n + 1 < len(anchors) else len(lines)
        body = lines[after:end]
        higher = None
        for j, l in enumerate(body):
            hm = HIGHER.match(l)
            if hm:
                higher = tidy([hm.group(2)] + body[j + 1:])
                body = body[:j]
                break
        text = tidy(body)
        ct = fields.get("Casting Time", "")
        dur = fields.get("Duration", "")
        page = pages[name_i] if name_i >= 0 else None
        spells.append({
            "id": f"spell.{slug(name)}.{book}", "kind": "spell", "name": name,
            "source": {"book": book, "ruleset": ruleset, "page": page, "ocrUsed": page in ocr_pages, "flags": flags},
            "level": level, "school": school,
            "castingTime": re.sub(r"\s*or Ritual$", "", ct) or None, "ritual": "Ritual" in ct,
            "range": fields.get("Range") or None,
            "components": parse_components(fields["Components"]) if fields.get("Components") else None,
            "duration": dur or None, "concentration": dur.startswith("Concentration"),
            "classLists": [x.strip() for x in classes.split(",")] if classes else [],
            "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240],
            "text": text, "higherLevels": higher,
        })
    return spells, fixes
