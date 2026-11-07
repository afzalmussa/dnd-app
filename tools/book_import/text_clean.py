"""Repair stray spaces inside words ("yo u ta ke", "taki ng", "Ray O F Frost") in imported text.

The scan's text layer sometimes puts spaces inside words. A pair of neighbouring pieces is joined when the
joined word is a real English word and at least one piece is not a word on its own (or is a lone letter other
than "a" or "I"). Two ordinary words that happen to sit together ("can not", "any one") are never joined.
Every change is logged with the page so it can be checked.
"""
import re

from wordfreq import zipf_frequency

MIN_JOINED = 2.5      # the joined word must be at least this common
MAX_FRAGMENT = 3.0    # a piece below this is rare enough to be a scan fragment
SMALL_WORDS = {"of", "the", "and", "to", "in", "on", "for", "a", "an", "or", "at", "by", "with", "from"}
TEXT_KEYS = {"text", "summary", "castingTime", "range", "duration", "higherLevels", "startingEquipment", "equipment",
             "printed", "material", "description", "tagline"}


def _z(word):
    return zipf_frequency(word.lower(), "en")


def _split_token(token):
    """'ng,' -> ('ng', ','). Only the trailing punctuation is kept apart."""
    m = re.match(r"^([A-Za-z]+)([^A-Za-z0-9]*)$", token)
    return (m.group(1), m.group(2)) if m else (None, None)


def _should_join(a, b):
    joined = a + b
    lone = lambda w: len(w) == 1 and w.lower() not in "ai"
    if _z(joined) < MIN_JOINED:
        return False
    if not (lone(a) or lone(b)) and _z(joined) <= max(_z(a), _z(b)):  # "in to" stays: "in" is more common than "into"
        return False
    clearly_better = _z(joined) >= 4.5 and _z(joined) >= max(_z(a), _z(b)) + 1.0  # "ta ke" -> "take", but never "in to"
    return clearly_better or _z(a) < MAX_FRAGMENT or _z(b) < MAX_FRAGMENT or lone(a) or lone(b)


def fix_spacing(text):
    """Returns the text with stray spaces inside words removed."""
    if not text:
        return text
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)            # "Reaction , which" -> "Reaction, which"
    for _ in range(4):                                       # a word split in three needs more than one pass
        out, changed = text.split(" "), False
        merged, i = [], 0
        while i < len(out):
            a_core, a_tail = _split_token(out[i])
            if a_core is not None and not a_tail and i + 2 < len(out):
                b_core, b_tail = _split_token(out[i + 1])
                c_core, c_tail = _split_token(out[i + 2])
                if b_core is not None and not b_tail and c_core is not None:
                    joined3 = a_core + b_core + c_core
                    pieces = (a_core, b_core, c_core)
                    if _z(joined3) >= 3.5 and sum(1 for w in pieces if _z(w) < MAX_FRAGMENT or len(w) == 1) >= 2 and _z(joined3) > max((_z(w) for w in pieces if len(w) > 1), default=0):
                        merged.append(joined3 + c_tail)
                        i += 3
                        changed = True
                        continue
            if a_core is not None and not a_tail and i + 1 < len(out):
                b_core, b_tail = _split_token(out[i + 1])
                if b_core is not None and _should_join(a_core, b_core):
                    merged.append(a_core + b_core + b_tail)
                    i += 2
                    changed = True
                    continue
            merged.append(out[i])
            i += 1
        text = " ".join(merged)
        if not changed:
            break
    return text


def clean_name(name):
    """Fixes spacing, then writes small words in lower case ("Ray OF Frost" -> "Ray of Frost")."""
    name = fix_spacing(name)
    name = re.sub(r"'S\b", "'s", name)
    name = " ".join(re.sub(r"^([A-Z])([A-Z]+)([a-z]+)$", lambda m: m.group(1) + (m.group(2) + m.group(3)).lower(), w) if re.match(r"^[A-Z][A-Z]+[a-z]+$", w)
                    else re.sub(r"^([A-Za-z])([a-z]*[A-Z][A-Za-z]*)$", lambda m: m.group(1) + m.group(2).lower(), w) if re.match(r"^[A-Za-z][a-z]*[A-Z]", w) and not w.isupper()
                    else w for w in name.split(" "))
    words = name.split(" ")
    return " ".join(w.lower() if i > 0 and w.lower() in SMALL_WORDS else w for i, w in enumerate(words))


def clean_entry(entry, log, page=None):
    """Cleans an entry in place: its name, its text fields and everything nested inside it (features, traits)."""
    page = (entry.get("source") or {}).get("page") or page if isinstance(entry, dict) else page
    if isinstance(entry, list):
        for item in entry:
            clean_entry(item, log, page)
    elif isinstance(entry, dict):
        for key, value in list(entry.items()):
            if key == "name" and isinstance(value, str):
                new = clean_name(value)
                if new != value:
                    log.append({"page": page, "rule": "stray-space-name", "before": value, "after": new})
                    entry[key] = new
            elif key in TEXT_KEYS and isinstance(value, str):
                new = fix_spacing(value)
                if new != value:
                    log.append({"page": page, "rule": "stray-space", "before": value[:80], "after": new[:80]})
                    entry[key] = new
            elif isinstance(value, (dict, list)) and key not in ("source", "traitBoxPrinted"):
                clean_entry(value, log, page)


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def still_garbled(name):
    tokens = re.findall(r"[A-Za-z]+", name.replace("'", ""))
    return any((len(t) == 1 and t.lower() not in "ai") or zipf_frequency(t.lower(), "en") == 0 for t in tokens)


def clean_entries(entries, log):
    """Cleans a list of imported entries. An entry whose name changed gets the id its new name gives."""
    for e in entries:
        old = e.get("name")
        clean_entry(e, log)
        if old and e.get("name") != old and e.get("kind") in ("spell", "feat", "item", "species", "subclass", "background"):
            e["id"] = f"{e['kind']}.{_slug(e['name'])}.{e['source']['book']}"
        flags = e.get("source", {}).get("flags")
        if e.get("kind") in ("spell", "feat", "item", "species", "subclass", "background") and e.get("name") and flags is not None                 and still_garbled(e["name"]) and not any("looks garbled" in f for f in flags):
            flags.append("name still looks garbled after cleaning; check it against the page")
