from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from models import DatabaseConfig, ApiSettingsUpdate, TableSettings, ApiInitStatus
from base.health import HealthBase
from base.database import DatabaseBase as db
from base.downloader import DownloaderBase
from base.logger import LoggerBase as lg
from base.settings import SettingsBase
from base.startup import StartupBase
from base.queue import QueueBase
from utils.delete import DeleteUtil
from services import APIUtil
from base.statistic import StatisticBase
from base.integration import IntegrationBase

init_router = APIRouter(prefix="/init", tags=["Init"])


@init_router.post("/database", response_model=None)
async def init_database(data: DatabaseConfig):
    """
    Initialize the database connection.
    """
    await db.init(data)
    # Load configuration for the form without completing the Settings step.
    await SettingsBase.init()
    StartupBase.complete("database")
    HealthBase.sta.database = True
    try:
        from services.dtk.identity import identities
    except ImportError:
        lg.error(
            "Guest identity dependencies are unavailable; install the locked dependencies"
        )
    else:
        await identities.start()


@init_router.post(
    "/settings",
    response_model=TableSettings,
    dependencies=[Depends(HealthBase.db_check)],
)
async def init_settings(new: ApiSettingsUpdate):
    """
    Update general settings; platform credentials use the API initialization route.
    """
    await SettingsBase.update(new)
    StartupBase.complete("settings")
    HealthBase.sta.settings = True
    return SettingsBase._data


@init_router.get(
    "/logger",
    response_model=None,
    dependencies=[Depends(HealthBase.db_st_check)],
)
async def init_logger():
    """
    Initialize the logger.
    """
    lg.init(SettingsBase._data.log_level)
    StartupBase.complete("logger")
    HealthBase.sta.logger = True
    lg.info("Database initialized.")
    lg.info(f"Settings initialized.")
    lg.debug("Settings loaded.")


@init_router.get(
    "/downloader",
    response_model=None,
    dependencies=[Depends(HealthBase.db_st_check)],
)
async def init_downloader():
    """
    Initialize the downloader connection.
    """
    await DownloaderBase.init()
    StartupBase.complete("aria2")
    HealthBase.sta.aria2 = True


def require_api_database():
    if db._api is None:
        raise HTTPException(503, "Initialize the database before platform APIs")


@init_router.get("/api/catalog", dependencies=[Depends(require_api_database)])
async def api_catalog():
    return await APIUtil.catalog()


@init_router.post("/api", dependencies=[Depends(require_api_database)])
async def init_api(which: ApiInitStatus | None = None):
    """
    Initialize the API.
    """

    from services.catalog import PLATFORMS

    if (
        which is not None
        and set(which.model_dump(exclude_none=True)) - PLATFORMS.keys()
    ):
        raise HTTPException(
            422, "One or more requested platforms have no registered adapter"
        )

    async def progress_stream():
        async for resp in initialize_apis(which):
            yield resp.model_dump_json().encode("utf-8") + b"\n"

    return StreamingResponse(progress_stream(), media_type="application/x-ndjson")


async def initialize_apis(which: ApiInitStatus | None = None):
    HealthBase.sta.apis = False
    last = None
    async for progress in APIUtil.init(which):
        last = progress
        yield progress
    if last is not None and all(
        value in (None, "true", "false") for value in last.model_dump().values()
    ):
        StartupBase.complete("apis")
        HealthBase.sta.apis = True
        IntegrationBase.start()


@init_router.get(
    "/base", response_model=None, dependencies=[Depends(HealthBase.db_st_check)]
)
async def init_base_service():
    """
    Initialize the base service.
    """
    if not HealthBase.sta.statistic:
        await StatisticBase.init()
        lg.info("Statistic initialized.")
        HealthBase.sta.statistic = True
    if not HealthBase.sta.delete:
        await DeleteUtil.init()
        HealthBase.sta.delete = True
    if not HealthBase.sta.queue:
        await QueueBase.init()
        HealthBase.sta.queue = True
    from utils.file_scan import FileScan

    FileScan.init()
    StartupBase.complete("base")
    lg.info("API initialized successfully.")


async def restore_startup():
    StartupBase.load()
    completed = StartupBase.progress.completed.copy()
    if "database" not in completed:
        return
    await init_database(db._config)
    if "settings" not in completed:
        return
    await init_settings(ApiSettingsUpdate())
    if "logger" not in completed:
        return
    await init_logger()
    if "aria2" not in completed:
        return
    await init_downloader()
    if "apis" not in completed:
        return
    async for _ in initialize_apis():
        pass
    if not HealthBase.sta.apis:
        lg.error("API startup failed. Continue setup to retry.")
        return
    if "base" in completed:
        await init_base_service()
