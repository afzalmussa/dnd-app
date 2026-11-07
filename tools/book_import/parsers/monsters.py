"""Parse stat blocks from the 2024 Monster Manual.

This PDF has a clean text layer, so no OCR is needed. The whole book is read as one stream of lines (a stat block
can start at the bottom of one page and continue on the next), page furniture is removed, and each block is
found by its 'Size Type, Alignment' line. Each block is then checked against its own numbers.
"""
import math
import re
from fractions import Fraction

import pymupdf

from parsers.classes import slug

SIZES = "Tiny|Small|Medium|Large|Huge|Gargantuan"
TYPE_LINE = re.compile(rf"^({SIZES})(?: or ({SIZES}))?\s+([A-Za-z ,()/-]+?),\s+([A-Za-z ,()/-]+)$")
FURNITURE = [re.compile(p) for p in (
    r"^\d+/\d+/\d+, \d+:\d+ [AP]M$", r"^Monster Manual$", r"^https?://\S+$", r"^\d+/\d+$", r"^ARTIST: .*$",
    r"^[A-Z][A-Z' ,-]{3,}$")]  # an illustration caption such as "GIANT SQUID"
ABILITIES = ["str", "dex", "con", "int", "wis", "cha"]
LABELS = ["Skills", "Resistances", "Vulnerabilities", "Immunities", "Gear", "Senses", "Languages", "CR"]
SECTIONS = {"Traits": "traits", "Actions": "actions", "Bonus Actions": "bonusActions", "Reactions": "reactions",
            "Legendary Actions": "legendaryActions"}
ENTRY = re.compile(r"^(?P<name>[A-Z][A-Za-z0-9' /,–\-()]{1,70}?)\.\s+(?P<rest>.+)$")
MINUS = str.maketrans({"−": "-", "–": "-"})


def num(text):
    return int(text.translate(MINUS).replace(",", "").replace("+", ""))


def read_lines(path):
    doc = pymupdf.open(path)
    lines = []
    for page_no, page in enumerate(doc, start=1):
        for raw in page.get_text().split("\n"):
            line = raw.strip()
            if line and not any(p.match(line) for p in FURNITURE):
                lines.append((line, page_no))
    return lines


def split_entries(block):
    """Group lines under one section into entries. A new entry starts at 'Name. text'."""
    entries = []
    for line in block:
        m = ENTRY.match(line)
        if m:
            entries.append({"name": m.group("name"), "text": m.group("rest")})
        elif entries:
            entries[-1]["text"] += " " + line
        else:
            entries.append({"name": "", "text": line})
    return [{**e, "text": re.sub(r"(\w)- (\w)", r"\1\2", e["text"])} for e in entries]


def parse_block(lines, page):
    """lines = the stat block, starting with the monster's name."""
    flags = []
    name = lines[0]
    m = TYPE_LINE.match(lines[1])
    entry = {"name": name, "size": m.group(1) + (f" or {m.group(2)}" if m.group(2) else ""), "creatureType": m.group(3).strip(),
             "alignment": m.group(4).strip()}
    text = "\n".join(lines[2:])

    ac = re.search(r"^AC (\d+)(?: \(([^)]*)\))?\s*(?:Initiative ([+−-]\d+) \((\d+)\))?", text, re.M)
    if ac:
        entry["ac"], entry["acNote"] = int(ac.group(1)), ac.group(2)
        entry["initiative"] = {"bonus": num(ac.group(3)), "score": int(ac.group(4))} if ac.group(3) else None
    else:
        flags.append("AC not found")
    hp = re.search(r"^HP ([\d,]+)(?: \(([^)]*)\))?", text, re.M)
    entry["hp"] = {"average": num(hp.group(1)), "dice": (hp.group(2) or "").translate(MINUS)} if hp else None
    if not hp:
        flags.append("HP not found")
    speed = re.search(r"^Speed (.+)$", text, re.M)
    entry["speed"] = speed.group(1) if speed else None
    if not speed:
        flags.append("Speed not found")

    abilities = {}
    for ab in ABILITIES:
        i = next((k for k, l in enumerate(lines) if l == ab.capitalize()), None)
        if i is not None and i + 3 < len(lines):
            try:
                abilities[ab] = {"score": num(lines[i + 1]), "mod": num(lines[i + 2]), "save": num(lines[i + 3])}
            except ValueError:
                flags.append(f"{ab} not readable")
    entry["abilities"] = abilities
    if len(abilities) != 6:
        flags.append(f"read {len(abilities)} of 6 ability scores")

    # labelled lines: Skills ... CR, each possibly wrapping onto the next line
    fields, current = {}, None
    after_table = next((k for k, l in enumerate(lines) if l == "Cha"), 0) + 4
    stop = next((k for k, l in enumerate(lines) if l in SECTIONS), len(lines))
    for l in lines[after_table:stop]:
        label = next((x for x in LABELS if l == x or l.startswith(x + " ")), None)
        if label:
            current = label
            fields[label] = l[len(label):].strip()
        elif current:
            fields[current] += " " + l
    entry["skills"] = fields.get("Skills")
    entry["resistances"] = fields.get("Resistances")
    entry["vulnerabilities"] = fields.get("Vulnerabilities")
    entry["immunities"] = fields.get("Immunities")
    entry["gear"] = fields.get("Gear")
    entry["senses"] = fields.get("Senses")
    entry["languages"] = fields.get("Languages")
    cr = re.match(r"^(\d+(?:/\d+)?) \(XP ([\d,]+)(?:, or ([\d,]+) in lair)?; PB \+(\d+)\)", fields.get("CR", ""))
    if cr:
        entry["cr"], entry["xp"], entry["pb"] = cr.group(1), num(cr.group(2)), int(cr.group(4))
        entry["xpLair"] = num(cr.group(3)) if cr.group(3) else None
    else:
        entry.update({"cr": None, "xp": None, "pb": None, "xpLair": None})
        flags.append("CR, XP and PB not read")

    # sections of text
    sections = {v: [] for v in SECTIONS.values()}
    current = None
    for l in lines[stop:]:
        if l in SECTIONS:
            current = SECTIONS[l]
        elif current:
            sections[current].append(l)
    entry["sections"] = {k: split_entries(v) for k, v in sections.items() if v}
    return entry, flags


def parse_monsters(pdf_path, book="mm", ruleset="2024"):
    lines = read_lines(pdf_path)
    anchors = [i for i in range(1, len(lines)) if TYPE_LINE.match(lines[i][0])]
    out = []
    for n, a in enumerate(anchors):
        end = (anchors[n + 1] - 1) if n + 1 < len(anchors) else len(lines)
        block = [l for l, _ in lines[a - 1:end]]
        entry, flags = parse_block(block, lines[a][1])
        entry.update({"id": f"monster.{slug(entry['name'])}.{book}", "kind": "monster",
                      "source": {"book": book, "ruleset": ruleset, "page": lines[a][1], "ocrUsed": False, "flags": flags}})
        out.append(entry)
    return out


# ---- structure checks ------------------------------------------------------------------------------

def expected_pb(cr):
    value = float(Fraction(cr))  # "1/8" and "5"
    return 2 if value < 1 else 2 + math.floor((value - 1) / 4)


def validate_monsters(monsters):
    """Fills each monster's flags with what does not add up. Nothing is corrected."""
    by_cr = {}
    for m in monsters:
        if m["cr"] and m["xp"] is not None:
            by_cr.setdefault(m["cr"], []).append(m["xp"])
    typical_xp = {cr: max(set(v), key=v.count) for cr, v in by_cr.items()}
    for m in monsters:
        f = m["source"]["flags"]
        for ab, v in m["abilities"].items():
            if v["mod"] != (v["score"] - 10) // 2:
                f.append(f"{ab} modifier {v['mod']} does not match score {v['score']}")
            if m["pb"] and (v["save"] - v["mod"]) not in (0, m["pb"], 2 * m["pb"]):
                f.append(f"{ab} saving throw {v['save']} is not the modifier plus 0, PB or 2xPB")
        if m["cr"]:
            if m["pb"] != expected_pb(m["cr"]):
                f.append(f"proficiency bonus +{m['pb']} does not fit CR {m['cr']}")
            if m["cr"] != "0" and m["xp"] != typical_xp.get(m["cr"]):  # some CR 0 creatures are worth 0 XP and some 10
                f.append(f"XP {m['xp']} differs from the {typical_xp.get(m['cr'])} most monsters of CR {m['cr']} have")
        hp = m["hp"]
        if hp and hp["dice"]:
            d = re.match(r"^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?$", hp["dice"].replace(" ", ""))
            if d:
                count, sides = int(d.group(1)), int(d.group(2))
                bonus = (1 if d.group(3) != "-" else -1) * int(d.group(4) or 0)
                if count * (sides + 1) // 2 + bonus != hp["average"]:
                    f.append(f"hit points {hp['average']} do not match {hp['dice']}")
        if not m["sections"].get("actions") and not m["sections"].get("traits"):
            f.append("no traits or actions found")
    return monsters
