import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from page_text import score_text, needs_ocr


def test_clean_text_scores_high():
    s = score_text("You can take one action and one bonus action on your turn. " * 6)
    assert s["word_share"] > 0.95 and not needs_ocr(s)


def test_garbage_and_empty_need_ocr():
    assert needs_ocr(score_text(""))
    assert needs_ocr(score_text("xqzv kfjw bnmp " * 40))
