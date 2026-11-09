from typing import Literal
from uuid import UUID

from fastapi.encoders import jsonable_encoder

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from services import APIUtil
from base.database import DatabaseBase as db
from base.integration import DOUYIN_ENDPOINTS, IntegrationBase
from models.integration import (
    IntegrationCredentials,
    IntegrationRequest,
    IntegrationService,
)
from models.dtk import AuthenticatedSessionImport, GuestSettingsUpdate


def require_database():
    if db._api is None:
        raise HTTPException(503, "Initialize the MediaHarbor database first")


integration_router = APIRouter(
    prefix="/integrations",
    tags=["API Health"],
    dependencies=[Depends(require_database)],
)


class EnabledUpdate(BaseModel):
    enabled: bool


@integration_router.get("/guest-settings")
async def guest_settings():
    from services.dtk.config import public_settings

    return public_settings()


@integration_router.put("/guest-settings")
async def update_guest_settings(settings: GuestSettingsUpdate):
    from services.dtk.config import save_settings

    try:
        return await save_settings(settings)
    except ValueError:
        raise HTTPException(422, "Check the pool ranges, proxy URL and proxy credentials")


@integration_router.get("/templates")
async def templates():
    return {
        "douyin_v5": IntegrationService(
            name="Douyin / TikTok",
            base_url="http://douyin-api:8000",
            endpoints=DOUYIN_ENDPOINTS,
            auth_check_endpoint="capabilities",
        ).model_dump(exclude={"api_key"})
    }


@integration_router.get("/services")
async def services():
    return await IntegrationBase.overview()


@integration_router.post("/services", status_code=201)
async def create_service(data: IntegrationService):
    return {"uid": await IntegrationBase.save(data)}


@integration_router.put("/services/{uid}")
async def update_service(uid: int, data: IntegrationService):
    await IntegrationBase.save(data, uid)
    await APIUtil.sync_service(uid)
    return {"uid": uid}


@integration_router.delete("/services/{uid}", status_code=204)
async def delete_service(uid: int):
    await IntegrationBase.delete(uid)


@integration_router.patch("/services/{uid}/enabled")
async def enable_service(uid: int, data: EnabledUpdate):
    await IntegrationBase.set_enabled(uid, data.enabled)
    await APIUtil.sync_service(uid)
    return {"enabled": data.enabled}


@integration_router.post("/services/{uid}/check")
async def check_service(uid: int):
    return await IntegrationBase.check(uid)


@integration_router.post("/services/{uid}/auth/reauthenticate")
async def reauthenticate_service(uid: int, credentials: IntegrationCredentials):
    await IntegrationBase.reauthenticate(uid, credentials)
    await APIUtil.sync_service(uid)
    return {
        "status": "Unknown",
        "detail": "Credentials replaced. Refresh to verify them.",
    }


@integration_router.post("/services/{uid}/auth/refresh")
async def refresh_credentials(uid: int):
    return await IntegrationBase.refresh_credentials(uid)


@integration_router.post("/services/{uid}/endpoints/{endpoint_key}/check")
async def check_endpoint(uid: int, endpoint_key: str):
    return await IntegrationBase.check(uid, endpoint_key)


@integration_router.post("/services/{uid}/endpoints/{endpoint_key}/request")
async def invoke_endpoint(uid: int, endpoint_key: str, request: IntegrationRequest):
    result = await IntegrationBase.invoke(uid, endpoint_key, request)
    status_code = (
        (result["upstream_status"] or 200)
        if result["success"]
        else (409 if result["error"] == "LOGIN_REQUIRED" else 503 if result["status"] == "Unavailable" else 502)
    )
    return JSONResponse(result, status_code=status_code)


@integration_router.get("/history")
async def history(
    range: Literal["1h", "24h", "7d"] = "24h",
    service_uid: int | None = None,
    source: Literal["all", "user", "health"] = "all",
    platform: str | None = None,
    provider: str | None = None,
):
    if service_uid is not None:
        await IntegrationBase.get(service_uid)
    return await IntegrationBase.history(range, service_uid, source, platform, provider)


class LoginRequest(BaseModel):
    replace_identity: UUID | None = None


@integration_router.get("/platforms/{platform}/accounts")
async def authenticated_accounts(platform: Literal["douyin", "tiktok"]):
    from services.dtk.identity import identities

    return await identities.accounts(platform)


@integration_router.delete("/platforms/{platform}/accounts/{identity_uid}", status_code=204)
async def remove_authenticated_account(platform: Literal["douyin", "tiktok"], identity_uid: UUID):
    from services.dtk.identity import identities

    found = await db.fetchval(
        "SELECT uid FROM dtk_identities WHERE uid = $1 AND platform = $2 AND authenticated AND state != 'retired'",
        identity_uid, platform,
    )
    if found is None:
        raise HTTPException(404, "Authenticated account not found")
    await identities.retire(identity_uid, "Account removed")


@integration_router.post("/platforms/{platform}/logins", status_code=201)
async def create_login(platform: Literal["douyin", "tiktok"], request: LoginRequest):
    from services.dtk.login import logins

    return await logins.create(platform, request.replace_identity)


@integration_router.get("/logins/{uid}")
async def login_status(uid: UUID):
    from services.dtk.login import logins

    await logins.cleanup()
    return JSONResponse(jsonable_encoder(await logins.status(uid)), headers={"Cache-Control": "no-store"})


@integration_router.get("/logins/{uid}/qr")
async def login_qr(uid: UUID):
    from services.dtk.login import logins

    return Response(await logins.image(uid), media_type="image/png", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@integration_router.delete("/logins/{uid}", status_code=204)
async def cancel_login(uid: UUID):
    from services.dtk.login import logins

    await logins.cancel(uid)


@integration_router.post("/logins/{uid}/renew", status_code=201)
async def renew_login(uid: UUID):
    from services.dtk.login import logins

    session = await logins.status(uid)
    if session["status"] == "confirmed":
        raise HTTPException(409, "This login is already complete")
    await logins.cancel(uid)
    return await logins.create(session["platform"])


@integration_router.post("/platforms/{platform}/accounts", status_code=201)
async def import_authenticated_account(platform: Literal["douyin", "tiktok"], session: AuthenticatedSessionImport):
    from services.dtk.identity import identities
    from services.base import ProviderError

    try:
        return await identities.import_authenticated(platform, session)
    except ValueError:
        raise HTTPException(422, "Check the browser session and include unexpired platform session cookies") from None
    except ProviderError as exc:
        raise HTTPException(409, exc.code) from None
    except Exception as exc:
        raise HTTPException(502, f"Session validation failed ({type(exc).__name__})") from None
