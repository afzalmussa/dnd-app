from parsers.artificer import MARKER, ROW, assemble, read_table, title


def test_marker_and_row_read_spaced_digits():
    assert MARKER.match("1 1th-level artificer feature")
    assert MARKER.match("3rd-level Battle Smith feature").group(2) == "Battle Smith"
    assert ROW.match("1 0th +4 Magic Item Adept 8").group(1).replace(" ", "") == "10"


def test_title_words():
    assert title("THE RIGHT TOOL FOR THE OB") == "The Right Tool for the Job"
    assert title("FLASH OF GENIUS") == "Flash of Genius"


def test_assemble_joins_words_from_two_columns():
    assert assemble("mordenkainensfaithfulhound", ["web", "faithful", "mordenkainens", "hound"]) == ["mordenkainens", "faithful", "hound"]
    assert assemble("jump", ["fly"]) is None


def test_table_needs_twenty_rows():
    flags = []
    assert read_table(["1st +2 Magical Tinkering, Spellcasting"], flags) == []
    assert flags
