"""Train and persist regression model on taxi_trip_pricing.csv."""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

FEATURE_COLS = [
    "Trip_Distance_km",
    "Time_of_Day",
    "Day_of_Week",
    "Passenger_Count",
    "Traffic_Conditions",
    "Weather",
    "Base_Fare",
    "Per_Km_Rate",
    "Per_Minute_Rate",
    "Trip_Duration_Minutes",
]
CAT_COLS = ["Time_of_Day", "Day_of_Week", "Traffic_Conditions", "Weather"]
NUM_COLS = [c for c in FEATURE_COLS if c not in CAT_COLS]

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "taxi_trip_pricing.csv"
MODEL_PATH = Path(__file__).resolve().parent / "model.joblib"
META_PATH = Path(__file__).resolve().parent / "train_meta.joblib"


def build_pipeline() -> Pipeline:
    pre = ColumnTransformer(
        [
            ("num", SimpleImputer(strategy="median"), NUM_COLS),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imp", SimpleImputer(strategy="most_frequent")),
                        (
                            "oh",
                            OneHotEncoder(
                                handle_unknown="ignore",
                                sparse_output=False,
                            ),
                        ),
                    ]
                ),
                CAT_COLS,
            ),
        ]
    )
    return Pipeline(
        steps=[
            ("pre", pre),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=200,
                    max_depth=16,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )


def train_from_csv(csv_path: Path) -> tuple[Pipeline, dict]:
    df = pd.read_csv(csv_path)
    if "Trip_Price" not in df.columns:
        raise ValueError("CSV must include Trip_Price column")
    train = df.dropna(subset=["Trip_Price"])
    X = train[FEATURE_COLS].copy()
    y = train["Trip_Price"]
    pipe = build_pipeline()
    pipe.fit(X, y)
    meta = {
        "n_rows": int(len(train)),
        "feature_cols": FEATURE_COLS,
        "categorical_options": {
            c: sorted(
                train[c].dropna().astype(str).unique().tolist(),
                key=str,
            )
            for c in CAT_COLS
        },
        "metrics_note": "In-sample R² on training rows only (sanity check).",
    }
    from sklearn.metrics import r2_score

    meta["train_r2"] = float(r2_score(y, pipe.predict(X)))
    return pipe, meta


def ensure_model(csv_path: Path | None = None) -> tuple[Pipeline, dict]:
    csv_path = csv_path or DEFAULT_CSV
    if not csv_path.is_file():
        raise FileNotFoundError(f"CSV not found: {csv_path}")
    if MODEL_PATH.is_file() and META_PATH.is_file():
        return joblib.load(MODEL_PATH), joblib.load(META_PATH)
    pipe, meta = train_from_csv(csv_path)
    joblib.dump(pipe, MODEL_PATH)
    joblib.dump(meta, META_PATH)
    return pipe, meta


def retrain_and_save(csv_path: Path | None = None) -> tuple[Pipeline, dict]:
    csv_path = csv_path or DEFAULT_CSV
    pipe, meta = train_from_csv(csv_path)
    joblib.dump(pipe, MODEL_PATH)
    joblib.dump(meta, META_PATH)
    return pipe, meta
