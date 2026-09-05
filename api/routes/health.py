from fastapi import APIRouter

from base.health import HealthBase
from apis import APIUtil
from models import Status, ApiHealthStatus, ModelHealthStatus

health_router = APIRouter(prefix="/health", tags=["Health"])


@health_router.get("/", response_model=dict)
async def basic_health():
    return {"status": Status.success}


@health_router.get("/api", response_model=ApiHealthStatus)
async def api_health():
    return APIUtil.sta


@health_router.get("/module", response_model=ModelHealthStatus)
async def module_health():
    return HealthBase.sta
