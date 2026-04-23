"""FastAPI app: taxi trip price prediction from trained CSV model."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model_train import FEATURE_COLS, ensure_model, retrain_and_save

app = FastAPI(title="Taxi pricing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_pipe = None
_meta = None


def get_model():
    global _pipe, _meta
    if _pipe is None:
        _pipe, _meta = ensure_model()
    return _pipe, _meta


class PredictIn(BaseModel):
    trip_distance_km: float | None = Field(default=None, alias="Trip_Distance_km")
    time_of_day: str | None = Field(default=None, alias="Time_of_Day")
    day_of_week: str | None = Field(default=None, alias="Day_of_Week")
    passenger_count: float | None = Field(default=None, alias="Passenger_Count")
    traffic_conditions: str | None = Field(default=None, alias="Traffic_Conditions")
    weather: str | None = Field(default=None, alias="Weather")
    base_fare: float | None = Field(default=None, alias="Base_Fare")
    per_km_rate: float | None = Field(default=None, alias="Per_Km_Rate")
    per_minute_rate: float | None = Field(default=None, alias="Per_Minute_Rate")
    trip_duration_minutes: float | None = Field(
        default=None, alias="Trip_Duration_Minutes"
    )

    model_config = {"populate_by_name": True}


class PredictOut(BaseModel):
    predicted_trip_price: float


@app.on_event("startup")
def startup():
    get_model()


@app.get("/health")
def health():
    _, meta = get_model()
    return {"status": "ok", "train_rows": meta["n_rows"], "train_r2": meta["train_r2"]}


@app.get("/schema")
def schema():
    _, meta = get_model()
    return {
        "features": meta["feature_cols"],
        "categorical_options": meta["categorical_options"],
    }


@app.post("/retrain")
def retrain():
    global _pipe, _meta
    _pipe, _meta = retrain_and_save()
    return {
        "ok": True,
        "train_rows": _meta["n_rows"],
        "train_r2": _meta["train_r2"],
    }


@app.post("/predict", response_model=PredictOut)
def predict(body: PredictIn):
    pipe, _ = get_model()
    row = body.model_dump(by_alias=True)
    missing = [k for k in FEATURE_COLS if k not in row]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing keys: {missing}")
    X = pd.DataFrame([{k: row.get(k) for k in FEATURE_COLS}])
    try:
        pred = float(pipe.predict(X)[0])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if pred < 0:
        pred = 0.0
    return PredictOut(predicted_trip_price=round(pred, 4))
