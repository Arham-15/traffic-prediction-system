import pandas as pd
import numpy as np
import glob
import os
import lightgbm as lgb

from sklearn.metrics import mean_absolute_error
from sklearn.metrics import mean_squared_error
from sklearn.metrics import r2_score


# ============================================================
# CONFIGURATION
# ============================================================

V2_DIR = r"data\processed\ml_v2"
MODEL_DIR = r"models"

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "traffic_lightgbm_v2.txt"
)


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

    # Weather features
    "temperature",
    "rain",
    "snow",
    "cloudiness",
]


TARGET = "target_traffic"

SAMPLES_PER_FILE = 50000


os.makedirs(MODEL_DIR, exist_ok=True)


# ============================================================
# HEADER
# ============================================================

print("=" * 70)
print("INTELLITRAFFIC - LIGHTGBM V2 TRAINING")
print("=" * 70)

print()
print("Features:", len(FEATURES))

print()
print("Weather features:")
print("  - temperature")
print("  - rain")
print("  - snow")
print("  - cloudiness")


# ============================================================
# TRAINING DATA
# 2017 - 2020
# ============================================================

train_files = sorted(
    glob.glob(
        rf"{V2_DIR}\ml_features_2017_batch_*.parquet"
    )
    + glob.glob(
        rf"{V2_DIR}\ml_features_2018_batch_*.parquet"
    )
    + glob.glob(
        rf"{V2_DIR}\ml_features_2019_batch_*.parquet"
    )
    + glob.glob(
        rf"{V2_DIR}\ml_features_2020_batch_*.parquet"
    )
)


print()
print("=" * 70)
print("LOADING TRAINING DATA")
print("=" * 70)

print()
print("Training files:", len(train_files))


X_parts = []
y_parts = []


for i, file in enumerate(train_files, 1):

    df = pd.read_parquet(file)

    sample_size = min(
        SAMPLES_PER_FILE,
        len(df)
    )

    sample = df.sample(
        n=sample_size,
        random_state=42
    )

    X_parts.append(
        sample[FEATURES]
    )

    y_parts.append(
        sample[TARGET]
    )

    print(
        f"[{i}/{len(train_files)}] "
        f"{os.path.basename(file)} | "
        f"sampled {sample_size:,}"
    )


X_train = pd.concat(
    X_parts,
    ignore_index=True
)

y_train = pd.concat(
    y_parts,
    ignore_index=True
)


del X_parts
del y_parts


print()
print("Training rows:", f"{len(X_train):,}")
print("Training features:", X_train.shape[1])


# ============================================================
# TEST DATA
# OCTOBER - DECEMBER 2021
# ============================================================

test_files = sorted(
    glob.glob(
        rf"{V2_DIR}\ml_features_2021_batch_*.parquet"
    )
)


print()
print("=" * 70)
print("LOADING 2021 TEST DATA")
print("=" * 70)

print()
print("Test files:", len(test_files))


test_parts = []


for i, file in enumerate(test_files, 1):

    df = pd.read_parquet(file)

    df = df[
        (df["date_time"] >= "2021-10-01")
        &
        (df["date_time"] < "2022-01-01")
    ]

    if len(df) > 0:

        test_parts.append(df)

    print(
        f"[{i}/{len(test_files)}] "
        f"{os.path.basename(file)} | "
        f"rows {len(df):,}"
    )


test_df = pd.concat(
    test_parts,
    ignore_index=True
)


X_test = test_df[FEATURES]

y_test = test_df[TARGET]


print()
print("Test rows:", f"{len(test_df):,}")

print(
    "Test start:",
    test_df["date_time"].min()
)

print(
    "Test end:",
    test_df["date_time"].max()
)


# ============================================================
# LIGHTGBM V2
# ============================================================

print()
print("=" * 70)
print("TRAINING LIGHTGBM V2")
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
# EVALUATION
# ============================================================

print()
print("=" * 70)
print("V2 EVALUATION")
print("=" * 70)


predictions = model.predict(
    X_test
)


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
print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")


# ============================================================
# FEATURE IMPORTANCE
# ============================================================

print()
print("=" * 70)
print("FEATURE IMPORTANCE")
print("=" * 70)


importance = pd.DataFrame(
    {
        "feature": FEATURES,
        "importance": model.feature_importances_
    }
)


importance = importance.sort_values(
    "importance",
    ascending=False
)


print()
print(
    importance.to_string(
        index=False
    )
)


# ============================================================
# SAVE MODEL
# ============================================================

model.booster_.save_model(
    MODEL_PATH
)


print()
print("=" * 70)
print("MODEL SAVED")
print("=" * 70)

print()
print(MODEL_PATH)

print()
print("=" * 70)
print("LIGHTGBM V2 TRAINING COMPLETE")
print("=" * 70)
