from dataclasses import dataclass
from functools import lru_cache
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    openweather_api_key: str | None
    supabase_url: str | None
    supabase_service_role_key: str | None


@lru_cache
def get_settings() -> Settings:
    return Settings(
        openweather_api_key=os.getenv("OPENWEATHER_API_KEY"),
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    )
