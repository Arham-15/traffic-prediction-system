import pandas as pd
import numpy as np
import glob
import os
import gc


# ============================================================
# CONFIG
# ============================================================

ML_DIR = r"data\processed\ml_continuous"
WEATHER_DIR = r"data\processed\weather"
MAPPING_FILE = r"data\processed\sensor_weather_mapping.csv"
OUTPUT_DIR = r"data\processed\ml_v2"

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# LOAD SENSOR → WEATHER MAPPING
# ============================================================

print("=" * 70)
print("INTELLITRAFFIC V2 - WEATHER ALIGNMENT")
print("=" * 70)

print()
print("Loading sensor-weather mapping...")

mapping = pd.read_csv(MAPPING_FILE)

mapping["sensor_id"] = mapping["sensor_id"].astype(str)

# Create stable weather-cell IDs.
weather_cells = (
    mapping[
        ["weather_latitude", "weather_longitude"]
    ]
    .drop_duplicates()
    .reset_index(drop=True)
)

weather_cells["weather_cell_id"] = np.arange(
    len(weather_cells),
    dtype=np.int16
)

mapping = mapping.merge(
    weather_cells,
    on=[
        "weather_latitude",
        "weather_longitude"
    ],
    how="left"
)

print("Mapped sensors:", mapping["sensor_id"].nunique())
print("Weather cells:", mapping["weather_cell_id"].nunique())
print("Missing cell IDs:", mapping["weather_cell_id"].isna().sum())


# ============================================================
# LOAD WEATHER FOR ONE YEAR
# ============================================================

def load_weather_year(year):

    print()
    print("-" * 70)
    print(f"LOADING WEATHER: {year}")
    print("-" * 70)

    weather_files = sorted(
        glob.glob(
            os.path.join(
                WEATHER_DIR,
                "weather_*.parquet"
            )
        )
    )

    parts = []

    for i, file in enumerate(weather_files, 1):

        df = pd.read_parquet(
            file,
            columns=[
                "date_time",
                "temperature",
                "rain",
                "snow",
                "cloudiness",
                "weather_latitude",
                "weather_longitude"
            ]
        )

        df = df[
            df["date_time"].dt.year == year
        ].copy()

        if len(df) == 0:
            del df
            continue

        df["weather_latitude"] = df[
            "weather_latitude"
        ].astype("float64")

        df["weather_longitude"] = df[
            "weather_longitude"
        ].astype("float64")

        parts.append(df)

        del df

        if i % 50 == 0:
            print(
                f"Weather files scanned: "
                f"{i}/{len(weather_files)}"
            )

    weather = pd.concat(
        parts,
        ignore_index=True
    )

    del parts
    gc.collect()

    # Attach weather cell ID.
    weather = weather.merge(
        weather_cells,
        on=[
            "weather_latitude",
            "weather_longitude"
        ],
        how="left"
    )

    weather = weather[
        [
            "date_time",
            "weather_cell_id",
            "temperature",
            "rain",
            "snow",
            "cloudiness"
        ]
    ]

    weather["weather_cell_id"] = (
        weather["weather_cell_id"]
        .astype("int16")
    )

    weather["temperature"] = (
        weather["temperature"]
        .astype("float32")
    )

    weather["rain"] = (
        weather["rain"]
        .astype("float32")
    )

    weather["snow"] = (
        weather["snow"]
        .astype("float32")
    )

    weather["cloudiness"] = (
        weather["cloudiness"]
        .astype("float32")
    )

    weather = weather.drop_duplicates(
        subset=[
            "weather_cell_id",
            "date_time"
        ]
    )

    print()
    print("Weather rows:", f"{len(weather):,}")
    print(
        "Weather cells:",
        weather["weather_cell_id"].nunique()
    )
    print(
        "Date range:",
        weather["date_time"].min(),
        "→",
        weather["date_time"].max()
    )

    return weather


# ============================================================
# PROCESS ONE YEAR
# ============================================================

def process_year(year):

    print()
    print("=" * 70)
    print(f"PROCESSING V2 YEAR: {year}")
    print("=" * 70)

    weather = load_weather_year(year)

    # --------------------------------------------------------
    # Find ML batches for this year
    # --------------------------------------------------------

    ml_files = sorted(
        glob.glob(
            os.path.join(
                ML_DIR,
                f"ml_features_{year}_batch_*.parquet"
            )
        )
    )

    print()
    print("ML batches:", len(ml_files))

    if not ml_files:
        print(f"No ML files found for {year}")
        del weather
        gc.collect()
        return

    # --------------------------------------------------------
    # Process each ML batch
    # --------------------------------------------------------

    for batch_index, ml_file in enumerate(
        ml_files,
        1
    ):

        filename = os.path.basename(ml_file)

        output_file = os.path.join(
            OUTPUT_DIR,
            filename
        )

        # Resume support
        if os.path.exists(output_file):

            print()
            print(
                f"[{batch_index}/{len(ml_files)}] "
                f"SKIP - already exists: {filename}"
            )

            continue

        print()
        print(
            f"[{batch_index}/{len(ml_files)}] "
            f"Processing: {filename}"
        )

        df = pd.read_parquet(
            ml_file
        )

        print(
            "Traffic rows:",
            f"{len(df):,}"
        )

        # Ensure consistent types.
        df["sensor_id"] = (
            df["sensor_id"]
            .astype(str)
        )

        df["date_time"] = pd.to_datetime(
            df["date_time"]
        )

        # ----------------------------------------------------
        # Attach weather cell ID to each sensor
        # ----------------------------------------------------

        df = df.merge(
            mapping[
                [
                    "sensor_id",
                    "weather_cell_id"
                ]
            ],
            on="sensor_id",
            how="left",
            validate="many_to_one"
        )

        missing_cells = (
            df["weather_cell_id"]
            .isna()
            .sum()
        )

        if missing_cells > 0:

            raise ValueError(
                f"{missing_cells:,} rows have "
                f"no weather-cell mapping."
            )

        df["weather_cell_id"] = (
            df["weather_cell_id"]
            .astype("int16")
        )

        # ----------------------------------------------------
        # Join hourly weather
        # ----------------------------------------------------

        df = df.merge(
            weather,
            on=[
                "date_time",
                "weather_cell_id"
            ],
            how="left",
            validate="many_to_one"
        )

        # ----------------------------------------------------
        # Validate weather alignment
        # ----------------------------------------------------

        weather_columns = [
            "temperature",
            "rain",
            "snow",
            "cloudiness"
        ]

        missing_weather = (
            df[weather_columns]
            .isna()
            .any(axis=1)
            .sum()
        )

        if missing_weather > 0:

            raise ValueError(
                f"{missing_weather:,} rows have "
                f"missing weather data in {filename}."
            )

        # ----------------------------------------------------
        # Remove helper column
        # ----------------------------------------------------

        df = df.drop(
            columns=["weather_cell_id"]
        )

        # ----------------------------------------------------
        # Save V2 batch
        # ----------------------------------------------------

        df.to_parquet(
            output_file,
            index=False,
            compression="snappy"
        )

        print(
            "Saved:",
            output_file
        )

        print(
            "Final rows:",
            f"{len(df):,}"
        )

        print(
            "Weather missing:",
            missing_weather
        )

        del df
        gc.collect()

    del weather
    gc.collect()

    print()
    print(f"{year} V2 COMPLETE")


# ============================================================
# MAIN
# ============================================================

for year in range(2017, 2022):

    process_year(year)


# ============================================================
# FINAL
# ============================================================

print()
print("=" * 70)
print("V2 WEATHER ALIGNMENT COMPLETE")
print("=" * 70)

print()
print("Output directory:")
print(OUTPUT_DIR)
