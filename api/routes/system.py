from asyncio import CancelledError, wait_for
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, FileResponse
from datetime import datetime
from pathlib import Path

from base.database import DatabaseBase as db
from base.logger import SSEManager
from base.settings import SettingsBase
from base.health import HealthBase
from models import (
    CACHE_PATH,
    TableSettings,
    DatabaseConfig,
    ApiSettingsUpdate,
)

system_router = APIRouter(prefix="/system", tags=["System"])


@system_router.get(
    "/settings",
    response_model=TableSettings,
    dependencies=[Depends(HealthBase.db_check)],
)
async def get_settings():
    """
    Get settings.
    """
    return SettingsBase._data


@system_router.post(
    "/settings",
    response_model=TableSettings,
    dependencies=[Depends(HealthBase.db_check)],
)
async def init_settings(new: ApiSettingsUpdate):
    """
    Update settings. Currently only support updating cookie_douyin.
    """
    await SettingsBase.update(new)
    return SettingsBase._data


@system_router.get("/database", response_model=DatabaseConfig)
async def get_database_config():
    """
    Get database config.
    """
    return db._config


@system_router.get("/lsdir", response_model=list[str])
async def ls_dir(path: str):
    """
    Get the list of files and directories in the path. Return a list of file and directory names.
    """
    p = Path(path)
    if not p.exists():
        raise Exception("Path does not exist.")
    if not p.is_dir():
        raise Exception("Path is not a directory.")

    return sorted([f.name for f in p.iterdir() if f.is_dir()])


@system_router.get("/mkdir", response_model=None)
async def mkdir(path: str):
    """
    Create a directory at the specified path. Return None.
    """
    p = Path(path)
    p.mkdir()


@system_router.get("/logs")
async def get_logs():
    """
    Get the recent logs. Return a list of log entries.
    """

    def format_sse(message: str) -> str:
        return "".join(f"data: {line}\n" for line in message.splitlines()) + "\n"

    async def event_generator():
        SSEManager.subscribe()
        try:
            for log_entry in SSEManager.recents:
                yield format_sse(log_entry)
            while True:
                assert SSEManager.queue is not None
                try:
                    log_entry = await wait_for(SSEManager.queue.get(), timeout=13)
                    yield format_sse(log_entry)
                except TimeoutError:
                    yield ": ping\n\n"
        except CancelledError:
            raise
        finally:
            SSEManager.unsubscribe()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@system_router.get("/logs/download")
async def download_logs(date: str | None = None):
    """
    Download the log file. Return the log file.
    """

    log_file = CACHE_PATH / "logs" / f"api.log{'.' if date else ''}{date or ""}"
    if not log_file.exists():
        raise Exception(f"Log file does not exist: {log_file.name}")

    return FileResponse(
        path=log_file,
        filename=log_file.name,
        media_type="text/plain",
    )


@system_router.get("/logs/list", response_model=list[str])
async def list_logs():
    """
    List all log files. Return a list of log file names.
    """
    log_dir = CACHE_PATH / "logs"
    if not log_dir.exists():
        raise Exception("Log directory does not exist.")

    files = sorted(
        [
            f.name.removeprefix("api.log.")
            for f in log_dir.iterdir()
            if f.is_file() and f.name != "api.log"
        ],
        reverse=True,
    )
    return [f"{datetime.now().strftime('%Y-%m-%d')} (today)"] + files
