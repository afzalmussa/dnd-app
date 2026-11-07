"""Read a class features table from a PDF page using word positions.

The text layer is noisy ("s" for 5, "ll" for 11, "+S" for +5), so numbers are repaired
only inside the table's number cells and every repair is logged.
"""
import re

# Characters OCR often confuses with digits. Only applied to cells that must be numbers.
DIGIT_LOOKALIKES = {"l": "1", "I": "1", "|": "1", "O": "0", "o": "0", "S": "5", "s": "5"}


def fix_number(token, page, log):
    """Return the token as clean digits (keeps a leading + or -), or None if it isn't a number."""
    sign = token[0] if token[:1] in "+-" else ""
    body = token[len(sign):]
    if not body:
        return None
    fixed = "".join(DIGIT_LOOKALIKES.get(c, c) for c in body)
    if not fixed.isdigit():
        return None
    if fixed != body:
        log.append({"page": page, "rule": "table-digit", "before": token, "after": sign + fixed})
    return sign + fixed


def _center_x(w):
    return (w[0] + w[2]) / 2


def _center_y(w):
    return (w[1] + w[3]) / 2


def _group_rows(tokens, gap=7):
    """Group (y, ...) tokens into rows: a new row starts when y jumps by more than `gap`."""
    rows = []
    for t in sorted(tokens, key=lambda t: t["y"]):
        if rows and t["y"] - rows[-1][-1]["y"] <= gap:
            rows[-1].append(t)
        else:
            rows.append([t])
    return rows


def _cluster(values, gap=8):
    """Group sorted numbers that sit close together; return the mean of each group."""
    groups = []
    for v in sorted(values):
        if groups and v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [sum(g) / len(g) for g in groups]


def parse_features_table(words, page_no):
    """words = PyMuPDF get_text("words") tuples. Returns dict with rows, columns, flags, fixes."""
    log, flags = [], []
    result = {"rows": [], "columns": [], "flags": flags, "fixes": log}

    # Header: the top-most "Level" word. Its position, "Bonus" and "Class" tell us where
    # the level, proficiency and feature columns sit (they differ from class to class).
    level_words = [w for w in words if w[4] == "Level" and w[0] < 120]
    bonus_words = [w for w in words if w[4] == "Bonus"]
    class_words = [w for w in words if w[4] == "Class"]
    if not (level_words and bonus_words and class_words):
        flags.append("table: could not find the Level, Bonus and Class headings")
        return result
    level_head = min(level_words, key=lambda w: w[1])
    bonus_cx = _center_x(min(bonus_words, key=lambda w: abs(w[1] - level_head[1])))
    feat_x0 = min(class_words, key=lambda w: abs(w[1] - level_head[1]))[0]
    level_cx = _center_x(level_head)
    header_bottom = _center_y(level_head)  # data rows start just below the middle of "Level"
    header_top = min((w[1] for w in words if w[4].upper().startswith("FEATURES")), default=0)

    # Level labels: numbers under the Level heading.
    labels = []
    for w in words:
        if abs(_center_x(w) - level_cx) <= 15 and _center_y(w) > header_bottom:
            n = fix_number(w[4], page_no, log)
            if n and not n.startswith(("+", "-")) and int(n) <= 20:
                labels.append({"y": _center_y(w), "level": int(n)})
    labels.sort(key=lambda t: t["y"])

    # Proficiency bonus: "+N" tokens under the Bonus heading.
    prof_tokens = []
    for w in words:
        if abs(_center_x(w) - bonus_cx) <= 15 and _center_y(w) > header_bottom:
            n = fix_number(w[4], page_no, log)
            if n and n.startswith("+"):
                prof_tokens.append({"y": _center_y(w), "value": int(n)})

    # The scan sometimes loses the "1" in the Level column. If labels start at 2 and there is
    # one proficiency token above label 2, that token is the level 1 row.
    if [t["level"] for t in labels] == list(range(2, 21)):
        above = [t for t in prof_tokens if t["y"] < labels[0]["y"] - 7]
        if len(above) == 1:
            labels.insert(0, {"y": above[0]["y"], "level": 1})
            flags.append("table: level 1 label missing in the scan; row found by position")
    if [t["level"] for t in labels] != list(range(1, 21)):
        flags.append(f"table: level labels read as {[t['level'] for t in labels]}, expected 1 to 20")
        return result
    table_bottom = labels[-1]["y"] + 12
    result["bottom"] = table_bottom
    table_top = labels[0]["y"] - 9  # keeps heading words such as "Features" out of row 1
    in_table = lambda w: header_bottom < _center_y(w) < table_bottom

    prof = {}
    for t in prof_tokens:
        if t["y"] < table_bottom:
            nearest = min(labels, key=lambda l: abs(l["y"] - t["y"]))
            prof[nearest["level"]] = t["value"]

    # Number cells: right of the feature names.
    numeric = []
    for w in words:
        if in_table(w) and w[0] >= feat_x0 + 30:
            n = fix_number(w[4], page_no, log)
            if n is not None:
                numeric.append({"y": _center_y(w), "x": _center_x(w), "x0": w[0], "value": n})
    feature_right = min((t["x0"] for t in numeric), default=10_000) - 4

    # Feature names: words between the Class heading and the first number column.
    feature_words = {t["level"]: [] for t in labels}
    for w in words:
        if in_table(w) and _center_y(w) > table_top and feat_x0 - 3 <= w[0] < feature_right:
            nearest = min(labels, key=lambda t: abs(t["y"] - _center_y(w)))
            feature_words[nearest["level"]].append((round(_center_y(w) / 4), w[0], w[4]))

    # Column positions and names from the number cells and the header words above them.
    col_x = _cluster([t["x"] for t in numeric])
    header_words = [w for w in words if header_top <= _center_y(w) <= header_bottom + 1 and _center_x(w) > feature_right]
    names = []
    for cx in col_x:
        near = sorted((w for w in header_words if abs(_center_x(w) - cx) <= 14), key=lambda w: (_center_y(w), w[0]))
        digit = next((fix_number(w[4], page_no, []) for w in near if fix_number(w[4], page_no, [])), None)
        names.append(digit if digit else " ".join(w[4] for w in near))
    if any(not n for n in names):
        flags.append("table: a number column has no readable heading")
    result["columns"] = [{"name": n or f"column@{round(cx)}", "x": round(cx)} for n, cx in zip(names, col_x)]

    # Pair number rows with levels by order (their y positions are offset from the level labels).
    number_rows = _group_rows(numeric)
    cells_by_level = {t["level"]: {} for t in labels}
    if len(number_rows) == 20:
        for lab, row in zip(labels, number_rows):
            for t in row:
                col = min(range(len(col_x)), key=lambda i: abs(col_x[i] - t["x"]))
                if result["columns"][col]["name"] in cells_by_level[lab["level"]]:
                    flags.append(f"table: two numbers in one cell at level {lab['level']}")
                cells_by_level[lab["level"]][result["columns"][col]["name"]] = int(t["value"])
    else:
        flags.append(f"table: found {len(number_rows)} number rows, expected 20; numbers left empty")

    for lab in labels:
        ordered = sorted(feature_words[lab["level"]])
        text = " ".join(w for _, _, w in ordered)
        result["rows"].append({
            "level": lab["level"],
            "proficiencyBonus": prof.get(lab["level"]),
            "featuresPrinted": text,
            "cells": cells_by_level[lab["level"]],
        })
    return result
