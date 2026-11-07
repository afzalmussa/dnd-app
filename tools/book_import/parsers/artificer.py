"""Parse the Artificer from Tasha's Cauldron of Everything (a 2014 class, so legacy).

Pages in this layout:
  - the class table and trait box (the cleaned text columns of the table page)
  - class features: a capitals heading followed by a "3rd-level artificer feature" line
  - the four Artificer Specialists, each feature heading followed by "3rd-level Alchemist feature"
  - the Artificer spell list (a two-column list, read by matching known spell names)
Nothing here is typed from memory: every number and word comes from the pages.
"""
import json
import re

import ocr
from parsers.classes import letters, slug
from parsers.origins import load_lines, tidy

NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4}
MARKER = re.compile(r"^((?:\d\s?){1,2})(?:st|nd|rd|th)-level\s+(\w[\w ]*?)\s+feature$", re.IGNORECASE)
ROW = re.compile(r"^((?:\d\s?){1,2})(?:st|nd|rd|th)\s+\+(\d)\s*(.*)$")
SMALL_WORDS = {"of", "the", "for", "and", "to", "in", "a", "an"}
HEADING_FIXES = {"THE RIGHT TOOL FOR THE OB": "The Right Tool for the Job", "SPELL- STORING ITEM": "Spell-Storing Item"}
SPECIALISTS = ["Alchemist", "Armorer", "Artillerist", "Battle Smith"]
STOP_LINES = {"ARTIFICER SPECIALISTS", "ARTIFICER INFUSIONS", "TASHA", "TASHA'S"} | {s.upper() for s in SPECIALISTS}


def title(heading):
    if heading in HEADING_FIXES:
        return HEADING_FIXES[heading]
    words = re.sub(r"\s+", " ", heading).title().split(" ")
    return " ".join(w.lower() if i and w.lower() in SMALL_WORDS else w for i, w in enumerate(words)).replace("'S", "'s")


def page_lines(cache_dir, book, page):
    c = ocr.read_cache(cache_dir, book, page)
    return [l.strip() for l in c["text_columns"].replace("\xad", "-").split("\n") if l.strip()]


def number(token):
    return int(token.replace(" ", ""))


# ---- the class table and trait box -----------------------------------------------------

def read_table(lines, flags):
    """Rows of the Artificer table. The feature names and Infusions Known come from the left part; the
    other columns come from the numbers-only block printed after it (items, cantrips, then slots)."""
    rows, i = [], 0
    while i < len(lines):
        m = ROW.match(lines[i])
        if m:
            level, bonus, rest = number(m.group(1)), int(m.group(2)), m.group(3).strip()
            if rest.endswith(",") and i + 1 < len(lines):
                rest += " " + lines[i + 1]  # a feature list that wraps onto a second line
                i += 1
            infusions = re.search(r"(?:^|\s)(\d(?: ?\d)?)$", rest)
            known = number(infusions.group(1)) if infusions else 0
            names = rest[:infusions.start()].strip() if infusions else rest
            rows.append({"level": level, "bonus": bonus, "features": [n.strip() for n in names.split(",") if n.strip()], "infusions": known})
        i += 1
    start = next((k for k, l in enumerate(lines) if l.startswith("Items Known")), None)
    nums = []
    if start is not None:
        for l in lines[start + 1:]:
            if re.fullmatch(r"\d(?: \d)*", l):
                nums.append([int(t) for t in l.split()])
            elif nums:
                break
    if len(rows) != 20 or len(nums) != 20:
        flags.append(f"table: read {len(rows)} level rows and {len(nums)} number rows; both should be 20")
        return []
    out = []
    for k, (row, n) in enumerate(zip(rows, nums)):
        # level 1 has no Infused Items column value, so only cantrips and slots are printed
        items, cantrips, slots = (0, n[0], n[1:]) if k == 0 else (n[0], n[1], n[2:])
        out.append({"level": row["level"], "proficiencyBonus": row["bonus"], "featuresPrinted": row["features"],
                    "columns": {"Infusions Known": row["infusions"], "Infused Items": items, "Cantrips": cantrips},
                    "spellSlots": (slots + [None] * 5)[:5]})
    return out


def read_trait_box(lines, known_skills, flags):
    text = "\n".join(lines)
    text = re.sub(r"-\n(?=[a-z])", "", text)  # a word broken across lines ("arti-\nsan's")

    def field(label, stop):
        m = re.search(label + r":\s*(.+?)(?=\n(?:" + stop + r")|\Z)", text, re.S)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    armor = field("Armor", "Weapons:")
    weapons = field("Weapons", "Tools:")
    tools = field("Tools", "Saving Throws:")
    saves = field("Saving Throws", "Skills:")
    skills = field("Skills", "The secrets|\\Z")
    hit = re.search(r"Hit Dice:\s*[1lI]d(\d+)", text)
    if not (armor and weapons and tools and saves and skills and hit):
        flags.append("trait box: some lines were not found")
    ids = {"strength": "str", "dexterity": "dex", "constitution": "con", "intelligence": "int", "wisdom": "wis", "charisma": "cha"}
    save_ids = [ids[w] for w in re.findall(r"[A-Za-z]+", saves.lower()) if w in ids]
    count_word = re.match(r"Choose (\w+)", skills)
    options = [s for s in known_skills if s.lower().replace(" ", "") in skills.lower().replace(" ", "").replace("-", "")]
    start = text.find("STARTING EQUIPMENT")
    end = text.find("MULTI", start)
    equipment = re.sub(r"\s+", " ", text[start + len("STARTING EQUIPMENT"):end]).strip() if start >= 0 and end > start else ""
    return {
        "hitDie": int(hit.group(1)) if hit else None, "savingThrows": save_ids,
        "skillChoices": {"count": NUMBER_WORDS.get(count_word.group(1).lower(), 0) if count_word else 0, "from": options},
        "weaponProficiencies": [weapons] if weapons else [], "armorTraining": [armor] if armor else [],
        "toolProficiencies": [tools] if tools else [], "startingEquipment": equipment,
        "traitBoxPrinted": {"Armor": armor, "Weapons": weapons, "Tools": tools, "Saving Throws": saves, "Skills": skills}}


# ---- feature text ----------------------------------------------------------------------

def split_features(lines, pages, owner_class, book, ruleset, ocr_pages):
    """Every heading that sits directly above a 'Nth-level <owner> feature' line, with the text below it."""
    heads = []
    for i in range(1, len(lines)):
        m = MARKER.match(lines[i])
        if m and lines[i - 1].isupper():
            heads.append((i - 1, i, number(m.group(1)), m.group(2).strip()))
    out = []
    for n, (h, marker, level, owner) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        stop = next((j for j in range(marker + 1, end) if lines[j].upper() in STOP_LINES), end)
        body = lines[marker + 1:stop]
        out.append({"owner": owner, "level": level, "heading": lines[h], "body": body, "page": pages[h], "ocr": pages[h] in ocr_pages})
    return out


def build_features(items, class_id, book, ruleset):
    features = []
    for it in items:
        name = title(it["heading"])
        text = re.sub(r"­\s*", "", tidy(it["body"]))  # a word broken at a line end (soft hyphen)
        flags = []
        if it["heading"] in HEADING_FIXES:
            flags.append(f"heading read as '{it['heading']}'; corrected to '{name}'")
        features.append({
            "id": f"feature.{slug(it['owner'])}.{slug(name)}.{book}", "name": name, "level": it["level"], "printedLevel": it["level"],
            "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240], "text": text,
            "source": {"book": book, "ruleset": ruleset, "page": it["page"], "ocrUsed": it["ocr"], "flags": flags}})
    return features


# ---- spell list ------------------------------------------------------------------------

def assemble(target, words):
    """Words (each used once, in any order) whose letters joined spell `target`, or None."""
    if not target:
        return []
    for i, w in enumerate(words):
        if w and target.startswith(w):
            rest = assemble(target[len(w):], words[:i] + words[i + 1:])
            if rest is not None:
                return [w] + rest
    return None


def read_spell_list(lines, spells, flags):
    """Ids of the spells in the printed Artificer list. Spell names already imported are matched on their
    letters only, so a name the scan split ("Prest Idi Gitati on") still matches the printed "Prestidigitation"."""
    start = next((i for i, l in enumerate(lines) if l.upper().startswith("ARTIFICER SPELL LIST")), None)
    if start is None:
        flags.append("spell list: heading not found")
        return []
    first = next((i for i in range(start, len(lines)) if letters(lines[i]).startswith("CANTR")), start)
    end = next((i for i in range(first, len(lines)) if MARKER.match(lines[i + 1] if i + 1 < len(lines) else "")), len(lines))
    text = " ".join(lines[first:end])
    found = []
    for spell in sorted(spells, key=lambda s: -len(re.sub(r"[^A-Za-z]", "", s["name"]))):
        chars = re.sub(r"[^A-Za-z]", "", spell["name"])
        if len(chars) < 3:
            continue
        pattern = r"(?<![A-Za-z])" + r"[\s'.\-/]*".join(re.escape(c) for c in chars) + r"(?![A-Za-z])"
        if re.search(pattern, text, re.IGNORECASE):
            found.append(spell["id"])
            text = re.sub(pattern, " ", text, flags=re.IGNORECASE)
    # Two-column lists can split a name between columns ("Mordenkainen's" ... "faithful hound"): rebuild it
    # from the words left over, when they spell exactly one unmatched spell's letters.
    words = [re.sub(r"[^a-z]", "", w.lower()) for w in re.findall(r"[A-Za-z']{2,}", text)]
    for spell in spells:
        if spell["id"] in found:
            continue
        chars = re.sub(r"[^a-z]", "", spell["name"].lower())
        used = assemble(chars, words)
        if used and len(used) > 1:
            found.append(spell["id"])
            for w in used:
                text = re.sub(r"(?<![A-Za-z])" + r"[']?".join(re.escape(c) for c in w) + r"(?![A-Za-z])", " ", text, count=1, flags=re.IGNORECASE)
                words.remove(w)
    skip = {"level", "ritual", "cantrips", "cantr", "lege", "chapter", "character", "options", "leve"}
    leftover = [w for w in re.findall(r"[A-Za-z']{4,}", text) if w.lower() not in skip]
    if leftover:
        flags.append("spell list: words not matched to an imported spell (the spell may not be imported, or check the page): " + ", ".join(sorted(set(leftover))))
    return sorted(found)


# ---- the whole class -------------------------------------------------------------------

def parse_artificer(cache_dir, root, book, ruleset, table_page, first, last, known_skills):
    """Returns (class entry, [subclass entries], fixes)."""
    fixes, flags = [], []
    table_lines = page_lines(cache_dir, book, table_page)
    progression = read_table(table_lines, flags)
    box = read_trait_box(table_lines, known_skills, flags)

    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    items = split_features(lines, pages, "artificer", book, ruleset, ocr_pages)
    class_items = [it for it in items if it["owner"].lower() == "artificer"]
    sub_items = {s: [it for it in items if it["owner"].lower() == s.lower()] for s in SPECIALISTS}

    # The spell list sits inside the Spellcasting feature's pages: keep it out of that feature's text.
    spells_json = [json.loads((root / "data-pack" / b / "spells.json").read_text(encoding="utf-8"))
                   for b in ("phb24", "xge", "tce") if (root / "data-pack" / b / "spells.json").exists()]
    all_spells = [s for book_spells in spells_json for s in book_spells]
    spell_list = read_spell_list(lines, all_spells, flags) if all_spells else []
    if not all_spells:
        flags.append("spell list: no imported spells to match against; import the spell books first")
    for it in class_items:
        cut = next((j for j, l in enumerate(it["body"]) if l.upper().startswith("ARTIFICER SPELL LIST")), None)
        if cut is not None:
            it["body"] = it["body"][:cut]

    class_id = f"class.artificer.{book}"
    features = build_features(class_items, class_id, book, ruleset)
    problems = []
    phb = root / "data-pack" / "phb24" / "classes.json"
    if phb.exists() and progression:
        half = [c for c in json.loads(phb.read_text(encoding="utf-8")) if c["name"] in ("Ranger", "Paladin")]
        for r in progression:  # both are half casters, so the slot table must match theirs
            theirs = [next((c["progression"][r["level"] - 1]["spellSlots"][k] for c in half
                            if c["progression"][r["level"] - 1]["spellSlots"][k] is not None), None) for k in range(5)]
            for k in range(5):
                if r["spellSlots"][k] is None and theirs[k] is not None:  # the scan drops a "1" here
                    r["spellSlots"][k] = theirs[k]
                    fixes.append({"page": table_page, "rule": "slot-filled-by-agreement",
                                  "before": f"Artificer level {r['level']}, level {k + 1} slots: missing", "after": str(theirs[k])})
                elif r["spellSlots"][k] != theirs[k] and theirs[k] is not None:
                    problems.append(f"level {r['level']}: level {k + 1} slots {r['spellSlots'][k]}, the half-caster tables say {theirs[k]}")
    page_of = {"table": table_page}
    entry = {
        "id": class_id, "kind": "class", "name": "Artificer",
        "source": {"book": book, "ruleset": ruleset, "page": table_page, "ocrUsed": False, "flags": flags + problems},
        "summary": "", "hitDie": box["hitDie"], "primaryAbilities": ["int"], "savingThrows": box["savingThrows"],
        "skillChoices": box["skillChoices"], "weaponProficiencies": box["weaponProficiencies"],
        "armorTraining": box["armorTraining"], "toolProficiencies": box["toolProficiencies"],
        "startingEquipment": box["startingEquipment"], "subclassLevel": 3,
        "spellcasting": {"ability": "int", "casterType": "half", "spellListId": f"spelllist.artificer.{book}"},
        "spellList": spell_list,
        "columnNames": ["Infusions Known", "Infused Items", "Cantrips"],
        "progression": progression, "features": features, "traitBoxPrinted": box["traitBoxPrinted"],
        "notes": ["Prepared spells: your Intelligence modifier + half your artificer level (rounded up), minimum 1. This is not a table column."],
    }

    subclasses = []
    for name in SPECIALISTS:
        feats = build_features(sub_items[name], class_id, book, ruleset)
        subclasses.append({
            "id": f"subclass.{slug(name)}.{book}", "kind": "subclass", "name": name, "domainSpells": [], "classId": class_id,
            "summary": "", "text": "", "features": feats,
            "source": {"book": book, "ruleset": ruleset, "page": sub_items[name][0]["page"] if sub_items[name] else None,
                       "ocrUsed": False, "flags": [] if feats else ["no features found"]}})
    return entry, subclasses, fixes


def register_multiclass(root):
    """Tasha's (Multiclassing and the Artificer): add half your artificer levels, rounded up, to the caster level.
    The app rounds half casters up, as the Ranger and Paladin rows do."""
    path = root / "data-pack" / "phb24" / "multiclassing.json"
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    half = data["casterLevelRule"]["half"]
    if "Artificer" not in half:
        half.append("Artificer")
        data["casterLevelRule"]["artificerSource"] = {"book": "tce", "page": 11}
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
