import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("OPENWEATHER_API_KEY")

def check_disruption_triggers(temp, humidity, weather_desc, aqi):
    is_disrupted = False
    reason = None
    payout_multiplier = 0.0

    # 1. Trigger: Heavy Rain/Storms
    rain_keywords = ["rain", "storm", "thunderstorm", "drizzle", "heavy intensity"]
    if any(word in weather_desc.lower() for word in rain_keywords):
        is_disrupted = True
        reason = "Severe Precipitation (Rain/Storm)"
        payout_multiplier = 1.0

    # 2. Trigger: Extreme Heat 
    elif temp >= 40:
        is_disrupted = True
        reason = f"Extreme Heat Wave ({temp}°C)"
        payout_multiplier = 0.8

    # 3. Trigger: Poor Air Quality 
    elif aqi >= 4:
        is_disrupted = True
        reason = f"Hazardous Air Quality (AQI: {aqi})"
        payout_multiplier = 0.6

    return {
        "is_disrupted": is_disrupted,
        "disruption_reason": reason,
        "payout_factor": payout_multiplier
    }

def get_weather(lat: float, lon: float):
    weather_url = "https://api.openweathermap.org/data/2.5/weather"
    aqi_url = "https://api.openweathermap.org/data/2.5/air_pollution"
    
    params = {"lat": lat, "lon": lon, "appid": API_KEY, "units": "metric"}

    try:
        # Fetch Weather
        w_response = requests.get(weather_url, params=params)
        w_data = w_response.json()

        if w_response.status_code != 200:
            return {"error": "Weather API failed"}

        temp = w_data["main"]["temp"]
        humidity = w_data["main"]["humidity"]
        weather_desc = w_data["weather"][0]["description"]

        # Fetch AQI (separate try so weather still works if AQI fails)
        aqi = 1
        pollutants = {}
        try:
            a_response = requests.get(aqi_url, params={"lat": lat, "lon": lon, "appid": API_KEY})
            a_data = a_response.json()
            if a_response.status_code == 200 and "list" in a_data and len(a_data["list"]) > 0:
                aqi = a_data["list"][0]["main"]["aqi"]  # 1 to 5 scale
                components = a_data["list"][0].get("components", {})
                pollutants = {
                    "pm25": components.get("pm2_5", 0),
                    "pm10": components.get("pm10", 0),
                    "co": components.get("co", 0),
                    "no2": components.get("no2", 0),
                    "o3": components.get("o3", 0),
                    "so2": components.get("so2", 0),
                }
        except Exception:
            pass  # AQI failure is non-fatal

        # Evaluate Triggers
        analysis = check_disruption_triggers(temp, humidity, weather_desc, aqi)

        return {
            "city": w_data.get("name", "Unknown"),
            "temperature": temp,
            "humidity": humidity,
            "weather_condition": weather_desc,
            "aqi": aqi,
            **pollutants,
            "coords": {"lat": lat, "lon": lon},
            "parametric_analysis": analysis
        }
    except Exception as e:
        return {"error": str(e)}

def get_forecast(lat: float, lon: float):
    weather_url = "https://api.openweathermap.org/data/2.5/forecast"
    aqi_url = "https://api.openweathermap.org/data/2.5/air_pollution/forecast"
    
    try:
        # Fetch 3-hour weather forecast
        w_res = requests.get(weather_url, params={"lat": lat, "lon": lon, "appid": API_KEY, "units": "metric"})
        w_data = w_res.json()
        
        if w_res.status_code != 200:
            return {"error": "Weather forecast API failed"}

        # Fetch hourly AQI forecast
        a_res = requests.get(aqi_url, params={"lat": lat, "lon": lon, "appid": API_KEY})
        a_data = a_res.json() if a_res.status_code == 200 else {}
        aqi_list = a_data.get("list", [])

        # Match each 3-hour weather forecast with the closest AQI forecast by timestamp
        combined = []
        for w_item in w_data.get("list", [])[:8]: # Next 24 hours (8 * 3 = 24)
            dt = w_item["dt"]
            
            # Find closest AQI
            closest_aqi_val = 1
            pm25 = 0
            pm10 = 0
            if aqi_list:
                closest_aqi = min(aqi_list, key=lambda a: abs(a["dt"] - dt))
                closest_aqi_val = closest_aqi["main"]["aqi"]
                components = closest_aqi.get("components", {})
                pm25 = components.get("pm2_5", 0)
                pm10 = components.get("pm10", 0)
            
            combined.append({
                "dt": dt,
                "temperature": w_item["main"]["temp"],
                "humidity": w_item["main"]["humidity"],
                "weather_condition": w_item["weather"][0]["description"],
                "wind_speed": w_item["wind"]["speed"] * 3.6, # m/s to km/h
                "wind_deg": w_item["wind"]["deg"],
                "aqi": closest_aqi_val,
                "pm25": pm25,
                "pm10": pm10
            })
            
        return {
            "city": w_data["city"]["name"],
            "forecast": combined
        }
    except Exception as e:
        return {"error": str(e)}