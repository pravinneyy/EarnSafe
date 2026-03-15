import os
import requests
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

# Get the API key from environment variables
API_KEY = os.getenv("OPENWEATHER_API_KEY")

def check_disruption_triggers(temp, humidity, weather_desc):
    
    is_disrupted = False
    reason = None
    payout_multiplier = 0.0

    # 1. Trigger: Heavy Rain/Thunderstorms
    rain_keywords = ["rain", "storm", "thunderstorm", "drizzle", "heavy intensity"]
    if any(word in weather_desc.lower() for word in rain_keywords):
        is_disrupted = True
        reason = "Severe Precipitation (Rain/Storm)"
        payout_multiplier = 1.0 # Full payout for rain

    # 2. Trigger: Extreme Heat 
    elif temp >= 40:
        is_disrupted = True
        reason = f"Extreme Heat Wave ({temp}°C)"
        payout_multiplier = 0.8 # High heat payout

    # 3. Trigger: High Humidity + Heat (Heat Index)
    elif temp >= 35 and humidity > 80:
        is_disrupted = True
        reason = "Excessive Humidity & Heat"
        payout_multiplier = 0.5

    return {
        "is_disrupted": is_disrupted,
        "disruption_reason": reason,
        "payout_factor": payout_multiplier
    }

def get_weather(lat: float, lon: float):
    """
    Fetches real-time weather and evaluates it against parametric triggers.
    """
    url = "https://api.openweathermap.org/data/2.5/weather"
    
    params = {
        "lat": lat,
        "lon": lon,
        "appid": API_KEY,
        "units": "metric" # Celsius
    }

    try:
        response = requests.get(url, params=params)
        data = response.json()

        # Check if the API request was successful
        if response.status_code != 200:
            return {
                "error": "Weather API failed", 
                "status_code": response.status_code,
                "message": data.get("message", "Unknown error")
            }

        
        temp = data["main"]["temp"]
        humidity = data["main"]["humidity"]
        weather_desc = data["weather"][0]["description"]
        city = data.get("name", "Unknown Location")

        # Evaluate Parametric Triggers
        analysis = check_disruption_triggers(temp, humidity, weather_desc)

        # Return full payload
        return {
            "city": city,
            "temperature": temp,
            "humidity": humidity,
            "weather_condition": weather_desc,
            "parametric_analysis": analysis, 
            "timestamp": data.get("dt")
        }
        
    except Exception as e:
        return {"error": f"Connection error: {str(e)}"}