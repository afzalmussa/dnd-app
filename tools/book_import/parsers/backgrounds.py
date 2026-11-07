"""Parse PHB backgrounds. The names are drawn as images, so these pages are read from OCR text."""
import difflib
import re

from wordfreq import zipf_frequency

import ocr
from ocr_fixes import fix_text
from parsers.classes import letters, slug

ABILITY_IDS = {"strength": "str", "dexterity": "dex", "constitution": "con",
               "intelligence": "int", "wisdom": "wis", "charisma": "cha"}
LABELS = ["Ability Scores", "Feat", "Skill Proficiencies", "Tool Proficiency", "Equipment"]
GOLD_LOOKALIKES = {"S": "5", "s": "5", "O": "0", "o": "0", "l": "1", "I": "1"}


def fix_gold(text, page, fixes):
    """'(B) SO GP' -> '(B) 50 GP': letters that stand in for digits right before 'GP'."""
    def sub(m):
        digits = "".join(GOLD_LOOKALIKES.get(c, c) for c in m.group(1))
        if digits != m.group(1):
            fixes.append({"page": page, "rule": "gold-digit", "before": m.group(0), "after": f"{digits} GP"})
        return f"{digits} GP"
    return re.sub(r"\b([0-9SOlI]{1,3}) GP\b", lambda m: sub(m) if re.search(r"\d", m.group(1)) or m.group(1) in ("SO", "OO") else m.group(0), text)


def printed_list(doc, page_no):
    """The alphabetical list under 'Sixteen backgrounds are presented', read column by column."""
    ws = doc[page_no - 1].get_text("words")
    start = next((w for w in ws if w[4] == "Sixteen"), None)
    order = next((w for w in ws if w[4] == "order:" and start and abs(w[1] - start[1]) < 30), None)
    if not (start and order):
        return []
    cols = ([], [], [])
    for w in ws:
        if w[0] >= start[0] - 10 and order[1] + 8 < w[1] < order[1] + 100 and w[2] < 560:
            cols[0 if w[0] < start[0] + 75 else 1 if w[0] < start[0] + 160 else 2].append((w[1], w[4]))
    return [t for col in cols for _, t in sorted(col)]


def parse_backgrounds(cache_dir, book, ruleset, first, last, feats, doc=None):
    """feats = [(id, name)] of imported feats; the origin feat is matched by name letters."""
    fixes, entries = [], []
    lines = []  # (text, page)
    for p in range(first, last + 1):
        c = ocr.read_cache(cache_dir, book, p)
        if c:
            for line in fix_text(c["text"], p, fixes).split("\n"):
                if line.strip():
                    lines.append((line.strip(), p))
    anchors = [i for i, (l, _) in enumerate(lines) if l.startswith("Ability Scores:")]
    slots = printed_list(doc, first) if doc is not None else []
    if slots and len(slots) != len(anchors):
        slots = []
    first_ocr = ocr.read_cache(cache_dir, book, first)
    ocr_words = [w for w in re.findall(r"\b[A-Z][a-z]{3,}\b(?![:.,;])", first_ocr["text"][first_ocr["text"].find("Sixteen"):][:400])] if first_ocr else []
    for n, a in enumerate(anchors):
        flags = []
        back = next((j for j in range(a - 1, max(a - 8, -1), -1)
                     if lines[j][0].isupper() and lines[j][0] == lines[j][0].upper() and len(re.sub(r"[^A-Z]", "", lines[j][0])) >= 4
                     and "." not in lines[j][0] and "," not in lines[j][0]), None)
        name_line, page = lines[back] if back is not None else (lines[a - 1][0], lines[a][1])
        name = name_line.title()
        if back is None:
            name = slots[n] if n < len(slots) else "?"
            flags.append(f"heading is an unreadable image; name '{name}' taken from the printed list of backgrounds by position. Confirm on the page")
            if re.search(r"[^A-Za-z]", name):
                alt = max(ocr_words, key=lambda w: difflib.SequenceMatcher(None, letters(name), letters(w)).ratio(), default="")
                if difflib.SequenceMatcher(None, letters(name), letters(alt)).ratio() >= 0.7:
                    fixes.append({"page": first, "rule": "background-name-from-ocr-list", "before": name, "after": alt})
                    name = alt
                else:
                    flags.append(f"the list prints this name garbled ('{name}')")
            page = lines[a][1]
        end = anchors[n + 1] - 1 if n + 1 < len(anchors) else len(lines)
        fields, cur = {}, None
        for l, _ in lines[a:end]:
            m = re.match(r"^(Ability Scores|Feat|Skill Proficiencies|Tool Proficiency|Equipment):\s*(.*)", l)
            if m:
                cur = m.group(1)
                fields[cur] = m.group(2)
            elif cur == "Equipment" and not re.search(r"\(B\)\s*\S+\s*GP", fields[cur]):
                fields[cur] += " " + l  # the equipment text wraps until the "(B) 50 GP" option ends
            elif cur == "Tool Proficiency" and "(see" in fields[cur] and ")" not in fields[cur]:
                fields[cur] += " " + l
            else:
                cur = None  # flavour text or the next block starts
        for label in LABELS:
            if not fields.get(label):
                flags.append(f"missing {label}")
        fields = {k: re.sub(r"(\w)- (\w)", r"\1\2", v) for k, v in fields.items()}
        if "Equipment" in fields:
            fields["Equipment"] = fix_gold(re.sub(r"\bA or 8\b", "A or B", fields["Equipment"]), page, fixes)
        abilities = [ABILITY_IDS[w] for w in re.findall(r"[a-z]+", fields.get("Ability Scores", "").lower()) if w in ABILITY_IDS]
        if len(abilities) != 3:
            flags.append(f"ability scores read as {abilities}; expected three")
        feat_text = re.sub(r"\s*\(see chapter \d+\)", "", fields.get("Feat", "")).strip()
        fm = re.match(r"^(.*?)(?:\s*\((.+)\))?$", feat_text)
        feat_name, variant = (fm.group(1), fm.group(2)) if fm else (feat_text, None)
        best = max(feats, key=lambda f: difflib.SequenceMatcher(None, letters(feat_name), letters(f[1])).ratio(), default=None)
        feat_id = None
        if best and difflib.SequenceMatcher(None, letters(feat_name), letters(best[1])).ratio() >= 0.8:
            feat_id = best[0]
        elif feat_name:
            flags.append(f"origin feat '{feat_name}' is not among the imported feats")
        skills = [s for s in re.split(r"\s+and\s+|,\s*", fields.get("Skill Proficiencies", "")) if s]
        if len(skills) != 2:
            flags.append(f"skill proficiencies read as {skills}; expected two")
        entries.append({
            "id": f"background.{slug(name)}.{book}", "kind": "background", "name": name,
            "source": {"book": book, "ruleset": ruleset, "page": page, "ocrUsed": True, "flags": flags},
            "abilityOptions": abilities, "originFeatId": feat_id, "originFeatChoice": variant,
            "skillProficiencies": skills, "toolProficiency": fields.get("Tool Proficiency") or None,
            "equipment": fields.get("Equipment") or None, "summary": "",
        })
    # A name still garbled can only be one OCR word of the list that fits alphabetically between its neighbours.
    for i, e in enumerate(entries):
        if not re.search(r"[^A-Za-z ]", e["name"]):
            continue
        before = next((entries[j]["name"] for j in range(i - 1, -1, -1) if not re.search(r"[^A-Za-z ]", entries[j]["name"])), "")
        after = next((entries[j]["name"] for j in range(i + 1, len(entries)) if not re.search(r"[^A-Za-z ]", entries[j]["name"])), "~")
        used = {x["name"].lower().rstrip("s") for x in entries}
        fits = [w for w in set(ocr_words) if before.lower() < w.lower() < after.lower()
                and w[0].lower() == e["name"][0].lower() and w.lower().rstrip("s") not in used and zipf_frequency(w.lower(), "en") >= 3.0]
        if len(fits) == 1:
            fixes.append({"page": e["source"]["page"], "rule": "background-name-by-alphabetical-order", "before": e["name"], "after": fits[0].title()})
            e["name"] = fits[0].title()
            e["id"] = f"background.{slug(e['name'])}.{book}"
            e["source"]["flags"] = [f for f in e["source"]["flags"] if "garbled" not in f]
            e["source"]["flags"].append("name matched from the OCR copy of the printed list by alphabetical position; confirm")
    return entries, fixes
