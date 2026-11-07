import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from parsers.equipment import fix_cost, fix_weight, fix_dice
from validate import validate_item


def test_cost_weight_and_dice_repairs_are_logged():
    log = []
    assert fix_cost("SOGP", 1, log) == "50 GP"
    assert fix_weight("816.", 1, log) == "8 lb."
    assert fix_dice("Versatile (1 dl 0)", 1, log) == "Versatile (1d10)"
    assert fix_dice("ldl2 Slashing", 1, log) == "1d12 Slashing"
    assert len(log) == 4


def test_validate_item_flags_unknown_mastery():
    item = {"category": "weapon", "cost": "1 GP", "weapon": {"mastery": "Smash", "group": "Simple"}}
    assert any("Smash" in p for p in validate_item(item))
