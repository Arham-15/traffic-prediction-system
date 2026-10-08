FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

COPY requirements.txt .

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY models/traffic_lightgbm_v2.txt ./models/traffic_lightgbm_v2.txt
COPY data/raw/largest/ca_meta.csv ./data/raw/largest/ca_meta.csv
COPY data/processed/hourly ./data/processed/hourly

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]