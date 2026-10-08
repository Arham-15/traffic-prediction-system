"""
Deterministic mapping between user-facing prediction years (2026-2030)
and the real PeMS observation years (2017-2021).

The backend is the single source of truth for this mapping. The frontend
never performs it - it only displays what the API returns.

The mapping changes ONLY the year. Month, day, hour and minute are
preserved exactly, so the historical reference timestamp is used solely
to retrieve real historical traffic for lag/rolling features, while the
user-facing prediction timestamp stays in 2026-2030.
"""

import pandas as pd


# User-facing prediction year -> real historical reference year.
PREDICTION_YEAR_TO_HISTORICAL_YEAR = {
    2026: 2017,
    2027: 2018,
    2028: 2019,
    2029: 2020,
    2030: 2021,
}

# Allowed user-facing prediction window (inclusive, whole years).
PREDICTION_MIN_YEAR = min(PREDICTION_YEAR_TO_HISTORICAL_YEAR)
PREDICTION_MAX_YEAR = max(PREDICTION_YEAR_TO_HISTORICAL_YEAR)


def validate_prediction_time(prediction_time):
    """
    Validate that the prediction time lies inside the supported
    2026-01-01 .. 2030-12-31 window. Raises ValueError otherwise.
    """
    prediction_time = pd.to_datetime(prediction_time)

    if prediction_time.year not in PREDICTION_YEAR_TO_HISTORICAL_YEAR:
        raise ValueError(
            "prediction_time must be between "
            f"{PREDICTION_MIN_YEAR}-01-01 and {PREDICTION_MAX_YEAR}-12-31. "
            f"Received: {prediction_time}"
        )

    return prediction_time


def map_to_historical_reference(prediction_time):
    """
    Return the historical reference timestamp for a 2026-2030
    prediction time.

    Only the year changes; month, day, hour and minute are preserved.
    February 29 falls back to February 28 when the historical
    reference year is not a leap year (e.g. 2028-02-29 -> 2019-02-28).
    """
    prediction_time = pd.to_datetime(prediction_time)

    historical_year = PREDICTION_YEAR_TO_HISTORICAL_YEAR.get(
        prediction_time.year
    )

    if historical_year is None:
        raise ValueError(
            "prediction_time must be between "
            f"{PREDICTION_MIN_YEAR}-01-01 and {PREDICTION_MAX_YEAR}-12-31. "
            f"Received: {prediction_time}"
        )

    try:
        return prediction_time.replace(year=historical_year)
    except ValueError:
        # Feb 29 selected in a leap prediction year whose historical
        # reference year has no Feb 29 - clamp to Feb 28.
        return prediction_time.replace(year=historical_year, day=28)
