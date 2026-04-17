from fastapi import APIRouter, Body, HTTPException
from app.integrations.ai_client import SYSTEM_SIMULATION

router = APIRouter(prefix="/admin", tags=["Admin Control"])

@router.post("/login")
async def admin_login(data: dict = Body(...)):
    if data.get("phone") == "8754470200": # Replace with your phone
        return {"status": "success"}
    raise HTTPException(status_code=401, detail="Unauthorized")

# --- Update start_sim and stop_sim in admin_router.py ---

@router.post("/start-simulation")
async def start_sim(request: Request, data: dict = Body(...)):
    # ... your existing simulation state updates ...
    
    # BROADCAST INSTANTLY
    manager = request.app.state.manager
    await manager.broadcast({"type": "REFRESH_DATA"})
    return {"status": "SUCCESS"}

@router.post("/stop-simulation")
async def stop_sim(request: Request):
    # ... your existing stop logic ...
    
    manager = request.app.state.manager
    await manager.broadcast({"type": "REFRESH_DATA"})
    return {"status": "SUCCESS"}