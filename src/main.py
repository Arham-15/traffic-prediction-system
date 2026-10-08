from fastapi import FastAPI
from pydantic import BaseModel
from src.prediction import predict_traffic

app = FastAPI(
    title="IntelliTraffic API",
    description="Traffic prediction API for IntelliTraffic",
    version="1.0"
)


class TrafficInput(BaseModel):
    date_time: str
    temp: float
    rain_1h: float
    snow_1h: float
    clouds_all: int
    holiday: str
    weather: str


@app.get("/")
def home():
    return {"message": "IntelliTraffic API is running"}


@app.post("/predict")
def predict(data: TrafficInput):

    prediction = predict_traffic(
        date_time=data.date_time,
        temp=data.temp,
        rain_1h=data.rain_1h,
        snow_1h=data.snow_1h,
        clouds_all=data.clouds_all,
        holiday=data.holiday,
        weather=data.weather
    )

    return {"predicted_traffic": prediction}