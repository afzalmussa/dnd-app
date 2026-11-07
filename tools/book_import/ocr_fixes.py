"""Fix known OCR slips before parsing. Every fix is logged as (page, rule, before, after)."""
import re

# (rule name, pattern, replacement). Only patterns where a letter clearly stands in for a digit.
RULES = [
    ("dice-l-for-1", re.compile(r"\b[lI](d(?:4|6|8|10|12|20|100))\b"), r"1\1"),
    ("dice-digit-O", re.compile(r"\b(\d+d)O\b"), r"\g<1>0"),
    ("dice-spaced", re.compile(r"\b(\d+) d (4|6|8|10|12|20|100)\b"), r"\1d\2"),
    ("number-O-for-0", re.compile(r"\b(\d+)O\b"), r"\g<1>0"),
    ("O-hit-points", re.compile(r"\bO(?= Hit Points?\b)"), "0"),
    ("l-for-1-before-unit", re.compile(r"\bl(?= (?:minute|hour|round|day|action|Bonus Action|Reaction|foot|mile)\b)"), "1"),
    ("ligature-hyphen-break", re.compile(r"(\w)-\n(\w)"), r"\1\2"),
]


def fix_text(text, page, log):
    """Apply every rule; append one log entry per change to `log`."""
    for name, pattern, repl in RULES:
        def sub(m, repl=repl, name=name):
            after = m.expand(repl)
            log.append({"page": page, "rule": name, "before": m.group(0), "after": after})
            return after
        text = pattern.sub(sub, text)
    return text
