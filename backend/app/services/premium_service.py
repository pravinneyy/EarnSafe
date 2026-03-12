"""
Premium calculation service.

Formula: base_premium × zone_risk_factor × season_factor × platform_factor
Each plan tier has a fixed base. Factors adjust it based on worker profile.
"""

from datetime import datetime

# Plan base premiums (₹/week)
PLAN_CONFIG = {
    "basic":    {"premium": 29,  "daily_coverage": 300,  "max_weekly": 1500},
    "standard": {"premium": 49,  "daily_coverage": 500,  "max_weekly": 2500},
    "pro":      {"premium": 89,  "daily_coverage": 800,  "max_weekly": 4000},
}

# Cities with higher flood / heat risk get a loading
HIGH_RISK_CITIES = {"chennai", "mumbai", "kolkata", "patna", "kochi"}
MED_RISK_CITIES  = {"pune", "hyderabad", "delhi", "ahmedabad", "surat"}

# Q-commerce platforms have higher hourly dependency → slight loading
HIGH_DEPENDENCY_PLATFORMS = {"blinkit", "zepto"}


def _zone_risk_factor(city: str) -> float:
    c = city.lower()
    if c in HIGH_RISK_CITIES:
        return 1.15
    if c in MED_RISK_CITIES:
        return 1.08
    return 1.0


def _season_factor() -> float:
    month = datetime.now().month
    if 6 <= month <= 9:    # monsoon
        return 1.20
    if month in (4, 5):    # summer / heat wave season
        return 1.10
    return 1.0


def _platform_factor(platform: str) -> float:
    return 1.10 if platform.lower() in HIGH_DEPENDENCY_PLATFORMS else 1.0


def calculate_weekly_premium(plan_tier: str, city: str, platform: str) -> dict:
    """
    Returns full premium breakdown for a given plan + worker profile.
    """
    config = PLAN_CONFIG[plan_tier]

    zf = _zone_risk_factor(city)
    sf = _season_factor()
    pf = _platform_factor(platform)

    raw_premium = config["premium"] * zf * sf * pf
    final_premium = round(raw_premium)   # round to nearest ₹

    return {
        "weekly_premium":    final_premium,
        "daily_coverage":    config["daily_coverage"],
        "max_weekly_payout": config["max_weekly"],
        "breakdown": {
            "base_premium":      config["premium"],
            "zone_risk_factor":  zf,
            "season_factor":     sf,
            "platform_factor":   pf,
        }
    }
