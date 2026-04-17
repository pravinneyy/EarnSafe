# --- backend/app/routers/admin_router.py ---

from fastapi import APIRouter, Body, HTTPException, Request  # Added 'Request' here
from app.integrations.ai_client import SYSTEM_SIMULATION

router = APIRouter(prefix="/admin", tags=["Admin Control"])

@router.post("/login")
async def admin_login(data: dict = Body(...)):
    if data.get("phone") == "8754470200": 
        return {"status": "success"}
    raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/start-simulation")
async def start_sim(request: Request, data: dict = Body(...)):
    SYSTEM_SIMULATION["active"] = True
    SYSTEM_SIMULATION["temp"] = float(data.get("temp", 25))
    SYSTEM_SIMULATION["rain"] = float(data.get("rain", 0))
    SYSTEM_SIMULATION["aqi"] = int(data.get("aqi", 1))
    SYSTEM_SIMULATION["traffic"] = int(data.get("traffic", 20))
    
    # Trigger instant WebSocket update to phones
    manager = request.app.state.manager
    await manager.broadcast({"type": "REFRESH_DATA"})
    
    return {"status": "SUCCESS"}

@router.post("/stop-simulation")
async def stop_sim(request: Request):
    SYSTEM_SIMULATION["active"] = False
    
    # Trigger instant WebSocket update to phones
    manager = request.app.state.manager
    await manager.broadcast({"type": "REFRESH_DATA"})
    
    return {"status": "SUCCESS"}