import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from parsers.legacy import TABLE_ROW, subclass_names_from_intro


def test_table_row_reads_level_and_names():
    m = TABLE_ROW.match("10th Consult the Spirits, Spirit Shield (3d8)")
    assert m.group(1) == "10" and m.group(2).startswith("Consult")


def test_subclass_names_from_intro_sentence():
    lines = ["The following options are available to a barbarian, in addition to those",
             "in the Player's Handbook: the Path of the Ancestral Guardian, the Path of",
             "the Storm Herald, and the Path of the Zealot.", "next paragraph"]
    assert subclass_names_from_intro(lines, "a barbarian") == [
        "Path of the Ancestral Guardian", "Path of the Storm Herald", "Path of the Zealot"]
