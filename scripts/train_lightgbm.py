import os
import pandas as pd
import glob
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np


# ============================================================
# CONFIG
# ============================================================

FEATURE_DIR = r"data\processed\ml"

TRAIN_END = "2021-09-30"
TEST_START = "2021-10-01"

SAMPLE_PER_FILE = 50000

MODEL_PATH = r"models\traffic_lightgbm.txt"


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
# LOAD TRAINING DATA
# ============================================================

print("=" * 70)
print("LOADING TRAINING DATA")
print("=" * 70)

files = sorted(
    glob.glob(
        rf"{FEATURE_DIR}\ml_features_*.parquet"
    )
)

train_parts = []

for i, file in enumerate(files, 1):

    df = pd.read_parquet(
        file,
        columns=["date_time"] + FEATURES + [TARGET]
    )

    df["date_time"] = pd.to_datetime(df["date_time"])

    df = df[
        df["date_time"] <= TRAIN_END
    ]

    if len(df) > SAMPLE_PER_FILE:
        df = df.sample(
            n=SAMPLE_PER_FILE,
            random_state=42
        )

    train_parts.append(df)

    print(
        f"[{i}/{len(files)}] "
        f"{len(df):,} rows"
    )


train_df = pd.concat(
    train_parts,
    ignore_index=True
)

print()
print("Training rows:", f"{len(train_df):,}")
print("Training columns:", len(FEATURES))


# ============================================================
# PREPARE TRAINING DATA
# ============================================================

X_train = train_df[FEATURES]
y_train = train_df[TARGET]

print()
print("X_train:", X_train.shape)
print("y_train:", y_train.shape)


# ============================================================
# TRAIN LIGHTGBM
# ============================================================

print()
print("=" * 70)
print("TRAINING LIGHTGBM")
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


# ============================================================
# TEST DATA
# ============================================================

print()
print("=" * 70)
print("LOADING TEST DATA")
print("=" * 70)

test_parts = []

test_files = sorted(
    glob.glob(
        rf"{FEATURE_DIR}\ml_features_2021_batch_*.parquet"
    )
)

for file in test_files:

    df = pd.read_parquet(
        file,
        columns=["date_time"] + FEATURES + [TARGET]
    )

    df["date_time"] = pd.to_datetime(df["date_time"])

    df = df[
        df["date_time"] >= TEST_START
    ]

    test_parts.append(df)


test_df = pd.concat(
    test_parts,
    ignore_index=True
)

print(
    "Test rows:",
    f"{len(test_df):,}"
)


# ============================================================
# PREDICTIONS
# ============================================================

X_test = test_df[FEATURES]
y_test = test_df[TARGET]

print()
print("=" * 70)
print("EVALUATING MODEL")
print("=" * 70)

predictions = model.predict(X_test)


# ============================================================
# METRICS
# ============================================================

mae = mean_absolute_error(
    y_test,
    predictions
)

rmse = np.sqrt(
    mean_squared_error(
        y_test,
        predictions
    )
)

r2 = r2_score(
    y_test,
    predictions
)

print()
print("LightGBM Results")
print("-" * 40)
print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")

print()
print("Baseline MAE : 31.8745")
print(f"LightGBM MAE : {mae:.4f}")

if mae < 31.8745:
    print()
    print("SUCCESS: LightGBM beats the baseline!")
else:
    print()
    print("LightGBM did not beat the baseline yet.")


# ============================================================
# SAVE MODEL
# ============================================================

os.makedirs(
    "models",
    exist_ok=True
)

model.booster_.save_model(
    MODEL_PATH
)

print()
print("Model saved to:")
print(MODEL_PATH)

print()
print("=" * 70)
print("TRAINING COMPLETE")
print("=" * 70)
