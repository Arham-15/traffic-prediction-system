import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd

from src.history_time import (
    map_to_historical_reference,
    validate_prediction_time,
)
from src.prediction import predict_corridor_sensors, predict_traffic
from src.sensor_lookup import (
    LocationNotSupportedError,
    find_nearby_sensors,
    validate_supported_location,
)


# Number of nearby real PeMS sensors evaluated for the traffic map.
TRAFFIC_MAP_SENSOR_COUNT = 8


app = FastAPI(
    title="IntelliTraffic API",
    description="AI-powered traffic prediction API using LightGBM V2",
    version="2.0",
    # Public API documentation surface disabled — prediction/health/cors
    # routes and schemas are unchanged.
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)


# CORS: the deployed frontend calls this API cross-origin over HTTPS, so an
# explicit origin allow-list is read from the ALLOWED_ORIGINS environment
# variable (comma-separated, whitespace tolerated). Without it, local
# development falls back to the Vite dev server origins. The list is
# explicit — never "*" — and no credentials are sent.

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://victorious-dune-079eaa100.3.azurestaticapps.net",
]

_raw_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in _raw_allowed_origins.split(",")
    if origin.strip()
] or DEFAULT_ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/debug/cors")
def debug_cors():
    return {
        "allowed_origins": ALLOWED_ORIGINS,
        "environment_value": os.environ.get("ALLOWED_ORIGINS", "")
    }


class TrafficInput(BaseModel):
    latitude: float
    longitude: float

    date_time: str

    day_type: str = Field(
        ...,
        description="UI-selected day type: Weekday or Weekend"
    )

    temperature: float
    rain: float
    snow: float
    cloudiness: float


@app.get("/")
def root():
    return {
        "message": "IntelliTraffic API is running",
        "model": "LightGBM V2"
    }


def _validated_prediction_time(data: TrafficInput) -> pd.Timestamp:
    """
    Parse and validate the selected date/time.

    Predictions are restricted to the supported 2026-2030 window;
    every endpoint maps that window onto the real 2017-2021 PeMS
    observations internally (backend is the source of truth).
    """

    try:
        prediction_time = pd.to_datetime(data.date_time)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid date_time format."
        )

    try:
        return validate_prediction_time(prediction_time)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )


def _actual_day_type(prediction_time: pd.Timestamp) -> str:
    """
    Derive the day type from the USER'S selected date, because the
    prediction represents that requested (2026-2030) date.
    """

    return (
        "Weekend"
        if prediction_time.dayofweek >= 5
        else "Weekday"
    )


@app.post("/predict")
def predict(data: TrafficInput):

    # Convert + validate selected date/time (2026-2030 window).
    prediction_time = _validated_prediction_time(data)

    # Derive the actual day type from the user's selected date.
    actual_day_type = _actual_day_type(prediction_time)

    # Prevent contradictory UI input.
    if data.day_type != actual_day_type:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Selected date is a {actual_day_type}. "
                f"day_type must be '{actual_day_type}'."
            )
        )

    # Geographic gate: reject locations far outside the California PeMS
    # network BEFORE any model, history or feature work runs.
    try:
        validate_supported_location(data.latitude, data.longitude)
    except LocationNotSupportedError as exc:
        raise HTTPException(
            status_code=400,
            detail=exc.as_detail()
        )

    result = predict_traffic(
        latitude=data.latitude,
        longitude=data.longitude,
        prediction_time=prediction_time,
        temperature=data.temperature,
        rain=data.rain,
        snow=data.snow,
        cloudiness=data.cloudiness
    )

    return {
        **result,
        "day_type": actual_day_type
    }


@app.post("/traffic-map")
def traffic_map(data: TrafficInput):
    """
    Real traffic intelligence for the map view.

    Predicts the PeMS sensors nearest to the selected location using
    the SAME LightGBM V2 model, the SAME feature pipeline and the
    SAME 2026-2030 -> 2017-2021 historical year mapping as /predict.
    Every returned segment is a real sensor with a real model
    prediction - nothing is simulated.
    """

    # Convert + validate selected date/time (2026-2030 window).
    prediction_time = _validated_prediction_time(data)

    actual_day_type = _actual_day_type(prediction_time)

    if data.day_type != actual_day_type:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Selected date is a {actual_day_type}. "
                f"day_type must be '{actual_day_type}'."
            )
        )

    # Geographic gate: the traffic map is also backed by the California
    # PeMS network, so unsupported locations are rejected here too.
    try:
        validate_supported_location(data.latitude, data.longitude)
    except LocationNotSupportedError as exc:
        raise HTTPException(
            status_code=400,
            detail=exc.as_detail()
        )

    # The historical reference time is identical for every sensor.
    historical_reference_time = map_to_historical_reference(
        prediction_time
    )

    # Real nearby PeMS sensors, nearest first.
    sensors = find_nearby_sensors(
        data.latitude,
        data.longitude,
        count=TRAFFIC_MAP_SENSOR_COUNT
    )

    results = predict_corridor_sensors(
        sensors=sensors,
        prediction_time=prediction_time,
        temperature=data.temperature,
        rain=data.rain,
        snow=data.snow,
        cloudiness=data.cloudiness
    )

    segments = [
        result
        for result in results
        if "prediction" in result
    ]

    errors = [
        {
            "sensor_id": result["sensor_id"],
            "error": result["error"]
        }
        for result in results
        if "error" in result
    ]

    return {
        "prediction_time": str(prediction_time),
        "historical_reference_time": str(historical_reference_time),
        "day_type": actual_day_type,
        "location": {
            "latitude": data.latitude,
            "longitude": data.longitude
        },
        "segments": segments,
        "errors": errors
    }
