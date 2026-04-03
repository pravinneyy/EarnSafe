from dataclasses import dataclass
from functools import lru_cache
import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    openweather_api_key: Optional[str]
    supabase_url: Optional[str]
    supabase_service_role_key: Optional[str]
    razorpay_key_id: Optional[str]
    razorpay_key_secret: Optional[str]


@lru_cache
def get_settings() -> Settings:
    return Settings(
        openweather_api_key=os.getenv("OPENWEATHER_API_KEY"),
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        razorpay_key_id=os.getenv("RAZORPAY_KEY_ID"),
        razorpay_key_secret=os.getenv("RAZORPAY_KEY_SECRET"),
    )
