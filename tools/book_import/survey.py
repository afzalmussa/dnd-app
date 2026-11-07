"""Survey a book: score every page, OCR poor ones, cache everything.

Usage: python survey.py phb24 [--redo-ocr] [--pages 1-50]
"""
import argparse, json, sys, time
from pathlib import Path
import pymupdf
from page_text import layer_text, column_text, score_text, needs_ocr
import ocr

ROOT = Path(__file__).resolve().parents[2]


def survey(book, redo=False, first=1, last=None, force_ocr=()):
    books = json.loads((Path(__file__).parent / "books.json").read_text(encoding="utf-8"))
    if book not in books:
        sys.exit(f"Unknown book '{book}'. Allowed: {', '.join(books)}")
    doc = pymupdf.open(ROOT / "PDFs" / books[book]["file"])
    last = last or len(doc)
    cache = ROOT / "ocr-cache"
    t0 = time.time()
    for n in range(first, last + 1):
        cached = ocr.read_cache(cache, book, n)
        if cached and not redo and not (n in force_ocr and cached["method"] != "ocr"):
            continue
        page = doc[n - 1]
        text = layer_text(page)
        score = score_text(text)
        method = "text-layer"
        columns = column_text(page)  # prose reads better column by column; tables use `text`
        if needs_ocr(score) or n in force_ocr:  # force_ocr: pages whose text layer lacks headings that are drawn as images
            text, method = ocr.ocr_page(page), "ocr"
            columns = text  # Tesseract already separates columns
        ocr.write_cache(cache, book, n, {"page": n, "method": method, "layer_score": score, "text": text, "text_columns": columns})
        print(f"page {n}/{last} {method} words={score['words']} share={score['word_share']} ({time.time()-t0:.0f}s)", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("book"); ap.add_argument("--redo-ocr", action="store_true")
    ap.add_argument("--pages", help="e.g. 40-80")
    a = ap.parse_args()
    f, l = (map(int, a.pages.split("-")) if a.pages else (1, None))
    survey(a.book, a.redo_ocr, f, l)
