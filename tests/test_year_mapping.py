import pytest

from src.history_time import (
    map_to_historical_reference,
    validate_prediction_time,
)
from src.severity import classify_severity


def test_all_five_years_map_deterministically():
    expected = {
        "2026-02-15 18:00": "2017-02-15 18:00",
        "2027-02-15 18:00": "2018-02-15 18:00",
        "2028-02-15 18:00": "2019-02-15 18:00",
        "2029-02-15 18:00": "2020-02-15 18:00",
        "2030-02-15 18:00": "2021-02-15 18:00",
    }

    for selected, historical in expected.items():
        reference = map_to_historical_reference(selected)

        assert str(reference) == f"{historical}:00"


def test_month_day_hour_minute_preserved_only_year_changes():
    reference = map_to_historical_reference("2030-07-04 09:30")

    assert reference.year == 2021
    assert (reference.month, reference.day, reference.hour, reference.minute) == (7, 4, 9, 30)


def test_leap_day_clamps_to_feb_28():
    # 2028 is a leap year but 2019 (its historical reference year) is not.
    reference = map_to_historical_reference("2028-02-29 08:00")

    assert reference.year == 2019
    assert reference.month == 2
    assert reference.day == 28
    assert reference.hour == 8


def test_validate_accepts_window_boundaries():
    assert validate_prediction_time("2026-01-01 00:00") is not None
    assert validate_prediction_time("2030-12-31 23:59") is not None


def test_validate_rejects_out_of_window():
    for candidate in (
        "2025-12-31 23:00",
        "2017-06-15 12:00",
        "2021-10-15 18:00",
        "2031-01-01 00:00",
    ):
        with pytest.raises(ValueError):
            validate_prediction_time(candidate)


def test_severity_classification_thresholds():
    assert classify_severity(0) == "LOW"
    assert classify_severity(150) == "LOW"
    assert classify_severity(199.99) == "LOW"
    assert classify_severity(200) == "MODERATE"
    assert classify_severity(399.99) == "MODERATE"
    assert classify_severity(400) == "HIGH"
    assert classify_severity(599.99) == "HIGH"
    assert classify_severity(600) == "SEVERE"
    assert classify_severity(993) == "SEVERE"
