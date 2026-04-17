"""
fraud_service.py — EarnSafe

NOTE: Primary fraud scoring now lives in ClaimService.submit_claim()
which has full async DB access, live weather verification via Open-Meteo,
mock-location detection, speed checks and rain mismatch scoring.

This module provides the standalone IsolationForest anomaly check
that can be called from anywhere without a DB session.
"""

import logging
import pickle
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_FRAUD_MODEL_PATH = Path(__file__).resolve().parents[3] / "ai" / "ml" / "models" / "fraud_model.pkl"
_fraud_model = None


def _load_fraud_model():
    global _fraud_model
    if _fraud_model is not None:
        return _fraud_model
    if not _FRAUD_MODEL_PATH.exists():
        logger.warning("fraud_model.pkl not found at %s — using heuristic fallback.", _FRAUD_MODEL_PATH)
        return None
    try:
        with open(_FRAUD_MODEL_PATH, "rb") as f:
            _fraud_model = pickle.load(f)
        logger.info("IsolationForest fraud model loaded from %s", _FRAUD_MODEL_PATH)
        return _fraud_model
    except Exception as e:
        logger.error("Failed to load fraud model: %s", e)
        return None


def detect_claim_anomaly(
    reported_rain_mm: float,
    hours_worked_before_claim: float,
    location_match_score: float,
) -> dict:
    """
    Run IsolationForest anomaly detection on a claim.

    Features:
        reported_rain_mm          — rainfall at time of claim
        hours_worked_before_claim — hours lost claimed by worker
        location_match_score      — GPS vs cell tower match (0=mismatch, 1=match)

    Returns:
        is_anomaly    bool
        anomaly_label "FLAGGED" | "NORMAL"
        anomaly_score float (lower = more anomalous)
    """
    model = _load_fraud_model()

    claim_vector = np.array([[
        max(0.0, reported_rain_mm),
        max(0.0, hours_worked_before_claim),
        max(0.0, min(1.0, location_match_score)),
    ]])

    if model is None:
        # Heuristic fallback when model file is unavailable
        is_anomaly = (
            reported_rain_mm < 2.0 and location_match_score < 0.4
        ) or hours_worked_before_claim > 11
        return {
            "is_anomaly":    is_anomaly,
            "anomaly_label": "FLAGGED" if is_anomaly else "NORMAL",
            "anomaly_score": -0.5 if is_anomaly else 0.1,
        }

    prediction    = model.predict(claim_vector)[0]   # 1=normal, -1=anomaly
    anomaly_score = float(model.score_samples(claim_vector)[0])

    return {
        "is_anomaly":    prediction == -1,
        "anomaly_label": "FLAGGED" if prediction == -1 else "NORMAL",
        "anomaly_score": round(anomaly_score, 4),
    }


# ── GPS / Location anti-spoofing helpers ─────────────────────────────────────

def score_location_trust(
    is_mock_location: bool,
    device_speed_kph: float | None,
    reported_rain_mm: float | None,
    live_rain_mm: float | None,
) -> tuple[float, list[str]]:
    """
    Compute a location trust score (0.0 = no trust, 1.0 = full trust).
    Returns (score, list_of_signals).

    Called by ClaimService as an additional anti-spoofing layer.

    Signals checked:
    1. is_mock_location flag from device integrity API
    2. Implausible travel speed (>130 km/h on a delivery bike)
    3. Rain mismatch — worker reports rain but live API shows dry (≥15mm delta)
    """
    score   = 1.0
    signals = []

    # 1. Device integrity — mock location detected by OS
    if is_mock_location:
        score -= 0.50
        signals.append("device integrity flag: mock GPS detected")

    # 2. Speed check — delivery bikes rarely exceed 80 km/h legally
    if device_speed_kph is not None:
        if device_speed_kph > 130:
            score -= 0.25
            signals.append(f"implausible speed: {device_speed_kph:.0f} km/h")
        elif device_speed_kph > 100:
            score -= 0.10
            signals.append(f"elevated speed: {device_speed_kph:.0f} km/h")

    # 3. Weather mismatch
    if reported_rain_mm is not None and live_rain_mm is not None:
        delta = abs(reported_rain_mm - live_rain_mm)
        if delta >= 15.0:
            score -= 0.30
            signals.append(
                f"weather mismatch: reported {reported_rain_mm:.1f}mm, "
                f"live API shows {live_rain_mm:.1f}mm (Δ{delta:.1f}mm)"
            )

    return max(0.0, round(score, 2)), signals
