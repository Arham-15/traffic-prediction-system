import pandas as pd
import numpy as np
import glob
import os
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

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

ML_DIR = r"data\processed\ml_continuous"
MODEL_DIR = r"models"

os.makedirs(MODEL_DIR, exist_ok=True)

print("=" * 70)
print("TRAINING LIGHTGBM - CONTINUOUS DATASET")
print("=" * 70)

# --------------------------------------------------
# TRAINING DATA
# 2017-2020
# --------------------------------------------------

train_files = sorted(
    glob.glob(rf"{ML_DIR}\ml_features_2017_batch_*.parquet")
    + glob.glob(rf"{ML_DIR}\ml_features_2018_batch_*.parquet")
    + glob.glob(rf"{ML_DIR}\ml_features_2019_batch_*.parquet")
    + glob.glob(rf"{ML_DIR}\ml_features_2020_batch_*.parquet")
)

print()
print("Training files:", len(train_files))

X_parts = []
y_parts = []

SAMPLES_PER_FILE = 50000

for i, file in enumerate(train_files, 1):
    df = pd.read_parquet(file)

    sample_size = min(SAMPLES_PER_FILE, len(df))

    sample = df.sample(
        n=sample_size,
        random_state=42
    )

    X_parts.append(sample[FEATURES])
    y_parts.append(sample[TARGET])

    print(
        f"[{i}/{len(train_files)}] "
        f"{os.path.basename(file)} | "
        f"sampled {sample_size:,}"
    )

X_train = pd.concat(X_parts, ignore_index=True)
y_train = pd.concat(y_parts, ignore_index=True)

del X_parts
del y_parts

print()
print("Training rows:", f"{len(X_train):,}")
print("Training features:", X_train.shape[1])

# --------------------------------------------------
# TEST DATA
# October - December 2021
# --------------------------------------------------

test_files = sorted(
    glob.glob(rf"{ML_DIR}\ml_features_2021_batch_*.parquet")
)

print()
print("Loading 2021 test data...")

test_parts = []

for i, file in enumerate(test_files, 1):
    df = pd.read_parquet(file)

    df = df[
        (df["date_time"] >= "2021-10-01") &
        (df["date_time"] < "2022-01-01")
    ]

    if len(df) > 0:
        test_parts.append(df)

    print(
        f"[{i}/{len(test_files)}] "
        f"{os.path.basename(file)} | "
        f"rows {len(df):,}"
    )

test_df = pd.concat(test_parts, ignore_index=True)

X_test = test_df[FEATURES]
y_test = test_df[TARGET]

print()
print("Test rows:", f"{len(test_df):,}")
print("Test start:", test_df["date_time"].min())
print("Test end:", test_df["date_time"].max())

# --------------------------------------------------
# LIGHTGBM
# --------------------------------------------------

print()
print("=" * 70)
print("TRAINING MODEL")
print("=" * 70)

model = lgb.LGBMRegressor(
    objective="regression",
    n_estimators=500,
    learning_rate=0.05,
    num_leaves=64,
    max_depth=-1,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    n_jobs=-1
)

model.fit(
    X_train,
    y_train
)

# --------------------------------------------------
# EVALUATION
# --------------------------------------------------

print()
print("=" * 70)
print("EVALUATION")
print("=" * 70)

predictions = model.predict(X_test)

mae = mean_absolute_error(y_test, predictions)
rmse = np.sqrt(mean_squared_error(y_test, predictions))
r2 = r2_score(y_test, predictions)

print()
print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")

# --------------------------------------------------
# SAVE MODEL
# --------------------------------------------------

model_path = os.path.join(
    MODEL_DIR,
    "traffic_lightgbm_continuous.txt"
)

model.booster_.save_model(model_path)

print()
print("Model saved:")
print(model_path)

print()
print("=" * 70)
print("TRAINING COMPLETE")
print("=" * 70)
