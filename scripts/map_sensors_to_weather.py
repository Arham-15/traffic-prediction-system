import pandas as pd
import requests
import time
import os

META_FILE = r"data\raw\largest\ca_meta.csv"
OUTPUT_FILE = r"data\processed\sensor_weather_mapping.csv"

API_URL = "https://archive-api.open-meteo.com/v1/archive"

df = pd.read_csv(META_FILE)

print("=" * 70)
print("MAPPING TRAFFIC SENSORS TO WEATHER GRID CELLS")
print("=" * 70)
print()
print("Sensors:", len(df))

results = []

for i, row in enumerate(df.itertuples(index=False), 1):

    sensor_id = str(row.ID)
    latitude = float(row.Lat)
    longitude = float(row.Lng)

    try:

        response = requests.get(
            API_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "start_date": "2021-01-01",
                "end_date": "2021-01-01",
                "hourly": "temperature_2m",
                "timezone": "America/Los_Angeles"
            },
            timeout=30
        )

        response.raise_for_status()

        data = response.json()

        weather_lat = data["latitude"]
        weather_lon = data["longitude"]

        results.append({
            "sensor_id": sensor_id,
            "sensor_latitude": latitude,
            "sensor_longitude": longitude,
            "weather_latitude": weather_lat,
            "weather_longitude": weather_lon
        })

    except Exception as e:

        print(
            f"ERROR sensor {sensor_id}: {e}"
        )

    if i % 100 == 0:
        print(
            f"Processed {i:,}/{len(df):,}"
        )

    # Small delay to avoid hammering the API
    time.sleep(0.05)


mapping = pd.DataFrame(results)

os.makedirs(
    os.path.dirname(OUTPUT_FILE),
    exist_ok=True
)

mapping.to_csv(
    OUTPUT_FILE,
    index=False
)

print()
print("=" * 70)
print("MAPPING COMPLETE")
print("=" * 70)

print()
print("Mapped sensors:", len(mapping))

print(
    "Unique weather cells:",
    mapping[
        ["weather_latitude", "weather_longitude"]
    ].drop_duplicates().shape[0]
)

print()
print("Output:")
print(OUTPUT_FILE)
