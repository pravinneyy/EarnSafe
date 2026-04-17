
import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests
from catboost import CatBoostClassifier

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# MODEL PATHS
# ─────────────────────────────────────────────────────────────────
_MODELS_DIR       = Path(__file__).parent / "models"
_RISK_MODEL_PATH  = _MODELS_DIR / "risk_model.cbm"
_FRAUD_MODEL_PATH = _MODELS_DIR / "fraud_model.pkl"
_ZONE_MAP_PATH    = _MODELS_DIR / "zone_risk_map.pkl"

# ─────────────────────────────────────────────────────────────────
# API ENDPOINTS (free, no key needed)
# ─────────────────────────────────────────────────────────────────
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AQI = "https://air-quality-api.open-meteo.com/v1/air-quality"

# ─────────────────────────────────────────────────────────────────
# PARAMETRIC TRIGGERS — Fixed ₹ payouts (true parametric)
# Judge feedback: use fixed payouts, not dynamic hours calculation
# ─────────────────────────────────────────────────────────────────
TRIGGERS = [
    {
        "id":          "heavy_rainfall",
        "name":        "Heavy Rainfall",
        "condition":   "rain_mm > 20",
        "threshold":   20,
        "field":       "rain_mm",
        "operator":    "gt",
        "fixed_payout": 500,
        "description": "Rainfall exceeds 20mm — deliveries severely impacted",
    },
    {
        "id":          "severe_waterlogging",
        "name":        "Severe Waterlogging",
        "condition":   "rain_mm > 50 AND flood_risk_zone",
        "threshold":   50,
        "field":       "rain_mm",
        "operator":    "gt",
        "fixed_payout": 800,
        "description": "Flooding in high-risk zone — deliveries impossible",
    },
    {
        "id":          "extreme_heat",
        "name":        "Extreme Heat",
        "condition":   "temp_c > 42",
        "threshold":   42,
        "field":       "temp_c",
        "operator":    "gt",
        "fixed_payout": 400,
        "description": "Temperature exceeds 42°C — outdoor work unsafe",
    },
    {
        "id":          "hazardous_aqi",
        "name":        "Hazardous Air Quality",
        "condition":   "pm25 > 75",
        "threshold":   75,
        "field":       "pm25",
        "operator":    "gt",
        "fixed_payout": 300,
        "description": "PM2.5 exceeds 75 µg/m³ — health risk for outdoor workers",
    },
    {
        "id":          "high_wind",
        "name":        "Dangerous Wind Speed",
        "condition":   "wind_kph > 60",
        "threshold":   60,
        "field":       "wind_kph",
        "operator":    "gt",
        "fixed_payout": 350,
        "description": "Wind speed exceeds 60 km/h — two-wheeler deliveries unsafe",
    },
]

# ─────────────────────────────────────────────────────────────────
# MOCK SCENARIOS — for demo / judge showcase
# ─────────────────────────────────────────────────────────────────
MOCK_SCENARIOS = {
    "monsoon_flood": {
        "label":       "Chennai Monsoon Flood (Velachery)",
        "rain_mm":     85.0,
        "temp_c":      27.0,
        "wind_kph":    35.0,
        "pm25":        28.0,
        "humidity":    95,
        "condition":   "Heavy rain shower",
        "zone":        "Velachery",
        "flood_risk":  0.85,
    },
    "extreme_heat": {
        "label":       "Summer Heat Wave (T Nagar)",
        "rain_mm":     0.0,
        "temp_c":      44.0,
        "wind_kph":    8.0,
        "pm25":        45.0,
        "humidity":    40,
        "condition":   "Clear sky",
        "zone":        "T Nagar",
        "flood_risk":  0.60,
    },
    "aqi_hazard": {
        "label":       "Hazardous AQI (Perambur)",
        "rain_mm":     0.0,
        "temp_c":      32.0,
        "wind_kph":    5.0,
        "pm25":        110.0,
        "humidity":    65,
        "condition":   "Overcast",
        "zone":        "Perambur",
        "flood_risk":  0.45,
    },
    "high_wind": {
        "label":       "Cyclone Warning (OMR)",
        "rain_mm":     15.0,
        "temp_c":      29.0,
        "wind_kph":    75.0,
        "pm25":        20.0,
        "humidity":    80,
        "condition":   "Partly cloudy",
        "zone":        "OMR",
        "flood_risk":  0.40,
    },
    "clear_day": {
        "label":       "Clear Day — No Disruption (Anna Nagar)",
        "rain_mm":     0.0,
        "temp_c":      31.0,
        "wind_kph":    12.0,
        "pm25":        25.0,
        "humidity":    55,
        "condition":   "Clear sky",
        "zone":        "Anna Nagar",
        "flood_risk":  0.35,
    },
}

# ─────────────────────────────────────────────────────────────────
# ZONE RISK MAP
# ─────────────────────────────────────────────────────────────────
_DEFAULT_ZONE_MAP = {
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

# ─────────────────────────────────────────────────────────────────
# LOAD MODELS
# ─────────────────────────────────────────────────────────────────
print("Booting EarnSafe AI Models...")

risk_model = CatBoostClassifier()
if _RISK_MODEL_PATH.exists():
    risk_model.load_model(str(_RISK_MODEL_PATH))
    print(f"Risk model loaded from {_RISK_MODEL_PATH}")
else:
    logger.warning("risk_model.cbm not found - using fallback. Run train_models.py!")
    _fb = pd.DataFrame([
        {"Zone": "Velachery",  "Delivery_Persona": "Food", "Month": 8,
         "Forecast_Rain_mm": 60, "Forecast_Temp_C": 28, "AQI_PM25": 40,
         "Wind_KPH": 10, "External_Disruption": "Heavy Rainfall"},
        {"Zone": "Anna Nagar", "Delivery_Persona": "Food", "Month": 4,
         "Forecast_Rain_mm": 0,  "Forecast_Temp_C": 40, "AQI_PM25": 30,
         "Wind_KPH": 8,  "External_Disruption": "Extreme Heat"},
        {"Zone": "OMR",        "Delivery_Persona": "Food", "Month": 1,
         "Forecast_Rain_mm": 2,  "Forecast_Temp_C": 29, "AQI_PM25": 25,
         "Wind_KPH": 12, "External_Disruption": "None"},
        {"Zone": "T Nagar",    "Delivery_Persona": "Food", "Month": 11,
         "Forecast_Rain_mm": 45, "Forecast_Temp_C": 27, "AQI_PM25": 80,
         "Wind_KPH": 5,  "External_Disruption": "Severe Waterlogging"},
    ])
    risk_model = CatBoostClassifier(
        iterations=50, depth=3,
        cat_features=["Zone", "Delivery_Persona", "External_Disruption"],
        verbose=0,
    )
    risk_model.fit(_fb, [0, 0, 0, 1])

fraud_model = None
if _FRAUD_MODEL_PATH.exists():
    with open(_FRAUD_MODEL_PATH, "rb") as f:
        fraud_model = pickle.load(f)
    print(f"Fraud model loaded from {_FRAUD_MODEL_PATH}")
else:
    from sklearn.ensemble import IsolationForest
    logger.warning("fraud_model.pkl not found - using fallback.")
    fraud_model = IsolationForest(contamination=0.10, random_state=42)
    fraud_model.fit(np.array([[40.0, 4.0, 0.92], [0.5, 6.0, 0.10],
                               [30.0, 3.0, 0.88], [55.0, 5.0, 0.95]]))

zone_risk_map: dict = _DEFAULT_ZONE_MAP
if _ZONE_MAP_PATH.exists():
    with open(_ZONE_MAP_PATH, "rb") as f:
        zone_risk_map = pickle.load(f)
    print(f"Zone risk map loaded ({len(zone_risk_map)} zones)")

print("EarnSafe AI Engine ready.\n")

_TIER_BASE_RATES = {"basic": 29.0, "standard": 49.0, "pro": 89.0}


# ─────────────────────────────────────────────────────────────────
# LIVE DATA FETCHING
# ─────────────────────────────────────────────────────────────────

def _fetch_open_meteo(lat: float, lon: float) -> dict:
    """Fetch live weather from Open-Meteo (free, no API key)."""
    try:
        params = {
            "latitude":  lat,
            "longitude": lon,
            "current": [
                "temperature_2m", "relative_humidity_2m",
                "rain", "wind_speed_10m", "weather_code",
            ],
            "timezone": "Asia/Kolkata",
        }
        r = requests.get(OPEN_METEO_URL, params=params, timeout=8)
        c = r.json().get("current", {})
        return {
            "temp_c":    round(c.get("temperature_2m", 30.0), 1),
            "humidity":  c.get("relative_humidity_2m", 60),
            "rain_mm":   round(c.get("rain", 0.0), 1),
            "wind_kph":  round(c.get("wind_speed_10m", 10.0), 1),
            "wmo_code":  c.get("weather_code", 0),
            "source":    "open-meteo",
        }
    except Exception as e:
        logger.warning(f"Open-Meteo weather fetch failed: {e}")
        return {"temp_c": 30.0, "humidity": 60, "rain_mm": 0.0,
                "wind_kph": 10.0, "wmo_code": 0, "source": "fallback"}


def _fetch_open_meteo_aqi(lat: float, lon: float) -> dict:
    """Fetch live AQI from Open-Meteo Air Quality API (free, no key)."""
    try:
        params = {
            "latitude":  lat,
            "longitude": lon,
            "current":   ["pm2_5", "pm10", "european_aqi"],
            "timezone":  "Asia/Kolkata",
        }
        r = requests.get(OPEN_METEO_AQI, params=params, timeout=8)
        c = r.json().get("current", {})
        return {
            "pm25":       round(c.get("pm2_5", 0.0) or 0.0, 1),
            "pm10":       round(c.get("pm10",  0.0) or 0.0, 1),
            "aqi_eu":     c.get("european_aqi", 1) or 1,
            "source":     "open-meteo-aqi",
        }
    except Exception as e:
        logger.warning(f"Open-Meteo AQI fetch failed: {e}")
        return {"pm25": 0.0, "pm10": 0.0, "aqi_eu": 1, "source": "fallback"}


def _fetch_mock_traffic(lat: float, lon: float) -> dict:
    """
    Mock traffic service — simulates congestion score.
    Real impl would use Google Maps / HERE Traffic API.
    Score: 0.0 = free flow, 1.0 = completely blocked.
    """
    import random
    hour = datetime.now().hour
    # Peak hours: 8-10am, 6-9pm
    is_peak = (8 <= hour <= 10) or (18 <= hour <= 21)
    base    = 0.65 if is_peak else 0.25
    score   = min(1.0, base + random.uniform(-0.1, 0.2))
    return {
        "congestion_score": round(score, 2),
        "is_peak_hour":     is_peak,
        "traffic_label":    "Heavy" if score > 0.6 else "Moderate" if score > 0.3 else "Light",
        "source":           "mock-traffic",
    }


# ─────────────────────────────────────────────────────────────────
# TRIGGER EVALUATION — Fixed ₹ payouts (true parametric)
# ─────────────────────────────────────────────────────────────────

def evaluate_triggers(
    rain_mm: float,
    temp_c: float,
    wind_kph: float,
    pm25: float,
    flood_risk: float = 0.5,
) -> dict:
    """
    Evaluate all 5 parametric triggers against live data.
    Returns list of fired triggers with fixed ₹ payouts.
    True parametric: trigger fires → fixed amount, no hours tracking.
    """
    fired    = []
    total_payout = 0

    for trigger in TRIGGERS:
        value = {
            "rain_mm":  rain_mm,
            "temp_c":   temp_c,
            "wind_kph": wind_kph,
            "pm25":     pm25,
        }.get(trigger["field"], 0)

        # Special case: waterlogging needs both high rain AND flood-risk zone
        if trigger["id"] == "severe_waterlogging":
            fired_bool = rain_mm > trigger["threshold"] and flood_risk > 0.6
        else:
            fired_bool = value > trigger["threshold"]

        if fired_bool:
            fired.append({
                "trigger_id":    trigger["id"],
                "trigger_name":  trigger["name"],
                "description":   trigger["description"],
                "measured_value": value,
                "threshold":     trigger["threshold"],
                "fixed_payout":  trigger["fixed_payout"],
            })
            total_payout += trigger["fixed_payout"]

    # Cap total payout at ₹1200 per event (prevents stacking abuse)
    total_payout = min(total_payout, 1200)

    return {
        "triggers_fired":  fired,
        "trigger_count":   len(fired),
        "disruption_active": len(fired) > 0,
        "total_fixed_payout": total_payout,
    }


# ─────────────────────────────────────────────────────────────────
# MAIN PUBLIC FUNCTION — get all live data + triggers + AI premium
# ─────────────────────────────────────────────────────────────────

def get_live_risk_data(lat: float, lon: float, zone: str = "Chennai", tier: str = "standard") -> dict:
    """
    Master function — fetches all live data and returns complete risk assessment.
    Called by the auto-trigger claim endpoint.

    Returns:
        weather         → live weather from Open-Meteo
        aqi             → live AQI from Open-Meteo
        traffic         → mock traffic congestion
        triggers        → which parametric triggers fired + fixed payouts
        ai_risk_score   → CatBoost probability
        weekly_premium  → dynamic premium adjusted for live conditions
    """
    weather = _fetch_open_meteo(lat, lon)
    aqi     = _fetch_open_meteo_aqi(lat, lon)
    traffic = _fetch_mock_traffic(lat, lon)

    zone_profile = zone_risk_map.get(zone.strip().title(), {"flood": 0.5, "heat": 0.6, "aqi": 0.5})

    triggers = evaluate_triggers(
        rain_mm    = weather["rain_mm"],
        temp_c     = weather["temp_c"],
        wind_kph   = weather["wind_kph"],
        pm25       = aqi["pm25"],
        flood_risk = zone_profile["flood"],
    )

    ai = predict_risk_with_weather(
        zone             = zone,
        delivery_persona = "Food",
        tier             = tier,
        rain_mm          = weather["rain_mm"],
        temp_c           = weather["temp_c"],
        aqi_pm25         = aqi["pm25"],
        wind_kph         = weather["wind_kph"],
    )

    return {
        "weather":         weather,
        "aqi":             aqi,
        "traffic":         traffic,
        "triggers":        triggers,
        "ai_risk_score":   ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium":  ai["weekly_premium_inr"],
        "zone_risk_profile": zone_profile,
        "timestamp":       datetime.now().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────
# MOCK SHOWCASE — for demo without affecting real data
# ─────────────────────────────────────────────────────────────────

def get_mock_scenario(scenario_name: str, tier: str = "standard") -> dict:
    """
    Returns a pre-built scenario for judge demos.
    Scenarios: monsoon_flood, extreme_heat, aqi_hazard, high_wind, clear_day

    This is purely for showcasing AI behaviour — zero side effects on real data.
    """
    scenario = MOCK_SCENARIOS.get(scenario_name)
    if not scenario:
        available = list(MOCK_SCENARIOS.keys())
        return {"error": f"Unknown scenario. Available: {available}"}

    triggers = evaluate_triggers(
        rain_mm    = scenario["rain_mm"],
        temp_c     = scenario["temp_c"],
        wind_kph   = scenario["wind_kph"],
        pm25       = scenario["pm25"],
        flood_risk = scenario["flood_risk"],
    )

    ai = predict_risk_with_weather(
        zone             = scenario["zone"],
        delivery_persona = "Food",
        tier             = tier,
        rain_mm          = scenario["rain_mm"],
        temp_c           = scenario["temp_c"],
        aqi_pm25         = scenario["pm25"],
        wind_kph         = scenario["wind_kph"],
    )

    return {
        "scenario":          scenario_name,
        "label":             scenario["label"],
        "weather": {
            "temp_c":        scenario["temp_c"],
            "rain_mm":       scenario["rain_mm"],
            "wind_kph":      scenario["wind_kph"],
            "humidity":      scenario["humidity"],
            "condition":     scenario["condition"],
        },
        "aqi": {
            "pm25":          scenario["pm25"],
        },
        "triggers":          triggers,
        "ai_risk_score":     ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium":    ai["weekly_premium_inr"],
        "note":              "This is a simulated scenario for demo purposes only.",
    }


# ─────────────────────────────────────────────────────────────────
# PREMIUM FUNCTIONS (backwards compatible)
# ─────────────────────────────────────────────────────────────────

def _disruption_label(rain_mm, temp_c, aqi_pm25, zone_profile) -> str:
    if rain_mm > 50 and zone_profile.get("flood", 0.5) > 0.6:
        return "Severe Waterlogging"
    elif rain_mm > 20:
        return "Heavy Rainfall"
    elif temp_c > 42:
        return "Extreme Heat"
    elif aqi_pm25 > 75:
        return "Severe AQI"
    return "None"


def predict_risk(zone: str, delivery_persona: str, tier: str) -> dict:
    """Backwards-compatible — used by premium_service.py and policy_router.py."""
    clean_zone    = zone.strip().title()
    clean_persona = delivery_persona.strip().title()
    clean_tier    = tier.strip().lower()
    month         = datetime.now().month
    zone_profile  = zone_risk_map.get(clean_zone, {"flood": 0.50, "heat": 0.60, "aqi": 0.50})

    if 6 <= month <= 10:
        rain_mm, temp_c, aqi_pm25 = zone_profile["flood"] * 45, 28.0, 30.0
    elif month in (3, 4, 5):
        rain_mm, temp_c, aqi_pm25 = 5.0, 35 + zone_profile["heat"] * 6, 35.0
    else:
        rain_mm, temp_c, aqi_pm25 = 10.0, 29.0, 30.0 + zone_profile["aqi"] * 30

    active_disruption = _disruption_label(rain_mm, temp_c, aqi_pm25, zone_profile)

    input_data = pd.DataFrame([{
        "Zone": clean_zone, "Delivery_Persona": clean_persona,
        "Month": month, "Forecast_Rain_mm": round(rain_mm, 1),
        "Forecast_Temp_C": round(temp_c, 1), "AQI_PM25": round(aqi_pm25, 1),
        "Wind_KPH": 12.0, "External_Disruption": active_disruption,
    }])

    try:
        probability = float(risk_model.predict_proba(input_data)[:, 1][0])
    except Exception as e:
        logger.warning(f"CatBoost inference failed: {e}")
        probability = 0.5

    base_rate = _TIER_BASE_RATES.get(clean_tier, 49.0)
    return {
        "ai_risk_score":      round(probability, 2),
        "weekly_premium_inr": round(base_rate * (1.0 + probability), 2),
        "zone":               clean_zone,
        "active_disruption":  active_disruption,
    }


def predict_risk_with_weather(
    zone: str, delivery_persona: str, tier: str,
    rain_mm: float, temp_c: float,
    aqi_pm25: float = 30.0, wind_kph: float = 12.0,
) -> dict:
    """Premium calculation with real weather inputs."""
    clean_zone    = zone.strip().title()
    clean_persona = delivery_persona.strip().title()
    clean_tier    = tier.strip().lower()
    month         = datetime.now().month
    zone_profile  = zone_risk_map.get(clean_zone, {"flood": 0.50, "heat": 0.60, "aqi": 0.50})

    active_disruption = _disruption_label(rain_mm, temp_c, aqi_pm25, zone_profile)

    input_data = pd.DataFrame([{
        "Zone": clean_zone, "Delivery_Persona": clean_persona,
        "Month": month, "Forecast_Rain_mm": round(rain_mm, 1),
        "Forecast_Temp_C": round(temp_c, 1), "AQI_PM25": round(aqi_pm25, 1),
        "Wind_KPH": round(wind_kph, 1), "External_Disruption": active_disruption,
    }])

    try:
        probability = float(risk_model.predict_proba(input_data)[:, 1][0])
    except Exception as e:
        logger.warning(f"CatBoost inference failed: {e}")
        probability = 0.5

    base_rate = _TIER_BASE_RATES.get(clean_tier, 49.0)
    return {
        "ai_risk_score":      round(probability, 2),
        "weekly_premium_inr": round(base_rate * (1.0 + probability), 2),
        "zone":               clean_zone,
        "active_disruption":  active_disruption,
        "weather_inputs": {
            "rain_mm": round(rain_mm, 1), "temp_c": round(temp_c, 1),
            "aqi_pm25": round(aqi_pm25, 1), "wind_kph": round(wind_kph, 1),
        },
    }


def detect_claim_anomaly(
    reported_rain_mm: float,
    hours_worked_before_claim: float,
    location_match_score: float,
) -> dict:
    """Fraud detection — exact same signature, fraud_service.py unchanged."""
    claim_data = np.array([[
        max(0.0, reported_rain_mm),
        max(0.0, hours_worked_before_claim),
        max(0.0, min(1.0, location_match_score)),
    ]])
    prediction = fraud_model.predict(claim_data)[0]
    return {
        "is_anomaly":    prediction == -1,
        "anomaly_label": "FLAGGED" if prediction == -1 else "NORMAL",
    }
