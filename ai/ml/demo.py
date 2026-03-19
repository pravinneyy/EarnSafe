import pandas as pd
import numpy as np
import requests
import random
from catboost import CatBoostClassifier
from sklearn.ensemble import IsolationForest

# ==========================================
# 1. THE DATA ENGINE (WeatherAPI + Mock Chaos)
# ==========================================
def get_7_day_forecast_and_chaos():
    # Put your real WeatherAPI.com key here
    api_key = "5bf081e0f8b845a7aea174955261803" 
    city = "Chennai"
    days = 7
    url = f"http://api.weatherapi.com/v1/forecast.json?key={api_key}&q={city}&days={days}"
    
    response = requests.get(url)
    
    # Quick error catch just in case the API key is missing
    if response.status_code != 200:
        print(f"API Error: {response.status_code}. Using fallback mock data.")
        return pd.DataFrame([{'Date': '2026-03-19', 'Zone': 'Velachery', 'Delivery_Persona': 'Food', 'Forecast_Rain_mm': 0, 'Forecast_Temp_C': 35, 'External_Disruption': 'None'}])
        
    weather_data = response.json()
    
    forecast_list = []
    zones = ['Velachery', 'Anna Nagar', 'OMR', 'T Nagar']
    personas = ['Food', 'Grocery', 'E-commerce']
    
    for forecast_day in weather_data['forecast']['forecastday']:
        real_rain_mm = forecast_day['day']['totalprecip_mm']
        real_temp_c = forecast_day['day']['avgtemp_c']
        date_string = forecast_day['date']
        
        for zone in zones:
            rain = real_rain_mm
            temp = real_temp_c
            
            # Inject Mock Chaos
            chaos_event = "None"
            if random.random() > 0.85: # 15% chance of a major disruption
                chaos_events = ["Unplanned Curfew", "Severe Waterlogging", "Local Strike"]
                chaos_event = random.choice(chaos_events)
                rain = rain * 5 if "Waterlogging" in chaos_event else rain
                
            forecast_list.append({
                'Date': date_string,
                'Zone': zone,
                'Delivery_Persona': random.choice(personas),
                'Forecast_Rain_mm': rain,
                'Forecast_Temp_C': temp,
                'External_Disruption': chaos_event
            })
            
    return pd.DataFrame(forecast_list)

print("Fetching 7-day forecast and generating delivery routes...")
df_upcoming_week = get_7_day_forecast_and_chaos()

# ==========================================
# 2. THE RISK ENGINE (CatBoost Pricing)
# ==========================================
print("Running CatBoost Risk Assessment...")
categorical_features = ['Zone', 'Delivery_Persona', 'External_Disruption']

# Initialize the model (We keep it shallow and fast for the prototype)
risk_model = CatBoostClassifier(iterations=50, depth=4, cat_features=categorical_features, verbose=0)

# Hackathon mock: fitting it on our dummy data so it can run live in your demo
dummy_target = [1 if x != "None" else 0 for x in df_upcoming_week['External_Disruption']]
risk_model.fit(df_upcoming_week.drop(columns=['Date']), dummy_target)

# Predict the risk probability (0.0 to 1.0)
probabilities = risk_model.predict_proba(df_upcoming_week.drop(columns=['Date']))[:, 1]
df_upcoming_week['Risk_Probability'] = np.round(probabilities, 2)

# Calculate Dynamic Weekly Premium (Base DC 20 + up to DC 80 based on risk)
df_upcoming_week['Weekly_Premium_DC'] = 20 + (df_upcoming_week['Risk_Probability'] * 80)

print("\n--- UPCOMING WEEK DYNAMIC PREMIUMS ---")
print(df_upcoming_week[['Date', 'Zone', 'External_Disruption', 'Risk_Probability', 'Weekly_Premium_DC']].head(10))


# ==========================================
# 3. THE FRAUD WATCHER (Isolation Forest)
# ==========================================
print("\n--- INITIATING CLAIM FRAUD CHECK ---")
# Features: [Reported_Rain_mm, Hours_Worked_Before_Claim, Location_Match_Score]
X_historical_claims = np.array([
    [10.5, 4, 0.99], # Normal
    [0.0, 1, 0.20],  # SUSPICIOUS: No rain, just started shift, GPS mismatch
    [45.2, 6, 0.95], # Normal
    [2.1, 8, 0.98]   # Normal
])

fraud_model = IsolationForest(contamination=0.10, random_state=42)
fraud_model.fit(X_historical_claims)

# Simulating a new claim coming in
new_claim = np.array([[0.0, 0.5, 0.10]]) # Highly suspicious
is_fraud = fraud_model.predict(new_claim)

if is_fraud[0] == -1:
    print("🚨 ALERT: Claim flagged for anomaly detection. Payout paused for review.")
else:
    print("✅ Claim verified against historical API data. Processing instant payout.")