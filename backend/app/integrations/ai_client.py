"""
ai_client.py — EarnSafe AI Integration Layer
=============================================
Production-grade async AI client.

Changes from previous version:
  - SYSTEM_SIMULATION removed from module level → stored in Redis (multi-worker safe)
  - Exponential backoff added to _get_with_retry
  - _build_fallback_snapshot is now fully deterministic (no Random())
  - predict_risk now accepts live weather inputs directly
  - TomTom traffic integration (heuristic fallback if no key)
  - model versioning via model_metadata.json
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from datetime import timezone
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
from catboost import CatBoostClassifier
from redis.asyncio import Redis

from app.config import get_settings
from app.services.exceptions import IntegrationError

logger = logging.getLogger(__name__)

# ── Simulation Redis key ───────────────────────────────────────────────────
_SIM_REDIS_KEY = "earnsafe:admin:simulation"

# ── Parametric triggers ────────────────────────────────────────────────────
TRIGGERS = [
    {"id": "heavy_rainfall",      "name": "Heavy Rainfall",        "threshold": 20.0, "field": "rain_mm",  "fixed_payout": 500},
    {"id": "severe_waterlogging", "name": "Severe Waterlogging",   "threshold": 50.0, "field": "rain_mm",  "fixed_payout": 800},
    {"id": "extreme_heat",        "name": "Extreme Heat",          "threshold": 42.0, "field": "temp_c",   "fixed_payout": 400},
    {"id": "hazardous_aqi",       "name": "Hazardous Air Quality", "threshold": 75.0, "field": "pm25",     "fixed_payout": 300},
    {"id": "high_wind",           "name": "Dangerous Wind Speed",  "threshold": 60.0, "field": "wind_kph", "fixed_payout": 350},
]

# ── Zone risk profiles ─────────────────────────────────────────────────────
ZONE_RISK_MAP = {
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

_TIER_BASE_RATES     = {"basic": 29.0, "standard": 49.0, "pro": 89.0}
_RISK_MODEL_PATH     = Path(__file__).resolve().parents[3] / "ai" / "ml" / "models" / "risk_model.cbm"
_MODEL_METADATA_PATH = Path(__file__).resolve().parents[3] / "ai" / "ml" / "models" / "model_metadata.json"
_RISK_MODEL: CatBoostClassifier | None = None
_MODEL_VERSION       = "fallback"

# In-process prediction cache (zone+tier+month level)
_PREDICTION_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

_WMO_LABELS = {
    0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
    45: "Fog", 48: "Fog",
    51: "Light Drizzle", 53: "Drizzle", 55: "Heavy Drizzle",
    61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
    80: "Rain Showers", 81: "Rain Showers", 82: "Heavy Showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
}


# ── Model loading ──────────────────────────────────────────────────────────

def _load_risk_model() -> CatBoostClassifier | None:
    global _RISK_MODEL, _MODEL_VERSION
    if _RISK_MODEL is not None:
        return _RISK_MODEL
    if not _RISK_MODEL_PATH.exists():
        logger.warning("Risk model not found at %s — using heuristic fallback.", _RISK_MODEL_PATH)
        return None
    model = CatBoostClassifier()
    model.load_model(str(_RISK_MODEL_PATH))
    _RISK_MODEL = model
    _MODEL_VERSION = _read_model_version()
    logger.info("CatBoost risk model loaded (version %s).", _MODEL_VERSION)
    return _RISK_MODEL


def _read_model_version() -> str:
    if not _MODEL_METADATA_PATH.exists():
        return "v1"
    try:
        with _MODEL_METADATA_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        risk_meta = payload.get("risk_model", {})
        if isinstance(risk_meta, dict) and risk_meta.get("version"):
            return str(risk_meta["version"])
    except Exception as error:
        logger.warning("Failed to parse model metadata: %s", error)
    return "v1"


# ── Simulation state (Redis-backed, multi-worker safe) ────────────────────

async def get_simulation_state(redis: Redis | None) -> dict[str, Any] | None:
    """
    Returns active simulation state from Redis, or None if simulation is off.
    Redis-backed so all workers see the same state.
    """
    if not redis:
        return None
    try:
        raw = await redis.get(_SIM_REDIS_KEY)
        if not raw:
            return None
        state = json.loads(raw)
        return state if state.get("active") else None
    except Exception as error:
        logger.warning("Failed to read simulation state from Redis: %s", error)
        return None


async def set_simulation_state(redis: Redis, state: dict[str, Any]) -> None:
    """Write simulation state to Redis with a 2-hour TTL (auto-expires)."""
    try:
        await redis.set(_SIM_REDIS_KEY, json.dumps(state), ex=7200)
    except Exception as error:
        logger.error("Failed to write simulation state to Redis: %s", error)
        raise


async def clear_simulation_state(redis: Redis) -> None:
    """Stop simulation — delete the Redis key."""
    try:
        await redis.delete(_SIM_REDIS_KEY)
    except Exception as error:
        logger.warning("Failed to clear simulation state from Redis: %s", error)


# ── Redis helpers ──────────────────────────────────────────────────────────

def _cache_key(prefix: str, payload: dict[str, Any]) -> str:
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return f"ai:{prefix}:{digest}"


async def _cached_json(redis: Redis | None, key: str) -> dict[str, Any] | None:
    if not redis:
        return None
    try:
        raw = await redis.get(key)
        return json.loads(raw) if raw else None
    except Exception as error:
        logger.warning("Redis cache read failed for %s: %s", key, error)
        return None


async def _write_cache(redis: Redis | None, key: str, payload: dict[str, Any]) -> None:
    if not redis:
        return
    try:
        ttl = get_settings().ai_cache_ttl_seconds
        await redis.set(key, json.dumps(payload), ex=ttl)
    except Exception as error:
        logger.warning("Redis cache write failed for %s: %s", key, error)


# ── HTTP with retry + exponential backoff ─────────────────────────────────

async def _get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any],
    redis: Redis | None,
    cache_key: str,
) -> dict[str, Any]:
    cached = await _cached_json(redis, cache_key)
    if cached:
        return cached

    settings     = get_settings()
    last_error: Exception | None = None

    for attempt in range(settings.retry_attempts):
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
            await _write_cache(redis, cache_key, payload)
            return payload
        except (httpx.TimeoutException, httpx.HTTPError) as error:
            last_error = error
            wait = 0.5 * (2 ** attempt)   # 0.5s → 1s → 2s
            logger.warning(
                "HTTP call failed for %s (attempt %s/%s) — retrying in %.1fs",
                url, attempt + 1, settings.retry_attempts, wait,
            )
            if attempt < settings.retry_attempts - 1:
                await asyncio.sleep(wait)

    raise IntegrationError(
        f"Upstream dependency failed after {settings.retry_attempts} attempts: {last_error}"
    ) from last_error


# ── Traffic: TomTom Flow API with heuristic fallback ──────────────────────

async def _fetch_traffic(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    redis: Redis | None,
) -> dict[str, Any]:
    """
    Live traffic from TomTom Flow Segment Data API.
    Falls back to deterministic peak-hour heuristic if key not configured.
    congestion_score = 1 - (currentSpeed / freeFlowSpeed)
    """
    settings  = get_settings()
    tomtom_key = settings.tomtom_api_key

    if tomtom_key:
        key_str = tomtom_key.get_secret_value()
        ck      = _cache_key("traffic", {"lat": round(lat, 3), "lon": round(lon, 3)})
        cached  = await _cached_json(redis, ck)
        if cached:
            return cached
        try:
            resp = await client.get(
                "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
                params={"key": key_str, "point": f"{lat},{lon}"},
            )
            resp.raise_for_status()
            flow        = resp.json().get("flowSegmentData", {})
            curr_spd    = float(flow.get("currentSpeed",  50))
            free_spd    = float(flow.get("freeFlowSpeed", 50))
            confidence  = float(flow.get("confidence",     1.0))
            congestion  = round(1.0 - min(curr_spd / free_spd, 1.0), 2) if free_spd > 0 else 0.0
            result = {
                "congestion_score":   congestion,
                "current_speed_kph":  round(curr_spd, 1),
                "freeflow_speed_kph": round(free_spd, 1),
                "confidence":         round(confidence, 2),
                "traffic_label":      "Heavy" if congestion > 0.6 else "Moderate" if congestion > 0.3 else "Light",
                "source":             "tomtom",
            }
            await _write_cache(redis, ck, result)
            return result
        except Exception as error:
            logger.warning("TomTom traffic API failed, using heuristic: %s", error)

    # Deterministic heuristic — no randomness
    hour       = pd.Timestamp.now(tz="Asia/Kolkata").hour
    is_peak    = (8 <= hour <= 10) or (18 <= hour <= 21)
    congestion = 0.65 if is_peak else 0.25
    return {
        "congestion_score": congestion,
        "traffic_label":    "Heavy" if is_peak else "Light",
        "is_peak_hour":     is_peak,
        "source":           "heuristic",
    }


# ── Helpers ────────────────────────────────────────────────────────────────

def _zone_profile(zone: str) -> dict[str, float]:
    return ZONE_RISK_MAP.get(zone.strip().title(), {"flood": 0.50, "heat": 0.60, "aqi": 0.50})


def _disruption_label(
    rain_mm: float, temp_c: float, aqi_pm25: float, zone_profile: dict[str, float]
) -> str:
    if rain_mm > 50 and zone_profile.get("flood", 0.5) > 0.6:
        return "Severe Waterlogging"
    if rain_mm > 20:
        return "Heavy Rainfall"
    if temp_c > 42:
        return "Extreme Heat"
    if aqi_pm25 > 75:
        return "Severe AQI"
    return "None"


def _weather_label_from_wmo(code: int | None) -> str:
    return _WMO_LABELS.get(code or 0, "Unknown")


def _to_unix_timestamp(value: str) -> int:
    return int(pd.Timestamp(value).tz_localize("Asia/Kolkata").tz_convert(timezone.utc).timestamp())


def _build_hourly_forecast(
    weather_payload: dict[str, Any], aqi_payload: dict[str, Any]
) -> list[dict[str, Any]]:
    w = weather_payload.get("hourly", {})
    a = aqi_payload.get("hourly", {})

    times  = w.get("time", [])              or []
    temps  = w.get("temperature_2m", [])    or []
    humids = w.get("relative_humidity_2m",[]) or []
    winds  = w.get("wind_speed_10m", [])    or []
    codes  = w.get("weather_code", [])      or []

    a_times = a.get("time", [])             or []
    pm25s   = a.get("pm2_5", [])            or []
    pm10s   = a.get("pm10", [])             or []
    aqis    = a.get("european_aqi", [])     or []

    aqi_by_time = {
        a_times[i]: {
            "pm25":   round(pm25s[i] or 0.0, 1) if i < len(pm25s) else 0.0,
            "pm10":   round(pm10s[i] or 0.0, 1) if i < len(pm10s) else 0.0,
            "aqi_eu": aqis[i] or 1               if i < len(aqis)  else 1,
        }
        for i in range(len(a_times))
    }

    forecast: list[dict[str, Any]] = []
    for idx, t in enumerate(times[:12]):
        code = codes[idx] if idx < len(codes) else 0
        aq   = aqi_by_time.get(t, {"pm25": 0.0, "pm10": 0.0, "aqi_eu": 1})
        forecast.append({
            "dt":              _to_unix_timestamp(t),
            "time":            t,
            "temperature":     round(temps[idx],  1) if idx < len(temps)  else 0.0,
            "humidity":        humids[idx]            if idx < len(humids) else 0,
            "wind_speed":      round(winds[idx],  1) if idx < len(winds)  else 0.0,
            "weather_condition": _weather_label_from_wmo(code),
            "wmo_code":        code,
            "pm25":            aq["pm25"],
            "pm10":            aq["pm10"],
            "aqi_eu":          aq["aqi_eu"],
        })
    return forecast


def _build_fallback_snapshot(
    *, lat: float, lon: float, zone: str, tier: str, reason: str
) -> dict[str, Any]:
    """
    Fully deterministic fallback — same inputs always produce same output.
    No Random() — derived from zone risk profile + current month only.
    """
    now          = pd.Timestamp.now(tz="Asia/Kolkata").floor("h")
    zone_profile = _zone_profile(zone)
    month        = now.month

    if 6 <= month <= 10:
        rain_mm, temp_c = round(zone_profile["flood"] * 25, 1), 28.0
    elif month in (3, 4, 5):
        rain_mm, temp_c = 2.0, round(35 + zone_profile["heat"] * 6, 1)
    else:
        rain_mm, temp_c = 5.0, 29.0

    humidity = int(round(55 + zone_profile["flood"] * 30))
    wind_kph = 12.0
    pm25     = round(18 + zone_profile["aqi"] * 35, 1)
    pm10     = round(pm25 * 1.35, 1)
    aqi_eu   = max(1, min(5, int(round(pm25 / 20))))
    wmo_code = 61 if rain_mm > 6 else 2

    weather = {"temp_c": temp_c, "humidity": humidity, "rain_mm": rain_mm,
               "wind_kph": wind_kph, "wmo_code": wmo_code, "source": "fallback"}
    aqi     = {"pm25": pm25, "pm10": pm10, "aqi_eu": aqi_eu, "source": "fallback"}
    hour    = now.hour
    is_peak = (8 <= hour <= 10) or (18 <= hour <= 21)
    traffic = {
        "congestion_score": 0.65 if is_peak else 0.25,
        "traffic_label":    "Heavy" if is_peak else "Light",
        "source":           "fallback",
    }

    triggers = evaluate_triggers(
        rain_mm=rain_mm, temp_c=temp_c,
        wind_kph=wind_kph, pm25=pm25, flood_risk=zone_profile["flood"],
    )
    ai = predict_risk(zone=zone, delivery_persona="Food", tier=tier,
                      rain=rain_mm, temp=temp_c, aqi=pm25)

    forecast = [
        {
            "dt":              int((now + pd.Timedelta(hours=h)).tz_convert(timezone.utc).timestamp()),
            "time":            (now + pd.Timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M"),
            "temperature":     temp_c, "humidity": humidity, "wind_speed": wind_kph,
            "weather_condition": _weather_label_from_wmo(wmo_code),
            "wmo_code":        wmo_code, "pm25": pm25, "pm10": pm10, "aqi_eu": aqi_eu,
        }
        for h in range(12)
    ]

    return {
        "temperature": temp_c, "weather_condition": _weather_label_from_wmo(wmo_code),
        "humidity": humidity, "wind_speed": wind_kph,
        "pm25": pm25, "pm10": pm10, "aqi_eu": aqi_eu,
        "forecast": forecast,
        "parametric_analysis": {
            "is_disrupted":       triggers["disruption_active"],
            "disruption_reason":  ai["active_disruption"],
            "traffic_congestion": int(round(traffic["congestion_score"] * 100)),
            "source":             "fallback",
        },
        "weather": weather, "aqi": aqi, "traffic": traffic,
        "triggers": triggers,
        "ai_risk_score":     ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium":    ai["weekly_premium_inr"],
        "zone_risk_profile": zone_profile,
        "timestamp":         pd.Timestamp.utcnow().isoformat(),
        "fallback_reason":   reason,
    }


# ── Core prediction ────────────────────────────────────────────────────────

def predict_risk(
    zone: str,
    delivery_persona: str,
    tier: str,
    rain: float | None = None,
    temp: float | None = None,
    aqi: float | None = None,
    wind: float | None = None,
) -> dict[str, Any]:
    """
    CatBoost risk prediction.
    If live weather values (rain/temp/aqi/wind) are provided, uses them.
    Otherwise derives season-aware defaults from zone risk profile.
    Results cached in-process by zone+tier+month when using defaults.
    """
    clean_zone   = zone.strip().title()
    clean_tier   = tier.strip().lower()
    month        = pd.Timestamp.utcnow().month
    zone_profile = _zone_profile(clean_zone)

    # Use live values if provided
    if any(v is not None for v in (rain, temp, aqi, wind)):
        if 6 <= month <= 10:
            d_rain, d_temp, d_aqi = zone_profile["flood"] * 45, 28.0, 30.0
        elif month in (3, 4, 5):
            d_rain, d_temp, d_aqi = 5.0, 35 + zone_profile["heat"] * 6, 35.0
        else:
            d_rain, d_temp, d_aqi = 10.0, 29.0, 30.0 + zone_profile["aqi"] * 30

        rain_mm  = round(float(d_rain  if rain is None else rain), 1)
        temp_c   = round(float(d_temp  if temp is None else temp), 1)
        aqi_pm25 = round(float(d_aqi   if aqi  is None else aqi),  1)
        wind_kph = round(float(12.0    if wind is None else wind), 1)
    else:
        # Zone-based seasonal defaults — cache these
        ck     = _cache_key("predict", {"zone": clean_zone, "tier": clean_tier, "month": month})
        cached = _PREDICTION_CACHE.get(ck)
        if cached and (time.time() - cached[0]) < get_settings().ai_cache_ttl_seconds:
            return cached[1]

        if 6 <= month <= 10:
            rain_mm, temp_c, aqi_pm25 = zone_profile["flood"] * 45, 28.0, 30.0
        elif month in (3, 4, 5):
            rain_mm, temp_c, aqi_pm25 = 5.0, 35 + zone_profile["heat"] * 6, 35.0
        else:
            rain_mm, temp_c, aqi_pm25 = 10.0, 29.0, 30.0 + zone_profile["aqi"] * 30
        wind_kph = 12.0

    active_disruption = _disruption_label(rain_mm, temp_c, aqi_pm25, zone_profile)
    input_frame = pd.DataFrame([{
        "Zone":                clean_zone,
        "Delivery_Persona":    delivery_persona.strip().title(),
        "Month":               month,
        "Forecast_Rain_mm":    rain_mm,
        "Forecast_Temp_C":     temp_c,
        "AQI_PM25":            aqi_pm25,
        "Wind_KPH":            wind_kph,
        "External_Disruption": active_disruption,
    }])

    probability = 0.5
    model = _load_risk_model()
    if model is not None:
        try:
            probability = float(model.predict_proba(input_frame)[:, 1][0])
        except Exception as error:
            logger.warning("CatBoost inference failed: %s", error)

    base_rate = _TIER_BASE_RATES.get(clean_tier, 49.0)
    result = {
        "ai_risk_score":      round(probability, 4),
        "weekly_premium_inr": round(base_rate * (1.0 + probability), 2),
        "zone":               clean_zone,
        "active_disruption":  active_disruption,
        "model_version":      _MODEL_VERSION,
    }

    # Only cache when using defaults (live values change every request)
    if not any(v is not None for v in (rain, temp, aqi, wind)):
        ck = _cache_key("predict", {"zone": clean_zone, "tier": clean_tier, "month": month})
        _PREDICTION_CACHE[ck] = (time.time(), result)

    return result


def evaluate_triggers(
    *, rain_mm: float, temp_c: float, wind_kph: float, pm25: float, flood_risk: float = 0.5
) -> dict[str, Any]:
    fired: list[dict[str, Any]] = []
    total_payout = 0
    values = {"rain_mm": rain_mm, "temp_c": temp_c, "wind_kph": wind_kph, "pm25": pm25}

    for trigger in TRIGGERS:
        value = values[trigger["field"]]
        if trigger["id"] == "severe_waterlogging":
            matched = rain_mm > trigger["threshold"] and flood_risk > 0.6
        else:
            matched = value > trigger["threshold"]
        if matched:
            fired.append({
                "trigger_id":     trigger["id"],
                "trigger_name":   trigger["name"],
                "threshold":      trigger["threshold"],
                "measured_value": round(value, 2),
                "fixed_payout":   trigger["fixed_payout"],
            })
            total_payout += trigger["fixed_payout"]

    return {
        "triggers_fired":     fired,
        "trigger_count":      len(fired),
        "disruption_active":  bool(fired),
        "total_fixed_payout": min(total_payout, 1200),
    }


# ── Main public function ───────────────────────────────────────────────────

async def get_live_risk_data(
    *,
    lat: float,
    lon: float,
    zone: str = "Chennai",
    tier: str = "standard",
    redis: Redis | None = None,
) -> dict[str, Any]:
    """
    Full live risk assessment. Data sources (concurrent):
      1. Open-Meteo weather   — rain, temp, wind, humidity
      2. Open-Meteo AQI       — PM2.5, PM10, European AQI
      3. TomTom traffic       — congestion (heuristic if no key)
      4. Redis simulation     — overrides all if admin simulation is active

    CatBoost runs on ACTUAL fetched values, not zone seasonal averages.
    Falls back to deterministic zone snapshot if all upstreams fail.
    """
    # ── Check simulation override (Redis-backed, multi-worker safe) ───────
    sim = await get_simulation_state(redis)
    if sim:
        temp_c  = float(sim.get("temp", 25.0))
        rain_mm = float(sim.get("rain", 0.0))
        pm25    = float(sim.get("aqi_pm25", 20.0))
        pm10    = round(pm25 * 1.35, 1)
        aqi_eu  = max(1, min(5, int(round(pm25 / 20))))
        wind_kph = 12.0
        humidity = 60
        wmo_code = 65 if rain_mm > 15 else (61 if rain_mm > 0 else 1)

        zone_profile = _zone_profile(zone)
        triggers = evaluate_triggers(
            rain_mm=rain_mm, temp_c=temp_c,
            wind_kph=wind_kph, pm25=pm25, flood_risk=zone_profile["flood"],
        )
        ai = predict_risk(zone=zone, delivery_persona="Food", tier=tier,
                          rain=rain_mm, temp=temp_c, aqi=pm25)
        traffic_score = float(sim.get("traffic_score", 0.4))

        return {
            "temperature": temp_c, "weather_condition": _weather_label_from_wmo(wmo_code),
            "humidity": humidity, "wind_speed": wind_kph,
            "pm25": pm25, "pm10": pm10, "aqi_eu": aqi_eu,
            "forecast": [],
            "parametric_analysis": {
                "is_disrupted":       triggers["disruption_active"],
                "disruption_reason":  ai["active_disruption"],
                "traffic_congestion": int(round(traffic_score * 100)),
                "source":             "simulation",
            },
            "weather":           {"temp_c": temp_c, "humidity": humidity, "rain_mm": rain_mm,
                                   "wind_kph": wind_kph, "wmo_code": wmo_code, "source": "simulation"},
            "aqi":               {"pm25": pm25, "pm10": pm10, "aqi_eu": aqi_eu, "source": "simulation"},
            "traffic":           {"congestion_score": traffic_score, "source": "simulation"},
            "triggers":          triggers,
            "ai_risk_score":     ai["ai_risk_score"],
            "active_disruption": ai["active_disruption"],
            "weekly_premium":    ai["weekly_premium_inr"],
            "model_versions":    {"risk_model": _MODEL_VERSION},
            "zone_risk_profile": zone_profile,
            "timestamp":         pd.Timestamp.utcnow().isoformat(),
        }

    # ── Live API fetch ─────────────────────────────────────────────────────
    settings = get_settings()
    timeout  = httpx.Timeout(settings.request_timeout_seconds)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            weather_payload, aqi_payload, traffic = await asyncio.gather(
                _get_with_retry(
                    client,
                    f"{settings.open_meteo_base_url}/v1/forecast",
                    params={
                        "latitude": lat, "longitude": lon,
                        "current":  ["temperature_2m", "relative_humidity_2m",
                                     "rain", "wind_speed_10m", "weather_code"],
                        "hourly":   ["temperature_2m", "relative_humidity_2m",
                                     "weather_code", "wind_speed_10m"],
                        "forecast_hours": 12,
                        "timezone": "Asia/Kolkata",
                    },
                    redis=redis,
                    cache_key=_cache_key("weather", {"lat": round(lat, 3), "lon": round(lon, 3)}),
                ),
                _get_with_retry(
                    client,
                    f"{settings.open_meteo_air_quality_base_url}/v1/air-quality",
                    params={
                        "latitude": lat, "longitude": lon,
                        "current":  ["pm2_5", "pm10", "european_aqi"],
                        "hourly":   ["pm2_5", "pm10", "european_aqi"],
                        "timezone": "Asia/Kolkata",
                    },
                    redis=redis,
                    cache_key=_cache_key("aqi", {"lat": round(lat, 3), "lon": round(lon, 3)}),
                ),
                _fetch_traffic(client, lat, lon, redis),
            )
    except Exception as error:
        logger.warning("All upstreams failed for %s,%s — using fallback: %s", lat, lon, error)
        return _build_fallback_snapshot(lat=lat, lon=lon, zone=zone, tier=tier, reason=str(error))

    cw = weather_payload.get("current", {})
    ca = aqi_payload.get("current", {})

    weather = {
        "temp_c":   round(cw.get("temperature_2m",      30.0), 1),
        "humidity": cw.get("relative_humidity_2m",       60),
        "rain_mm":  round(cw.get("rain",                 0.0),  1),
        "wind_kph": round(cw.get("wind_speed_10m",       10.0), 1),
        "wmo_code": cw.get("weather_code",               0),
        "source":   "open-meteo",
    }
    aqi_data = {
        "pm25":   round(ca.get("pm2_5",        0.0) or 0.0, 1),
        "pm10":   round(ca.get("pm10",          0.0) or 0.0, 1),
        "aqi_eu": ca.get("european_aqi", 1) or 1,
        "source": "open-meteo-aqi",
    }

    zone_profile = _zone_profile(zone)

    # CatBoost on LIVE values
    ai = predict_risk(
        zone=zone, delivery_persona="Food", tier=tier,
        rain=weather["rain_mm"], temp=weather["temp_c"],
        aqi=aqi_data["pm25"],   wind=weather["wind_kph"],
    )

    triggers = evaluate_triggers(
        rain_mm=weather["rain_mm"], temp_c=weather["temp_c"],
        wind_kph=weather["wind_kph"], pm25=aqi_data["pm25"],
        flood_risk=zone_profile["flood"],
    )

    weather_condition  = _weather_label_from_wmo(weather["wmo_code"])
    traffic_congestion = int(round(traffic["congestion_score"] * 100))
    forecast           = _build_hourly_forecast(weather_payload, aqi_payload)

    return {
        "temperature":       weather["temp_c"],
        "weather_condition": weather_condition,
        "humidity":          weather["humidity"],
        "wind_speed":        weather["wind_kph"],
        "pm25":              aqi_data["pm25"],
        "pm10":              aqi_data["pm10"],
        "aqi_eu":            aqi_data["aqi_eu"],
        "forecast":          forecast,
        "parametric_analysis": {
            "is_disrupted":       triggers["disruption_active"],
            "disruption_reason":  ai["active_disruption"],
            "traffic_congestion": traffic_congestion,
            "source":             "open-meteo",
        },
        "weather":           weather,
        "aqi":               aqi_data,
        "traffic":           traffic,
        "triggers":          triggers,
        "ai_risk_score":     ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium":    ai["weekly_premium_inr"],
        "model_versions":    {"risk_model": ai.get("model_version", _MODEL_VERSION)},
        "zone_risk_profile": zone_profile,
        "timestamp":         pd.Timestamp.utcnow().isoformat(),
    }
