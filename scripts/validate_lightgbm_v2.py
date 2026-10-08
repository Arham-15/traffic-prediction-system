import pandas as pd
import numpy as np
import glob
import lightgbm as lgb

from sklearn.metrics import mean_absolute_error
from sklearn.metrics import mean_squared_error
from sklearn.metrics import r2_score


ML_DIR = r"data\processed\ml_v2"
MODEL_PATH = r"models\traffic_lightgbm_v2.txt"


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
    "temperature",
    "rain",
    "snow",
    "cloudiness",
]

TARGET = "target_traffic"


print("=" * 70)
print("LIGHTGBM V2 VALIDATION")
print("=" * 70)

files = sorted(
    glob.glob(rf"{ML_DIR}\ml_features_2021_batch_*.parquet")
)

print()
print("Validation files:", len(files))

model = lgb.Booster(model_file=MODEL_PATH)

print()
print("Model loaded successfully")
print("Model features:", model.num_feature())
print("Model trees:", model.num_trees())


y_parts = []
prediction_parts = []

print()
print("=" * 70)
print("PROCESSING OCTOBER - DECEMBER 2021")
print("=" * 70)

total_rows = 0

for i, file in enumerate(files, 1):

    df = pd.read_parquet(file)

    df = df[
        (df["date_time"] >= "2021-10-01")
        & (df["date_time"] < "2022-01-01")
    ]

    if len(df) == 0:
        print(
            f"[{i}/{len(files)}] "
            f"{file.split(chr(92))[-1]} | 0 rows"
        )
        continue

    X = df[FEATURES]
    y = df[TARGET]

    predictions = model.predict(X)

    y_parts.append(y.to_numpy())
    prediction_parts.append(predictions)

    total_rows += len(df)

    print(
        f"[{i}/{len(files)}] "
        f"{file.split(chr(92))[-1]} | "
        f"{len(df):,} rows"
    )


y_true = np.concatenate(y_parts)
y_pred = np.concatenate(prediction_parts)


print()
print("=" * 70)
print("VALIDATION DATA")
print("=" * 70)

print()
print("Total validation rows:", f"{total_rows:,}")
print("Actual target rows:", f"{len(y_true):,}")

print()
print("Target missing:", np.isnan(y_true).sum())
print("Prediction missing:", np.isnan(y_pred).sum())


mae = mean_absolute_error(y_true, y_pred)
rmse = np.sqrt(mean_squared_error(y_true, y_pred))
r2 = r2_score(y_true, y_pred)


print()
print("=" * 70)
print("V2 VALIDATION RESULTS")
print("=" * 70)

print()
print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R2   : {r2:.4f}")


print()
print("=" * 70)
print("V2 VALIDATION COMPLETE")
print("=" * 70)
