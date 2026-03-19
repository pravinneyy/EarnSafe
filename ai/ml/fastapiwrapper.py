"""
EarnSafe AI Engine — FastAPI Wrapper (Reference / Demo Only)

This file served as the original standalone AI/ML server during Phase 1.
The models are now integrated into the main backend at:
  - backend/app/services/ai_service.py (model initialization)
  - backend/app/services/premium_service.py (CatBoost risk pricing)
  - backend/app/services/fraud_service.py (IsolationForest fraud detection)
  - backend/app/routers/policy_router.py (/policy/ai-premium endpoint)

You can still run this file standalone for testing:
  uvicorn fastapiwrapper:app --reload --port 8001
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import requests
import random
from catboost import CatBoostClassifier
from sklearn.ensemble import IsolationForest

# Initialize the API
app = FastAPI(title="EarnSafe AI Engine (Standalone Demo)")

# ==========================================
# MODEL INITIALIZATION (Loads on startup)
# ==========================================
print("Booting up EarnSafe AI Models...")
categorical_features = ['Zone', 'Delivery_Persona', 'External_Disruption']
risk_model = CatBoostClassifier(iterations=50, depth=4, cat_features=categorical_features, verbose=0)

dummy_df = pd.DataFrame([
    {'Zone': 'OMR', 'Delivery_Persona': 'Food', 'Forecast_Rain_mm': 0, 'Forecast_Temp_C': 35, 'External_Disruption': 'None'},
    {'Zone': 'Velachery', 'Delivery_Persona': 'Grocery', 'Forecast_Rain_mm': 50, 'Forecast_Temp_C': 28, 'External_Disruption': 'Local Strike'}
])
risk_model.fit(dummy_df, [0, 1])

fraud_model = IsolationForest(contamination=0.10, random_state=42)
X_historical_claims = np.array([[10.5, 4, 0.99], [0.0, 1, 0.20], [45.2, 6, 0.95]])
fraud_model.fit(X_historical_claims)

# ==========================================
# DATA SCHEMAS
# ==========================================
class PremiumRequest(BaseModel):
    zone: str
    delivery_persona: str
    tier: str = "standard"

class ClaimRequest(BaseModel):
    reported_rain_mm: float
    hours_worked_before_claim: float
    location_match_score: float

# ==========================================
# ENDPOINT 1: Calculate Dynamic Premium
# ==========================================
@app.post("/api/v1/calculate-premium")
def calculate_premium(request: PremiumRequest):
    clean_zone = request.zone.strip().title()
    clean_persona = request.delivery_persona.strip().title()

    rain = round(random.uniform(0, 15), 1)
    temp = round(random.uniform(28, 38), 1)

    chaos_event = "None"
    if random.random() > 0.85:
        chaos_event = random.choice(["Unplanned Curfew", "Severe Waterlogging", "Local Strike"])
        rain = rain * 5 if "Waterlogging" in chaos_event else rain

    input_data = pd.DataFrame([{
        'Zone': clean_zone,
        'Delivery_Persona': clean_persona,
        'Forecast_Rain_mm': rain,
        'Forecast_Temp_C': temp,
        'External_Disruption': chaos_event
    }])

    probability = risk_model.predict_proba(input_data)[:, 1][0]

    tier_name = request.tier.lower()
    if 'basic' in tier_name:
        base_rate = 19.0
    elif 'pro' in tier_name:
        base_rate = 49.0
    else:
        base_rate = 29.0

    ai_risk_multiplier = 1.0 + probability
    final_premium = round(base_rate * ai_risk_multiplier, 2)

    return {
        "status": "success",
        "zone": clean_zone,
        "active_disruption": chaos_event,
        "ai_risk_score": round(probability, 2),
        "weekly_premium_inr": final_premium
    }

# ==========================================
# ENDPOINT 2: Intelligent Fraud Detection
# ==========================================
@app.post("/api/v1/verify-claim")
def verify_claim(request: ClaimRequest):
    claim_data = np.array([[
        request.reported_rain_mm,
        request.hours_worked_before_claim,
        request.location_match_score
    ]])

    is_fraud = fraud_model.predict(claim_data)[0]

    if is_fraud == -1:
        return {"claim_status": "FLAGGED", "reason": "Anomaly detected against historical API data."}

    return {"claim_status": "APPROVED", "reason": "Claim verified. Initiating payout."}
