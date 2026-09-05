import traceback
import logging

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import asynccontextmanager

from routes import *
from routes.init import *

from base.health import HealthBase
from base.settings import SettingsBase
from base.database import DatabaseBase as db, CONFIG_PATH
from base.queue import QueueBase as qe
from base.logger import LoggerBase as lg
from base.statistic import StatisticBase as sta
from apis import APIUtil
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
    logger = logging.getLogger("uvicorn.access")
    logger.addFilter(IgnoreHealthFilter())
    if CONFIG_PATH.exists():
        try:
            # Database initialization
            await init_database(db._config)

            # Settings initialization
            HealthBase.sta.settings = True

            # Logger initialization
            await init_logger()

            # Downloader initialization
            await init_downloader()

            # API initialization
            async for res in APIUtil.init():
                pass

            # Base initialization
            await init_base_service()
        except Exception:
            lg.info(
                "Automatic initialization failed. Please check the configuration and try again."
            )
    # logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    yield
    lg.info("Shutting down MediaHarbor...")
    await qe.close()
    await DeleteUtil.close()
    await sta.close()
    lg.info("Statistic closed.")
    await SettingsBase.close()
    lg.info("Settings closed.")
    await db.close()
    lg.info("Database closed.")


app = FastAPI(
    title="MediaHarbor API",
    version=VERSION,
    description="The backend API for MediaHarbor, a media management system.",
    lifespan=lifespan,
    root_path="/api",
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
