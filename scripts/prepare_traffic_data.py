from pathlib import Path
import pandas as pd

ROOT = Path(r"C:\PROJECTS\IntelliTraffic\traffic-prediction-system")
DATA_DIR = ROOT / "data" / "processed" / "largest"
RAW_DIR = ROOT / "data" / "raw" / "largest"
OUTPUT_DIR = ROOT / "data" / "processed" / "features"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

YEAR = 2017

TRAFFIC_FILE = DATA_DIR / f"traffic_{YEAR}.parquet"
META_FILE = RAW_DIR / "ca_meta.csv"

OUTPUT_FILE = OUTPUT_DIR / f"traffic_features_{YEAR}.parquet"


print("=" * 70)
print("INTELLITRAFFIC FEATURE ENGINEERING")
print("=" * 70)

print("\nLoading metadata...")
meta = pd.read_csv(META_FILE)

print("Sensors:", len(meta))

print("\nLoading traffic data...")
traffic = pd.read_parquet(TRAFFIC_FILE)

print("Traffic shape:", traffic.shape)


# ---------------------------------------------------------
# 1. Convert timestamp
# ---------------------------------------------------------

traffic["Time"] = pd.to_datetime(traffic["Time"])

traffic = traffic.set_index("Time")


# ---------------------------------------------------------
# 2. Convert wide → long
# ---------------------------------------------------------

print("\nConverting wide format to long format...")

long_df = traffic.stack(
    future_stack=True
).reset_index()

long_df.columns = [
    "timestamp",
    "sensor_id",
    "traffic"
]

print("Long shape:", long_df.shape)


# ---------------------------------------------------------
# 3. Sensor ID type
# ---------------------------------------------------------

long_df["sensor_id"] = long_df["sensor_id"].astype(str)

meta["ID"] = meta["ID"].astype(str)


# ---------------------------------------------------------
# 4. Handle missing traffic
# ---------------------------------------------------------

print("\nMissing traffic before cleaning:",
      long_df["traffic"].isna().sum())

# Keep missing values temporarily.
# Interpolation will happen separately for each sensor.

long_df["traffic"] = (
    long_df
    .groupby("sensor_id")["traffic"]
    .transform(
        lambda x: x.interpolate(
            method="linear",
            limit=12
        )
    )
)

# Remaining missing values are filled using
# each sensor's median traffic.

long_df["traffic"] = (
    long_df
    .groupby("sensor_id")["traffic"]
    .transform(
        lambda x: x.fillna(x.median())
    )
)

print("Missing traffic after cleaning:",
      long_df["traffic"].isna().sum())


# ---------------------------------------------------------
# 5. Add sensor/location metadata
# ---------------------------------------------------------

print("\nJoining sensor metadata...")

meta_small = meta[
    [
        "ID",
        "Lat",
        "Lng",
        "District",
        "County",
        "Fwy",
        "Lanes",
        "Type",
        "Direction"
    ]
].copy()

meta_small = meta_small.rename(
    columns={"ID": "sensor_id"}
)

long_df = long_df.merge(
    meta_small,
    on="sensor_id",
    how="left"
)

print("After metadata join:", long_df.shape)


# ---------------------------------------------------------
# 6. Time features
# ---------------------------------------------------------

print("\nCreating time features...")

long_df["hour"] = long_df["timestamp"].dt.hour
long_df["minute"] = long_df["timestamp"].dt.minute
long_df["day"] = long_df["timestamp"].dt.day
long_df["month"] = long_df["timestamp"].dt.month
long_df["weekday"] = long_df["timestamp"].dt.weekday
long_df["day_of_year"] = long_df["timestamp"].dt.dayofyear

long_df["is_weekend"] = (
    long_df["weekday"] >= 5
).astype(int)

long_df["is_rush_hour"] = (
    long_df["hour"].isin([7, 8, 9, 16, 17, 18])
).astype(int)


# ---------------------------------------------------------
# 7. Sort by sensor/time
# ---------------------------------------------------------

long_df = long_df.sort_values(
    ["sensor_id", "timestamp"]
)


# ---------------------------------------------------------
# 8. Historical traffic features
# ---------------------------------------------------------

print("\nCreating lag features...")

grouped = long_df.groupby("sensor_id")["traffic"]

# Previous 5 minutes
long_df["traffic_lag_1"] = grouped.shift(1)

# Previous 15 minutes
long_df["traffic_lag_3"] = grouped.shift(3)

# Previous 30 minutes
long_df["traffic_lag_6"] = grouped.shift(6)

# Previous 1 hour
long_df["traffic_lag_12"] = grouped.shift(12)


# ---------------------------------------------------------
# 9. Rolling traffic
# ---------------------------------------------------------

print("Creating rolling features...")

long_df["traffic_rolling_mean_1h"] = (
    long_df
    .groupby("sensor_id")["traffic"]
    .transform(
        lambda x: x.shift(1).rolling(12).mean()
    )
)

long_df["traffic_rolling_std_1h"] = (
    long_df
    .groupby("sensor_id")["traffic"]
    .transform(
        lambda x: x.shift(1).rolling(12).std()
    )
)


# ---------------------------------------------------------
# 10. Remove rows where historical features don't exist
# ---------------------------------------------------------

before = len(long_df)

long_df = long_df.dropna(
    subset=[
        "traffic_lag_1",
        "traffic_lag_3",
        "traffic_lag_6",
        "traffic_lag_12",
        "traffic_rolling_mean_1h"
    ]
)

print(
    f"\nRemoved {before - len(long_df):,} "
    "initial-history rows"
)


# ---------------------------------------------------------
# 11. Reduce data types
# ---------------------------------------------------------

float_columns = [
    "traffic",
    "Lat",
    "Lng",
    "traffic_lag_1",
    "traffic_lag_3",
    "traffic_lag_6",
    "traffic_rolling_mean_1h",
    "traffic_rolling_std_1h"
]

for col in float_columns:
    if col in long_df.columns:
        long_df[col] = long_df[col].astype("float32")


# ---------------------------------------------------------
# 12. Save
# ---------------------------------------------------------

print("\nSaving feature dataset...")

long_df.to_parquet(
    OUTPUT_FILE,
    index=False,
    compression="snappy"
)

print("\n" + "=" * 70)
print("DONE")
print("=" * 70)

print("Output:", OUTPUT_FILE)
print("Final shape:", long_df.shape)

print("\nColumns:")
print(long_df.columns.tolist())
