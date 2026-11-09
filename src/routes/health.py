from fastapi import APIRouter

from base.health import HealthBase
from base.database import DatabaseBase as db
from base.integration import IntegrationBase
from services import APIUtil
from services.catalog import PLATFORMS
from models import Status, ApiHealthStatus, ModelHealthStatus

health_router = APIRouter(prefix="/health", tags=["Health"])


@health_router.get("/", response_model=dict)
async def basic_health():
    return {"status": Status.success}


@health_router.get("/api", response_model=ApiHealthStatus)
async def api_health():
    status = APIUtil.sta.model_copy()
    if db._api is not None:
        for service in await IntegrationBase.overview():
            if service["adapter_key"] and service["platform"] in PLATFORMS:
                if service["status"] in ("Disabled", "Expired", "Error", "Unavailable"):
                    setattr(status, service["platform"], False)
                elif (
                    service["status"] in ("Healthy", "Partial", "Degraded")
                    and service["platform"] in APIUtil._instance
                ):
                    setattr(status, service["platform"], True)
    return status


@health_router.get("/module", response_model=ModelHealthStatus)
async def module_health():
    return HealthBase.sta
