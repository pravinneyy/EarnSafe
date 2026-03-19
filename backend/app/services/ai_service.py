"""
AI/ML Service — EarnSafe AI Engine

Loads CatBoost (risk pricing) and IsolationForest (fraud detection)
models once at startup and exposes prediction functions.
"""

import random

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from sklearn.ensemble import IsolationForest

# ──────────────────────────────────────────────
# MODEL INITIALIZATION (runs once on import)
# ──────────────────────────────────────────────
print("⚡ Booting EarnSafe AI Models...")

# --- CatBoost Risk Model ---
_CATEGORICAL_FEATURES = ["Zone", "Delivery_Persona", "External_Disruption"]

risk_model = CatBoostClassifier(
    iterations=50, depth=4, cat_features=_CATEGORICAL_FEATURES, verbose=0
)

_dummy_df = pd.DataFrame(
    [
        {"Zone": "OMR", "Delivery_Persona": "Food", "Forecast_Rain_mm": 0, "Forecast_Temp_C": 35, "External_Disruption": "None"},
        {"Zone": "Velachery", "Delivery_Persona": "Grocery", "Forecast_Rain_mm": 50, "Forecast_Temp_C": 28, "External_Disruption": "Local Strike"},
        {"Zone": "Anna Nagar", "Delivery_Persona": "E-Commerce", "Forecast_Rain_mm": 10, "Forecast_Temp_C": 32, "External_Disruption": "None"},
        {"Zone": "T Nagar", "Delivery_Persona": "Food", "Forecast_Rain_mm": 80, "Forecast_Temp_C": 25, "External_Disruption": "Severe Waterlogging"},
    ]
)
risk_model.fit(_dummy_df, [0, 1, 0, 1])

# --- IsolationForest Fraud Model ---
fraud_model = IsolationForest(contamination=0.10, random_state=42)
_X_historical = np.array([
    [10.5, 4, 0.99],  # Normal
    [0.0, 1, 0.20],   # Suspicious
    [45.2, 6, 0.95],  # Normal
    [2.1, 8, 0.98],   # Normal
])
fraud_model.fit(_X_historical)

print("✅ AI Models loaded successfully.")

# ──────────────────────────────────────────────
# TIER BASE RATES
# ──────────────────────────────────────────────
_TIER_BASE_RATES = {
    "basic": 29.0,
    "standard": 49.0,
    "pro": 89.0,
}


# ──────────────────────────────────────────────
# PUBLIC API
# ──────────────────────────────────────────────

def predict_risk(zone: str, delivery_persona: str, tier: str) -> dict:
    """
    Run the CatBoost model to get an AI risk score and dynamic premium.

    Returns dict with: ai_risk_score, weekly_premium_inr, zone, active_disruption
    """
    clean_zone = zone.strip().title()
    clean_persona = delivery_persona.strip().title()

    # Simulated weather feed (would be replaced with real WeatherAPI data)
    rain = round(random.uniform(0, 15), 1)
    temp = round(random.uniform(28, 38), 1)

    # 15% chance of mock disruption
    chaos_event = "None"
    if random.random() > 0.85:
        chaos_event = random.choice(
            ["Unplanned Curfew", "Severe Waterlogging", "Local Strike"]
        )
        if "Waterlogging" in chaos_event:
            rain = rain * 5

    input_data = pd.DataFrame(
        [
            {
                "Zone": clean_zone,
                "Delivery_Persona": clean_persona,
                "Forecast_Rain_mm": rain,
                "Forecast_Temp_C": temp,
                "External_Disruption": chaos_event,
            }
        ]
    )

    probability = float(risk_model.predict_proba(input_data)[:, 1][0])

    base_rate = _TIER_BASE_RATES.get(tier.lower(), 29.0)
    ai_risk_multiplier = 1.0 + probability
    final_premium = round(base_rate * ai_risk_multiplier, 2)

    return {
        "ai_risk_score": round(probability, 2),
        "weekly_premium_inr": final_premium,
        "zone": clean_zone,
        "active_disruption": chaos_event,
    }


def detect_claim_anomaly(
    reported_rain_mm: float,
    hours_worked_before_claim: float,
    location_match_score: float,
) -> dict:
    """
    Run the IsolationForest model on a claim.

    Returns dict with: is_anomaly (bool), anomaly_label (str)
    """
    claim_data = np.array(
        [[reported_rain_mm, hours_worked_before_claim, location_match_score]]
    )
    prediction = fraud_model.predict(claim_data)[0]  # 1 = normal, -1 = anomaly

    return {
        "is_anomaly": prediction == -1,
        "anomaly_label": "FLAGGED" if prediction == -1 else "NORMAL",
    }
