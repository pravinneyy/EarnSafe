from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import timezone
from pathlib import Path
from random import Random
from typing import Any

import httpx
import pandas as pd
from catboost import CatBoostClassifier
from redis.asyncio import Redis

from app.config import get_settings
from app.services.exceptions import IntegrationError

# --- ADMIN SIMULATION STATE ---
SYSTEM_SIMULATION = {
    "active": False,
    "temp": 25.0,
    "rain": 0.0,
    "aqi": 1,
    "traffic": 0,
    "reason": "Simulated Event"
}

logger = logging.getLogger(__name__)

TRIGGERS = [
    {"id": "heavy_rainfall", "name": "Heavy Rainfall", "threshold": 20.0, "field": "rain_mm", "fixed_payout": 500},
    {"id": "severe_waterlogging", "name": "Severe Waterlogging", "threshold": 50.0, "field": "rain_mm", "fixed_payout": 800},
    {"id": "extreme_heat", "name": "Extreme Heat", "threshold": 42.0, "field": "temp_c", "fixed_payout": 400},
    {"id": "hazardous_aqi", "name": "Hazardous Air Quality", "threshold": 75.0, "field": "pm25", "fixed_payout": 300},
    {"id": "high_wind", "name": "Dangerous Wind Speed", "threshold": 60.0, "field": "wind_kph", "fixed_payout": 350},
]

ZONE_RISK_MAP = {
    "Velachery": {"flood": 0.85, "heat": 0.60, "aqi": 0.55},
    "Anna Nagar": {"flood": 0.35, "heat": 0.65, "aqi": 0.50},
    "T Nagar": {"flood": 0.60, "heat": 0.70, "aqi": 0.65},
    "OMR": {"flood": 0.40, "heat": 0.55, "aqi": 0.40},
    "Tambaram": {"flood": 0.50, "heat": 0.60, "aqi": 0.45},
    "Adyar": {"flood": 0.70, "heat": 0.58, "aqi": 0.48},
    "Perambur": {"flood": 0.45, "heat": 0.65, "aqi": 0.70},
    "Chrompet": {"flood": 0.55, "heat": 0.62, "aqi": 0.50},
    "Sholinganallur": {"flood": 0.75, "heat": 0.55, "aqi": 0.42},
    "Kodambakkam": {"flood": 0.50, "heat": 0.68, "aqi": 0.60},
}

_TIER_BASE_RATES = {"basic": 29.0, "standard": 49.0, "pro": 89.0}
_RISK_MODEL_PATH = Path(__file__).resolve().parents[3] / "ai" / "ml" / "models" / "risk_model.cbm"
_RISK_MODEL: CatBoostClassifier | None = None

_WMO_LABELS = {
    0: "Clear",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    56: "Freezing Drizzle",
    57: "Freezing Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    66: "Freezing Rain",
    67: "Freezing Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Rain Showers",
    81: "Rain Showers",
    82: "Heavy Showers",
    85: "Snow Showers",
    86: "Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm",
}


def _load_risk_model() -> CatBoostClassifier | None:
    global _RISK_MODEL
    if _RISK_MODEL is not None:
        return _RISK_MODEL
    if not _RISK_MODEL_PATH.exists():
        logger.warning("Risk model file not found at %s; falling back to heuristic premium scoring.", _RISK_MODEL_PATH)
        return None
    model = CatBoostClassifier()
    model.load_model(str(_RISK_MODEL_PATH))
    _RISK_MODEL = model
    return _RISK_MODEL


def _cache_key(prefix: str, payload: dict[str, Any]) -> str:
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    return f"ai:{prefix}:{digest}"


async def _cached_json(redis: Redis | None, key: str) -> dict[str, Any] | None:
    if not redis:
        return None
    try:
        raw = await redis.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception as error:
        logger.warning("Redis cache read failed for %s: %s", key, error)
        return None


async def _write_cache(redis: Redis | None, key: str, payload: dict[str, Any]) -> None:
    if not redis:
        return
    settings = get_settings()
    try:
        await redis.set(key, json.dumps(payload), ex=settings.ai_cache_ttl_seconds)
    except Exception as error:
        logger.warning("Redis cache write failed for %s: %s", key, error)


def _build_fallback_snapshot(*, lat: float, lon: float, zone: str, tier: str, reason: str) -> dict[str, Any]:
    current_time = pd.Timestamp.now(tz="Asia/Kolkata").floor("h")
    randomizer = Random(f"fallback:{lat}:{lon}:{current_time.isoformat()}")
    zone_profile = _zone_profile(zone)

    temp_c = round(28.0 + (zone_profile["heat"] * 6.0) + randomizer.uniform(-1.2, 1.2), 1)
    humidity = int(round(55 + (zone_profile["flood"] * 30)))
    rain_mm = round(zone_profile["flood"] * (12 if current_time.month in (6, 7, 8, 9, 10, 11) else 4), 1)
    wind_kph = round(10 + randomizer.uniform(0, 8), 1)
    pm25 = round(18 + (zone_profile["aqi"] * 35) + randomizer.uniform(-4, 4), 1)
    pm10 = round(pm25 * 1.35, 1)
    aqi_eu = max(1, min(5, int(round(pm25 / 20))))
    wmo_code = 61 if rain_mm > 6 else 2

    weather = {
        "temp_c": temp_c,
        "humidity": humidity,
        "rain_mm": rain_mm,
        "wind_kph": wind_kph,
        "wmo_code": wmo_code,
        "source": "fallback",
    }
    aqi = {
        "pm25": pm25,
        "pm10": pm10,
        "aqi_eu": aqi_eu,
        "source": "fallback",
    }
    traffic = {
        "congestion_score": round(min(1.0, 0.25 + randomizer.uniform(0.0, 0.55)), 2),
        "source": "fallback",
    }
    triggers = evaluate_triggers(
        rain_mm=weather["rain_mm"],
        temp_c=weather["temp_c"],
        wind_kph=weather["wind_kph"],
        pm25=aqi["pm25"],
        flood_risk=zone_profile["flood"],
    )
    ai = predict_risk(zone=zone, delivery_persona="Food", tier=tier)
    weather_condition = _weather_label_from_wmo(weather["wmo_code"])
    traffic_congestion = int(round(traffic["congestion_score"] * 100))

    forecast: list[dict[str, Any]] = []
    for hour_offset in range(12):
        forecast_time = current_time + pd.Timedelta(hours=hour_offset)
        forecast_temp = round(temp_c + randomizer.uniform(-1.5, 1.5), 1)
        forecast_pm25 = round(max(0.0, pm25 + randomizer.uniform(-6, 6)), 1)
        forecast.append(
            {
                "dt": int(forecast_time.tz_convert(timezone.utc).timestamp()),
                "time": forecast_time.strftime("%Y-%m-%dT%H:%M"),
                "temperature": forecast_temp,
                "humidity": humidity,
                "wind_speed": round(max(0.0, wind_kph + randomizer.uniform(-2, 2)), 1),
                "weather_condition": weather_condition,
                "wmo_code": weather["wmo_code"],
                "pm25": forecast_pm25,
                "pm10": round(forecast_pm25 * 1.35, 1),
                "aqi_eu": max(1, min(5, int(round(forecast_pm25 / 20)))),
            }
        )

    return {
        "temperature": weather["temp_c"],
        "weather_condition": weather_condition,
        "humidity": weather["humidity"],
        "wind_speed": weather["wind_kph"],
        "pm25": aqi["pm25"],
        "pm10": aqi["pm10"],
        "aqi_eu": aqi["aqi_eu"],
        "forecast": forecast,
        "parametric_analysis": {
            "is_disrupted": triggers["disruption_active"],
            "disruption_reason": ai["active_disruption"],
            "traffic_congestion": traffic_congestion,
        },
        "weather": weather,
        "aqi": aqi,
        "traffic": traffic,
        "triggers": triggers,
        "ai_risk_score": ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium": ai["weekly_premium_inr"],
        "zone_risk_profile": zone_profile,
        "timestamp": pd.Timestamp.utcnow().isoformat(),
        "fallback_reason": reason,
    }


async def _get_with_retry(client: httpx.AsyncClient, url: str, *, params: dict[str, Any], redis: Redis | None, cache_key: str) -> dict[str, Any]:
    cached = await _cached_json(redis, cache_key)
    if cached:
        return cached

    settings = get_settings()
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
            logger.warning("HTTP call failed for %s on attempt %s/%s", url, attempt + 1, settings.retry_attempts)
    raise IntegrationError(f"Upstream AI/weather dependency failed: {last_error}") from last_error


def _zone_profile(zone: str) -> dict[str, float]:
    return ZONE_RISK_MAP.get(zone.strip().title(), {"flood": 0.50, "heat": 0.60, "aqi": 0.50})


def _disruption_label(rain_mm: float, temp_c: float, aqi_pm25: float, zone_profile: dict[str, float]) -> str:
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
    if code is None:
        return "Unknown"
    return _WMO_LABELS.get(code, "Unknown")


def _pm25_from_aqi_override(aqi_override: float | None) -> float | None:
    if aqi_override is None:
        return None
    normalized_value = round(max(float(aqi_override), 0.0), 1)
    # Treat small values as the 1-5 demo AQI slider, otherwise as direct PM2.5.
    if normalized_value <= 5:
        return round(normalized_value * 25.0, 1)
    return normalized_value


def _to_unix_timestamp(value: str) -> int:
    return int(pd.Timestamp(value).tz_localize("Asia/Kolkata").tz_convert(timezone.utc).timestamp())


def _build_hourly_forecast(weather_payload: dict[str, Any], aqi_payload: dict[str, Any]) -> list[dict[str, Any]]:
    weather_hourly = weather_payload.get("hourly", {})
    aqi_hourly = aqi_payload.get("hourly", {})

    weather_times = weather_hourly.get("time", []) or []
    temperature_values = weather_hourly.get("temperature_2m", []) or []
    humidity_values = weather_hourly.get("relative_humidity_2m", []) or []
    wind_values = weather_hourly.get("wind_speed_10m", []) or []
    weather_code_values = weather_hourly.get("weather_code", []) or []

    aqi_times = aqi_hourly.get("time", []) or []
    pm25_values = aqi_hourly.get("pm2_5", []) or []
    pm10_values = aqi_hourly.get("pm10", []) or []
    aqi_eu_values = aqi_hourly.get("european_aqi", []) or []

    aqi_by_time = {}
    for idx, time_value in enumerate(aqi_times):
        aqi_by_time[time_value] = {
            "pm25": round(pm25_values[idx] or 0.0, 1) if idx < len(pm25_values) else 0.0,
            "pm10": round(pm10_values[idx] or 0.0, 1) if idx < len(pm10_values) else 0.0,
            "aqi_eu": aqi_eu_values[idx] or 1 if idx < len(aqi_eu_values) else 1,
        }

    forecast: list[dict[str, Any]] = []
    for idx, time_value in enumerate(weather_times[:12]):
        wmo_code = weather_code_values[idx] if idx < len(weather_code_values) else 0
        aqi_sample = aqi_by_time.get(time_value, {"pm25": 0.0, "pm10": 0.0, "aqi_eu": 1})
        forecast.append(
            {
                "dt": _to_unix_timestamp(time_value),
                "time": time_value,
                "temperature": round(temperature_values[idx], 1) if idx < len(temperature_values) else 0.0,
                "humidity": humidity_values[idx] if idx < len(humidity_values) else 0,
                "wind_speed": round(wind_values[idx], 1) if idx < len(wind_values) else 0.0,
                "weather_condition": _weather_label_from_wmo(wmo_code),
                "wmo_code": wmo_code,
                "pm25": aqi_sample["pm25"],
                "pm10": aqi_sample["pm10"],
                "aqi_eu": aqi_sample["aqi_eu"],
            }
        )

    return forecast


def predict_risk(
    zone: str,
    delivery_persona: str,
    tier: str,
    rain: float | None = None,
    temp: float | None = None,
    aqi: float | None = None,
) -> dict[str, Any]:
    clean_zone = zone.strip().title()
    clean_persona = delivery_persona.strip().title()
    clean_tier = tier.strip().lower()
    month = pd.Timestamp.utcnow().month
    zone_profile = _zone_profile(clean_zone)

    if 6 <= month <= 10:
        default_rain_mm, default_temp_c, default_aqi_pm25 = zone_profile["flood"] * 45, 28.0, 30.0
    elif month in (3, 4, 5):
        default_rain_mm, default_temp_c, default_aqi_pm25 = 5.0, 35 + zone_profile["heat"] * 6, 35.0
    else:
        default_rain_mm, default_temp_c, default_aqi_pm25 = 10.0, 29.0, 30.0 + zone_profile["aqi"] * 30

    rain_mm = round(float(default_rain_mm if rain is None else rain), 1)
    temp_c = round(float(default_temp_c if temp is None else temp), 1)
    aqi_pm25 = round(float(default_aqi_pm25 if aqi is None else aqi), 1)
    active_disruption = _disruption_label(rain_mm, temp_c, aqi_pm25, zone_profile)

    input_frame = pd.DataFrame(
        [
            {
                "Zone": clean_zone,
                "Delivery_Persona": clean_persona,
                "Month": month,
                "Forecast_Rain_mm": rain_mm,
                "Forecast_Temp_C": temp_c,
                "AQI_PM25": aqi_pm25,
                "Wind_KPH": 12.0,
                "External_Disruption": active_disruption,
            }
        ]
    )

    probability = 0.5
    model = _load_risk_model()
    if model is not None:
        try:
            probability = float(model.predict_proba(input_frame)[:, 1][0])
        except Exception as error:
            logger.warning("CatBoost inference failed, using fallback score: %s", error)

    # --- Heuristic risk score computed directly from weather inputs ---
    # The ML model was trained on limited data and under-predicts for
    # extreme conditions. This heuristic ensures the score rises visibly
    # when simulation sliders are pushed to high values.
    rain_score = min(rain_mm / 100.0, 1.0)            # 0mm→0.0, 100mm→1.0
    temp_score = max(0.0, (temp_c - 30.0) / 20.0)    # 30°C→0.0, 50°C→1.0
    aqi_score  = min(aqi_pm25 / 150.0, 1.0)           # 0→0.0, 150µg→1.0
    zone_flood = zone_profile.get("flood", 0.5)
    zone_heat  = zone_profile.get("heat", 0.5)

    heuristic = min(
        rain_score  * 0.40 * (1.0 + zone_flood * 0.5) +
        temp_score  * 0.25 * (1.0 + zone_heat  * 0.5) +
        aqi_score   * 0.20 +
        0.10 * zone_flood,   # baseline zone risk
        1.0
    )

    # When the ML model gives a suspiciously low score (< 0.10),
    # trust the heuristic. Otherwise blend 60% ML + 40% heuristic.
    if probability < 0.10:
        final_score = round(heuristic, 4)
    else:
        final_score = round(0.60 * probability + 0.40 * heuristic, 4)

    base_rate = _TIER_BASE_RATES.get(clean_tier, 49.0)
    return {
        "ai_risk_score": final_score,
        "weekly_premium_inr": round(base_rate * (1.0 + final_score), 2),
        "zone": clean_zone,
        "active_disruption": active_disruption,
    }


def evaluate_triggers(*, rain_mm: float, temp_c: float, wind_kph: float, pm25: float, flood_risk: float = 0.5) -> dict[str, Any]:
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
            fired.append(
                {
                    "trigger_id": trigger["id"],
                    "trigger_name": trigger["name"],
                    "threshold": trigger["threshold"],
                    "measured_value": value,
                    "fixed_payout": trigger["fixed_payout"],
                }
            )
            total_payout += trigger["fixed_payout"]
    return {
        "triggers_fired": fired,
        "trigger_count": len(fired),
        "disruption_active": bool(fired),
        "total_fixed_payout": min(total_payout, 1200),
    }


async def get_live_risk_data(
    *,
    lat: float,
    lon: float,
    zone: str = "Chennai",
    tier: str = "standard",
    redis: Redis | None = None,
    sim_temp: float | None = None,
    sim_aqi: float | None = None,
    sim_rain: float | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    manual_override_active = any(value is not None for value in (sim_temp, sim_aqi, sim_rain))
    zone_profile = _zone_profile(zone)

    weather_payload: dict[str, Any] = {}
    aqi_payload: dict[str, Any] = {}

    if SYSTEM_SIMULATION["active"]:
        temp_c = float(SYSTEM_SIMULATION["temp"])
        rain_mm = float(SYSTEM_SIMULATION["rain"])
        slider_aqi = int(SYSTEM_SIMULATION["aqi"])
        pm25 = float(slider_aqi * 25.0)
        pm10 = round(pm25 * 1.35, 1)
        aqi_eu = max(1, min(5, slider_aqi))
        traffic_score = float(SYSTEM_SIMULATION["traffic"]) / 100.0
        wmo = 65 if rain_mm > 15 else (61 if rain_mm > 0 else 1)
        source = "simulation-active"
        humidity = 60
        wind = 12.0
    else:
        try:
            timeout = httpx.Timeout(settings.request_timeout_seconds)
            async with httpx.AsyncClient(timeout=timeout) as client:
                weather_payload, aqi_payload = await asyncio.gather(
                    _get_with_retry(client, f"{settings.open_meteo_base_url}/v1/forecast", 
                        params={"latitude": lat, "longitude": lon, "current": ["temperature_2m", "rain", "weather_code", "relative_humidity_2m", "wind_speed_10m"], "hourly": ["temperature_2m", "relative_humidity_2m", "weather_code", "wind_speed_10m"], "forecast_hours": 12, "timezone": "Asia/Kolkata"},
                        redis=redis, cache_key=_cache_key("weather", {"lat": lat, "lon": lon})),
                    _get_with_retry(client, f"{settings.open_meteo_air_quality_base_url}/v1/air-quality", 
                        params={"latitude": lat, "longitude": lon, "current": ["pm2_5", "pm10", "european_aqi"], "hourly": ["pm2_5", "pm10", "european_aqi"], "timezone": "Asia/Kolkata"},
                        redis=redis, cache_key=_cache_key("aqi", {"lat": lat, "lon": lon}))
                )
        except Exception as error:
            logger.warning("API Fetch Failed: %s. Using simulation or fallback.", error)
            if not manual_override_active:
                return _build_fallback_snapshot(lat=lat, lon=lon, zone=zone, tier=tier, reason=str(error))

        curr_w = weather_payload.get("current", {})
        curr_a = aqi_payload.get("current", {})
        override_pm25 = _pm25_from_aqi_override(sim_aqi)

        temp_c = round(float(sim_temp) if sim_temp is not None else float(curr_w.get("temperature_2m", 28.0)), 1)
        rain_mm = round(float(sim_rain) if sim_rain is not None else float(curr_w.get("rain", 0.0)), 1)
        pm25 = override_pm25 if override_pm25 is not None else round(float(curr_a.get("pm2_5", 20.0) or 20.0), 1)
        pm10 = round(float(curr_a.get("pm10", pm25 * 1.35) or (pm25 * 1.35)), 1)
        aqi_eu = int(curr_a.get("european_aqi", max(1, min(5, int(round(pm25 / 20)))) ) or max(1, min(5, int(round(pm25 / 20)))))
        traffic_score = 0.4
        source = "manual-override" if manual_override_active else "open-meteo"
        if sim_rain is not None:
            wmo = 65 if rain_mm > 15 else 61 if rain_mm > 0 else 1
        else:
            wmo = int(curr_w.get("weather_code", 0) or 0)
        humidity = int(curr_w.get("relative_humidity_2m", 60) or 60)
        wind = round(float(curr_w.get("wind_speed_10m", 10.0) or 10.0), 1)

    triggers = evaluate_triggers(
        rain_mm=rain_mm,
        temp_c=temp_c,
        wind_kph=wind,
        pm25=pm25,
        flood_risk=zone_profile["flood"],
    )
    ai = predict_risk(
        zone=zone,
        delivery_persona="Food",
        tier=tier,
        rain=rain_mm,
        temp=temp_c,
        aqi=pm25,
    )

    weather_condition = _weather_label_from_wmo(wmo)
    weather = {
        "temp_c": temp_c,
        "humidity": humidity,
        "rain_mm": rain_mm,
        "wind_kph": wind,
        "wmo_code": wmo,
        "source": source,
    }
    aqi = {
        "pm25": pm25,
        "pm10": pm10,
        "aqi_eu": aqi_eu,
        "source": source,
    }
    traffic = {
        "congestion_score": round(traffic_score, 2),
        "source": source,
    }

    return {
        "temperature": temp_c,
        "weather_condition": weather_condition,
        "humidity": humidity,
        "wind_speed": wind,
        "pm25": pm25,
        "pm10": pm10,
        "aqi_eu": aqi_eu,
        "forecast": _build_hourly_forecast(weather_payload, aqi_payload) if weather_payload else [],
        "parametric_analysis": {
            "is_disrupted": triggers["disruption_active"],
            "disruption_reason": ai["active_disruption"],
            "traffic_congestion": int(round(traffic_score * 100)),
            "source": source,
        },
        "weather": weather,
        "aqi": aqi,
        "traffic": traffic,
        "triggers": triggers,
        "ai_risk_score": ai["ai_risk_score"],
        "active_disruption": ai["active_disruption"],
        "weekly_premium": ai["weekly_premium_inr"],
        "zone_risk_profile": zone_profile,
        "timestamp": pd.Timestamp.utcnow().isoformat(),
    }
