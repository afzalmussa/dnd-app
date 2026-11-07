"""Parse tools and adventuring gear entries: a capitals heading 'NAME (COST)' followed by the description."""
import re

from parsers.classes import letters, slug
from parsers.equipment import fix_cost
from parsers.origins import load_lines, name_is_broken, tidy
from parsers.subclasses import caps_share

HEADING = re.compile(r"^(?P<name>.{3,45}?)\s*\((?P<cost>[^()]{2,14})[)~]?\s*$")
TOOL_FIELDS = ("Ability", "Utilize", "Craft", "Variants")


def is_heading(line):
    m = HEADING.match(line)
    if not m or caps_share(m.group("name")) < 0.6:
        return None
    cost = re.sub(r"[^0-9A-Za-z,]", "", m.group("cost"))
    if not re.match(r"^(VARIES|[0-9SOlI,]+(CP|SP|EP|GP|PP))$", cost, re.IGNORECASE):
        return None
    return m


def normalise_cost(raw, page, fixes):
    raw = re.sub(r"[^0-9A-Za-z,]", "", raw)
    if raw.upper() == "VARIES":
        return "Varies"
    return fix_cost(raw.upper().replace("L", "1", 1) if raw.upper().startswith("L") else raw, page, fixes)


def clean_name(raw):
    """'S MITH'S TOOLS' -> "Smith's Tools": rejoin stray single letters, then title-case."""
    name = re.sub(r"(?<![A-Za-z'])([A-Z]) (?=[A-Z]{2,})", r"\1", raw.strip())
    name = name.title().replace("'S", "'s")
    return re.sub(r"\s+", " ", re.sub(r"\s+,", ",", name))


def parse_gear(cache_dir, book, ruleset, kind, first, last):
    """kind is 'tool' or 'gear'. Returns (items, fixes)."""
    fixes, items = [], []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    heads = [(i, is_heading(l)) for i, l in enumerate(lines)]
    heads = [(i, m) for i, m in heads if m]
    category = None
    for n, (i, m) in enumerate(heads):
        flags = []
        name = clean_name(m.group("name"))
        if name_is_broken(name, 0.1) or re.search(r"[^A-Za-z', -]", name) or re.search(r"\b[A-Za-z]{1,2}'s\b", name):
            flags.append(f"name '{name}' looks garbled; check against the page")
        cost = normalise_cost(m.group("cost"), pages[i], fixes)
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        body = lines[i + 1:end]
        # A plain capitals line with no cost (e.g. "OTHER TOOLS") is a category heading, not text.
        if kind == "tool":
            above = [l for l in lines[:i] if l.isupper() and "TOOLS" in l and "(" not in l and len(l) < 25]
            category = above[-1].title().replace("'S", "'s") if above else None
        body = [l for l in body if not (l.isupper() and len(l) > 4 and "(" not in l and kind == "tool" and "TOOLS" in l)]
        item = {
            "id": f"item.{slug(name)}.{book}", "kind": "item", "name": name,
            "category": "tool" if kind == "tool" else "gear",
            "source": {"book": book, "ruleset": ruleset, "page": pages[i], "ocrUsed": pages[i] in ocr_pages, "flags": flags},
            "cost": cost or None, "weight": None, "attunement": False, "summary": "", "text": "",
        }
        if kind == "tool":
            fields, cur = {}, None
            for l in body:
                fm = re.match(r"^(Ability|Utilize|Craft|Variants|Weight)\s*:\s*(.*)", l)
                if fm:
                    cur = fm.group(1)
                    fields[cur] = fm.group(2)
                    wm = re.match(r"^(.*?)\s+Weight\s*:\s*(.*)$", fields[cur])  # "Ability: Strength Weight: 8 lb."
                    if wm:
                        fields[cur], fields["Weight"] = wm.group(1), wm.group(2)
                elif cur:
                    fields[cur] += " " + l
            for need in ("Ability", "Utilize", "Weight"):
                if not fields.get(need):
                    flags.append(f"missing {need}")
            weight = re.sub(r"[^\d/a-z. ]", "", fields.get("Weight", "")).strip()
            weight = re.sub(r"^[lI]\b", "1", weight)
            wm = re.match(r"^(\d+(?:/\d+)?)\s*lb\.?$", weight)
            item["weight"] = f"{wm.group(1)} lb." if wm else (weight or None)
            if weight and not wm and weight != "Varies":
                flags.append(f"weight '{weight}' not understood")
            item["tool"] = {"group": category, "ability": fields.get("Ability"),
                            "utilize": tidy([fields.get("Utilize", "")]), "craft": tidy([fields.get("Craft", "")]) or None,
                            "variants": tidy([fields["Variants"]]) if fields.get("Variants") else None}
            item["text"] = ""
        else:
            item["text"] = tidy(body)
            item["summary"] = (re.match(r"(.+?[.!?])(\s|$)", item["text"]) or [None, item["text"][:200]])[1][:240]
            if not item["text"]:
                flags.append("no description text")
            if len(item["text"]) > 900:
                flags.append("long text; may include a table or run-on lines. Check the page")
        items.append(item)
    return items, fixes


# ---- the Adventuring Gear table: Item / Weight / Cost, in two columns on the page -----------

WEIGHT = r"(?:Varies|\d+(?:/\d+)?½?\s*(?:lb\.?|16\.)|½\s*lb\.?)"
COST = r"(?:Varies|[0-9SOlI,]+\s?(?:CP|SP|EP|GP|PP))"
TABLE_LINE = re.compile(rf"^(?P<name>.+?)(?:\s+(?P<weight>{WEIGHT}))?\s+(?P<cost>{COST})$")


def weight_pounds(text):
    """'1/2 lb.' -> 0.5, '216.' -> 2, '58½ lb.' -> 58.5, 'Varies' -> None."""
    if not text or text.lower() == "varies":
        return None
    t = text.replace(" ", "").replace("lb.", "").replace("lb", "")
    t = re.sub(r"16\.$", "", t) if not re.fullmatch(r"\d+/\d+|\d+", t) else t
    half = t.endswith("½")
    t = t.replace("½", "")
    if "/" in t:
        a, b = t.split("/")
        return int(a) / int(b)
    return (int(t) if t else 0) + (0.5 if half else 0)


def parse_gear_table(doc, page_no, fixes):
    """Returns {name: {'weight': 'x lb.' or None, 'cost': 'n GP'}} read from the two-column table."""
    page = doc[page_no - 1]
    words = page.get_text("words")
    mid = page.rect.width / 2
    out, ordered, orphans = {}, [], []
    for in_half in (lambda w: w[0] < mid - 4, lambda w: w[0] >= mid - 4):
        lines = []
        for w in sorted((w for w in words if in_half(w)), key=lambda w: ((w[1] + w[3]) / 2, w[0])):
            y = (w[1] + w[3]) / 2
            if lines and abs(lines[-1][0] - y) <= 4:
                lines[-1][1].append(w)
            else:
                lines.append([y, [w]])
        for _, ws in lines:
            text = " ".join(w[4] for w in sorted(ws, key=lambda w: w[0]))
            text = re.sub(r"\b[lI]\b(?=\s*(?:lb|GP|SP|CP))", "1", text)
            m = TABLE_LINE.match(text)
            if not m or m.group("name") in ("Item", "Weight Cost"):
                continue
            cost = fix_cost(m.group("cost"), page_no, fixes)
            wt = m.group("weight")
            lb = None
            if wt and wt.lower() != "varies":
                pounds = weight_pounds(wt)
                lb = f"{pounds:g} lb."
                if lb != wt:
                    fixes.append({"page": page_no, "rule": "table-weight", "before": wt, "after": lb})
            elif wt:
                lb = "Varies"
            name = m.group("name").strip()
            garbled = re.match(r"^(.+?)\s+\S*\d\S*\s*lb\.$", name)  # "Tent 2Cl lb.": a weight the scan could not read
            if garbled:
                name, lb = garbled.group(1), None
            inside = re.match(r"^(.+?)\s+(\d+(?:/\d+)? lb\.)(?:\s*\(.*\))?$", name)  # "Waterskin 5 lb. (full)"
            if inside:
                name, lb = inside.group(1), inside.group(2)
            if re.match(r"^\d+ lb\.$", name):
                # The item name was lost on this line (the first row). Resolved later by alphabetical position.
                orphans.append({"weight": name, "cost": cost, "index": len(ordered)})
                ordered.append(None)
                continue
            ordered.append(name)
            out[name] = {"weight": lb, "cost": cost, "weightGarbled": bool(garbled)}
    for o in orphans:
        o["before"] = next((n for n in ordered[o["index"] + 1:] if n), None)
        o["after"] = next((n for n in reversed(ordered[:o["index"]]) if n), None)
    out["__orphans__"] = orphans
    return out
