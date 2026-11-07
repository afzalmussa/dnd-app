"""Parse 2014-style content: Xanathar's/Tasha's subclasses and Tasha's feats.

Subclass layout: a capitals heading, intro text, a small "<NAME> FEATURES" table
("3rd Ancestral Protectors"), then each feature as a capitals heading with its text.
"""
import difflib
import re

from parsers.classes import letters, slug
from parsers.origins import load_lines, name_is_broken, tidy
from parsers.subclasses import caps_share

TABLE_ROW = re.compile(r"^(\d{1,2})\s?(?:st|nd|rd|th)\s+(.+)$")
LEVEL_MARKER = re.compile(r"^(\d{1,2})\s?(?:st|nd|rd|th)-level\s+(.+?)\s+feature", re.IGNORECASE)
SUBCLASS_LEVEL = 3  # table rule: 2014 subclasses are chosen at level 3, earlier features arrive then


def similar(a, b):
    return difflib.SequenceMatcher(None, letters(a), letters(b)).ratio()


def subclass_names_from_intro(lines, article):
    """Read 'The following options are available to a barbarian ...: the Path of X, the Path of Y, and the Path of Z.'"""
    i = next((i for i, l in enumerate(lines) if re.search(rf"available to {article}\b", l)), None)
    if i is None:
        return []
    sentence = tidy(lines[i:i + 8])
    m = re.search(r":\s*(.+?)\.\s", sentence + " ")
    if not m:
        return []
    parts = re.split(r",\s*(?:and\s+)?|\s+and\s+the\s+", m.group(1))
    return [re.sub(r"^(?:and\s+)?the\s+", "", p.strip(), flags=re.IGNORECASE) for p in parts if p.strip()]


def is_feature_heading(line):
    return len(line) >= 4 and caps_share(line) > 0.9 and not line.endswith("FEATURES")


def parse_subclasses_2014(cache_dir, book, ruleset, class_name, article, first, last, names=None):
    fixes, out = [], []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    names = names or subclass_names_from_intro(lines, article)
    if not names:
        return [], fixes, [f"{class_name}: subclass names not read from the intro sentence"]
    # Subclass headings: capitals lines that are not the table title.
    heads, cursor = [], 0
    for name in names:
        idx = next((i for i in range(cursor, len(lines))
                    if len(lines[i]) < 60 and caps_share(lines[i]) > 0.7 and not letters(lines[i]).endswith(("FEATURES", "SPELLS"))
                    and similar(lines[i], name) >= 0.8), None)
        heads.append(idx)
        if idx is not None:
            cursor = idx + 1
    for k, name in enumerate(names):
        flags, h = [], heads[k]
        if h is None:
            out.append({"id": f"subclass.{slug(name)}.{book}", "kind": "subclass", "name": name,
                        "classId": f"class.{slug(class_name)}.phb24", "summary": "", "text": "", "features": [],
                        "source": {"book": book, "ruleset": ruleset, "page": None, "ocrUsed": False,
                                   "flags": ["heading not found in the text"]}})
            continue
        end = next((j for j in heads[k + 1:] if j is not None), len(lines))
        block = lines[h + 1:end]
        t = next((i for i, l in enumerate(block) if letters(l).endswith("FEATURES") and caps_share(l) > 0.7), None)
        table = []
        if t is None:
            flags.append("features table not found")
        else:
            table, j = [], t + 1
            while j < len(block) and j < t + 4 and not TABLE_ROW.match(block[j]):
                j += 1  # skip the "Barbarian / Level Feature" heading lines
            rows = []
            while j < len(block):
                m = TABLE_ROW.match(block[j])
                if m:
                    rows.append([int(m.group(1)), m.group(2)])
                elif rows and rows[-1][1].rstrip().endswith(",") and caps_share(block[j]) < 0.5 and len(block[j]) < 70:
                    rows[-1][1] += " " + block[j]  # a table row that wrapped onto a second line
                else:
                    break
                j += 1
            for level_, names_ in rows:
                for part in re.split(r",\s*(?![^()]*\))", names_):
                    table.append((level_, re.sub(r"\s*\(.*?\)\s*$", "", part).strip(), part.strip()))
        marker_texts = {}
        if not table:
            markers = [i for i, l in enumerate(block) if LEVEL_MARKER.match(l) and i > 0 and similar(LEVEL_MARKER.match(l).group(2), name) >= 0.8]
            for n_, i in enumerate(markers):
                label = block[i - 1].title().replace("'S", "'s")
                stop = (markers[n_ + 1] - 1) if n_ + 1 < len(markers) else len(block)
                table.append((int(LEVEL_MARKER.match(block[i]).group(1)), label, label))
                marker_texts[label] = tidy([l for l in block[i + 1:stop] if not (caps_share(l) > 0.9 and len(l) > 20 and l.endswith("SPELLS"))])
            if table:
                flags = [f for f in flags if f != "features table not found"]
        first_seen, features = dict(marker_texts), []
        for printed, fname, label in table:
            fflags = []
            level = max(printed, SUBCLASS_LEVEL)
            if level != printed:
                fflags.append(f"printed at level {printed}; granted at level {level} by the table rule")
            if fname not in first_seen:
                idx = next((i for i, l in enumerate(block) if is_feature_heading(l) and similar(l, fname) >= 0.8 and i > (t or 0)), None)
                if idx is None:
                    text = ""
                    fflags.append("feature heading not found in the text")
                else:
                    stop = next((i for i in range(idx + 1, len(block)) if is_feature_heading(block[i])), len(block))
                    text = tidy(block[idx + 1:stop])
                first_seen[fname] = text
            else:
                text = first_seen[fname]  # a feature that grows (e.g. Spirit Shield) is described once
            dice = re.search(r"\((\d+d\d+)\)", label)
            if dice and dice.group(1) not in text:
                found = sorted(set(re.findall(r"\b\d+d\d+\b", text)))
                fflags.append(f"table says {dice.group(1)} but the feature text has {found}; possible OCR slip in one of them")
            if name_is_broken(fname, 0.1):
                fflags.append(f"name '{fname}' contains non-words; check against the page")
            features.append({
                "id": f"feature.{slug(name)}.{slug(label)}.{book}", "name": label, "level": level, "printedLevel": printed,
                "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240], "text": text,
                "source": {"book": book, "ruleset": ruleset, "page": pages[h], "ocrUsed": pages[h] in ocr_pages, "flags": fflags},
            })
        if not features:
            flags.append("no features found")
        domain_spells = []
        ds = next((i for i, l in enumerate(block) if letters(l).endswith("SPELLS") and caps_share(l) > 0.9
                   and any(TABLE_ROW.match(x) for x in block[i + 1:i + 4])), None)
        if ds is not None:
            j = ds + 1
            while j < len(block) and not TABLE_ROW.match(block[j]) and j < ds + 4:
                j += 1
            while j < len(block) and TABLE_ROW.match(block[j]):
                m = TABLE_ROW.match(block[j])
                domain_spells.append({"level": int(m.group(1)), "spells": [x.strip() for x in re.split(r",\s*", m.group(2)) if x.strip()]})
                j += 1
        out.append({"id": f"subclass.{slug(name)}.{book}", "kind": "subclass", "name": name, "domainSpells": domain_spells,
                    "classId": f"class.{slug(class_name)}.phb24", "summary": "", "text": "", "features": features,
                    "source": {"book": book, "ruleset": ruleset, "page": pages[h], "ocrUsed": pages[h] in ocr_pages, "flags": flags}})
    return out, fixes, []


def parse_legacy_feats(cache_dir, book, ruleset, first, last):
    """Tasha's feats: a capitals name, an optional 'Prerequisite:' line, then the benefits."""
    fixes, feats = [], []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    heads = [i for i, l in enumerate(lines) if len(l) >= 4 and caps_share(l) > 0.9 and l != "FEATS" and len(l) < 40]
    # The same name twice in a row is a page break inside one feat.
    heads = [i for n, i in enumerate(heads) if n == 0 or letters(lines[i]) != letters(lines[heads[n - 1]])]
    for n, i in enumerate(heads):
        name = lines[i].title()
        flags = [f"name '{name}' contains non-words; check against the page"] if name_is_broken(name, 0.1) else []
        end = heads[n + 1] if n + 1 < len(heads) else len(lines)
        body = [l for l in lines[i + 1:end] if letters(l) != letters(lines[i])]
        prereq = None
        if body and body[0].startswith("Prerequisite"):
            prereq = re.sub(r"^Prerequisite:?\s*", "", body[0])
            body = body[1:]
        text = tidy(body)
        feats.append({
            "id": f"feat.{slug(name)}.{book}", "kind": "feat", "name": name,
            "source": {"book": book, "ruleset": ruleset, "page": pages[i], "ocrUsed": pages[i] in ocr_pages, "flags": flags},
            "category": "legacy", "prerequisite": {"printed": prereq, "level": None, "abilities": {}} if prereq else None,
            "repeatable": False, "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240], "text": text,
        })
    return feats, fixes


# ---- Tasha's layout: each feature is a heading followed by "3rd-level Way of Mercy feature" --------------

CLASS_WORDS = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]
MARKER_NAME = re.compile(r"^(\d{1,2})\s?(?:st|nd|rd|th)-level\s+(.+?)\s+feature", re.IGNORECASE)


def parse_subclasses_by_markers(cache_dir, book, ruleset, first, last, skip_classes=()):
    """Subclasses named by their feature marker lines. The class comes from the nearest class heading above."""
    fixes, found = [], {}
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    current_class = None
    markers = []
    for i, line in enumerate(lines):
        flat = line.strip().lower()
        if flat in CLASS_WORDS and line.strip().isupper():
            current_class = flat
        m = MARKER_NAME.match(line)
        if m and i > 0 and m.group(2).lower() not in CLASS_WORDS and not m.group(2).lower().startswith(("optional", "class")):
            markers.append((i, int(m.group(1)), m.group(2).strip(), current_class))
    for n, (i, printed, sub_name, cls) in enumerate(markers):
        if cls is None or cls in skip_classes:
            continue
        heading = lines[i - 1]
        stop = (markers[n + 1][0] - 1) if n + 1 < len(markers) else len(lines)
        text = tidy(lines[i + 1:stop])
        fname = heading.title().replace("'S", "'s")
        fflags = []
        if caps_share(heading) < 0.8:
            fflags.append(f"heading line '{heading}' is not capitals; the feature name may be wrong")
        if name_is_broken(fname, 0.1):
            fflags.append(f"name '{fname}' contains non-words; check against the page")
        level = max(printed, SUBCLASS_LEVEL)
        if level != printed:
            fflags.append(f"printed at level {printed}; granted at level {level} by the table rule")
        sub = found.setdefault(sub_name, {"class": cls, "page": pages[i], "features": []})
        sub["features"].append({
            "id": f"feature.{slug(sub_name)}.{slug(fname)}.{book}", "name": fname, "level": level, "printedLevel": printed,
            "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240], "text": text,
            "source": {"book": book, "ruleset": ruleset, "page": pages[i], "ocrUsed": pages[i] in ocr_pages, "flags": fflags}})
    out = []
    for sub_name, v in found.items():
        name = re.sub(r"\s+", " ", sub_name)
        out.append({"id": f"subclass.{slug(name)}.{book}", "kind": "subclass", "name": name, "domainSpells": [],
                    "classId": f"class.{v['class']}.phb24", "summary": "", "text": "", "features": v["features"],
                    "source": {"book": book, "ruleset": ruleset, "page": v["page"], "ocrUsed": v["page"] in ocr_pages,
                               "flags": [] if v["features"] else ["no features found"]}})
    return out, fixes
