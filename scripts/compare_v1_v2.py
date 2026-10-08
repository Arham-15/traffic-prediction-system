import pandas as pd
import numpy as np
import glob
import lightgbm as lgb

from sklearn.metrics import mean_absolute_error
from sklearn.metrics import mean_squared_error
from sklearn.metrics import r2_score


V1_DIR = r"data\processed\ml_continuous"
V2_DIR = r"data\processed\ml_v2"

V1_MODEL = r"models\traffic_lightgbm_continuous.txt"
V2_MODEL = r"models\traffic_lightgbm_v2.txt"


V1_FEATURES = [
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

V2_FEATURES = V1_FEATURES + [
    "temperature",
    "rain",
    "snow",
    "cloudiness",
]

TARGET = "target_traffic"


print("=" * 70)
print("INTELLITRAFFIC - V1 vs V2 COMPARISON")
print("=" * 70)

v1_model = lgb.Booster(model_file=V1_MODEL)
v2_model = lgb.Booster(model_file=V2_MODEL)

print()
print("V1 features:", v1_model.num_feature())
print("V2 features:", v2_model.num_feature())


v1_files = sorted(
    glob.glob(rf"{V1_DIR}\ml_features_2021_batch_*.parquet")
)

v2_files = sorted(
    glob.glob(rf"{V2_DIR}\ml_features_2021_batch_*.parquet")
)

print()
print("V1 files:", len(v1_files))
print("V2 files:", len(v2_files))


v1_true = []
v1_pred = []

v2_true = []
v2_pred = []

print()
print("=" * 70)
print("VALIDATING SAME OCT-DEC 2021 DATA")
print("=" * 70)

for i, (v1_file, v2_file) in enumerate(
    zip(v1_files, v2_files), 1
):

    v1_df = pd.read_parquet(v1_file)
    v2_df = pd.read_parquet(v2_file)

    start = "2021-10-01"
    end = "2022-01-01"

    v1_df = v1_df[
        (v1_df["date_time"] >= start)
        & (v1_df["date_time"] < end)
    ]

    v2_df = v2_df[
        (v2_df["date_time"] >= start)
        & (v2_df["date_time"] < end)
    ]

    if len(v1_df) != len(v2_df):
        raise ValueError(
            f"Row mismatch in batch {i}: "
            f"V1={len(v1_df)}, V2={len(v2_df)}"
        )

    if len(v1_df) == 0:
        continue

    y1 = v1_df[TARGET].to_numpy()
    y2 = v2_df[TARGET].to_numpy()

    if not np.allclose(y1, y2, equal_nan=True):
        raise ValueError(
            f"Target mismatch detected in batch {i}"
        )

    pred1 = v1_model.predict(v1_df[V1_FEATURES])
    pred2 = v2_model.predict(v2_df[V2_FEATURES])

    v1_true.append(y1)
    v1_pred.append(pred1)

    v2_true.append(y2)
    v2_pred.append(pred2)

    print(
        f"[{i}/{len(v1_files)}] "
        f"Rows: {len(v1_df):,}"
    )


v1_true = np.concatenate(v1_true)
v1_pred = np.concatenate(v1_pred)

v2_true = np.concatenate(v2_true)
v2_pred = np.concatenate(v2_pred)


v1_mae = mean_absolute_error(v1_true, v1_pred)
v1_rmse = np.sqrt(mean_squared_error(v1_true, v1_pred))
v1_r2 = r2_score(v1_true, v1_pred)

v2_mae = mean_absolute_error(v2_true, v2_pred)
v2_rmse = np.sqrt(mean_squared_error(v2_true, v2_pred))
v2_r2 = r2_score(v2_true, v2_pred)


mae_improvement = ((v1_mae - v2_mae) / v1_mae) * 100
rmse_improvement = ((v1_rmse - v2_rmse) / v1_rmse) * 100
r2_change = v2_r2 - v1_r2


print()
print("=" * 70)
print("FINAL COMPARISON")
print("=" * 70)

print()
print("V1 RESULTS")
print("-" * 70)
print(f"MAE  : {v1_mae:.4f}")
print(f"RMSE : {v1_rmse:.4f}")
print(f"R2   : {v1_r2:.4f}")

print()
print("V2 RESULTS")
print("-" * 70)
print(f"MAE  : {v2_mae:.4f}")
print(f"RMSE : {v2_rmse:.4f}")
print(f"R2   : {v2_r2:.4f}")

print()
print("V2 IMPROVEMENT")
print("-" * 70)
print(f"MAE improvement  : {mae_improvement:.2f}%")
print(f"RMSE improvement : {rmse_improvement:.2f}%")
print(f"R2 change        : {r2_change:+.4f}")

print()
print("=" * 70)
print("COMPARISON COMPLETE")
print("=" * 70)
