import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("OPENWEATHER_API_KEY")

if not API_KEY:
    print("CRITICAL ERROR: OPENWEATHER_API_KEY is not set in .env file!")

def check_disruption_triggers(temp, humidity, weather_desc, aqi):
    is_disrupted = False
    reason = None
    payout_multiplier = 0.0

    if not weather_desc:
        weather_desc = ""

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


def get_weather(lat: float, lon: float, m_temp=None, m_aqi=None, m_rain=None):
    weather_url = "https://api.openweathermap.org/data/2.5/weather"
    aqi_url = "https://api.openweathermap.org/data/2.5/air_pollution"
    
    params = {"lat": lat, "lon": lon, "appid": API_KEY, "units": "metric"}

    try:
        w_response = requests.get(weather_url, params=params)
        w_data = w_response.json()

        
        temp = float(m_temp) if m_temp is not None else w_data.get("main", {}).get("temp", 0)
        humidity = w_data.get("main", {}).get("humidity", 0)
        
        
        if m_rain and float(m_rain) > 0:
            weather_desc = "heavy rain"
            rain_val = float(m_rain)
        else:
            weather_desc = w_data.get("weather", [{}])[0].get("description", "clear sky")
            rain_val = w_data.get("rain", {}).get("1h", 0)

        
        aqi = int(m_aqi) if m_aqi is not None else 1
        pollutants = {}
        if m_aqi is None: # Only fetch from API if slider wasn't used
            try:
                a_response = requests.get(aqi_url, params={"lat": lat, "lon": lon, "appid": API_KEY})
                a_data = a_response.json()
                if a_response.status_code == 200:
                    aqi = a_data["list"][0]["main"]["aqi"]
                    components = a_data["list"][0].get("components", {})
                    pollutants = {
                        "pm25": components.get("pm2_5", 0), "pm10": components.get("pm10", 0),
                        "co": components.get("co", 0), "no2": components.get("no2", 0),
                        "o3": components.get("o3", 0), "so2": components.get("so2", 0),
                    }
            except: pass

        
        analysis = check_disruption_triggers(temp, humidity, weather_desc, aqi)

        
        return {
            "city": w_data.get("name", "Unknown"),
            "temperature": temp,
            "humidity": humidity,
            "weather_condition": weather_desc,
            "rain": rain_val,
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
        w_res = requests.get(weather_url, params={"lat": lat, "lon": lon, "appid": API_KEY, "units": "metric"})
        w_data = w_res.json()
        
        if w_res.status_code != 200:
            return {"error": "Forecast API failed"}

        a_res = requests.get(aqi_url, params={"lat": lat, "lon": lon, "appid": API_KEY})
        a_data = a_res.json() if a_res.status_code == 200 else {}
        aqi_list = a_data.get("list", [])

        combined = []
        for w_item in w_data.get("list", [])[:8]:
            dt = w_item["dt"]
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
                "wind_speed": w_item.get("wind", {}).get("speed", 0) * 3.6,
                "wind_deg": w_item.get("wind", {}).get("deg", 0),
                "aqi": closest_aqi_val,
                "pm25": pm25,
                "pm10": pm10
            })
            
        return {
            "city": w_data.get("city", {}).get("name", "Unknown"),
            "forecast": combined
        }
    except Exception as e:
        return {"error": str(e)}