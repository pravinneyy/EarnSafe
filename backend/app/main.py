from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Import your routers from the routers folder
from app.routers import user_router, policy_router, claim_router, weather_router, payment_router


app = FastAPI(
    title="Insurance API",
    description="Parametric income insurance API for delivery workers",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(user_router.router)
app.include_router(policy_router.router)
app.include_router(payment_router.router)
app.include_router(claim_router.router)
# This includes the logic from your weather_router.py file
app.include_router(weather_router.router)

@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "service": "Insurance API v1.0.0"}