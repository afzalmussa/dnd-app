"""Parse the subclasses printed after each PHB class.

Layout: a "<CLASS> SUBCLASSES" heading, a sentence naming the subclasses, then for each one
a capitals heading, a one-line tagline, intro text and "LEVEL n: NAME" feature headings.
"""
import difflib
import re

from parsers.classes import letters, slug
from parsers.origins import load_lines, name_is_broken, tidy

DIGITS = {"l": "1", "I": "1", "O": "0", "o": "0"}


def caps_share(line):
    chars = [c for c in line if c.isalpha()]
    return sum(c.isupper() for c in chars) / len(chars) if chars else 0


def similar(a, b):
    return difflib.SequenceMatcher(None, letters(a), letters(b)).ratio()


def find_subclass_heading(lines, class_name):
    target = f"{class_name} SUBCLASSES"
    return next((i for i, l in enumerate(lines)
                 if len(l) < 40 and caps_share(l) > 0.7 and "SUBCL" in letters(l) and not letters(l).startswith("LEVEL") and similar(l, target) >= 0.7), None)


def subclass_names(lines, start):
    sentence = tidy(lines[start + 1:start + 25])
    m = re.search(r"presents the (.+?) subclasses", sentence)
    if not m:
        return []
    return [n.strip() for n in re.split(r",\s*(?:and\s+)?|\s+and\s+", m.group(1)) if n.strip()]


def feature_level(heading):
    m = re.match(r"^L\s*E\s*V\s*E\s*L\s*([0-9lIOo]{1,2})\s*[:;.]\s*(.*)$", heading.strip())
    if not m:
        return None, heading
    digits = "".join(DIGITS.get(c, c) for c in m.group(1))
    return (int(digits) if digits.isdigit() else None), m.group(2)


def parse_subclasses(cache_dir, book, ruleset, class_name, first, last):
    fixes, out = [], []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    start = find_subclass_heading(lines, class_name)
    if start is None:
        return [], fixes, [f"{class_name}: '{class_name.upper()} SUBCLASSES' heading not found"]
    names = subclass_names(lines, start)
    if not names:
        return [], fixes, [f"{class_name}: subclass names not read from the intro sentence"]

    # Each subclass heading is the first mostly-capitals line that looks like its name.
    heads, cursor = [], start + 2
    for name in names:
        idx = next((i for i in range(cursor, len(lines))
                    if len(lines[i]) < 45 and caps_share(lines[i]) > 0.6 and similar(lines[i], name) >= 0.75
                    and not letters(lines[i]).startswith("LEVEL")), None)
        heads.append(idx)
        if idx is not None:
            cursor = idx + 1

    for k, name in enumerate(names):
        flags = []
        h = heads[k]
        if h is None:
            out.append({"id": f"subclass.{slug(name)}.{book}", "name": name,
                        "source": {"book": book, "ruleset": ruleset, "page": None, "ocrUsed": False,
                                   "flags": ["heading not found in the text"]},
                        "classId": f"class.{slug(class_name)}.{book}", "summary": "", "features": []})
            continue
        end = next((j for j in heads[k + 1:] if j is not None), len(lines))
        block = lines[h + 1:end]
        feats_at = [i for i, l in enumerate(block) if letters(l).startswith("LEVEL") and len(l) < 70 and caps_share(l) > 0.6]
        tagline = block[0] if block and not (feats_at and feats_at[0] == 0) else ""
        features = []
        for n, i in enumerate(feats_at):
            level, fname = feature_level(block[i])
            fflags = []
            if level is None:
                fflags.append(f"level not readable from heading '{block[i]}'")
            fname = fname.title()
            if name_is_broken(fname, 0.1):
                fflags.append(f"name '{fname}' contains non-words; check against the page")
            stop = feats_at[n + 1] if n + 1 < len(feats_at) else len(block)
            text = tidy(block[i + 1:stop])
            features.append({
                "id": f"feature.{slug(name)}.{slug(fname)}.{book}", "name": fname, "level": level,
                "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240], "text": text,
                "source": {"book": book, "ruleset": ruleset, "page": pages[h + 1 + i], "ocrUsed": pages[h + 1 + i] in ocr_pages, "flags": fflags},
            })
        if name_is_broken(name, 0.1):
            flags.append(f"name '{name}' contains non-words; check against the page")
        if not features:
            flags.append("no features found")
        out.append({
            "id": f"subclass.{slug(name)}.{book}", "kind": "subclass", "name": name,
            "source": {"book": book, "ruleset": ruleset, "page": pages[h], "ocrUsed": pages[h] in ocr_pages, "flags": flags},
            "classId": f"class.{slug(class_name)}.{book}", "summary": tagline, "text": "", "features": features,
        })
    # A subclass heading the scan lost leaves its features at the end of the previous subclass.
    # Levels restart there (3 after 14), so split at that point. This relies on order only.
    for k in range(1, len(out)):
        if out[k]["source"]["page"] is None and not out[k]["features"]:
            prev = out[k - 1]["features"]
            cut = next((i for i in range(1, len(prev)) if (prev[i]["level"] or 0) < (prev[i - 1]["level"] or 0)), None)
            if cut is not None:
                out[k]["features"], out[k - 1]["features"] = prev[cut:], prev[:cut]
                note = "heading lost in the scan; features split off the previous subclass where levels restart"
                out[k]["source"]["flags"] = [note]
                out[k - 1]["source"]["flags"].append(f"features after level {prev[cut - 1]['level']} moved to {out[k]['name']}")
                out[k]["source"]["page"] = out[k]["features"][0]["source"]["page"]
    return out, fixes, []
