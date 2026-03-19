from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import requests
import random
from catboost import CatBoostClassifier
from sklearn.ensemble import IsolationForest

# Initialize the API
app = FastAPI(title="EarnSafe AI Engine")

# ==========================================
# MODEL INITIALIZATION (Loads on startup)
# ==========================================
print("Booting up EarnSafe AI Models...")
categorical_features = ['Zone', 'Delivery_Persona', 'External_Disruption']
risk_model = CatBoostClassifier(iterations=50, depth=4, cat_features=categorical_features, verbose=0)

# Mock training to keep the API alive for Phase 1 demo
dummy_df = pd.DataFrame([
    {'Zone': 'OMR', 'Delivery_Persona': 'Food', 'Forecast_Rain_mm': 0, 'Forecast_Temp_C': 35, 'External_Disruption': 'None'},
    {'Zone': 'Velachery', 'Delivery_Persona': 'Grocery', 'Forecast_Rain_mm': 50, 'Forecast_Temp_C': 28, 'External_Disruption': 'Local Strike'}
])
# We pass two rows, so we need two targets [0, 1]
risk_model.fit(dummy_df, [0, 1])

fraud_model = IsolationForest(contamination=0.10, random_state=42)
X_historical_claims = np.array([[10.5, 4, 0.99], [0.0, 1, 0.20], [45.2, 6, 0.95]])
fraud_model.fit(X_historical_claims)

# ==========================================
# DATA SCHEMAS (What the Frontend sends us)
# ==========================================
class PremiumRequest(BaseModel):
    zone: str
    delivery_persona: str
    tier: str  # <-- Added tier so the AI knows the plan!

class ClaimRequest(BaseModel):
    reported_rain_mm: float
    hours_worked_before_claim: float
    location_match_score: float

# ==========================================
# ENDPOINT 1: Calculate Dynamic Premium
# ==========================================

# --- MOCK REGISTRATION ENDPOINT ---
@app.post("/users/register")
async def register_user(payload: dict):
    print(f"📱 New driver registered: {payload}")
    return {
        "status": "success",
        "message": "Registration complete",
        "token": "devtrails_hackathon_token",
        "user": {
            "name": "Lax Developer", 
            "phone": "9952931309"
        }
    }

# --- MOCK POLICY CREATION ENDPOINT ---
@app.post("/policy/create")
async def create_policy(payload: dict):
    print(f"🛡️ New policy activated: {payload}")
    return {
        "status": "success",
        "message": "Policy created successfully",
        "policy_id": "POL-DEVTRAILS-999",
        "user": {
            "name": "Lax Developer"
        },
        "policy": {
            "tier": payload.get("plan_tier", "Standard Shield"),
            "active": True
        }
    }

@app.post("/api/v1/calculate-premium")
def calculate_premium(request: PremiumRequest):
    
    # --- 1. AI DATA PREPROCESSING (The Fix!) ---
    # .strip() removes accidental spaces at the start/end
    # .title() turns "anna nagar" into "Anna Nagar"
    clean_zone = request.zone.strip().title()
    clean_persona = request.delivery_persona.strip().title()

    # 2. Fetch real WeatherAPI data (mocking the extraction here for speed)
    rain = round(random.uniform(0, 15), 1)
    temp = round(random.uniform(28, 38), 1)
    
    # Inject 15% chance of mock chaos
    chaos_event = "None"
    if random.random() > 0.85:
        chaos_event = random.choice(["Unplanned Curfew", "Severe Waterlogging", "Local Strike"])
        rain = rain * 5 if "Waterlogging" in chaos_event else rain

    # 3. Format for CatBoost (Make sure you use the CLEAN variables here!)
    input_data = pd.DataFrame([{
        'Zone': clean_zone,                 # <-- Updated!
        'Delivery_Persona': clean_persona,  # <-- Updated!
        'Forecast_Rain_mm': rain,
        'Forecast_Temp_C': temp,
        'External_Disruption': chaos_event
    }])

    # 4. Predict AI Risk Multiplier
    probability = risk_model.predict_proba(input_data)[:, 1][0]
    
    # --- DYNAMIC TIER LOGIC ---
    tier_name = request.tier.lower()
    
    if 'basic' in tier_name:
        base_rate = 19.0
    elif 'pro' in tier_name:
        base_rate = 49.0
    else:
        base_rate = 29.0 # Default for standard shield

    ai_risk_multiplier = 1.0 + probability 
    final_premium = round(base_rate * ai_risk_multiplier, 2)

    return {
        "status": "success",
        "zone": clean_zone, # <-- Send the clean version back to the app!
        "active_disruption": chaos_event,
        "ai_risk_score": round(probability, 2),
        "weekly_premium_inr": final_premium
    }

# ==========================================
# ENDPOINT 1: Calculate Dynamic Premium
# ==========================================

# ... (Keep your mock registration and policy endpoints exactly the same) ...

@app.post("/api/v1/calculate-premium")
def calculate_premium(request: PremiumRequest):
    # 1. Fetch real WeatherAPI data (mocking the extraction here for speed)
    rain = round(random.uniform(0, 15), 1)
    temp = round(random.uniform(28, 38), 1)
    
    # Inject 15% chance of mock chaos
    chaos_event = "None"
    if random.random() > 0.85:
        chaos_event = random.choice(["Unplanned Curfew", "Severe Waterlogging", "Local Strike"])
        rain = rain * 5 if "Waterlogging" in chaos_event else rain

    # 2. Format for CatBoost
    input_data = pd.DataFrame([{
        'Zone': request.zone,
        'Delivery_Persona': request.delivery_persona,
        'Forecast_Rain_mm': rain,
        'Forecast_Temp_C': temp,
        'External_Disruption': chaos_event
    }])

    # 3. Predict AI Risk Multiplier
    probability = risk_model.predict_proba(input_data)[:, 1][0]
    
    # 4. The EarnSafe Pricing Formula (Base * Zone/Season factors * AI Multiplier)
    
    # --- NEW PRO TIER LOGIC ---
    tier_name = request.tier.lower()
    if tier_name == 'basic':
        base_rate = 19.0
    elif tier_name == 'premium':
        base_rate = 49.0
    else:
        base_rate = 29.0 # Default for Standard or anything else

    ai_risk_multiplier = 1.0 + probability 
    final_premium = round(base_rate * ai_risk_multiplier, 2)

    return {
        "status": "success",
        "zone": request.zone,
        "active_disruption": chaos_event,
        "ai_risk_score": round(probability, 2),
        "weekly_premium_inr": final_premium
    }

# ==========================================
# ENDPOINT 1: Calculate Dynamic Premium
# ==========================================

# --- MOCK REGISTRATION ENDPOINT ---
@app.post("/users/register")
async def register_user(payload: dict):
    print(f"📱 New driver registered: {payload}")
    return {
        "status": "success",
        "message": "Registration complete",
        "token": "devtrails_hackathon_token",
        "user": {
            "name": "Lax Developer", # Giving it a first and last name so split() works perfectly
            "phone": "9952931309"
        }
    }

# --- MOCK POLICY CREATION ENDPOINT ---
@app.post("/policy/create")
async def create_policy(payload: dict):
    print(f"🛡️ New policy activated: {payload}")
    return {
        "status": "success",
        "message": "Policy created successfully",
        "policy_id": "POL-DEVTRAILS-999",
        "user": {
            "name": "Lax Developer"
        },
        "policy": {
            "tier": "Standard Shield",
            "active": True
        }
    }

@app.post("/api/v1/calculate-premium")
def calculate_premium(request: PremiumRequest):
    # 1. Fetch real WeatherAPI data (mocking the extraction here for speed)
    rain = round(random.uniform(0, 15), 1)
    temp = round(random.uniform(28, 38), 1)
    
    # Inject 15% chance of mock chaos
    chaos_event = "None"
    if random.random() > 0.85:
        chaos_event = random.choice(["Unplanned Curfew", "Severe Waterlogging", "Local Strike"])
        rain = rain * 5 if "Waterlogging" in chaos_event else rain

    # 2. Format for CatBoost
    input_data = pd.DataFrame([{
        'Zone': request.zone,
        'Delivery_Persona': request.delivery_persona,
        'Forecast_Rain_mm': rain,
        'Forecast_Temp_C': temp,
        'External_Disruption': chaos_event
    }])

    # 3. Predict AI Risk Multiplier
    probability = risk_model.predict_proba(input_data)[:, 1][0]
    
    # 4. The EarnSafe Pricing Formula (Base * Zone/Season factors * AI Multiplier)
    base_rate = 29.0 # E.g., Basic Plan base
    ai_risk_multiplier = 1.0 + probability 
    final_premium = round(base_rate * ai_risk_multiplier, 2)

    return {
        "status": "success",
        "zone": request.zone,
        "active_disruption": chaos_event,
        "ai_risk_score": round(probability, 2),
        "weekly_premium_inr": final_premium
    }

# ==========================================
# ENDPOINT 2: Intelligent Fraud Detection
# ==========================================
@app.post("/api/v1/verify-claim")
def verify_claim(request: ClaimRequest):
    # Format incoming claim data into NumPy array
    claim_data = np.array([[
        request.reported_rain_mm, 
        request.hours_worked_before_claim, 
        request.location_match_score
    ]])
    
    # 1 = Normal, -1 = Anomaly
    is_fraud = fraud_model.predict(claim_data)[0]
    
    if is_fraud == -1:
        return {"claim_status": "FLAGGED", "reason": "Anomaly detected against historical API data."}
    
    return {"claim_status": "APPROVED", "reason": "Claim verified. Initiating payout."}

