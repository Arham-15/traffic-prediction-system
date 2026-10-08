import pandas as pd
import glob
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np


# ============================================================
# CONFIG
# ============================================================

FEATURE_DIR = r"data\processed\ml"
MODEL_PATH = r"models\traffic_lightgbm.txt"

VALIDATION_START = "2021-08-01"
VALIDATION_END = "2021-09-30"

SAMPLE_PER_FILE = 50000


# ============================================================
# FEATURES
# ============================================================

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

TARGET = "target_traffic"


# ============================================================
# LOAD MODEL
# ============================================================

print("=" * 70)
print("LOADING LIGHTGBM MODEL")
print("=" * 70)

model = lgb.Booster(
    model_file=MODEL_PATH
)

print("Model loaded successfully.")


# ============================================================
# LOAD VALIDATION DATA
# ============================================================

print()
print("=" * 70)
print("LOADING VALIDATION DATA")
print("=" * 70)

files = sorted(
    glob.glob(
        rf"{FEATURE_DIR}\ml_features_2021_batch_*.parquet"
    )
)

validation_parts = []

for i, file in enumerate(files, 1):

    df = pd.read_parquet(
        file,
        columns=["date_time"] + FEATURES + [TARGET]
    )

    df["date_time"] = pd.to_datetime(
        df["date_time"]
    )

    df = df[
        (df["date_time"] >= VALIDATION_START)
        &
        (df["date_time"] <= VALIDATION_END)
    ]

    if len(df) > SAMPLE_PER_FILE:
        df = df.sample(
            n=SAMPLE_PER_FILE,
            random_state=42
        )

    validation_parts.append(df)

    print(
        f"[{i}/{len(files)}] "
        f"{len(df):,} rows"
    )


validation_df = pd.concat(
    validation_parts,
    ignore_index=True
)

print()
print(
    "Validation rows:",
    f"{len(validation_df):,}"
)

print(
    "Validation start:",
    validation_df["date_time"].min()
)

print(
    "Validation end:",
    validation_df["date_time"].max()
)


# ============================================================
# PREDICTIONS
# ============================================================

X_validation = validation_df[FEATURES]
y_validation = validation_df[TARGET]

print()
print("=" * 70)
print("RUNNING VALIDATION")
print("=" * 70)

predictions = model.predict(
    X_validation
)


# ============================================================
# METRICS
# ============================================================

mae = mean_absolute_error(
    y_validation,
    predictions
)

rmse = np.sqrt(
    mean_squared_error(
        y_validation,
        predictions
    )
)

r2 = r2_score(
    y_validation,
    predictions
)


# ============================================================
# RESULTS
# ============================================================

print()
print("=" * 70)
print("VALIDATION RESULTS")
print("=" * 70)

print()
print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")

print()
print("Comparison")
print("-" * 40)
print("Baseline MAE : 31.8745")
print(f"Model MAE    : {mae:.4f}")

if mae < 31.8745:
    print()
    print("SUCCESS: Model beats the baseline.")
else:
    print()
    print("WARNING: Model does not beat the baseline.")

print()
print("=" * 70)
print("VALIDATION COMPLETE")
print("=" * 70)
