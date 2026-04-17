"""
EarnSafe — Model Training Script
=================================
Trains and saves all three model binaries used by the backend:

  1. risk_model.cbm      — CatBoost classifier for parametric risk scoring
  2. fraud_model.pkl     — IsolationForest for claim fraud detection
  3. zone_risk_map.pkl   — Zone → {flood, heat, aqi} risk profile dict

Usage (from repo root):
    pip install catboost scikit-learn pandas
    python ai/ml/train_models.py
"""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from sklearn.ensemble import IsolationForest

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ─────────────────────────────────────────────────────────────────
# 1. RISK MODEL  (CatBoost — parametric risk classification)
# ─────────────────────────────────────────────────────────────────
# Labels: 1 = high disruption risk, 0 = safe / mild conditions

RISK_TRAINING_DATA = [
    # Zone              Persona  Month  Rain  Temp  AQI   Wind  Disruption             Label
    ("Velachery",      "Food",   8,     85,   27,   35,   30,   "Severe Waterlogging", 1),
    ("Velachery",      "Food",   9,     60,   28,   30,   20,   "Heavy Rainfall",      1),
    ("Velachery",      "Food",   10,    70,   27,   28,   18,   "Severe Waterlogging", 1),
    ("Sholinganallur", "Food",   8,     55,   27,   32,   22,   "Heavy Rainfall",      1),
    ("Adyar",          "Food",   9,     50,   28,   30,   20,   "Heavy Rainfall",      1),
    ("T Nagar",        "Grocery",4,      0,   44,   45,    8,   "Extreme Heat",        1),
    ("T Nagar",        "Food",   5,      2,   43,   40,    6,   "Extreme Heat",        1),
    ("Kodambakkam",    "Food",   5,      0,   45,   50,    9,   "Extreme Heat",        1),
    ("Perambur",       "Food",   11,     5,   32,  110,    5,   "Severe AQI",          1),
    ("Perambur",       "Grocery",11,     3,   31,   90,    4,   "Severe AQI",          1),
    ("OMR",            "Food",   12,    15,   29,   20,   75,   "None",                1),
    ("Anna Nagar",     "Food",   1,      2,   29,   25,   12,   "None",                0),
    ("Anna Nagar",     "Food",   2,      0,   30,   22,   10,   "None",                0),
    ("Anna Nagar",     "Grocery",3,      5,   34,   35,    8,   "None",                0),
    ("OMR",            "Food",   1,      2,   29,   20,   12,   "None",                0),
    ("OMR",            "Grocery",2,      0,   30,   18,   10,   "None",                0),
    ("Tambaram",       "Food",   6,     10,   32,   28,   14,   "None",                0),
    ("Tambaram",       "Food",   12,     5,   28,   30,   11,   "None",                0),
    ("Chrompet",       "Food",   2,      1,   30,   25,   10,   "None",                0),
    ("Adyar",          "Food",   3,      3,   33,   28,   12,   "None",                0),
    ("Kodambakkam",    "Grocery",1,      0,   29,   22,    9,   "None",                0),
    ("Sholinganallur", "Food",   2,      2,   30,   20,   11,   "None",                0),
    ("Velachery",      "Food",   6,     25,   30,   30,   15,   "Heavy Rainfall",      1),
    ("T Nagar",        "Food",   8,     30,   28,   35,   18,   "Heavy Rainfall",      1),
    ("Perambur",       "Food",   12,     2,   29,   80,    6,   "Severe AQI",          1),
]

columns = ["Zone", "Delivery_Persona", "Month", "Forecast_Rain_mm",
           "Forecast_Temp_C", "AQI_PM25", "Wind_KPH", "External_Disruption"]

rows = [r[:8] for r in RISK_TRAINING_DATA]
labels = [r[8] for r in RISK_TRAINING_DATA]

df = pd.DataFrame(rows, columns=columns)

risk_model = CatBoostClassifier(
    iterations=300,
    depth=5,
    learning_rate=0.05,
    cat_features=["Zone", "Delivery_Persona", "External_Disruption"],
    eval_metric="AUC",
    random_seed=42,
    verbose=False,
)
risk_model.fit(df, labels)
risk_model.save_model(str(MODELS_DIR / "risk_model.cbm"))
print(f"[OK] risk_model.cbm saved  ({len(df)} training samples)")


# ─────────────────────────────────────────────────────────────────
# 2. FRAUD MODEL  (IsolationForest — anomaly detection)
# ─────────────────────────────────────────────────────────────────
# Features: [reported_rain_mm, hours_worked_before_claim, location_match_score]
# Normal = most rows; anomalies = suspicious claims (high rain + long hours + low match)

fraud_normal = np.array([
    [45.0, 2.0, 0.95],   # genuine — heavy rain, stopped early, location matches
    [60.0, 1.5, 0.92],
    [30.0, 3.0, 0.88],
    [80.0, 0.5, 0.97],
    [20.0, 4.0, 0.85],
    [55.0, 2.5, 0.90],
    [0.0,  6.0, 0.80],   # no rain, long shift, location ok — normal claim
    [10.0, 5.0, 0.83],
    [35.0, 3.5, 0.87],
    [70.0, 1.0, 0.94],
])
fraud_anomalous = np.array([
    [5.0,  8.0, 0.15],   # almost no rain, worked long, location mismatch — suspicious
    [2.0,  9.0, 0.08],
    [0.5,  7.5, 0.12],
    [1.0,  8.5, 0.20],
])

fraud_data = np.vstack([fraud_normal, fraud_anomalous])

fraud_model = IsolationForest(contamination=0.20, random_state=42)
fraud_model.fit(fraud_data)

with open(MODELS_DIR / "fraud_model.pkl", "wb") as f:
    pickle.dump(fraud_model, f)
print(f"[OK] fraud_model.pkl saved  ({len(fraud_data)} training samples)")


# ─────────────────────────────────────────────────────────────────
# 3. ZONE RISK MAP  (dict — hyper-local risk profile)
# ─────────────────────────────────────────────────────────────────
# flood: 0.0–1.0 (flood/waterlogging susceptibility)
# heat:  0.0–1.0 (urban heat island effect)
# aqi:   0.0–1.0 (air quality risk level)

zone_risk_map: dict[str, dict[str, float]] = {
    "Velachery":      {"flood": 0.85, "heat": 0.60, "aqi": 0.55},
    "Anna Nagar":     {"flood": 0.35, "heat": 0.65, "aqi": 0.50},
    "T Nagar":        {"flood": 0.60, "heat": 0.70, "aqi": 0.65},
    "OMR":            {"flood": 0.40, "heat": 0.55, "aqi": 0.40},
    "Tambaram":       {"flood": 0.50, "heat": 0.60, "aqi": 0.45},
    "Adyar":          {"flood": 0.70, "heat": 0.58, "aqi": 0.48},
    "Perambur":       {"flood": 0.45, "heat": 0.65, "aqi": 0.70},
    "Chrompet":       {"flood": 0.55, "heat": 0.62, "aqi": 0.50},
    "Sholinganallur": {"flood": 0.75, "heat": 0.55, "aqi": 0.42},
    "Kodambakkam":    {"flood": 0.50, "heat": 0.68, "aqi": 0.60},
}

with open(MODELS_DIR / "zone_risk_map.pkl", "wb") as f:
    pickle.dump(zone_risk_map, f)
print(f"[OK] zone_risk_map.pkl saved  ({len(zone_risk_map)} zones)")

print("\nAll models saved to", MODELS_DIR.resolve())
