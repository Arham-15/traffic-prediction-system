import pandas as pd
import numpy as np

from src.traffic_history import get_sensor_history


def build_prediction_features(
    sensor_id,
    latitude,
    longitude,
    lanes,
    prediction_time,
    temperature,
    rain,
    snow,
    cloudiness,
    history_end_time=None
):
    """
    Build the exact 20-feature input required by
    the IntelliTraffic V2 LightGBM model.

    Traffic history comes from the real PeMS dataset.
    Weather values are supplied manually by the user.

    prediction_time is the user-facing timestamp (2026-2030) and
    drives every time feature (hour, day_of_week, month, weekend,
    rush hour). history_end_time is the historical reference
    timestamp (2017-2021) used ONLY to retrieve the real traffic
    history for the lag/rolling features; it defaults to
    prediction_time so historical-date callers behave as before.
    """

    prediction_time = pd.to_datetime(prediction_time)

    # -------------------------------------------------
    # 1. Get 169 hours BEFORE the historical reference time
    # -------------------------------------------------

    history = get_sensor_history(
        sensor_id=sensor_id,
        hours=169,
        end_time=(
            history_end_time
            if history_end_time is not None
            else prediction_time
        )
    )

    if len(history) < 169:
        raise ValueError(
            f"Not enough traffic history for sensor {sensor_id}. "
            f"Required: 169, found: {len(history)}"
        )

    history["Time"] = pd.to_datetime(
        history["Time"]
    )

    traffic = history["traffic"]

    # -------------------------------------------------
    # 2. Time features
    # -------------------------------------------------

    hour = prediction_time.hour

    day_of_week = prediction_time.dayofweek

    month = prediction_time.month

    is_weekend = int(
        day_of_week >= 5
    )

    is_rush_hour = int(
        hour in [7, 8, 9, 16, 17, 18]
    )

    # -------------------------------------------------
    # 3. Historical traffic features
    # -------------------------------------------------

    traffic_lag_1 = traffic.iloc[-1]

    traffic_lag_2 = traffic.iloc[-2]

    traffic_lag_3 = traffic.iloc[-3]

    traffic_lag_24 = traffic.iloc[-24]

    traffic_lag_168 = traffic.iloc[-168]

    # -------------------------------------------------
    # 4. Rolling features
    # -------------------------------------------------

    rolling_mean_3 = (
        traffic.iloc[-3:]
        .mean()
    )

    rolling_mean_24 = (
        traffic.iloc[-24:]
        .mean()
    )

    # -------------------------------------------------
    # 5. Create exact V2 feature vector
    # -------------------------------------------------

    features = pd.DataFrame(
        [
            {
                "traffic": traffic_lag_1,

                "hour": hour,

                "day_of_week": day_of_week,

                "month": month,

                "is_weekend": is_weekend,

                "is_rush_hour": is_rush_hour,

                "traffic_lag_1": traffic_lag_1,

                "traffic_lag_2": traffic_lag_2,

                "traffic_lag_3": traffic_lag_3,

                "traffic_lag_24": traffic_lag_24,

                "traffic_lag_168": traffic_lag_168,

                "rolling_mean_3": rolling_mean_3,

                "rolling_mean_24": rolling_mean_24,

                "latitude": np.float32(latitude),

                "longitude": np.float32(longitude),

                "lanes": np.float32(lanes),

                # Manual weather inputs
                "temperature": np.float32(temperature),

                "rain": np.float32(rain),

                "snow": np.float32(snow),

                "cloudiness": np.float32(cloudiness),
            }
        ]
    )

    return features
