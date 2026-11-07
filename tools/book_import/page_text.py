"""Read one PDF page's text layer and score how trustworthy it is."""
import re
import pymupdf
from wordfreq import zipf_frequency

# A page scoring below this gets OCR'd. Tuned from the survey output (see README).
MIN_WORD_SHARE = 0.80
MIN_CHARS = 200


def layer_text(page):
    """Text layer in reading order. sort=True orders blocks top-to-bottom, left-to-right."""
    return page.get_text("text", sort=True)


def score_text(text):
    """Return {chars, words, word_share, odd_runs}. word_share = share of words that look real."""
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return {"chars": len(text.strip()), "words": 0, "word_share": 0.0, "odd_runs": 0}
    real = sum(1 for w in words if len(w) == 1 and w.lower() in "ai" or zipf_frequency(w.lower(), "en") > 0)
    odd = len(re.findall(r"[^\w\s.,;:'\"!?()\[\]/+\-\u2013\u2014%&*]{2,}", text))
    return {"chars": len(text.strip()), "words": len(words),
            "word_share": round(real / len(words), 3), "odd_runs": odd}


def needs_ocr(score):
    return score["chars"] < MIN_CHARS or score["word_share"] < MIN_WORD_SHARE


def column_text(page, gutter_tol=4):
    """Prose in column order: left column top to bottom, then right column.

    Words come with positions. A word belongs to the right column when its left edge
    is past the page midline. Words that start left of the midline but end past it sit
    in a full-width line (title, wide table) and are kept in that column's flow, which
    is why tables are read with layer_text instead.
    """
    return column_text_from_words(page.get_text("words"), page.rect.width / 2, gutter_tol)


def column_text_from_words(words, mid, gutter_tol=4):
    """Same as column_text, for a list of PyMuPDF word tuples (lets callers drop a table first)."""
    cols = ([], [])
    for x0, y0, x1, y1, w, *_ in words:
        cols[0 if x0 < mid - gutter_tol else 1].append(((y0 + y1) / 2, x0, w, y1))
    out = []
    for col in cols:
        lines, cur, cur_y = [], [], None
        for y0, x0, w, y1 in sorted(col):
            if cur_y is not None and abs(y0 - cur_y) > 4:
                lines.append(" ".join(t for _, t in sorted(cur))); cur = []
            cur_y = y0 if not cur else cur_y  # y0 here is the word's vertical middle
            cur.append((x0, w))
        if cur:
            lines.append(" ".join(t for _, t in sorted(cur)))
        out.append("\n".join(lines))
    return "\n".join(out)
