"""Parse feats and species (Chapters 4 and 5 of the PHB)."""
import difflib
import re

from wordfreq import zipf_frequency

import ocr
from ocr_fixes import fix_text
from parsers.classes import letters, slug

FOOTER = re.compile(r"^\W*\d+\W*$")
FEAT_LINE = re.compile(r"^(Origin|General|Fighting Style|Epic Boon) Feat\s*(?:\((.*)\))?\s*$")
TRAIT_START = re.compile(r"^([A-Z][A-Za-z'’-]*(?: [A-Za-z'’-]+){0,4})\.\s+(\S.*)$")


def name_is_broken(name):
    """True when a name has pieces that are not words, e.g. 'A Lert' (a split caused by the drop-cap)."""
    tokens = re.findall(r"[A-Za-z]+", name.replace("'", ""))
    return any(len(t) == 1 or zipf_frequency(t.lower(), "en") < 1.5 for t in tokens)


def tidy(lines):
    text = "\n".join(lines)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return re.sub(r"\s*\n\s*", " ", text).strip()


def load_lines(cache_dir, book, first, last, fixes):
    """All lines of a page range, in column order, with page numbers and page footers removed."""
    lines, pages, ocr_pages = [], [], set()
    for p in range(first, last + 1):
        c = ocr.read_cache(cache_dir, book, p)
        if not c:
            continue
        if c["method"] == "ocr":
            ocr_pages.add(p)
        for line in fix_text(c["text_columns"], p, fixes).split("\n"):
            line = line.strip()
            if line and not FOOTER.search(line) and "CHAPTER" not in letters(line)[:14]:
                lines.append(line)
                pages.append(p)
    return lines, pages, ocr_pages


# ---- feats ---------------------------------------------------------------------------

def parse_prerequisite(text):
    """Keep the printed text; also pull out a level and ability minimums when they are plain."""
    if not text:
        return None
    text = re.sub(r"^Prerequisite:\s*", "", text)
    level = re.search(r"Level\s+(\d+)\+", text)
    abilities = re.findall(r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)\+", text)
    return {"printed": text, "level": int(level.group(1)) if level else None,
            "abilities": {a.lower()[:3]: int(n) for a, n in abilities}}


def parse_feats(cache_dir, book, ruleset, first, last):
    fixes = []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    anchors = [i for i, l in enumerate(lines) if FEAT_LINE.match(l)]
    feats = []
    for n, a in enumerate(anchors):
        flags = []
        m = FEAT_LINE.match(lines[a])
        name = lines[a - 1].title() if a else ""
        if not lines[a - 1].isupper():
            flags.append(f"name line '{lines[a - 1]}' is not capitals; name may be wrong")
        if name_is_broken(name):
            flags.append(f"name '{name}' contains non-words; check against the page")
        end = anchors[n + 1] - 1 if n + 1 < len(anchors) else len(lines)
        body = lines[a + 1:end]
        # Drop section headings such as "GENERAL FEATS" and the sentence under them.
        body = [l for i, l in enumerate(body) if not (l.isupper() and l.endswith("FEATS"))
                and not l.startswith("These feats are in the")]
        text = tidy(body)
        feats.append({
            "id": f"feat.{slug(name)}.{book}", "kind": "feat", "name": name,
            "source": {"book": book, "ruleset": ruleset, "page": pages[a - 1], "ocrUsed": pages[a - 1] in ocr_pages, "flags": flags},
            "category": m.group(1), "prerequisite": parse_prerequisite(m.group(2)),
            "repeatable": bool(re.search(r"\bRepeatable\.", text)),
            "summary": (re.match(r"(.+?[.!?])(\s|$)", text) or [None, text[:200]])[1][:240],
            "text": text,
        })
    return feats, fixes


# ---- species -------------------------------------------------------------------------

def species_names(lines):
    """Read the species list from the intro sentence ('Ten species are presented ... Aasimar, Dragonborn, ...')."""
    i = next((i for i, l in enumerate(lines) if "species are presented" in l), None)
    if i is None:
        return []
    sentence = tidy(lines[i:i + 4])
    m = re.search(r"alphabetical order:\s*(.+?)\.\s", sentence + " ")
    return [n.strip() for n in re.split(r",\s*(?:and\s+)?", m.group(1)) if n.strip()] if m else []


def parse_species(cache_dir, book, ruleset, first, last):
    fixes = []
    lines, pages, ocr_pages = load_lines(cache_dir, book, first, last, fixes)
    names = species_names(lines)
    anchors = [i for i, l in enumerate(lines) if l.startswith("Creature Type:")]
    out, problems = [], []
    if len(names) != len(anchors):
        problems.append(f"found {len(names)} species names but {len(anchors)} 'Creature Type' lines")
    # Where each species' own section starts: its name heading above the traits block.
    starts = []
    for name, a in zip(names, anchors):
        target = letters(name)
        back = range(a - 1, max(a - 60, -1), -1)
        hit = next((j for j in back if difflib.SequenceMatcher(None, target, letters(lines[j])).ratio() >= 0.8 and len(lines[j]) < 30), None)
        starts.append(hit if hit is not None else a - 1)
    for k, (name, a) in enumerate(zip(names, anchors)):
        flags = []
        heading = lines[a - 1]
        if difflib.SequenceMatcher(None, letters(name) + "TRAITS", letters(heading)).ratio() < 0.8:
            flags.append(f"traits heading read as '{heading}', expected '{name.upper()} TRAITS'")
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        block = lines[a:end]
        # fields: Creature Type / Size / Speed, each possibly wrapped, up to "As a X, you have these special traits."
        stop = next((i for i, l in enumerate(block) if re.match(r"^As an? .*special traits", l)), None)
        if stop is None:
            flags.append("line 'As a ..., you have ... special traits' not found")
            stop = 1
        said = re.match(r"^As an? (\w+),", block[stop]) if stop < len(block) else None
        if said and said.group(1) != name and difflib.SequenceMatcher(None, name.lower(), said.group(1).lower()).ratio() >= 0.6:
            fixes.append({"page": pages[a], "rule": "species-name-from-trait-line", "before": name, "after": said.group(1)})
            flags.append(f"species list read '{name}', the traits line says '{said.group(1)}'; used the traits line")
            name = said.group(1)
        head = tidy(block[:stop])
        fm = re.match(r"Creature Type:\s*(.*?)\s*Size:\s*(.*?)\s*Speed:\s*(.*)$", head)
        if not fm:
            flags.append(f"creature type, size and speed not read from: {head[:80]}")
        traits, cur = [], None
        prev = ""
        for line in block[stop + 1:]:
            m = TRAIT_START.match(line)
            # A real trait name starts a new paragraph, so the line before it ends a sentence.
            # (Otherwise "...your\nProficiency Bonus. The..." looks like a trait called "Proficiency Bonus".)
            wrapped = len(prev) >= 35 and prev[-1].isalnum()  # a full prose line that did not end its sentence
            if m and not wrapped:
                cur = {"name": m.group(1), "lines": [m.group(2)]}
                traits.append(cur)
            elif cur:
                cur["lines"].append(line)
            prev = line
        sid = f"species.{slug(name)}.{book}"
        out.append({
            "id": sid, "kind": "species", "name": name,
            "source": {"book": book, "ruleset": ruleset, "page": pages[a], "ocrUsed": pages[a] in ocr_pages, "flags": flags},
            "creatureType": fm.group(1) if fm else None, "size": fm.group(2) if fm else None,
            "speed": fm.group(3) if fm else None, "summary": "", "text": "",
            "traits": [{"id": f"feature.{slug(name)}.{slug(t['name'])}.{book}", "name": t["name"], "level": 1,
                        "summary": tidy(t["lines"])[:240], "text": tidy(t["lines"]),
                        "source": {"book": book, "ruleset": ruleset, "page": pages[a], "ocrUsed": False, "flags": []}}
                       for t in traits],
        })
        if not traits:
            flags.append("no traits found")
    return out, fixes, problems
