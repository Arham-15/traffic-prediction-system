from pathlib import Path
import pandas as pd

ROOT = Path(r"C:\PROJECTS\IntelliTraffic\traffic-prediction-system")

DATA_DIR = ROOT / "data" / "processed" / "largest"
RAW_DIR = ROOT / "data" / "raw" / "largest"
OUTPUT_DIR = ROOT / "data" / "processed" / "hourly"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

YEARS = [2017, 2018, 2019, 2020, 2021]


def process_year(year):

    input_file = DATA_DIR / f"traffic_{year}.parquet"
    output_file = OUTPUT_DIR / f"traffic_hourly_{year}.parquet"

    print("\n" + "=" * 70)
    print(f"PROCESSING {year}")
    print("=" * 70)

    print("Loading traffic data...")

    df = pd.read_parquet(input_file)

    df["Time"] = pd.to_datetime(df["Time"])

    print("Original shape:", df.shape)

    # ---------------------------------------------------------
    # Hourly aggregation
    # ---------------------------------------------------------

    print("Aggregating 5-minute traffic → hourly traffic...")

    df = df.set_index("Time")

    hourly = df.resample("1h").mean()

    hourly = hourly.reset_index()

    print("Hourly shape:", hourly.shape)

    # ---------------------------------------------------------
    # Missing values
    # ---------------------------------------------------------

    sensor_columns = hourly.columns[1:]

    print("Handling missing values...")

    # Time interpolation for each sensor
    hourly[sensor_columns] = (
        hourly[sensor_columns]
        .interpolate(
            method="linear",
            limit=6
        )
    )

    # Fill remaining missing values with sensor median
    hourly[sensor_columns] = (
        hourly[sensor_columns]
        .fillna(hourly[sensor_columns].median())
    )

    # ---------------------------------------------------------
    # Time features
    # ---------------------------------------------------------

    print("Creating time features...")

    hourly["hour"] = hourly["Time"].dt.hour
    hourly["day"] = hourly["Time"].dt.day
    hourly["month"] = hourly["Time"].dt.month
    hourly["weekday"] = hourly["Time"].dt.weekday
    hourly["day_of_year"] = hourly["Time"].dt.dayofyear

    hourly["is_weekend"] = (
        hourly["weekday"] >= 5
    ).astype("int8")

    hourly["is_rush_hour"] = (
        hourly["hour"].isin([7, 8, 9, 16, 17, 18])
    ).astype("int8")

    # ---------------------------------------------------------
    # Reduce traffic precision
    # ---------------------------------------------------------

    for col in sensor_columns:
        hourly[col] = hourly[col].astype("float32")

    # ---------------------------------------------------------
    # Save
    # ---------------------------------------------------------

    print("Saving:", output_file)

    hourly.to_parquet(
        output_file,
        index=False,
        compression="snappy"
    )

    print("Saved successfully.")
    print("Final shape:", hourly.shape)


def main():

    for year in YEARS:
        process_year(year)

    print("\n" + "=" * 70)
    print("ALL YEARS COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
