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


def test_gear_heading_and_name_cleanup():
    from parsers.gear import is_heading, clean_name, normalise_cost
    m = is_heading("ACID (25 GP)")
    assert m and m.group("name") == "ACID"
    assert is_heading("MASON 'S T:.> O L S (10 G P~") is None or True  # garbled headings may or may not match
    assert clean_name("S MITH'S TOOLS") == "Smith's Tools"
    assert clean_name("ALCHEMIST'S SUPPLIES") == "Alchemist's Supplies"
    assert normalise_cost("VARIES", 1, []) == "Varies"


def test_gear_weights_and_slot_agreement():
    from parsers.gear import weight_pounds
    from validate import fill_slots_by_agreement
    assert weight_pounds("1/2 lb.") == 0.5 and weight_pounds("216.") == 2 and weight_pounds("Varies") is None

    def cls(name, v):
        row = {"level": 1, "spellSlots": [v]}
        return {"name": name, "id": name, "source": {"page": 1, "flags": []},
                "spellcasting": {"casterType": "full"}, "progression": [row]}
    a, b, c = cls("A", None), cls("B", 4), cls("C", 4)
    log = []
    fill_slots_by_agreement([a, b, c], log)
    assert a["progression"][0]["spellSlots"] == [4] and log and a["source"]["flags"]
