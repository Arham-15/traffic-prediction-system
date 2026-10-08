import pandas as pd
import numpy as np
import glob
import lightgbm as lgb

from sklearn.metrics import mean_absolute_error
from sklearn.metrics import mean_squared_error
from sklearn.metrics import r2_score


ML_DIR = r"data\processed\ml_continuous"

FEATURES = [
    "traffic",
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    "is_rush_hour",
    "traffic_lag_1",
    "traffic_lag_2",
    "traffic_lag_3",
    "traffic_lag_24",
    "traffic_lag_168",
    "rolling_mean_3",
    "rolling_mean_24",
    "latitude",
    "longitude",
    "lanes",
]


print("=" * 70)
print("CONTINUOUS LIGHTGBM VALIDATION")
print("=" * 70)

# --------------------------------------------------
# LOAD 2021 VALIDATION DATA
# --------------------------------------------------

files = sorted(
    glob.glob(
        rf"{ML_DIR}\ml_features_2021_batch_*.parquet"
    )
)

print()
print("Files found:", len(files))

parts = []

for i, file in enumerate(files, 1):

    df = pd.read_parquet(file)

    df = df[
        (df["date_time"] >= "2021-08-01")
        & (df["date_time"] < "2021-10-01")
    ]

    if len(df) > 0:
        parts.append(df)

    print(
        f"[{i}/{len(files)}] "
        f"{len(df):,} rows"
    )


df = pd.concat(parts, ignore_index=True)

print()
print("Total validation rows:", f"{len(df):,}")
print("Start:", df["date_time"].min())
print("End:", df["date_time"].max())


# --------------------------------------------------
# SAMPLE
# --------------------------------------------------

sample_size = min(1_750_000, len(df))

df = df.sample(
    n=sample_size,
    random_state=42
)

print()
print("Sampled rows:", f"{len(df):,}")


# --------------------------------------------------
# LOAD MODEL
# --------------------------------------------------

model = lgb.Booster(
    model_file=r"models\traffic_lightgbm_continuous.txt"
)


# --------------------------------------------------
# PREDICTION
# --------------------------------------------------

X = df[FEATURES]
y = df["target_traffic"]

predictions = model.predict(X)


# --------------------------------------------------
# METRICS
# --------------------------------------------------

mae = mean_absolute_error(
    y,
    predictions
)

rmse = np.sqrt(
    mean_squared_error(
        y,
        predictions
    )
)

r2 = r2_score(
    y,
    predictions
)


# --------------------------------------------------
# RESULTS
# --------------------------------------------------

print()
print("=" * 70)
print("VALIDATION RESULTS")
print("=" * 70)

print()
print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")

print()
print("=" * 70)
print("VALIDATION COMPLETE")
print("=" * 70)
