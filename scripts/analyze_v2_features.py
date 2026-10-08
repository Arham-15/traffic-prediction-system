import lightgbm as lgb
import pandas as pd


MODEL_PATH = r"models\traffic_lightgbm_v2.txt"


print("=" * 70)
print("INTELLITRAFFIC V2 - FEATURE IMPORTANCE")
print("=" * 70)


model = lgb.Booster(model_file=MODEL_PATH)


features = model.feature_name()
importance = model.feature_importance(importance_type="gain")


df = pd.DataFrame({
    "feature": features,
    "importance": importance
})


df = df.sort_values(
    "importance",
    ascending=False
).reset_index(drop=True)


total_importance = df["importance"].sum()

df["importance_percent"] = (
    df["importance"] / total_importance * 100
)


print()
print("Total features:", len(df))
print("Total trees:", model.num_trees())


print()
print("=" * 70)
print("FEATURE IMPORTANCE")
print("=" * 70)

for i, row in df.iterrows():

    print(
        f"{i + 1:2d}. "
        f"{row['feature']:<20} "
        f"Gain: {row['importance']:,.2f} "
        f"({row['importance_percent']:.2f}%)"
    )


print()
print("=" * 70)
print("WEATHER FEATURE IMPORTANCE")
print("=" * 70)


weather_features = [
    "temperature",
    "rain",
    "snow",
    "cloudiness"
]


weather_df = df[
    df["feature"].isin(weather_features)
].copy()


weather_df = weather_df.sort_values(
    "importance_percent",
    ascending=False
)


weather_total = weather_df["importance_percent"].sum()


for _, row in weather_df.iterrows():

    print(
        f"{row['feature']:<20} "
        f"{row['importance_percent']:.2f}%"
    )


print()
print(
    f"Combined weather importance: "
    f"{weather_total:.2f}%"
)


print()
print("=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)
