import pandas as pd
import numpy as np


META_PATH = "data/raw/largest/ca_meta.csv"


# Geographic support gate: the model is trained on California PeMS data,
# so predictions are only meaningful within this distance of a real PeMS
# sensor. Requests further away than this are rejected before the model
# runs (they would otherwise silently map onto an unrelated sensor).
MAX_SENSOR_DISTANCE_KM = 50

SUPPORTED_AREA_MESSAGE = (
    "Location is outside the supported California PeMS traffic network. "
    "Please select a location within 50 km of a supported PeMS sensor."
)


# Load sensor metadata once
metadata = pd.read_csv(META_PATH)

metadata["ID"] = metadata["ID"].astype(str)

# Keep only the columns needed by the prediction API
sensor_data = metadata[
    [
        "ID",
        "Lat",
        "Lng",
        "District",
        "County",
        "Fwy",
        "Lanes",
        "Type",
        "Direction",
    ]
].copy()


def _sensor_distances(latitude, longitude):
    """
    Great-circle (haversine) distance in radians from the supplied
    coordinates to every PeMS sensor.
    """

    lat1 = np.radians(latitude)
    lon1 = np.radians(longitude)

    lat2 = np.radians(sensor_data["Lat"].values)
    lon2 = np.radians(sensor_data["Lng"].values)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1)
        * np.cos(lat2)
        * np.sin(dlon / 2) ** 2
    )

    return 2 * np.arcsin(np.sqrt(a))


def _sensor_dict(sensor, distance):

    return {
        "sensor_id": str(sensor["ID"]),
        "latitude": float(sensor["Lat"]),
        "longitude": float(sensor["Lng"]),
        "distance_km": float(6371 * distance),
        "district": int(sensor["District"]),
        "county": str(sensor["County"]),
        "freeway": str(sensor["Fwy"]),
        "lanes": float(sensor["Lanes"]),
        "type": str(sensor["Type"]),
        "direction": str(sensor["Direction"]),
    }


def find_nearest_sensor(latitude, longitude):
    """
    Find the PeMS sensor geographically closest
    to the supplied latitude and longitude.
    """

    distance = _sensor_distances(latitude, longitude)

    nearest_index = int(np.argmin(distance))

    return _sensor_dict(
        sensor_data.iloc[nearest_index],
        distance[nearest_index]
    )


class LocationNotSupportedError(Exception):
    """
    Raised when the requested location is too far from every real PeMS
    sensor to support a meaningful prediction.
    """

    def __init__(self, latitude, longitude, nearest_sensor_id, nearest_sensor_distance_km):
        self.latitude = float(latitude)
        self.longitude = float(longitude)
        self.nearest_sensor_id = str(nearest_sensor_id)
        self.nearest_sensor_distance_km = float(nearest_sensor_distance_km)
        super().__init__(SUPPORTED_AREA_MESSAGE)

    def as_detail(self):
        """Structured payload for the HTTP 400 `detail` body."""

        return {
            "message": SUPPORTED_AREA_MESSAGE,
            "max_distance_km": MAX_SENSOR_DISTANCE_KM,
            "nearest_sensor_id": self.nearest_sensor_id,
            "nearest_sensor_distance_km": round(self.nearest_sensor_distance_km, 1),
        }


def validate_supported_location(latitude, longitude):
    """
    Geographic gate for the prediction endpoints.

    Computes the nearest real PeMS sensor and raises
    LocationNotSupportedError when it is further than
    MAX_SENSOR_DISTANCE_KM away. Must be called BEFORE any model,
    history or feature work so unsupported locations never reach
    LightGBM. Returns the nearest-sensor distance in km when supported.
    """

    distance = _sensor_distances(latitude, longitude)

    nearest_index = int(np.argmin(distance))
    nearest_distance_km = float(6371 * distance[nearest_index])

    if nearest_distance_km > MAX_SENSOR_DISTANCE_KM:
        raise LocationNotSupportedError(
            latitude=latitude,
            longitude=longitude,
            nearest_sensor_id=str(sensor_data.iloc[nearest_index]["ID"]),
            nearest_sensor_distance_km=nearest_distance_km,
        )

    return nearest_distance_km


def find_nearby_sensors(latitude, longitude, count=8):
    """
    Return the `count` real PeMS sensors geographically closest to the
    supplied latitude and longitude, sorted by distance (nearest
    first). Used by the traffic-map endpoint so several road segments
    can be highlighted from real model predictions.
    """

    distance = _sensor_distances(latitude, longitude)

    count = max(1, int(count))

    nearest_indices = np.argsort(distance)[:count]

    return [
        _sensor_dict(sensor_data.iloc[index], distance[index])
        for index in nearest_indices
    ]
