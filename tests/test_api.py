from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)

# Real coordinates in downtown Sacramento (inside PeMS district 3 coverage).
SACRAMENTO = {"latitude": 38.5816, "longitude": -121.4944}

# Unsupported locations: the nearest California PeMS sensor is thousands
# of km away, so the geographic gate must reject these requests.
DELHI = {"latitude": 28.6139, "longitude": 77.2090}
LONDON = {"latitude": 51.5074, "longitude": -0.1278}

# 50 km boundary pair (nearest sensor 501016091, measured with the same
# haversine rule as src.sensor_lookup):
#   inside  -> 49.9 km from the sensor (supported)
#   outside -> 50.2 km from the sensor (rejected)
BOUNDARY_INSIDE = {"latitude": 35.2317, "longitude": -121.2485}
BOUNDARY_OUTSIDE = {"latitude": 35.2309, "longitude": -121.2510}


def _payload(date_time, **overrides):
    """Build a valid /predict body; day_type derived from the selected date."""

    body = {
        **SACRAMENTO,
        "date_time": date_time,
        "day_type": (
            "Weekend"
            if datetime.strptime(date_time[:10], "%Y-%m-%d").weekday() >= 5
            else "Weekday"
        ),
        "temperature": 20.0,
        "rain": 0.0,
        "snow": 0.0,
        "cloudiness": 40.0,
    }

    body.update(overrides)
    return body


def test_predict_2026_maps_history_to_2017():
    response = client.post("/predict", json=_payload("2026-02-15 18:00:00"))

    assert response.status_code == 200

    data = response.json()

    # User-facing timestamp is preserved; history comes from 2017.
    assert data["prediction_time"] == "2026-02-15 18:00:00"
    assert data["historical_reference_time"] == "2017-02-15 18:00:00"
    assert isinstance(data["prediction"], (int, float))
    assert data["prediction"] >= 0
    assert data["severity"] in {"LOW", "MODERATE", "HIGH", "SEVERE"}
    assert data["day_type"] == "Weekend"  # 2026-02-15 is a Sunday
    assert data["sensor"]["sensor_id"]


def test_predict_2030_maps_history_to_2021():
    response = client.post("/predict", json=_payload("2030-02-15 18:00:00"))

    assert response.status_code == 200

    data = response.json()

    assert data["prediction_time"] == "2030-02-15 18:00:00"
    assert data["historical_reference_time"] == "2021-02-15 18:00:00"
    assert data["day_type"] == "Weekday"  # 2030-02-15 is a Friday
    assert isinstance(data["prediction"], (int, float))
    assert data["prediction"] >= 0


def test_day_type_mismatch_is_rejected():
    response = client.post(
        "/predict",
        json=_payload("2026-02-15 18:00:00", day_type="Weekday"),
    )

    assert response.status_code == 400


def test_out_of_window_date_is_rejected():
    before = client.post("/predict", json=_payload("2025-12-31 18:00:00"))
    after = client.post("/predict", json=_payload("2031-01-01 00:00:00"))

    assert before.status_code == 400
    assert after.status_code == 400


def test_traffic_map_returns_real_nearby_sensors():
    response = client.post("/traffic-map", json=_payload("2026-02-15 18:00:00"))

    assert response.status_code == 200

    data = response.json()

    assert data["prediction_time"] == "2026-02-15 18:00:00"
    assert data["historical_reference_time"] == "2017-02-15 18:00:00"
    assert len(data["segments"]) >= 1

    sensor_ids = set()

    for segment in data["segments"]:
        assert segment["sensor_id"]
        assert segment["freeway"]
        assert segment["direction"]
        assert isinstance(segment["prediction"], (int, float))
        assert segment["prediction"] >= 0
        assert segment["severity"] in {"LOW", "MODERATE", "HIGH", "SEVERE"}
        assert -90 <= segment["latitude"] <= 90
        assert -180 <= segment["longitude"] <= 180

        sensor_ids.add(segment["sensor_id"])

    # Every segment is a distinct real sensor.
    assert len(sensor_ids) == len(data["segments"])

    # Sensors are sorted nearest first.
    distances = [segment["distance_km"] for segment in data["segments"]]
    assert distances == sorted(distances)


def test_predict_missing_fields_validation_error():
    response = client.post("/predict", json={})

    assert response.status_code == 422


def test_delhi_is_rejected_and_model_never_runs():
    """Delhi is ~12,000 km from the nearest PeMS sensor: the geographic
    gate must reject the request BEFORE LightGBM is invoked."""

    with patch("src.main.predict_traffic") as model_spy:
        response = client.post(
            "/predict", json=_payload("2026-02-15 18:00:00", **DELHI)
        )

        assert response.status_code == 400
        model_spy.assert_not_called()

    detail = response.json()["detail"]

    assert "outside the supported California PeMS traffic network" in detail["message"]
    assert detail["max_distance_km"] == 50
    assert detail["nearest_sensor_id"]
    assert detail["nearest_sensor_distance_km"] > 10000


def test_london_is_rejected():
    response = client.post(
        "/predict", json=_payload("2026-02-15 18:00:00", **LONDON)
    )

    assert response.status_code == 400

    detail = response.json()["detail"]

    assert "outside the supported California PeMS traffic network" in detail["message"]
    assert detail["nearest_sensor_distance_km"] > 1000


def test_unsupported_location_is_rejected_on_traffic_map_too():
    """The corridor endpoint is backed by the same PeMS network and must
    apply the same gate (without searching sensors or predicting)."""

    with patch("src.main.find_nearby_sensors") as lookup_spy:
        response = client.post(
            "/traffic-map", json=_payload("2026-02-15 18:00:00", **DELHI)
        )

        assert response.status_code == 400
        lookup_spy.assert_not_called()

    detail = response.json()["detail"]

    assert detail["max_distance_km"] == 50
    assert "outside the supported California PeMS traffic network" in detail["message"]


def test_boundary_inside_50km_is_still_supported():
    """~49.9 km from the nearest sensor: inside the rule, so the normal
    prediction flow must run exactly as before."""

    response = client.post(
        "/predict", json=_payload("2026-10-15 18:00:00", **BOUNDARY_INSIDE)
    )

    assert response.status_code == 200

    data = response.json()

    assert isinstance(data["prediction"], (int, float))
    assert data["prediction"] >= 0
    assert data["sensor"]["sensor_id"] == "501016091"
    assert data["sensor"]["distance_km"] <= 50
    assert data["historical_reference_time"] == "2017-10-15 18:00:00"


def test_boundary_outside_50km_is_rejected():
    """Same sensor, ~50.2 km away: just past the rule, so the request is
    rejected with the structured distance payload."""

    response = client.post(
        "/predict", json=_payload("2026-10-15 18:00:00", **BOUNDARY_OUTSIDE)
    )

    assert response.status_code == 400

    detail = response.json()["detail"]

    assert "outside the supported California PeMS traffic network" in detail["message"]
    assert detail["max_distance_km"] == 50
    assert detail["nearest_sensor_id"] == "501016091"
    # Just past the boundary (50.2 km), not a far-away outlier.
    assert 50 < detail["nearest_sensor_distance_km"] <= 60
