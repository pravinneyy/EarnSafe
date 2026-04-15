from redis.asyncio import Redis

from app.integrations.ai_client import get_live_risk_data


class WeatherService:
    def __init__(self, redis: Redis | None = None) -> None:
        self.redis = redis

    try:
        w_response = requests.get(weather_url, params=params)
        w_data = w_response.json()

        
        temp = float(m_temp) if m_temp is not None else w_data.get("main", {}).get("temp", 0)
        humidity = w_data.get("main", {}).get("humidity", 0)
        
        
        # FIX: Check if m_rain is actually passed (even if it is 0)
        if m_rain is not None:
            rain_val = float(m_rain)
            
            weather_desc = "heavy rain" if rain_val > 5 else "clear sky"
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
