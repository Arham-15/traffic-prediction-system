import pandas as pd
import glob
import os


HOURLY_DIR = "data/processed/hourly"


def get_sensor_history(sensor_id, hours=169, end_time=None):
    """
    Return hourly traffic history for a specific sensor.

    If end_time is provided:
        Returns the latest `hours` observations ending BEFORE
        the selected prediction time.

    If end_time is None:
        Returns the latest available `hours` observations.

    169 hours are required for the 168-hour lag plus rolling features.
    """

    sensor_id = str(sensor_id)

    if end_time is not None:
        end_time = pd.to_datetime(end_time)

    files = sorted(
        glob.glob(
            os.path.join(
                HOURLY_DIR,
                "traffic_hourly_*.parquet"
            )
        )
    )

    if not files:
        raise ValueError(
            "No hourly traffic data files found."
        )

    history_parts = []

    for file in reversed(files):

        df = pd.read_parquet(
            file,
            columns=["Time", sensor_id]
        )

        df["Time"] = pd.to_datetime(df["Time"])

        # If the user selected a prediction time,
        # only use traffic observations BEFORE that time.
        if end_time is not None:
            df = df[df["Time"] < end_time]

        if not df.empty:
            history_parts.append(df)

        combined_rows = sum(
            len(part) for part in history_parts
        )

        if combined_rows >= hours:
            break

    if not history_parts:
        raise ValueError(
            f"No traffic history found for sensor {sensor_id}"
            + (
                f" before {end_time}"
                if end_time is not None
                else ""
            )
        )

    history = pd.concat(
        reversed(history_parts),
        ignore_index=True
    )

    history = history[
        ["Time", sensor_id]
    ].dropna()

    history = history.tail(hours)

    if len(history) < hours:
        raise ValueError(
            f"Not enough traffic history for sensor {sensor_id}. "
            f"Required: {hours}, found: {len(history)}"
        )

    history = history.rename(
        columns={
            sensor_id: "traffic"
        }
    )

    return history.reset_index(drop=True)
