import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from ocr_fixes import fix_text


def test_ld8_becomes_1d8_and_is_logged():
    log = []
    assert fix_text("deal ld8 damage", 5, log) == "deal 1d8 damage"
    assert log == [{"page": 5, "rule": "dice-l-for-1", "before": "ld8", "after": "1d8"}]


def test_normal_words_untouched():
    log = []
    assert fix_text("the old dragon", 1, log) == "the old dragon"
    assert log == []
