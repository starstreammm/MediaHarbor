from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from models import DatabaseConfig, ApiSettingsUpdate, TableSettings, ApiInitStatus
from base.health import HealthBase
from base.database import DatabaseBase as db
from base.downloader import DownloaderBase
from base.logger import LoggerBase as lg
from base.settings import SettingsBase
from base.queue import QueueBase
from utils.delete import DeleteUtil
from apis import APIUtil
from base.statistic import StatisticBase

init_router = APIRouter(prefix="/init", tags=["Init"])


@init_router.post("/database", response_model=None)
async def init_database(data: DatabaseConfig):
    """
    Initialize the database connection.
    """
    await db.init(data)
    HealthBase.sta.database = True
    await SettingsBase.init()


@init_router.post(
    "/settings",
    response_model=TableSettings,
    dependencies=[Depends(HealthBase.db_check)],
)
async def init_settings(new: ApiSettingsUpdate):
    """
    Update settings. Currently only support updating cookie_douyin.
    """
    await SettingsBase.update(new)
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
    HealthBase.sta.logger = True
    lg.info("Database initialized.")
    lg.info(f"Settings initialized.")
    lg.debug(f"Settings: {SettingsBase._data.model_dump()}")


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
    HealthBase.sta.aria2 = True


@init_router.post("/api", dependencies=[Depends(HealthBase.db_st_check)])
async def init_api(which: ApiInitStatus):
    """
    Initialize the API.
    """

    async def progress_stream():
        async for resp in APIUtil.init(which):
            yield resp.model_dump_json().encode("utf-8") + b"\n"

    return StreamingResponse(progress_stream(), media_type="application/x-ndjson")


@init_router.get(
    "/base", response_model=None, dependencies=[Depends(HealthBase.db_st_check)]
)
async def init_base_service():
    """
    Initialize the base service.
    """
    await StatisticBase.init()
    lg.info("Statistic initialized.")
    HealthBase.sta.statistic = True
    await DeleteUtil.init()
    HealthBase.sta.delete = True
    await QueueBase.init()
    HealthBase.sta.queue = True
    lg.info("API initialized successfully.")
