"""Turn the players' Aurora PDF sheets into character files the app can open (Import button).

Reads PDFs/<name>.pdf (local only) and the data pack. Class numbers and features come from the
2024 PHB data; species traits, feats, items, spells and live play state come from the sheet.
Background increases and the Origin feat are left empty: only the player can choose them.

Output: reports/sample-characters/<name>.json (git-ignored, holds player names) and
<name>.expected.json with the sheet's own totals, which a unit test compares against.

Usage: python sheets_to_characters.py
"""
import json
import re
import uuid
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "reports" / "sample-characters"
SHEETS = ["Auriviel Inferno", "Thrandur Lorgin", "Ordizon"]
PLAYER_FIX = {"Player One": "Raqib"}  # the Ordizon sheet still says "Player One"
ABILITIES = ["str", "dex", "con", "int", "wis", "cha"]
SKILLS = json.loads((ROOT / "app/src/shared/coreRules.json").read_text(encoding="utf-8"))["skills"]
SPELL_ABILITY = {"Wisdom": "wis", "Intelligence": "int", "Charisma": "cha"}


def load(book, kind):
    f = ROOT / "data-pack" / book / f"{kind}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def key(name):
    return re.sub(r"[^a-z]", "", name.lower())


def read_fields(doc):
    fields = {}
    for page in doc:
        for w in page.widgets() or []:
            if w.field_value not in (None, "", "Off"):
                fields.setdefault(w.field_name, w.field_value)
    return fields


def number(text, default=0):
    m = re.search(r"-?\d+", str(text or ""))
    return int(m.group(0)) if m else default


def sheet_paragraphs(text):
    """Species traits and feats from page 1: everything after 'Languages.' up to the first class feature."""
    i = text.find("Languages.")
    if i < 0:
        return {}, {}
    block = text[i:].split("\n")
    lines = block[1:]
    profs = {}
    for label in ("Armor Proficiencies", "Weapon Proficiencies", "Tool Proficiencies", "Languages"):
        m = re.search(rf"{label}\.\s*(.+?)(?=\n(?:Armor|Weapon|Tool) Proficiencies\.|\nLanguages\.|\n[A-Z][A-Za-z' ]+\. )", text, re.S)
        if m:
            raw = m.group(1).replace("\n", " ").replace("Crossbow, ", "Crossbow|")  # keep "Crossbow, Light" together
            items = [x.strip().replace("|", ", ") for x in re.split(r",\s*", raw) if x.strip() and x.strip() not in ("-", "–", "−")]
            profs[label] = items
    paragraphs, current = {}, None
    for line in lines:
        m = re.match(r"^([A-Z][A-Za-z'’ ()/—-]{2,45})\.\s+(\S.*)$", line)
        if m:
            current = m.group(1).strip()
            paragraphs[current] = [m.group(2)]
        elif current:
            paragraphs[current].append(line)
    return profs, {k: " ".join(v) for k, v in paragraphs.items()}


def effect(name, source, description, kind="feature", uses=None, activation="passive"):
    return {"id": str(uuid.uuid4()), "name": name, "kind": kind, "source": source, "description": description,
            "activation": activation, "active": True, "uses": uses, "modifiers": [], "triggers": [],
            "duration": {"type": "permanent"}}


def convert(name, classes, subclasses, feats, spells):
    doc = pymupdf.open(ROOT / "PDFs" / f"{name}.pdf")
    f = read_fields(doc)
    page1 = doc[0].get_text()
    m = re.match(r"Level (\d+) (.+?) (Barbarian|Cleric|Wizard)(?:,\s*(.+))?$", f["details_build"])
    level, species, cname, sub = int(m.group(1)), m.group(2), m.group(3), m.group(4) or ""
    cls = next(c for c in classes if c["name"] == cname)
    row = cls["progression"][level - 1]
    # Aurora swaps these two fields: "modifier" holds the score and "score" holds the modifier.
    scores = {a: number(f.get(f"details_{a}_modifier")) for a in ABILITIES}
    mods = {a: (scores[a] - 10) // 2 for a in ABILITIES}

    # subclass: match by name core, preferring the 2024 PHB
    def core(n):
        return re.sub(r"^(school of|path of the|path of)\s+|\s+domain$", "", n.lower().strip())
    pool = [s for s in subclasses if s["classId"] == cls["id"]]
    sub_hit = next((s for s in pool if core(s["name"]) == core(sub)), None) or next(
        (s for s in pool if core(s["name"])[:5] == core(sub)[:5]), None)

    skills = {}
    for s in SKILLS:
        flat = s["id"].replace("-", "")
        if f.get(f"details_{flat}_expertise") == "Yes":
            skills[s["id"]] = "expertise"
        elif f.get(f"details_{flat}_proficiency") == "Yes":
            skills[s["id"]] = "proficient"
    profs, paragraphs = sheet_paragraphs(page1)

    # --- features: 2024 class + subclass, then species traits and feats from the sheet
    effects, class_names = [], set()
    for r in cls["progression"][:level]:
        for fname in r["featuresPrinted"]:
            if fname.lower() == "subclass feature":
                continue
            ft = next((x for x in cls["features"] if x["name"] == fname and x["level"] == r["level"]), None)
            class_names.add(key(fname))
            uses = None
            col = {"Rage": "Rages", "Channel Divinity": "Channel Divinity"}.get(fname)
            if col and row["columns"].get(col):
                uses = {"max": row["columns"][col], "used": 0, "resetOn": "long"}
            effects.append(effect(fname, f"{cname} {r['level']} (2024)", (ft or {}).get("text", ""), uses=uses))
    if sub_hit:
        for ft in sub_hit["features"]:
            if ft["level"] <= level:
                class_names.add(key(re.sub(r"\s*\(.*\)", "", ft["name"])))
                effects.append(effect(ft["name"], f"{sub_hit['name']} {ft['level']} ({sub_hit['source']['ruleset']} {sub_hit['source']['book']})", ft["text"]))
    by_feat = {key(x["name"]): x for x in feats}
    for pname, text in paragraphs.items():
        base = key(re.sub(r"\s*\(.*\)", "", pname))
        if base in class_names or base in ("spellcasting", "channeldivinity", "rage"):
            break  # class features start here
        feat = by_feat.get(base)
        if feat and feat.get("supersededBy"):
            feat = next((x for x in load("phb24", "feats") if x["id"] == feat["supersededBy"]), feat)
            text = feat["text"] + "  [2024 version of this feat]"
        if re.search(r"\b(checks|saves|saving throws)\b", pname, re.I):
            continue  # a rule line inside a class feature, not a trait
        effects.append(effect(pname, "Species or feat (from the 2014 sheet)", text, kind="trait"))

    # --- play state and curses from the sheet's free text
    notes = {"general": "", "backstory": f.get("background_story", ""), "allies": ""}
    extra = [f.get(k) for k in ("details_resistances", "details_attack_description", "background_additional_features") if f.get(k)]
    notes["general"] = "From the 2014 sheet (check against play):\n\n" + "\n\n".join(extra) if extra else ""
    hp_text = f.get("details_hp_current", "")
    hp_max = number(f.get("details_hp_max"))
    hp_current = number(hp_text, hp_max) if hp_text else hp_max
    temp = re.search(r"\+(\d+)", hp_text)

    # --- spells
    spell_entries, slots = [], [n or 0 for n in (row["spellSlots"] or [None] * 9)]
    by_name = {key(s["name"]): s for s in spells}
    ability = None
    for k, v in f.items():
        sm = re.match(r"spellcasting_ability:(.+):1$", k)
        if sm and sm.group(1) != "Other Spells":
            ability = SPELL_ABILITY.get(v)
        sp = re.match(r"spells_(\d):(\d+)_:(.+):1$", k)
        if sp:
            lvl, group = int(sp.group(1)), sp.group(3)
            clean = re.sub(r"\s*\((.*?)\)\s*$", "", v).strip()
            tag = re.search(r"\((.*?)\)\s*$", v)
            note = tag.group(1) if tag else ""
            hit = by_name.get(key(clean))
            prepared = lvl == 0 or f.get(k.replace("spells_", "prepare_")) == "Yes" or "Always" in note or group == "Other Spells"
            spell_entries.append({"id": str(uuid.uuid4()), "spellId": hit["id"] if hit else None, "name": clean, "level": lvl,
                                  "prepared": bool(prepared), "notes": note if group != "Other Spells" else (note or "other source")})

    # --- attacks
    attacks = []
    for i in range(1, 7):
        w = f.get(f"details_attack{i}_weapon")
        if not w:
            continue
        dm = re.match(r"(\d+d\d+)\s*([+-]\d+)?\s*(\w+)?", f.get(f"details_attack{i}_damage", ""))
        ranged = "/" in f.get(f"details_attack{i}_range", "")
        attacks.append({"id": str(uuid.uuid4()), "name": w, "ability": "dex" if ranged else "str", "proficient": True,
                        "attackBonusExtra": 0, "damage": dm.group(1) if dm else "", "damageType": (dm.group(3) or "") if dm else "",
                        "addAbilityToDamage": True, "damageBonusExtra": 0, "mastery": "", "range": f.get(f"details_attack{i}_range", ""),
                        "notes": f.get(f"details_attack{i}_description", "")})

    # --- inventory (names in [brackets] are equipped in Aurora)
    inventory = []
    for prefix in ("equipment_page_gear", "equipment_page_magic_gear"):
        for i in range(0, 60):
            n = f.get(f"{prefix}_name.{i}")
            if not n:
                continue
            count = max(1, number(f.get(f"{prefix}_count.{i}"), 1))
            total = number(f.get(f"{prefix}_weight.{i}"), 0)
            inventory.append({"id": str(uuid.uuid4()), "itemId": None, "name": n.strip("[]"), "quantity": count,
                              "weight": round(total / count, 2), "equipped": n.startswith("["), "attuned": False, "notes": ""})
    sheet_walk = number(f.get("details_speed_walking"), 30)

    character = {
        "schemaVersion": 1, "id": str(uuid.uuid4()), "name": f["details_character_name"].replace("  ", " "),
        "player": PLAYER_FIX.get(f.get("details_player", ""), f.get("details_player", "")), "portrait": None,
        "ruleset": "2024", "origin": {"backgroundIncreases": {}, "originFeat": ""},
        "speciesId": None, "backgroundId": None, "levels": [], "speciesName": species, "backgroundName": f.get("details_background", ""),
        "abilityScores": scores,
        "manualValues": {"classes": [{"name": cname, "subclass": sub_hit["name"] if sub_hit else sub, "level": level, "hitDie": cls["hitDie"]}],
                         "maxHp": hp_max, "proficiencyBonus": row["proficiencyBonus"], "armorClass": number(f.get("details_armor_class")),
                         "speed": sheet_walk, "initiativeBonus": number(f.get("details_initiative")) - mods["dex"]},
        "proficiencies": {"savingThrows": [a for a in ABILITIES if f.get(f"details_{a}_save_proficiency") == "Yes"], "skills": skills,
                          "armor": profs.get("Armor Proficiencies", []), "weapons": profs.get("Weapon Proficiencies", []),
                          "tools": profs.get("Tool Proficiencies", []), "languages": profs.get("Languages", [])},
        "attacks": attacks, "spellcasting": {"ability": ability, "slotsMax": slots}, "spells": spell_entries,
        "inventory": inventory,
        "coins": {k: number(f.get(f"equipment_page_coins_{k}")) for k in ("cp", "sp", "ep", "gp", "pp")},
        "defenses": {"resistances": [x.strip() for x in re.findall(r"Resistances?\.\s*([A-Za-z, ]+)", f.get("details_resistances", ""))[0].split(",")] if re.search(r"Resistances?\.", f.get("details_resistances", "")) else [], "immunities": [], "vulnerabilities": []},
        "senses": [f["details_vision"]] if f.get("details_vision") else [],
        "customEffects": effects,
        "state": {"hpCurrent": hp_current, "tempHp": int(temp.group(1)) if temp else 0, "tempHpExpires": None, "hitDiceUsed": {},
                  "deathSaves": {"successes": 0, "failures": 0}, "inspiration": number(f.get("details_inspiration")) > 0, "exhaustion": 0,
                  "conditions": [], "spellSlotsUsed": [0] * 9, "toggles": {}},
        "dmOverrides": {"featureLevels": {}, "replacedEntries": {}, "modifiers": []},
        "notes": notes,
    }
    expected = {
        "saves": {a: number(f.get(f"details_{a}_save_total")) for a in ABILITIES},
        "skills": {s["id"]: number(f.get(f"details_{s['id'].replace('-', '')}_total")) for s in SKILLS},
        "passivePerception": number(f.get("details_passive_perception_total")),
        "initiative": number(f.get("details_initiative")),
    }
    return character, expected


def main():
    classes, spells = load("phb24", "classes"), load("phb24", "spells")
    subclasses = load("phb24", "subclasses") + load("xge", "subclasses") + load("tce", "subclasses")
    feats = load("tce", "feats")
    OUT.mkdir(parents=True, exist_ok=True)
    for name in SHEETS:
        character, expected = convert(name, classes, subclasses, feats, spells)
        stem = re.sub(r"[^a-z0-9]+", "-", character["name"].lower()).strip("-")
        (OUT / f"{stem}.json").write_text(json.dumps(character, indent=2, ensure_ascii=False), encoding="utf-8")
        (OUT / f"{stem}.expected.json").write_text(json.dumps(expected, indent=2), encoding="utf-8")
        print(f"{character['name']}: {len(character['customEffects'])} features, {len(character['spells'])} spells, "
              f"{len(character['inventory'])} items -> {OUT / (stem + '.json')}")


if __name__ == "__main__":
    main()
