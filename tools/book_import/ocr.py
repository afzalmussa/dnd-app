"""OCR a page with Tesseract at 300 DPI. Results are cached per page so re-runs are free."""
import json
from pathlib import Path
import pymupdf
import pytesseract
from PIL import Image

TESSERACT_EXE = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
pytesseract.pytesseract.tesseract_cmd = TESSERACT_EXE


def cache_path(cache_dir, book, page_no):
    return Path(cache_dir) / book / f"page-{page_no:04d}.json"


def read_cache(cache_dir, book, page_no):
    p = cache_path(cache_dir, book, page_no)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def write_cache(cache_dir, book, page_no, record):
    p = cache_path(cache_dir, book, page_no)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")


def ocr_page(page):
    pix = page.get_pixmap(dpi=300)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    return pytesseract.image_to_string(img, config="--psm 1")
