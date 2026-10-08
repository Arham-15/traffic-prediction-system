import os
import time
import random

import pandas as pd
import requests


MAPPING_FILE = r"data\processed\sensor_weather_mapping.csv"
OUTPUT_DIR = r"data\processed\weather"

API_URL = "https://archive-api.open-meteo.com/v1/archive"

START_DATE = "2017-01-01"
END_DATE = "2021-12-31"

os.makedirs(OUTPUT_DIR, exist_ok=True)


mapping = pd.read_csv(MAPPING_FILE)

weather_cells = (
    mapping[
        ["weather_latitude", "weather_longitude"]
    ]
    .drop_duplicates()
    .reset_index(drop=True)
)


print("=" * 70)
print("HISTORICAL WEATHER DOWNLOAD")
print("=" * 70)
print()

print("Weather cells:", len(weather_cells))
print("Period:", START_DATE, "to", END_DATE)
print("Output:", OUTPUT_DIR)
print()


session = requests.Session()

session.headers.update({
    "User-Agent": "IntelliTraffic/1.0"
})


successful = 0
skipped = 0
failed = 0


for i, row in weather_cells.iterrows():

    latitude = float(row["weather_latitude"])
    longitude = float(row["weather_longitude"])

    filename = (
        f"weather_"
        f"{latitude:.6f}_"
        f"{longitude:.6f}.parquet"
    )

    output_file = os.path.join(
        OUTPUT_DIR,
        filename
    )


    # --------------------------------------------------
    # Resume support
    # --------------------------------------------------

    if os.path.exists(output_file):

        skipped += 1

        print(
            f"[{i + 1}/{len(weather_cells)}] "
            f"SKIP | already exists | "
            f"{latitude:.6f}, {longitude:.6f}"
        )

        continue


    success = False


    # --------------------------------------------------
    # Retry
    # --------------------------------------------------

    for attempt in range(1, 7):

        try:

            print(
                f"[{i + 1}/{len(weather_cells)}] "
                f"Request | attempt {attempt}/6 | "
                f"{latitude:.6f}, {longitude:.6f}"
            )


            response = session.get(
                API_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "start_date": START_DATE,
                    "end_date": END_DATE,
                    "hourly": (
                        "temperature_2m,"
                        "rain,"
                        "snowfall,"
                        "cloud_cover"
                    ),
                    "timezone": "America/Los_Angeles"
                },
                timeout=180
            )


            response.raise_for_status()


            data = response.json()

            hourly = data["hourly"]


            weather = pd.DataFrame({

                "date_time": pd.to_datetime(
                    hourly["time"]
                ),

                "temperature": hourly["temperature_2m"],

                "rain": hourly["rain"],

                "snow": hourly["snowfall"],

                "cloudiness": hourly["cloud_cover"]

            })


            weather["weather_latitude"] = latitude
            weather["weather_longitude"] = longitude


            weather.to_parquet(
                output_file,
                index=False,
                engine="fastparquet"
            )


            successful += 1
            success = True


            print(
                f"    SUCCESS | "
                f"{len(weather):,} rows"
            )


            # --------------------------------------------------
            # Delay after successful request
            # --------------------------------------------------

            delay = random.uniform(5.0, 8.0)

            print(
                f"    Waiting {delay:.1f}s..."
            )

            time.sleep(delay)

            break


        # --------------------------------------------------
        # HTTP errors
        # --------------------------------------------------

        except requests.exceptions.HTTPError as e:

            print(
                f"    FAILED attempt {attempt}/6:"
            )

            print(
                f"    {e}"
            )


            if attempt < 6:

                if response.status_code == 429:

                    delay = random.uniform(60, 90)

                    print(
                        "    RATE LIMITED (429)"
                    )

                    print(
                        f"    Waiting {delay:.1f}s before retry..."
                    )

                else:

                    delay = min(
                        60,
                        5 * (2 ** (attempt - 1))
                    )

                    delay += random.uniform(0, 3)

                    print(
                        f"    Waiting {delay:.1f}s before retry..."
                    )

                time.sleep(delay)


        # --------------------------------------------------
        # Other errors
        # --------------------------------------------------

        except Exception as e:

            print(
                f"    FAILED attempt {attempt}/6:"
            )

            print(
                f"    {e}"
            )


            if attempt < 6:

                delay = min(
                    60,
                    5 * (2 ** (attempt - 1))
                )

                delay += random.uniform(0, 3)

                print(
                    f"    Waiting {delay:.1f}s before retry..."
                )

                time.sleep(delay)


    if not success:

        failed += 1

        print(
            f"    PERMANENT FAILURE | "
            f"{latitude:.6f}, {longitude:.6f}"
        )


print()
print("=" * 70)
print("WEATHER DOWNLOAD RUN COMPLETE")
print("=" * 70)
print()

print("New successful:", successful)
print("Already existed:", skipped)
print("Failed:", failed)
print("Total cells:", len(weather_cells))

print()
print("Run the same command again if failures remain.")
print("Existing files will automatically be skipped.")
