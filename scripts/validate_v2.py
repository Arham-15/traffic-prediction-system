import pandas as pd
import glob
import os

FILES = glob.glob(r"data\processed\ml_v2\*.parquet")

total_rows = 0
total_missing = 0
rows_weather_missing = 0
sensors = set()
years = {}

print("=" * 70)
print("FULL V2 WEATHER VALIDATION")
print("=" * 70)

print("Files:", len(FILES))
print()

for i, file in enumerate(FILES, 1):

    df = pd.read_parquet(
        file,
        columns=[
            "date_time",
            "sensor_id",
            "temperature",
            "rain",
            "snow",
            "cloudiness",
            "target_traffic"
        ]
    )

    total_rows += len(df)

    sensors.update(df["sensor_id"].unique())

    year = int(df["date_time"].dt.year.iloc[0])
    years[year] = years.get(year, 0) + len(df)

    missing = df[
        [
            "temperature",
            "rain",
            "snow",
            "cloudiness",
            "target_traffic"
        ]
    ].isna().sum().sum()

    total_missing += missing

    weather_missing = df[
        [
            "temperature",
            "rain",
            "snow",
            "cloudiness"
        ]
    ].isna().any(axis=1).sum()

    rows_weather_missing += weather_missing

    print(
        f"[{i}/{len(FILES)}] "
        f"{os.path.basename(file)} | "
        f"Rows: {len(df):,} | "
        f"Missing: {missing}"
    )

print()
print("=" * 70)
print("VALIDATION SUMMARY")
print("=" * 70)

print("Total V2 rows:", f"{total_rows:,}")
print("Unique sensors:", len(sensors))
print("Total weather/target missing cells:", total_missing)
print("Rows with weather missing:", rows_weather_missing)

print()
print("Rows by year:")

for year in sorted(years):
    print(f"{year}: {years[year]:,}")

print()
print("=" * 70)
print("WEATHER VALUE RANGES")
print("=" * 70)

sample = pd.read_parquet(
    FILES[0],
    columns=[
        "temperature",
        "rain",
        "snow",
        "cloudiness"
    ]
)

print(sample.describe().to_string())

print()
print("=" * 70)
print("V2 VALIDATION COMPLETE")
print("=" * 70)
