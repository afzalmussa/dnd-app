import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from parsers.spells import parse_components, LEVEL_LINE, CANTRIP_LINE
from validate import validate_spell


def test_components_with_material():
    c = parse_components("V, S, M (a pinch of dust)")
    assert (c["v"], c["s"], c["m"], c["material"]) == (True, True, True, "a pinch of dust")
    assert parse_components("V")["s"] is False


def test_type_lines():
    assert LEVEL_LINE.match("Level 2 Divination (Cleric, Wizard)").groups() == ("2", "Divination", "Cleric, Wizard")
    assert CANTRIP_LINE.match("Evocation Cantrip (Wizard)").group(1) == "Evocation"


def test_validate_spell_reports_empty_fields():
    s = {"level": None, "school": "Evocation", "castingTime": "Action", "range": "Self",
         "components": None, "duration": "Instantaneous", "text": "x"}
    assert validate_spell(s) == ["level is empty", "components is empty"]
