"""Structural checks on parsed classes. Anything that fails becomes a flag; nothing is corrected here."""


def proficiency_for_level(level):
    """The standard progression: +2 at level 1, then +1 every four levels."""
    return 2 + (level - 1) // 4


def validate_class(entry):
    """Return a list of problems for one parsed class entry."""
    problems = []
    rows = entry["progression"]
    if [r["level"] for r in rows] != list(range(1, 21)):
        problems.append("progression does not have exactly 20 rows in order")
        return problems
    for r in rows:
        expected = proficiency_for_level(r["level"])
        if r["proficiencyBonus"] != expected:
            problems.append(f"level {r['level']}: proficiency bonus {r['proficiencyBonus']}, standard progression says {expected}")
    for name in entry["columnNames"]:
        values = [r["columns"].get(name) for r in rows]
        if any(v is None for v in values):
            missing = [r["level"] for r in rows if r["columns"].get(name) is None]
            problems.append(f"column '{name}' is empty at levels {missing}")
        else:
            drops = [rows[i]["level"] for i in range(1, 20) if values[i] < values[i - 1]]
            if drops:
                problems.append(f"column '{name}' goes down at levels {drops}")
    if rows[0]["spellSlots"] is not None:
        for slot in range(9):
            col = [r["spellSlots"][slot] or 0 for r in rows]
            drops = [rows[i]["level"] for i in range(1, 20) if col[i] < col[i - 1]]
            if drops:
                problems.append(f"level {slot + 1} spell slots go down at levels {drops}")
    # Every feature name in the table needs text, except the generic "Subclass feature" rows.
    for f in entry["features"]:
        if not f["text"]:
            problems.append(f"feature '{f['name']}' (level {f['level']}) has no text")
    return problems


def compare_caster_slots(entries):
    """Classes with the same caster type must have the same slot table."""
    problems = {}
    by_type = {}
    for e in entries:
        sc = e.get("spellcasting")
        if sc and sc["casterType"]:
            by_type.setdefault(sc["casterType"], []).append(e)
    for ctype, group in by_type.items():
        first = group[0]
        for other in group[1:]:
            a = [r["spellSlots"] for r in first["progression"]]
            b = [r["spellSlots"] for r in other["progression"]]
            diffs = [i + 1 for i in range(20) if a[i] != b[i]]
            if diffs:
                problems.setdefault(other["id"], []).append(
                    f"{ctype} caster slots differ from {first['name']} at levels {diffs}")
    return problems


def validate_spell(s):
    """The seven fields every spell must have (level, school, casting time, range, components, duration)."""
    problems = []
    for key in ("level", "school", "castingTime", "range", "components", "duration"):
        if s[key] is None:
            problems.append(f"{key} is empty")
    if not s["text"]:
        problems.append("no description text")
    return problems


def validate_feat(f):
    problems = []
    if not f["text"]:
        problems.append("no description text")
    if f["category"] == "General" and not f["prerequisite"]:
        problems.append("General feat without a prerequisite line; check the page")
    return problems


def validate_species(s):
    problems = [f"{k} is empty" for k in ("creatureType", "size", "speed") if not s[k]]
    if not s["traits"]:
        problems.append("no traits")
    return problems
