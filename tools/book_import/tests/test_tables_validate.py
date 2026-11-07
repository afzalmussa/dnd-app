import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from parsers.tables import fix_number
from validate import proficiency_for_level, validate_class


def test_fix_number_repairs_lookalikes_and_logs():
    log = []
    assert fix_number("ll", 1, log) == "11"
    assert fix_number("+S", 1, log) == "+5"
    assert fix_number("Rage", 1, log) is None
    assert len(log) == 2


def test_proficiency_progression():
    assert [proficiency_for_level(n) for n in (1, 4, 5, 9, 13, 17, 20)] == [2, 2, 3, 4, 5, 6, 6]


def test_validate_flags_wrong_bonus_and_falling_slots():
    rows = [{"level": n, "proficiencyBonus": proficiency_for_level(n), "columns": {}, "spellSlots": [2] + [0] * 8}
            for n in range(1, 21)]
    rows[4]["proficiencyBonus"] = 9
    rows[10]["spellSlots"][0] = 1
    entry = {"progression": rows, "columnNames": [], "features": []}
    problems = validate_class(entry)
    assert any("level 5" in p for p in problems)
    assert any("go down" in p for p in problems)
