from fastapi import APIRouter, Body, HTTPException
from app.integrations.ai_client import SYSTEM_SIMULATION

router = APIRouter(prefix="/admin", tags=["Admin Control"])

@router.post("/login")
async def admin_login(data: dict = Body(...)):
    if data.get("phone") == "8754470200": # Replace with your phone
        return {"status": "success"}
    raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/start-simulation")
async def start_sim(data: dict = Body(...)):
    SYSTEM_SIMULATION["active"] = True
    # Convert incoming slider strings to numbers
    SYSTEM_SIMULATION["temp"] = float(data.get("temp", 25))
    SYSTEM_SIMULATION["rain"] = float(data.get("rain", 0))
    SYSTEM_SIMULATION["aqi"] = int(data.get("aqi", 1))
    SYSTEM_SIMULATION["traffic"] = int(data.get("traffic", 20))
    print(f"DEBUG: Simulation started with Rain: {SYSTEM_SIMULATION['rain']}mm")
    return {"status": "GLOBAL_SIMULATION_ON"}

@router.post("/stop-simulation")
async def stop_sim():
    SYSTEM_SIMULATION["active"] = False
    return {"status": "GLOBAL_SIMULATION_OFF"}