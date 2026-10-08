from pathlib import Path
import gc

import pandas as pd


ROOT = Path(r"C:\PROJECTS\IntelliTraffic\traffic-prediction-system")

HOURLY_DIR = ROOT / "data" / "processed" / "hourly"
META_FILE = ROOT / "data" / "raw" / "largest" / "ca_meta.csv"
OUTPUT_DIR = ROOT / "data" / "processed" / "ml"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

YEARS = [2017, 2018, 2019, 2020, 2021]

BATCH_SIZE = 250


# ---------------------------------------------------------
# Load sensor metadata
# ---------------------------------------------------------

def load_sensor_metadata():

    print("Loading sensor metadata...")

    meta = pd.read_csv(META_FILE)

    meta["ID"] = meta["ID"].astype(str)

    print("Sensors:", len(meta))

    return meta


# ---------------------------------------------------------
# Create features for one sensor
# ---------------------------------------------------------

def create_sensor_features(df, sensor_id, meta):

    sensor_id = str(sensor_id)

    data = pd.DataFrame()

    data["date_time"] = pd.to_datetime(df["Time"])

    data["traffic"] = df[sensor_id].astype("float32")

    # -----------------------------------------------------
    # Time features
    # -----------------------------------------------------

    data["hour"] = data["date_time"].dt.hour.astype("int8")

    data["day_of_week"] = (
        data["date_time"].dt.weekday
    ).astype("int8")

    data["month"] = (
        data["date_time"].dt.month
    ).astype("int8")

    data["is_weekend"] = (
        data["day_of_week"] >= 5
    ).astype("int8")

    data["is_rush_hour"] = (
        data["hour"].isin([7, 8, 9, 16, 17, 18])
    ).astype("int8")

    # -----------------------------------------------------
    # Lag features
    # -----------------------------------------------------

    data["traffic_lag_1"] = data["traffic"].shift(1)
    data["traffic_lag_2"] = data["traffic"].shift(2)
    data["traffic_lag_3"] = data["traffic"].shift(3)

    data["traffic_lag_24"] = (
        data["traffic"].shift(24)
    )

    data["traffic_lag_168"] = (
        data["traffic"].shift(168)
    )

    # -----------------------------------------------------
    # Rolling features
    # -----------------------------------------------------

    data["rolling_mean_3"] = (
        data["traffic"]
        .shift(1)
        .rolling(3)
        .mean()
    )

    data["rolling_mean_24"] = (
        data["traffic"]
        .shift(1)
        .rolling(24)
        .mean()
    )

    # -----------------------------------------------------
    # Sensor metadata
    # -----------------------------------------------------

    sensor_meta = meta[
        meta["ID"] == sensor_id
    ]

    if sensor_meta.empty:
        raise ValueError(
            f"Metadata not found for sensor {sensor_id}"
        )

    sensor_meta = sensor_meta.iloc[0]

    data["sensor_id"] = sensor_id

    data["latitude"] = (
        float(sensor_meta["Lat"])
    )

    data["longitude"] = (
        float(sensor_meta["Lng"])
    )

    data["lanes"] = (
        int(sensor_meta["Lanes"])
    )

    # -----------------------------------------------------
    # Target
    # -----------------------------------------------------

    data["target_traffic"] = (
        data["traffic"].shift(-1)
    )

    # -----------------------------------------------------
    # Remove rows created by lag/target operations
    # -----------------------------------------------------

    data = data.dropna()

    return data


# ---------------------------------------------------------
# Process one batch of sensors
# ---------------------------------------------------------

def process_batch(
    df,
    sensor_ids,
    meta,
    year,
    batch_number
):

    frames = []

    for sensor_id in sensor_ids:

        sensor_features = create_sensor_features(
            df,
            sensor_id,
            meta
        )

        frames.append(sensor_features)

    batch = pd.concat(
        frames,
        ignore_index=True
    )

    output_file = (
        OUTPUT_DIR /
        f"ml_features_{year}_batch_{batch_number:02d}.parquet"
    )

    batch.to_parquet(
        output_file,
        index=False,
        compression="snappy"
    )

    print(
        f"Batch {batch_number:02d} saved | "
        f"Sensors: {len(sensor_ids)} | "
        f"Rows: {len(batch):,} | "
        f"File: {output_file.name}"
    )

    del frames
    del batch

    gc.collect()


# ---------------------------------------------------------
# Process one year
# ---------------------------------------------------------

def process_year(year, meta):

    input_file = (
        HOURLY_DIR /
        f"traffic_hourly_{year}.parquet"
    )

    print("\n" + "=" * 70)
    print(f"PROCESSING ML FEATURES: {year}")
    print("=" * 70)

    print("Loading:", input_file)

    df = pd.read_parquet(input_file)

    print("Input shape:", df.shape)

    # -----------------------------------------------------
    # Identify traffic sensor columns
    # -----------------------------------------------------

    sensor_columns = [
        col
        for col in df.columns
        if str(col).isdigit()
    ]

    print(
        "Traffic sensors found:",
        len(sensor_columns)
    )

    # -----------------------------------------------------
    # Process sensors in batches
    # -----------------------------------------------------

    total_sensors = len(sensor_columns)

    batch_number = 1

    for start in range(
        0,
        total_sensors,
        BATCH_SIZE
    ):

        end = min(
            start + BATCH_SIZE,
            total_sensors
        )

        sensor_batch = sensor_columns[start:end]

        print(
            f"\nProcessing sensors "
            f"{start + 1}-{end} "
            f"of {total_sensors}"
        )

        process_batch(
            df,
            sensor_batch,
            meta,
            year,
            batch_number
        )

        batch_number += 1

    print(
        f"\n{year} COMPLETE"
    )

    del df

    gc.collect()


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():

    meta = load_sensor_metadata()

    for year in YEARS:

        process_year(
            year,
            meta
        )

    print("\n" + "=" * 70)
    print("ALL ML FEATURE ENGINEERING COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
