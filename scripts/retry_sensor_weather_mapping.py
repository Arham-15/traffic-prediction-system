import pandas as pd
import requests
import time

META_FILE = r"data\raw\largest\ca_meta.csv"
MAPPING_FILE = r"data\processed\sensor_weather_mapping.csv"

API_URL = "https://archive-api.open-meteo.com/v1/archive"

meta = pd.read_csv(META_FILE)
mapping = pd.read_csv(MAPPING_FILE)

mapped_ids = set(mapping["sensor_id"].astype(str))

missing = meta[
    ~meta["ID"].astype(str).isin(mapped_ids)
].copy()

print("=" * 70)
print("RETRYING FAILED SENSOR WEATHER MAPPINGS")
print("=" * 70)

print("Missing sensors:", len(missing))

results = []

session = requests.Session()

for i, row in enumerate(missing.itertuples(index=False), 1):

    sensor_id = str(row.ID)
    latitude = float(row.Lat)
    longitude = float(row.Lng)

    success = False

    for attempt in range(1, 4):

        try:

            response = session.get(
                API_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "start_date": "2021-01-01",
                    "end_date": "2021-01-01",
                    "hourly": "temperature_2m",
                    "timezone": "America/Los_Angeles"
                },
                timeout=60
            )

            response.raise_for_status()

            data = response.json()

            results.append({
                "sensor_id": sensor_id,
                "sensor_latitude": latitude,
                "sensor_longitude": longitude,
                "weather_latitude": data["latitude"],
                "weather_longitude": data["longitude"]
            })

            success = True
            break

        except Exception as e:

            print(
                f"Sensor {sensor_id} | "
                f"attempt {attempt}/3 failed: {e}"
            )

            time.sleep(2)

    if not success:
        print(
            f"FAILED PERMANENTLY: {sensor_id}"
        )

    print(
        f"Processed {i}/{len(missing)}"
    )

    time.sleep(0.2)


if results:

    retry_df = pd.DataFrame(results)

    combined = pd.concat(
        [mapping, retry_df],
        ignore_index=True
    )

    combined = combined.drop_duplicates(
        subset=["sensor_id"],
        keep="last"
    )

    combined.to_csv(
        MAPPING_FILE,
        index=False
    )

else:

    combined = mapping


print()
print("=" * 70)
print("RETRY COMPLETE")
print("=" * 70)

print("Total mapped sensors:", len(combined))

print(
    "Unique weather cells:",
    combined[
        ["weather_latitude", "weather_longitude"]
    ].drop_duplicates().shape[0]
)

print(
    "Still missing:",
    len(meta) - len(combined)
)

print()
print("Mapping file:")
print(MAPPING_FILE)
