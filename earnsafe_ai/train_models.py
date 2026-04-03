"""
EarnSafe AI — Model Training Script
====================================
Run this ONCE on your machine to generate the saved model files:
    python train_models.py

Outputs:
    risk_model.cbm      → CatBoost risk/premium model
    fraud_model.pkl     → IsolationForest fraud detection model
    label_encoder.pkl   → Zone label encoder (for consistent inference)

Then copy these 3 files into:  backend/app/services/models/
"""

import pickle
import random
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder
import os

random.seed(42)
np.random.seed(42)

# ─────────────────────────────────────────────────────────────────
# 1. SYNTHETIC DATASET — Chennai Food Delivery, realistic patterns
# ─────────────────────────────────────────────────────────────────

CHENNAI_ZONES = [
    # Zone name,          flood_risk (0-1), heat_risk (0-1), aqi_risk (0-1)
    ("Velachery",         0.85, 0.60, 0.55),  # low-lying, floods badly
    ("Anna Nagar",        0.35, 0.65, 0.50),
    ("T Nagar",           0.60, 0.70, 0.65),  # congested, heat island
    ("OMR",               0.40, 0.55, 0.40),  # coastal breeze helps
    ("Tambaram",          0.50, 0.60, 0.45),
    ("Adyar",             0.70, 0.58, 0.48),  # near river, floods
    ("Perambur",          0.45, 0.65, 0.70),  # industrial, high AQI
    ("Chrompet",          0.55, 0.62, 0.50),
    ("Sholinganallur",    0.75, 0.55, 0.42),  # IT corridor, waterlogging
    ("Kodambakkam",       0.50, 0.68, 0.60),
]

DISRUPTION_TYPES = [
    "None",
    "Heavy Rainfall",
    "Extreme Heat",
    "Severe Waterlogging",
    "Dense Fog",
    "Local Strike",
    "Unplanned Curfew",
    "Severe AQI",
]

# Month → season factors (Chennai)
# Jun-Oct = monsoon, Mar-May = summer
def season_factors(month: int):
    if 6 <= month <= 10:   # Northeast + Southwest monsoon
        return {"rain_base": 25, "rain_variance": 60, "temp_base": 27, "temp_variance": 4}
    elif month in (3, 4, 5):  # Summer
        return {"rain_base": 5,  "rain_variance": 15, "temp_base": 36, "temp_variance": 5}
    elif month in (11, 12):   # Northeast monsoon tail
        return {"rain_base": 15, "rain_variance": 40, "temp_base": 28, "temp_variance": 3}
    else:                      # Jan-Feb, dry
        return {"rain_base": 2,  "rain_variance": 8,  "temp_base": 29, "temp_variance": 3}


def generate_disruption(rain_mm, temp_c, aqi_pm25, zone_flood_risk, zone_aqi_risk, month):
    """Determine disruption type from weather + zone characteristics."""
    # Base probabilities
    rain_disruption_prob = min(rain_mm / 80.0, 1.0) * zone_flood_risk
    heat_disruption_prob = max((temp_c - 38) / 6.0, 0.0) * 0.8
    aqi_disruption_prob  = min(aqi_pm25 / 150.0, 1.0) * zone_aqi_risk
    social_disruption_prob = 0.04  # ~4% base chance of strike/curfew

    r = random.random()
    if r < rain_disruption_prob and rain_mm > 20:
        if rain_mm > 60 and zone_flood_risk > 0.7:
            return "Severe Waterlogging"
        return "Heavy Rainfall"
    elif r < rain_disruption_prob + heat_disruption_prob and temp_c > 38:
        return "Extreme Heat"
    elif r < rain_disruption_prob + heat_disruption_prob + aqi_disruption_prob and aqi_pm25 > 75:
        return "Severe AQI"
    elif r < rain_disruption_prob + heat_disruption_prob + aqi_disruption_prob + social_disruption_prob:
        return random.choice(["Local Strike", "Unplanned Curfew"])
    elif month in (1, 2) and random.random() < 0.05:
        return "Dense Fog"
    return "None"


def income_loss_label(disruption, rain_mm, temp_c, hours_active):
    """1 = significant income loss, 0 = no/minor loss."""
    if disruption == "None":
        return 1 if hours_active < 3 and random.random() < 0.05 else 0
    severe = {"Severe Waterlogging", "Unplanned Curfew", "Local Strike"}
    moderate = {"Heavy Rainfall", "Extreme Heat", "Severe AQI", "Dense Fog"}
    if disruption in severe:
        return 1  # always income loss
    if disruption in moderate:
        return 1 if random.random() < 0.75 else 0
    return 0


rows = []
for _ in range(600):
    month = random.randint(1, 12)
    sf = season_factors(month)

    zone_name, flood_r, heat_r, aqi_r = random.choice(CHENNAI_ZONES)

    rain_mm   = max(0, np.random.normal(sf["rain_base"], sf["rain_variance"]))
    temp_c    = np.random.normal(sf["temp_base"] + heat_r * 3, sf["temp_variance"])
    aqi_pm25  = max(5, np.random.normal(35 + aqi_r * 60, 20))
    wind_kph  = max(0, np.random.normal(12, 8))
    hours_active = random.uniform(4, 12)

    disruption = generate_disruption(rain_mm, temp_c, aqi_pm25, flood_r, aqi_r, month)
    label = income_loss_label(disruption, rain_mm, temp_c, hours_active)

    rows.append({
        "Zone":                zone_name,
        "Delivery_Persona":    "Food",      # fixed — EarnSafe is Food delivery only
        "Month":               month,
        "Forecast_Rain_mm":    round(rain_mm, 1),
        "Forecast_Temp_C":     round(temp_c, 1),
        "AQI_PM25":            round(aqi_pm25, 1),
        "Wind_KPH":            round(wind_kph, 1),
        "Hours_Active":        round(hours_active, 1),
        "External_Disruption": disruption,
        "Income_Loss":         label,        # target variable
    })

df = pd.DataFrame(rows)

print(f"Dataset: {len(df)} rows")
print(f"Income loss rate: {df['Income_Loss'].mean():.1%}")
print(f"Disruption breakdown:\n{df['External_Disruption'].value_counts()}\n")

# ─────────────────────────────────────────────────────────────────
# 2. CATBOOST RISK MODEL
# ─────────────────────────────────────────────────────────────────

CATEGORICAL_FEATURES = ["Zone", "Delivery_Persona", "External_Disruption"]
FEATURE_COLS = [
    "Zone", "Delivery_Persona", "Month",
    "Forecast_Rain_mm", "Forecast_Temp_C", "AQI_PM25",
    "Wind_KPH", "External_Disruption",
]

X = df[FEATURE_COLS]
y = df["Income_Loss"]

risk_model = CatBoostClassifier(
    iterations=200,
    depth=5,
    learning_rate=0.05,
    cat_features=CATEGORICAL_FEATURES,
    eval_metric="AUC",
    random_seed=42,
    verbose=50,
)

risk_model.fit(X, y)
risk_model.save_model("risk_model.cbm")
print("✅ Saved: risk_model.cbm")

# Feature importances (useful to show judges)
importances = risk_model.get_feature_importance(prettified=True)
print("\nTop feature importances:")
print(importances.head(8).to_string(index=False))

# ─────────────────────────────────────────────────────────────────
# 3. ISOLATION FOREST — FRAUD DETECTION
#    Features: [rain_mm, hours_worked, location_match, claim_ratio,
#               activity_drop, prior_claims_count]
# ─────────────────────────────────────────────────────────────────
print("\nTraining IsolationForest fraud model...")

# Realistic normal claims (what a genuine disrupted worker looks like)
normal_claims = []
for _ in range(300):
    rain = np.random.normal(35, 20)           # real rain event
    hours = random.uniform(1, 6)              # genuinely lost hours
    loc_match = random.uniform(0.75, 1.0)     # GPS ≈ cell tower
    claim_ratio = random.uniform(0.3, 0.9)    # claim < daily cap
    activity_drop = random.uniform(0.5, 1.0)  # app shows less activity
    prior_claims = random.randint(0, 2)
    normal_claims.append([
        max(0, rain), hours, loc_match,
        claim_ratio, activity_drop, prior_claims,
    ])

# Suspicious / fraudulent patterns (what a spoofer looks like)
# These are injected as "contamination" for the model to learn from
fraud_claims = []
for _ in range(30):
    fraud_type = random.choice(["gps_spoof", "inflate_hours", "dry_weather_claim"])
    if fraud_type == "gps_spoof":
        # No rain, but claiming flood — GPS spoofed
        rain = random.uniform(0, 5)
        hours = random.uniform(4, 10)
        loc_match = random.uniform(0.0, 0.30)   # cell tower mismatch
        activity_drop = random.uniform(0.0, 0.20)  # app still active
        claim_ratio = random.uniform(0.85, 1.0)
        prior_claims = random.randint(2, 5)
    elif fraud_type == "inflate_hours":
        # Real rain but inflating hours lost
        rain = random.uniform(20, 60)
        hours = random.uniform(9, 12)           # implausibly high
        loc_match = random.uniform(0.6, 0.9)
        activity_drop = random.uniform(0.6, 0.9)
        claim_ratio = random.uniform(0.90, 1.0) # close to cap
        prior_claims = random.randint(3, 6)
    else:
        # Claiming disruption on a clear day
        rain = random.uniform(0, 3)
        hours = random.uniform(3, 8)
        loc_match = random.uniform(0.1, 0.5)
        activity_drop = random.uniform(0.0, 0.3)
        claim_ratio = random.uniform(0.7, 1.0)
        prior_claims = random.randint(1, 4)

    fraud_claims.append([rain, hours, loc_match, claim_ratio, activity_drop, prior_claims])

X_fraud = np.array(normal_claims + fraud_claims)

fraud_model = IsolationForest(
    contamination=0.09,   # ~9% fraud rate is realistic
    n_estimators=150,
    max_samples="auto",
    random_state=42,
)
fraud_model.fit(X_fraud)

# Quick sanity check
test_normal   = np.array([[40.0, 4.0, 0.92, 0.60, 0.80, 1]])
test_spoof    = np.array([[0.5,  6.0, 0.10, 0.95, 0.05, 4]])
print(f"  Normal claim prediction:  {fraud_model.predict(test_normal)[0]} (expected 1=normal)")
print(f"  Spoof claim prediction:   {fraud_model.predict(test_spoof)[0]}  (expected -1=anomaly)")

with open("fraud_model.pkl", "wb") as f:
    pickle.dump(fraud_model, f)
print("✅ Saved: fraud_model.pkl")

# ─────────────────────────────────────────────────────────────────
# 4. SAVE ZONE LIST for consistent inference
# ─────────────────────────────────────────────────────────────────
zone_risk_map = {z[0]: {"flood": z[1], "heat": z[2], "aqi": z[3]} for z in CHENNAI_ZONES}
with open("zone_risk_map.pkl", "wb") as f:
    pickle.dump(zone_risk_map, f)
print("✅ Saved: zone_risk_map.pkl")

print("\n✅ All models trained and saved. Copy these into backend/app/services/models/")
print("   - risk_model.cbm")
print("   - fraud_model.pkl")
print("   - zone_risk_map.pkl")
