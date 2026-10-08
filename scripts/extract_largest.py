from pathlib import Path
import pandas as pd

ROOT = Path(r"C:\PROJECTS\IntelliTraffic\traffic-prediction-system")
DATA_DIR = ROOT / "data" / "raw" / "largest"
OUTPUT_DIR = ROOT / "data" / "processed" / "largest"

META_FILE = DATA_DIR / "ca_meta.csv"

YEARS = [2017, 2018, 2019, 2020, 2021]

# Process 5,000 timestamps at a time.
# 5,000 × 8,600 = 43 million values, which is manageable.
CHUNK_SIZE = 5_000


def extract_year(year):
    input_file = DATA_DIR / f"ca_his_raw_{year}.h5"
    output_file = OUTPUT_DIR / f"traffic_{year}.parquet"

    print(f"\n{'=' * 60}")
    print(f"Processing {year}")
    print(f"{'=' * 60}")

    if not input_file.exists():
        print(f"SKIPPED: {input_file} not found")
        return

    store = pd.HDFStore(input_file, mode="r")

    try:
        shape = store.get_storer("t").shape
        total_rows = shape[0]
        total_columns = shape[1]

        print(f"Rows:    {total_rows:,}")
        print(f"Sensors: {total_columns:,}")

        # Get sensor IDs from metadata
        meta = pd.read_csv(META_FILE)
        sensor_ids = meta["ID"].astype(str).tolist()

        # Read first row to determine actual HDF5 column names
        first = pd.read_hdf(
            input_file,
            key="t",
            start=0,
            stop=1
        )

        available_columns = [str(c) for c in first.columns]

        # Keep sensors that actually exist in this year's HDF5
        selected_columns = [
            sensor for sensor in sensor_ids
            if sensor in available_columns
        ]

        print(f"Metadata sensors: {len(sensor_ids):,}")
        print(f"Available sensors: {len(selected_columns):,}")

        if len(selected_columns) != len(sensor_ids):
            missing = set(sensor_ids) - set(selected_columns)
            print(f"Missing sensors: {len(missing):,}")

        # Temporary chunk files
        chunk_files = []

        for start in range(0, total_rows, CHUNK_SIZE):
            stop = min(start + CHUNK_SIZE, total_rows)

            print(
                f"Reading rows {start:,} → {stop:,} "
                f"({stop / total_rows * 100:.1f}%)"
            )

            chunk = pd.read_hdf(
                input_file,
                key="t",
                start=start,
                stop=stop
            )

            # Keep all 8,600 sensors
            chunk = chunk[selected_columns]

            # Convert sensor IDs to strings
            chunk.columns = chunk.columns.astype(str)

            # Keep timestamp as a normal column
            chunk = chunk.reset_index()

            # Store temporary chunk
            chunk_file = OUTPUT_DIR / f"_{year}_chunk_{start}.parquet"
            chunk.to_parquet(chunk_file, index=False)

            chunk_files.append(chunk_file)

            del chunk

        print("Combining chunks...")

        frames = [
            pd.read_parquet(file)
            for file in chunk_files
        ]

        result = pd.concat(frames, ignore_index=True)

        # Save compressed Parquet
        result.to_parquet(
            output_file,
            index=False,
            compression="snappy"
        )

        print(f"Saved: {output_file}")
        print(f"Final shape: {result.shape}")

        # Delete temporary chunks
        for file in chunk_files:
            file.unlink()

        del result

    finally:
        store.close()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("LargeST ALL-SENSOR EXTRACTION")
    print(f"Output directory: {OUTPUT_DIR}")

    for year in YEARS:
        extract_year(year)

    print("\nExtraction complete.")


if __name__ == "__main__":
    main()
