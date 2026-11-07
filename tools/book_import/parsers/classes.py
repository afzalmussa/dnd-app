"""Parse one class from the PHB: the trait box, the features table and the feature text."""
import re
import difflib

import ocr
from ocr_fixes import fix_text
from page_text import column_text_from_words
from parsers.tables import parse_features_table

ABILITY_IDS = {"strength": "str", "dexterity": "dex", "constitution": "con",
               "intelligence": "int", "wisdom": "wis", "charisma": "cha"}
BOX_LABELS = ["Primary Ability", "Hit Point Die", "Saving Throw", "Skill Proficiencies",
              "Weapon Proficiencies", "Armor Training", "Tool Proficiencies", "Starting Equipment"]


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def letters(text):
    """Uppercase letters only. Lets us compare headings despite stray spaces and punctuation."""
    return re.sub(r"[^A-Z]", "", text.upper())


def split_names(text):
    return [n.strip() for n in re.split(r",\s*|\s+and\s+|\s+or\s+", text) if n.strip()]


# ---- trait box -----------------------------------------------------------------------

def read_trait_box(words):
    """Return ({label: value text}, flags).

    Each label has an anchor word (its first word, in the label column). Value lines are
    given to the nearest anchor above them. The box ends where the value lines stop.
    """
    mid = 306  # PHB pages are 612 wide; the box lives in the left column
    first = next((w for w in words if w[4] == "Primary" and w[0] < mid), None)
    if not first:
        return {}, ["trait box: 'Primary Ability' not found"]
    row = sorted((w for w in words if abs(w[1] - first[1]) < 4 and w[0] < mid), key=lambda w: w[0])
    value_x = next(w[0] for w in row if w[0] > first[2] + 15) - 4

    anchors = {}
    for w in words:
        if w[0] < value_x and w[1] >= first[1] - 2:
            for label in BOX_LABELS:
                if w[4].upper() == label.split()[0].upper() and label not in anchors:
                    anchors[label] = (w[1] + w[3]) / 2
    # Value words: ignore lone border marks such as "I" or ":I".
    value_words = [w for w in words if value_x <= w[0] < mid and w[1] >= first[1] - 2
                   and not re.fullmatch(r"[:;|I]+", w[4])]
    value_words.sort(key=lambda w: (w[1] + w[3]) / 2)
    last_anchor_y = max(anchors.values(), default=0) - 4  # after the last label, only wrapped lines may follow
    lines = []
    for w in value_words:
        y = (w[1] + w[3]) / 2
        if lines and y - lines[-1]["y"] <= 4:
            lines[-1]["words"].append(w)
        elif lines and y - lines[-1]["y"] > (16 if lines[-1]["y"] >= last_anchor_y else 35):
            break  # gap below the box (rows are further apart than wrapped lines)
        else:
            lines.append({"y": y, "words": [w]})
    fields = {}
    for line in lines:
        owner = max((l for l, ay in anchors.items() if ay <= line["y"] + 4), key=lambda l: anchors[l], default=None)
        if owner:
            text = " ".join(w[4] for w in sorted(line["words"], key=lambda w: w[0]))
            fields[owner] = (fields.get(owner, "") + " " + text).strip()
    flags = [f"trait box: label '{l}' not found" for l in ("Hit Point Die", "Saving Throw", "Skill Proficiencies",
                                                           "Weapon Proficiencies", "Starting Equipment") if l not in fields]
    for label, value in fields.items():
        value = re.sub(r"(\w)- ([a-z])", r"\1\2", value)  # "Na- ture" -> "Nature"
        value = re.sub(r"\bA or 8\b", "A or B", value)    # OCR slip: B read as 8
        value = re.sub(r"(\s+[1iIl|])+$", "", value)       # stray border marks after the last word
        fields[label] = "None" if letters(value) == "NONE" else value  # "No ne" -> "None"
    return fields, flags


def repair_skill(name, known, page_no, fixes, flags):
    """A skill name with unreadable glyphs (control characters) is matched to the sheet's skill list."""
    prefix = "or " if name.startswith("or ") else ""
    bare = name[len(prefix):]
    if not re.search(r"[\x00-\x1f]", bare):
        return name
    parts = re.split(r"[\x00-\x1f]+", bare)
    pattern = re.compile("^" + ".+".join(re.escape(p) for p in parts) + "$", re.IGNORECASE)
    hits = [k for k in known if pattern.match(k)]
    if len(hits) == 1:
        fixes.append({"page": page_no, "rule": "skill-name-from-list", "before": repr(bare), "after": hits[0]})
        return prefix + hits[0]
    flags.append(f"skill name {bare!r} has unreadable characters and matches {len(hits)} known skills")
    return name


# ---- feature text -------------------------------------------------------------------

def find_heading(lines, start, name, min_ratio=0.85):
    """Index of the first line at or after `start` that is the 'LEVEL n: NAME' heading for `name`."""
    target = letters(name)
    for i in range(start, len(lines)):
        norm = letters(lines[i])
        if not norm.startswith("LEVEL"):
            continue
        tail = norm[5:]
        for cut in (0, 1, 2):  # the level digit is often read as a stray letter
            if difflib.SequenceMatcher(None, target, tail[cut:]).ratio() >= min_ratio:
                return i
    return None


def is_heading(line):
    norm = letters(line)
    if norm.startswith("LEVEL") and len(line) > 6:
        return True
    return len(norm) >= 10 and line.upper() == line and not line.endswith(".")


def tidy(lines):
    text = "\n".join(lines)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)   # words broken across lines
    return re.sub(r"\s*\n\s*", " ", text).strip()


def first_sentence(text):
    m = re.match(r"(.+?[.!?])(\s|$)", text)
    return (m.group(1) if m else text)[:240]


# ---- main entry --------------------------------------------------------------------

def parse_class(doc, cache_dir, book, ruleset, name, first_page, last_page, table_page, skills_known=()):
    fixes, flags = [], []
    words = doc[first_page - 1].get_text("words")
    cache = {p: ocr.read_cache(cache_dir, book, p) for p in range(first_page, last_page + 1)}
    ocr_used = any(c and c["method"] == "ocr" for c in cache.values())
    source = {"book": book, "ruleset": ruleset, "page": first_page, "ocrUsed": ocr_used, "flags": flags}

    # 1. trait box
    box, box_flags = read_trait_box(words)
    flags += box_flags
    hit_die = None
    if "Hit Point Die" in box:
        printed = box["Hit Point Die"].split()[0].upper()
        die_text = re.sub(r"[LI]", "1", printed)  # "Dl2" is "D12"
        m = re.match(r"D(\d+)", die_text)
        hit_die = int(m.group(1)) if m else None
        if die_text != printed:
            fixes.append({"page": first_page, "rule": "hit-die", "before": printed, "after": die_text})
    if hit_die not in (6, 8, 10, 12):
        flags.append(f"hit die read as {hit_die}; expected 6, 8, 10 or 12")
    primary = [ABILITY_IDS[w] for w in re.findall(r"[a-z]+", box.get("Primary Ability", "").lower()) if w in ABILITY_IDS]
    saves = [ABILITY_IDS[w] for w in re.findall(r"[a-z]+", box.get("Saving Throw", "").lower()) if w in ABILITY_IDS]
    if len(saves) != 2:
        flags.append(f"saving throws read as {saves}; expected two")
    skills = None
    m = re.match(r"Choose\s+(\w+):\s*(.+)", box.get("Skill Proficiencies", ""))
    if m:
        count = {"2": 2, "3": 3, "4": 4, "ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4}.get(m.group(1).upper())
        skills = {"count": count, "from": split_names(m.group(2))}
        if count is None:
            flags.append(f"skill choice count unreadable: '{m.group(1)}'")
    else:
        flags.append("skill choices not read from the trait box")
    if skills:
        skills["from"] = [re.sub(r"^or ", "", repair_skill(n, skills_known, first_page, fixes, flags)) for n in skills["from"]]

    # 2. features table
    table = parse_features_table(doc[table_page - 1].get_text("words"), table_page)
    flags += table["flags"]
    fixes += table["fixes"]
    slot_cols = sorted((c["name"] for c in table["columns"] if c["name"].isdigit()), key=int)
    other_cols = [c["name"] for c in table["columns"] if not c["name"].isdigit()]
    progression = []
    for r in table["rows"]:
        feats = [f for f in re.split(r",\s*", r["featuresPrinted"]) if f]
        progression.append({
            "level": r["level"],
            "proficiencyBonus": r["proficiencyBonus"],
            "featuresPrinted": feats,
            "columns": {c: r["cells"].get(c) for c in other_cols},
            "spellSlots": [r["cells"].get(c) for c in slot_cols] if slot_cols else None,
        })

    # 3. feature text, in table order
    lines = []
    for p in range(first_page, last_page + 1):
        if cache[p]:
            lines += fix_text(cache[p]["text_columns"], p, fixes).split("\n")
    ordered = [(row["level"], f) for row in progression for f in row["featuresPrinted"]
               if f.lower() != "subclass feature"]
    positions, cursor = [], 0
    for level, fname in ordered:
        idx = find_heading(lines, cursor, fname)
        note = None
        if idx is None and not any(p[1] == fname for p in positions):
            idx = find_heading(lines, cursor, fname, min_ratio=0.7)
            note = "heading matched loosely; check the text" if idx is not None else None
        if idx is None and not any(p[1] == fname for p in positions):
            flags.append(f"feature '{fname}' (level {level}): heading not found in the text")
        if idx is not None:
            cursor = idx + 1
        positions.append((level, fname, idx, note))
    features, by_name = [], {}
    for level, fname, idx, note in positions:
        text, fflags = "", []
        if idx is not None:
            end = next((j for j in range(idx + 1, len(lines)) if is_heading(lines[j])), len(lines))
            text = tidy(lines[idx + 1:end])
            if note:
                fflags.append(note)
        elif fname in by_name:
            text = by_name[fname]["text"]  # a repeat of an earlier feature (e.g. Ability Score Improvement)
        else:
            fflags.append("feature text not found")
        features.append({
            "id": f"feature.{slug(name)}.{slug(fname)}.{book}",
            "name": fname, "level": level,
            "summary": first_sentence(text), "text": text,
            "source": {**source, "flags": fflags},
        })
        by_name.setdefault(fname, features[-1])

    # 4. fields worked out from the table and text
    subclass_level = next((r["level"] for r in progression
                           if any(f.lower().endswith("subclass") for f in r["featuresPrinted"])), None)
    spellcasting = None
    if slot_cols:
        top = max((i + 1 for i in range(len(slot_cols))
                   if any(r["spellSlots"] and r["spellSlots"][i] for r in progression)), default=0)
        caster = "full" if top == 9 else "half" if top == 5 else "third" if top == 4 else None
        spellcasting = {"ability": None, "casterType": caster, "spellListId": f"spelllist.{slug(name)}.{book}"}
        sc = next((f for f in features if f["name"].lower().startswith("spellcasting")), None)
        if sc:
            m = re.search(r"(\w+) is your spellcasting ability", sc["text"])
            if m and m.group(1).lower() in ABILITY_IDS:
                spellcasting["ability"] = ABILITY_IDS[m.group(1).lower()]
        if not spellcasting["ability"]:
            flags.append("spellcasting ability not found in the Spellcasting feature text")

    entry = {
        "id": f"class.{slug(name)}.{book}", "kind": "class", "name": name.title(), "source": source,
        "summary": "", "hitDie": hit_die, "primaryAbilities": primary, "savingThrows": saves,
        "skillChoices": skills,
        "weaponProficiencies": [box["Weapon Proficiencies"]] if box.get("Weapon Proficiencies") else [],
        "armorTraining": [box["Armor Training"]] if box.get("Armor Training") else [],
        "toolProficiencies": [box["Tool Proficiencies"]] if box.get("Tool Proficiencies") else [],
        "startingEquipment": box.get("Starting Equipment", ""),
        "subclassLevel": subclass_level, "spellcasting": spellcasting,
        "columnNames": other_cols, "progression": progression, "features": features,
        "traitBoxPrinted": box,
    }
    return entry, fixes
