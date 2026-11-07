import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from text_clean import fix_spacing, clean_name


def test_joins_pieces_split_inside_words():
    s = "Reaction , which yo u ta ke in res ponse to taki ng damage from a creature that you can see withi n 60 feet"
    assert fix_spacing(s) == "Reaction, which you take in response to taking damage from a creature that you can see within 60 feet"


def test_keeps_ordinary_separate_words_and_numbers():
    s = "You can not move 5 feet. Roll 2d6 and add a d4. Any one creature."
    assert fix_spacing(s) == s


def test_names():
    assert clean_name("Ray O F Frost") == "Ray of Frost"
    assert clean_name("Armor Of Agathys") == "Armor of Agathys"
    assert clean_name("Tasha'S Bubbling Cauldron") == "Tasha's Bubbling Cauldron"


def test_three_pieces_and_odd_capitals_in_names():
    assert clean_name("Calm E Motio Ns") == "Calm Emotions"
    assert clean_name("C Ommand") == "Command"
