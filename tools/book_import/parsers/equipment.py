"""Parse the PHB Weapons and Armor tables from word positions.

In these tables the name, mastery, weight and cost sit on a slightly different line from the
damage and properties, so every word is given to the nearest row name by vertical distance.
"""
import json
import re
from pathlib import Path

import ocr
from parsers.classes import slug

ROOT = Path(__file__).resolve().parents[3]
CATEGORY = re.compile(r"^(Simple|Martial) (Melee|Ranged) Weapons$|^(Light|Medium|Heavy) Armor\b|^Shield$", re.IGNORECASE)
DIE_CHARS = {"l": "1", "I": "1", "O": "0", "o": "0"}


class _Match:
    """Wraps a regex match so the die part can have inner spaces removed ('1 dl 0' -> die 'l0')."""
    def __init__(self, m):
        self.m = m
    def group(self, n):
        return self.m.group(0) if n == 0 else self.m.group(n).replace(" ", "")


def fix_dice(text, page, fixes):
    """'ldl0' -> '1d10', 'l d6' -> '1d6'. Only accepted when the result is a real die."""
    def sub(m):
        count = "".join(DIE_CHARS.get(c, c) for c in m.group(1)) or "1"
        die = "".join(DIE_CHARS.get(c, c) for c in m.group(2))
        if die not in ("4", "6", "8", "10", "12", "20", "100") or not count.isdigit():
            return m.group(0)
        out = f"{count}d{die}"
        if out != m.group(0):
            fixes.append({"page": page, "rule": "table-dice", "before": m.group(0), "after": out})
        return out
    return re.sub(r"\b([lI\d]?)\s?d\s?([lIO\d](?:\s?[lIO\d]){0,2})\b", lambda m: sub(re.match(r"(.*)(.*)", m.group(0)) and _Match(m)), text)


def fix_cost(text, page, fixes):
    m = re.match(r"^([0-9SOlIL,]+)\s*(CP|SP|EP|GP|PP)$", text.replace(" ", ""))
    if not m:
        return text
    digits = "".join({"S": "5", "O": "0", "l": "1", "I": "1", "L": "1"}.get(c, c) for c in m.group(1))
    out = f"{digits} {m.group(2)}"
    if out != text:
        fixes.append({"page": page, "rule": "table-cost", "before": text, "after": out})
    return out


def fix_weight(text, page, fixes):
    """'816.' is '8 lb.': the scan reads 'lb.' as '16.'."""
    m = re.match(r"^(\d{1,3})\s*(?:16\.|1b\.|lb\.)$", text.replace(" ", ""))
    if not m:
        return text
    out = f"{m.group(1)} lb."
    if out != text:
        fixes.append({"page": page, "rule": "table-weight", "before": text, "after": out})
    return out


def read_rows(words, header_words, name_x_max, y_start, y_end):
    """Return [(category, {column: text})]. header_words = {column: x0} for the non-name columns."""
    lines = {}
    for w in sorted((w for w in words if w[0] < name_x_max and y_start < (w[1] + w[3]) / 2 < y_end), key=lambda w: (w[1], w[0])):
        y = (w[1] + w[3]) / 2
        key = next((k for k in lines if abs(k - y) <= 4), y)
        lines.setdefault(key, []).append(w)
    anchors = [(y, " ".join(w[4] for w in sorted(ws, key=lambda w: w[0]))) for y, ws in sorted(lines.items())]
    cols = sorted(header_words.items(), key=lambda kv: kv[1])
    rows, category, seen, cat_ys = [], None, set(), []
    for y, text in anchors:
        # "Shield" is both a category heading and the row below it: the first is the heading.
        if CATEGORY.match(text) and not (text.lower() == "shield" and text.lower() in seen):
            seen.add(text.lower())
            cat_ys.append(y)
            category = text
            continue
        rows.append({"y": y, "name": text, "category": category, "cells": {c: [] for c, _ in cols}})
    for w in words:
        if w[0] < name_x_max or not (y_start < (w[1] + w[3]) / 2 < y_end):
            continue
        y = (w[1] + w[3]) / 2
        if not rows:
            break
        if any(abs(cy - y) <= 3 for cy in cat_ys):
            continue  # the rest of a category heading line, e.g. "(1 Minute to Don or Doff)"
        nearest = min(rows, key=lambda r: abs(r["y"] - y))
        col = [c for c, x in cols if w[0] >= x - (14 if c == "Cost" else 8)][-1:]
        if col:
            nearest["cells"][col[0]].append((y, w[0], w[4]))
    for r in rows:
        r["cells"] = {c: " ".join(t for _, _, t in sorted(v, key=lambda t: (round(t[0] / 5), t[1]))) for c, v in r["cells"].items()}
    return rows


def parse_weapons(doc, cache_dir, book, ruleset, page_no, damage_types):
    fixes, items = [], []
    page = doc[page_no - 1]
    words = page.get_text("words")
    head = {w[4]: w[0] for w in words if w[4] in ("Damage", "Properties", "Mastery", "Weight", "Cost") and w[1] < 80}
    if len(head) != 5:
        return [], fixes, [f"weapons header not found on page {page_no}"]
    top = max(w[3] for w in words if w[4] in head and w[1] < 90) + 1  # just under the column headings
    y_end = page.rect.height - 22  # stop above the page footer
    for r in read_rows(words, head, head["Damage"] - 6, top, y_end):
        c, flags = r["cells"], []
        name = r["name"]
        dmg = fix_dice(c["Damage"], page_no, fixes)
        m = re.match(r"^(\d+(?:d\d+)?)\s+(\w+)$", dmg)
        if not m:
            flags.append(f"damage '{dmg}' not understood")
        elif m.group(2).lower() not in damage_types:
            flags.append(f"damage type '{m.group(2)}' is not a known damage type")
        props = [re.sub(r"(\w)- (\w)", r"\1\2", p).strip() for p in re.split(r",\s*(?![^()]*\))", fix_dice(c["Properties"], page_no, fixes)) if p.strip()]
        weight = fix_weight(c["Weight"], page_no, fixes)
        cost = fix_cost(c["Cost"], page_no, fixes)
        if not c["Mastery"]:
            flags.append("mastery property empty")
        if not cost:
            flags.append("cost empty")
        if weight and not re.match(r"^(\d+|\d/\d) lb\.$", weight):
            flags.append(f"weight '{weight}' not understood")
        cat = (r["category"] or "").split()
        items.append({
            "id": f"item.{slug(name)}.{book}", "kind": "item", "name": name, "category": "weapon",
            "source": {"book": book, "ruleset": ruleset, "page": page_no, "ocrUsed": False, "flags": flags},
            "cost": cost or None, "weight": weight or None, "attunement": False, "summary": "",
            "weapon": {"group": cat[0] if cat else None, "kind": cat[1] if len(cat) > 1 else None,
                       "damage": m.group(1) if m else None, "damageType": m.group(2) if m else None,
                       "properties": props, "mastery": c["Mastery"] or None},
        })
    return items, fixes, []


def parse_armor(doc, cache_dir, book, ruleset, page_no, damage_types=None):
    fixes, items = [], []
    page = doc[page_no - 1]
    words = page.get_text("words")
    head = {w[4]: w[0] for w in words if w[4] in ("Strength", "Stealth", "Weight", "Cost") and w[1] < 90}
    ac_head = next((w for w in words if w[4] == "Armor" and w[1] < 90 and w[0] > 100), None)
    if len(head) != 4 or not ac_head:
        return [], fixes, [f"armor header not found on page {page_no}"]
    head["AC"] = ac_head[0]
    top = max(w[3] for w in words if (w[4] in head or w is ac_head) and w[1] < 90) + 1
    # The table ends at the second "ARMOR" heading, which starts the text below it.
    later = sorted(w[1] for w in words if w[4] == "ARMOR" and w[1] > 100)
    y_end = (later[0] - 2) if later else page.rect.height - 40
    for r in read_rows(words, head, head["AC"] - 6, top, y_end):
        c, flags = r["cells"], []
        name = re.sub(r"\s+(?=[a-z]\b)", "", r["name"])  # "Armo r" -> "Armor"
        ac = c["AC"]
        am = re.match(r"^(\+?\d+)(?:\s*\+\s*Dex modifier)?(?:\s*\(max (\d)\))?", re.sub(r"modifie\s*r", "modifier", ac))
        if not am:
            flags.append(f"armor class '{ac}' not understood")
        strength = re.search(r"(\d+)", c["Strength"])
        cat = (r["category"] or "").split()[0].title() if r["category"] else None
        items.append({
            "id": f"item.{slug(name)}.{book}", "kind": "item", "name": name, "category": "armor",
            "source": {"book": book, "ruleset": ruleset, "page": page_no, "ocrUsed": False, "flags": flags},
            "cost": fix_cost(c["Cost"], page_no, fixes) or None, "weight": fix_weight(c["Weight"], page_no, fixes) or None,
            "attunement": False, "summary": "",
            "armor": {"armorType": cat, "armorClassPrinted": ac,
                      "baseAC": int(am.group(1).lstrip("+")) if am else None, "bonus": bool(am and am.group(1).startswith("+")),
                      "addsDex": "Dex" in ac, "dexCap": int(am.group(2)) if am and am.group(2) else None,
                      "strengthRequirement": int(strength.group(1)) if strength else None,
                      "stealthDisadvantage": "Disadvantage" in c["Stealth"]},
        })
    return items, fixes, []
