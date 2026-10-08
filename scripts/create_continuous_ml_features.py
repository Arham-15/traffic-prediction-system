import pandas as pd
import numpy as np
import glob
import os
import gc


# ============================================================
# CONFIG
# ============================================================

HOURLY_DIR = r"data\processed\hourly"
OUTPUT_DIR = r"data\processed\ml_continuous"

BATCH_SIZE = 250

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# LOAD ALL HOURLY FILES
# ============================================================

files = sorted(
    glob.glob(
        rf"{HOURLY_DIR}\traffic_hourly_*.parquet"
    )
)

print("=" * 70)
print("CONTINUOUS ML FEATURE ENGINEERING")
print("=" * 70)

print()
print("Files found:", len(files))

for file in files:
    print(" -", file)


# ============================================================
# PROCESS YEARS CONTINUOUSLY
# ============================================================

previous_tail = None

for year_index, file in enumerate(files):

    year = os.path.basename(file).split("_")[-1].replace(
        ".parquet", ""
    )

    print()
    print("=" * 70)
    print(f"PROCESSING {year}")
    print("=" * 70)

    df = pd.read_parquet(file)

    df["Time"] = pd.to_datetime(df["Time"])

    sensor_columns = [
        col for col in df.columns
        if str(col).isdigit()
    ]

    print(
        f"Sensors: {len(sensor_columns)}"
    )

    print(
        f"Rows: {len(df):,}"
    )


    # ========================================================
    # ADD PREVIOUS YEAR TAIL
    # ========================================================

    if previous_tail is not None:

        print(
            "Adding previous 168 hours for continuous lags..."
        )

        df_work = pd.concat(
            [previous_tail, df],
            ignore_index=True
        )

    else:

        df_work = df.copy()


    # ========================================================
    # TIME FEATURES
    # ========================================================

    df_work["hour"] = (
        df_work["Time"].dt.hour.astype("int8")
    )

    df_work["day_of_week"] = (
        df_work["Time"].dt.dayofweek.astype("int8")
    )

    df_work["month"] = (
        df_work["Time"].dt.month.astype("int8")
    )

    df_work["is_weekend"] = (
        (df_work["Time"].dt.dayofweek >= 5)
        .astype("int8")
    )

    df_work["is_rush_hour"] = (
        df_work["Time"].dt.hour.isin(
            [7, 8, 9, 16, 17, 18]
        )
        .astype("int8")
    )


    # ========================================================
    # SENSOR METADATA
    # ========================================================

    meta = pd.read_csv(
        r"data\raw\largest\ca_meta.csv"
    )

    meta["ID"] = meta["ID"].astype(str)

    metadata_lookup = meta.set_index("ID")


    # ========================================================
    # BATCH PROCESSING
    # ========================================================

    total_sensors = len(sensor_columns)

    for start in range(
        0,
        total_sensors,
        BATCH_SIZE
    ):

        end = min(
            start + BATCH_SIZE,
            total_sensors
        )

        batch_sensors = sensor_columns[
            start:end
        ]

        print()
        print(
            f"Processing sensors "
            f"{start + 1}-{end} "
            f"of {total_sensors}"
        )


        batch_parts = []


        for sensor in batch_sensors:

            traffic = df_work[sensor].astype(
                "float32"
            )

            sensor_df = pd.DataFrame({
                "date_time": df_work["Time"],
                "traffic": traffic,

                "hour": df_work["hour"],
                "day_of_week": df_work["day_of_week"],
                "month": df_work["month"],
                "is_weekend": df_work["is_weekend"],
                "is_rush_hour": df_work["is_rush_hour"],

                "traffic_lag_1": traffic.shift(1),
                "traffic_lag_2": traffic.shift(2),
                "traffic_lag_3": traffic.shift(3),
                "traffic_lag_24": traffic.shift(24),
                "traffic_lag_168": traffic.shift(168),

                "rolling_mean_3": (
                    traffic.shift(1)
                    .rolling(3)
                    .mean()
                ),

                "rolling_mean_24": (
                    traffic.shift(1)
                    .rolling(24)
                    .mean()
                ),

                "sensor_id": str(sensor),

                "latitude": np.float32(
                    metadata_lookup.loc[
                        str(sensor), "Lat"
                    ]
                ),

                "longitude": np.float32(
                    metadata_lookup.loc[
                        str(sensor), "Lng"
                    ]
                ),

                "lanes": np.float32(
                    metadata_lookup.loc[
                        str(sensor), "Lanes"
                    ]
                ),

                "target_traffic": traffic.shift(-1)
            })


            # Keep only rows belonging to current year
            sensor_df = sensor_df[
                sensor_df["date_time"].dt.year
                == int(year)
            ]


            sensor_df = sensor_df.dropna()

            batch_parts.append(
                sensor_df
            )


        batch_df = pd.concat(
            batch_parts,
            ignore_index=True
        )


        output_file = (
            os.path.join(
                OUTPUT_DIR,
                f"ml_features_{year}_batch_"
                f"{start // BATCH_SIZE + 1:02d}.parquet"
            )
        )

        batch_df.to_parquet(
            output_file,
            index=False,
            compression="snappy"
        )


        print(
            f"Batch saved | "
            f"Sensors: {len(batch_sensors)} | "
            f"Rows: {len(batch_df):,}"
        )

        print(
            f"File: {output_file}"
        )


        del batch_parts
        del batch_df

        gc.collect()


    # ========================================================
    # KEEP LAST 168 HOURS
    # ========================================================

    previous_tail = df.tail(168).copy()

    del df
    del df_work

    gc.collect()

    print()
    print(f"{year} COMPLETE")


# ============================================================
# COMPLETE
# ============================================================

print()
print("=" * 70)
print("CONTINUOUS ML FEATURE ENGINEERING COMPLETE")
print("=" * 70)
