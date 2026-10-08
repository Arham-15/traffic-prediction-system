import lightgbm as lgb

from src.history_time import map_to_historical_reference
from src.severity import classify_severity
from src.sensor_lookup import find_nearest_sensor
from src.prediction_features import build_prediction_features


MODEL_PATH = "models/traffic_lightgbm_v2.txt"


# Load trained V2 LightGBM model
model = lgb.Booster(
    model_file=MODEL_PATH
)


def predict_for_sensor(
    sensor,
    prediction_time,
    temperature,
    rain,
    snow,
    cloudiness
):
    """
    Run the existing LightGBM V2 model for one real PeMS sensor.

    The historical reference time (2017-2021) is derived from the
    user-facing prediction time (2026-2030) and is used ONLY to load
    real traffic history for the lag/rolling features.
    """

    # -------------------------------------------------
    # 1. Map the selected future year onto the real
    #    historical observation year (backend truth)
    # -------------------------------------------------

    historical_reference_time = map_to_historical_reference(
        prediction_time
    )

    # -------------------------------------------------
    # 2. Build exact V2 features
    # -------------------------------------------------

    features = build_prediction_features(
        sensor_id=sensor["sensor_id"],
        latitude=sensor["latitude"],
        longitude=sensor["longitude"],
        lanes=sensor["lanes"],
        prediction_time=prediction_time,
        history_end_time=historical_reference_time,
        temperature=temperature,
        rain=rain,
        snow=snow,
        cloudiness=cloudiness
    )

    # -------------------------------------------------
    # 3. Make prediction
    # -------------------------------------------------

    prediction = model.predict(
        features
    )[0]

    return {
        "prediction": float(prediction),
        "historical_reference_time": str(historical_reference_time),
    }


def predict_traffic(
    latitude,
    longitude,
    prediction_time,
    temperature,
    rain,
    snow,
    cloudiness
):
    """
    Predict next-hour traffic for the sensor nearest
    to the supplied GPS coordinates using LightGBM V2.
    """

    # -------------------------------------------------
    # 1. Find nearest traffic sensor
    # -------------------------------------------------

    sensor = find_nearest_sensor(
        latitude,
        longitude
    )

    # -------------------------------------------------
    # 2 + 3. Build exact V2 features and predict
    # -------------------------------------------------

    outcome = predict_for_sensor(
        sensor=sensor,
        prediction_time=prediction_time,
        temperature=temperature,
        rain=rain,
        snow=snow,
        cloudiness=cloudiness
    )

    # -------------------------------------------------
    # 4. Return prediction + information
    # -------------------------------------------------

    return {
        "prediction": outcome["prediction"],
        "prediction_time": str(prediction_time),
        "historical_reference_time": outcome["historical_reference_time"],
        "severity": classify_severity(outcome["prediction"]),
        "sensor": sensor,
        "weather_input": {
            "temperature": float(temperature),
            "rain": float(rain),
            "snow": float(snow),
            "cloudiness": float(cloudiness)
        }
    }


def predict_corridor_sensors(
    sensors,
    prediction_time,
    temperature,
    rain,
    snow,
    cloudiness
):
    """
    Run the existing LightGBM V2 model for several real PeMS sensors
    (used by the traffic-map endpoint). Every entry carries the real
    sensor metadata plus its prediction, historical reference time and
    severity. Sensors whose history is unavailable are reported with
    an "error" message instead of a fabricated value.
    """

    results = []

    for sensor in sensors:

        try:
            outcome = predict_for_sensor(
                sensor=sensor,
                prediction_time=prediction_time,
                temperature=temperature,
                rain=rain,
                snow=snow,
                cloudiness=cloudiness
            )

        except Exception as exc:
            results.append(
                {
                    **sensor,
                    "error": str(exc)
                }
            )
            continue

        results.append(
            {
                **sensor,
                **outcome,
                "severity": classify_severity(outcome["prediction"])
            }
        )

    return results


if __name__ == "__main__":

    result = predict_traffic(
        latitude=38.389811,
        longitude=-121.479587,
        prediction_time="2026-10-15 18:00:00",
        temperature=25.0,
        rain=0.0,
        snow=0.0,
        cloudiness=20.0
    )

    print("\nPrediction Result")
    print("=" * 50)

    print(
        "Predicted Traffic:",
        result["prediction"]
    )

    print(
        "Prediction Time:",
        result["prediction_time"]
    )

    print(
        "Historical Reference Time:",
        result["historical_reference_time"]
    )

    print("\nWeather Input")
    print("-" * 50)

    for key, value in result["weather_input"].items():
        print(f"{key}: {value}")

    print("\nNearest Sensor")
    print("-" * 50)

    for key, value in result["sensor"].items():
        print(f"{key}: {value}")
