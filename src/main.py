import traceback
import logging
import uvicorn

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import asynccontextmanager

from routes import *
from routes.init import *

from base.settings import SettingsBase
from base.database import DatabaseBase as db
from base.queue import QueueBase as qe
from base.logger import LoggerBase as lg
from base.statistic import StatisticBase as sta
from base.integration import IntegrationBase
from models import VERSION
from utils.delete import DeleteUtil


class IgnoreHealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()

        if "/health" in msg and "GET" in msg:
            return False

        return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Keep diagnostics available before the user starts the Logger setup step.
    lg.init()
    logger = logging.getLogger("uvicorn.access")
    logger.addFilter(IgnoreHealthFilter())
    try:
        await restore_startup()
    except Exception:
        lg.exception(
            "Automatic startup stopped. Continue setup to retry the unfinished step."
        )
    # logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    yield
    lg.info("Shutting down MediaHarbor...")
    from utils.file_scan import FileScan

    await FileScan.close()
    await IntegrationBase.close()
    await qe.close()
    from services import APIUtil

    await APIUtil.close()
    try:
        from services.dtk.identity import identities
    except ImportError:
        lg.warning("Guest identity dependencies were unavailable during shutdown")
    else:
        await identities.close()
    await DeleteUtil.close()
    if HealthBase.sta.statistic:
        await sta.close()
    lg.info("Statistic closed.")
    if HealthBase.sta.database:
        await SettingsBase.close()
    lg.info("Settings closed.")
    await db.close()
    lg.info("Database closed.")


app = FastAPI(
    title="MediaHarbor API",
    version=VERSION,
    description="The backend API for MediaHarbor, a media management system.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Filename",
        "Content-Fullpath",
    ],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: Exception):
    path = request.url.path.removeprefix("/api")
    if (
        path.startswith("/integrations/") or path in ("/init/api", "/init/settings")
    ) and isinstance(exc, RequestValidationError):
        # Integration configuration can contain API keys; never echo or log input values.
        detail = "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        )
        return JSONResponse(
            status_code=422, content={"code": "VALIDATION_ERROR", "detail": detail}
        )
    try:
        lg.exception(f"Validation Error: {exc}")
    except Exception:
        traceback.print_exc()
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "detail": str(exc),
        },
    )


@app.exception_handler(Exception)
async def all_exception_handler(request: Request, exc: Exception):
    try:
        lg.exception(exc)
    except Exception:
        traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "detail": str(exc),
        },
    )


app.include_router(health_router)
app.include_router(init_router)
app.include_router(creator_router)
app.include_router(account_router)
app.include_router(post_router)
app.include_router(collection_router)
app.include_router(file_router)
app.include_router(queue_router)
app.include_router(system_router)
app.include_router(statistics_router)
app.include_router(integration_router)


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=38888,
        loop="asyncio",
        log_level="info",
        root_path="/api",
    )
