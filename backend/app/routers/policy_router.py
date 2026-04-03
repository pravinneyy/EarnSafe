from fastapi import APIRouter, HTTPException, Query

from app.database import policies_db
from app.schemas import PolicyCreate, PolicyResponse
from app.services.premium_service import calculate_weekly_premium
from app.services.ai_service import (
    predict_risk,
    predict_risk_with_weather,
    get_live_risk_data,
    get_mock_scenario,
    evaluate_triggers,
    MOCK_SCENARIOS,
    TRIGGERS,
)
from app.services.user_store import SupabaseConfigError, SupabaseRequestError, fetch_user_by_id

router = APIRouter(prefix="/policy", tags=["Policy"])


def _raise_store_error(error: Exception) -> None:
    status_code = 500 if isinstance(error, SupabaseConfigError) else 502
    raise HTTPException(status_code=status_code, detail=str(error)) from error


# ── AI Premium (existing — backwards compatible) ───────────────────────────

@router.get("/ai-premium", tags=["AI"])
def get_ai_premium(
    zone: str   = Query(..., description="Delivery zone e.g. Velachery"),
    persona: str = Query(..., description="Delivery type e.g. Food"),
    tier: str   = Query("standard", description="basic | standard | pro"),
):
    """AI premium quote using zone-based seasonal defaults."""
    result = predict_risk(zone=zone, delivery_persona=persona, tier=tier)
    return {"status": "success", **result}


# ── Live Risk Assessment (NEW — uses real APIs) ────────────────────────────

@router.get("/ai-premium/live", tags=["AI"])
def get_live_premium(
    lat: float  = Query(..., description="Worker's current latitude"),
    lon: float  = Query(..., description="Worker's current longitude"),
    zone: str   = Query("Chennai", description="Delivery zone for risk profile"),
    tier: str   = Query("standard", description="basic | standard | pro"),
):
    """
    Full live risk assessment using real APIs:
    - Open-Meteo: live rain, temp, wind
    - Open-Meteo AQI: live PM2.5
    - Mock traffic: congestion score
    - 5 parametric triggers evaluated
    - CatBoost dynamic premium
    """
    data = get_live_risk_data(lat=lat, lon=lon, zone=zone, tier=tier)
    return {"status": "success", **data}


# ── Simulate (for demo with custom values) ────────────────────────────────

@router.get("/ai-premium/simulate", tags=["AI"])
def simulate_premium(
    zone: str     = Query(..., description="Delivery zone e.g. Velachery"),
    tier: str     = Query("standard", description="basic | standard | pro"),
    rain_mm: float = Query(60.0, description="Rainfall in mm (try 80 for heavy monsoon)"),
    temp_c: float  = Query(28.0, description="Temperature °C (try 44 for extreme heat)"),
    aqi_pm25: float = Query(30.0, description="PM2.5 µg/m³ (try 110 for hazardous)"),
    wind_kph: float = Query(12.0, description="Wind speed km/h (try 75 for cyclone)"),
):
    """
    Simulate AI premium under custom weather conditions.
    Shows triggers fired + fixed payouts + dynamic premium.
    """
    from app.services.ai_service import zone_risk_map
    zone_profile = zone_risk_map.get(zone.strip().title(), {"flood": 0.5, "heat": 0.6, "aqi": 0.5})

    triggers = evaluate_triggers(
        rain_mm    = rain_mm,
        temp_c     = temp_c,
        wind_kph   = wind_kph,
        pm25       = aqi_pm25,
        flood_risk = zone_profile["flood"],
    )
    ai = predict_risk_with_weather(
        zone=zone, delivery_persona="Food", tier=tier,
        rain_mm=rain_mm, temp_c=temp_c, aqi_pm25=aqi_pm25, wind_kph=wind_kph,
    )
    return {
        "status":   "success",
        "inputs": {
            "zone": zone, "tier": tier, "rain_mm": rain_mm,
            "temp_c": temp_c, "aqi_pm25": aqi_pm25, "wind_kph": wind_kph,
        },
        "triggers":          triggers,
        "ai_risk_score":     ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium":    ai["weekly_premium_inr"],
    }


# ── Mock Scenarios (for judge demo) ───────────────────────────────────────

@router.get("/ai-premium/demo", tags=["AI"])
def demo_scenario(
    scenario: str = Query(
        "monsoon_flood",
        description="monsoon_flood | extreme_heat | aqi_hazard | high_wind | clear_day"
    ),
    tier: str = Query("standard", description="basic | standard | pro"),
):
    """
    Pre-built scenarios for judge demos.
    Shows exactly how the AI reacts to different disruption types.
    Zero side effects — purely for showcasing.
    """
    result = get_mock_scenario(scenario_name=scenario, tier=tier)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"status": "success", **result}


@router.get("/ai-premium/demo/scenarios", tags=["AI"])
def list_scenarios():
    """List all available demo scenarios."""
    return {
        "available_scenarios": [
            {"id": k, "label": v["label"]} for k, v in MOCK_SCENARIOS.items()
        ]
    }


@router.get("/triggers", tags=["AI"])
def list_triggers():
    """List all 5 parametric triggers with their thresholds and fixed payouts."""
    return {"triggers": TRIGGERS}


# ── Policy CRUD (unchanged) ───────────────────────────────────────────────

@router.post("/create", response_model=PolicyResponse, status_code=201)
def create_policy(policy: PolicyCreate):
    try:
        user = fetch_user_by_id(policy.user_id)
    except (SupabaseConfigError, SupabaseRequestError) as error:
        _raise_store_error(error)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if any(p["user_id"] == policy.user_id and p["status"] == "active" for p in policies_db):
        raise HTTPException(status_code=400, detail="User already has an active policy")

    calc = calculate_weekly_premium(
        plan_tier=policy.plan_tier,
        city=user["city"],
        platform=user["platform"],
    )

    policy_id   = len(policies_db) + 1
    policy_data = {
        "id":                policy_id,
        "user_id":           policy.user_id,
        "plan_tier":         policy.plan_tier,
        "weekly_premium":    calc["weekly_premium"],
        "daily_coverage":    calc["daily_coverage"],
        "max_weekly_payout": calc["max_weekly_payout"],
        "status":            "active",
    }
    policies_db.append(policy_data)
    return policy_data


@router.get("/user/{user_id}", response_model=list[PolicyResponse])
def get_user_policies(user_id: int):
    return [p for p in policies_db if p["user_id"] == user_id]


@router.get("/{policy_id}", response_model=PolicyResponse)
def get_policy(policy_id: int):
    policy = next((p for p in policies_db if p["id"] == policy_id), None)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy
