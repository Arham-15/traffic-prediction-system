import joblib
import pandas as pd
import numpy as np


MODEL_PATH = "models/random_forest_traffic_model.pkl"
FEATURES_PATH = "models/model_features.pkl"


# Load trained model and feature list
model = joblib.load(MODEL_PATH)
features = joblib.load(FEATURES_PATH)


def predict_traffic(
    date_time,
    temp,
    rain_1h,
    snow_1h,
    clouds_all,
    holiday,
    weather
):
    date_time = pd.to_datetime(date_time)

    # Time features
    hour = date_time.hour
    day_of_week = date_time.dayofweek
    month = date_time.month
    year = date_time.year
    day = date_time.day

    is_weekend = int(day_of_week >= 5)

    # Cyclical time features
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)

    month_sin = np.sin(2 * np.pi * month / 12)
    month_cos = np.cos(2 * np.pi * month / 12)

    # Prepare input
    input_data = {
        "temp": temp,
        "rain_1h": rain_1h,
        "snow_1h": snow_1h,
        "clouds_all": clouds_all,

        "year": year,
        "month": month,
        "day": day,
        "hour": hour,
        "day_of_week": day_of_week,
        "is_weekend": is_weekend,

        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "month_sin": month_sin,
        "month_cos": month_cos,

       "is_holiday": 0 if holiday == "None" else 1,

        "weather_Clear": int(weather == "Clear"),
        "weather_Clouds": int(weather == "Clouds"),
        "weather_Drizzle": int(weather == "Drizzle"),
        "weather_Fog": int(weather == "Fog"),
        "weather_Haze": int(weather == "Haze"),
        "weather_Mist": int(weather == "Mist"),
        "weather_Rain": int(weather == "Rain"),
        "weather_Smoke": int(weather == "Smoke"),
        "weather_Snow": int(weather == "Snow"),
        "weather_Squall": int(weather == "Squall"),
        "weather_Thunderstorm": int(weather == "Thunderstorm")
    }

    input_df = pd.DataFrame([input_data])

    # Make sure columns are in the exact order used during training
    input_df = input_df[features]

    prediction = model.predict(input_df)[0]

    return round(prediction, 2)


if __name__ == "__main__":

    prediction = predict_traffic(
        date_time="2017-10-27 18:00:00",
        temp=288.5,
        rain_1h=0.0,
        snow_1h=0.0,
        clouds_all=40,
        holiday=False,
        weather="Clouds"
    )

    print("Predicted Traffic Volume:", prediction)