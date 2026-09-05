from fastapi import APIRouter, Depends

from base.database import DatabaseBase as db
from base.downloader import DownloaderBase as dl
from base.health import HealthBase
from utils.ls import ListUtil
from utils.queue import QueueUtil
from models import (
    Status,
    QueueInsert,
    TableQueue,
    CursorBase,
    ApiList,
    DownloadStatus,
)

queue_router = APIRouter(
    prefix="/queue",
    tags=["Queue"],
    dependencies=[Depends(HealthBase.all_check)],
)


@queue_router.post("/cursor", response_model=ApiList[TableQueue])
async def ls_queue_success(cursor: CursorBase, state: Status):
    return await ListUtil.queue(cursor)


@queue_router.post("/retry", response_model=int)
async def retry_queue(uid: int):
    """
    Retry a failed task in the queue. Return the uid of the new task.
    """
    row = await db.fetchrow(
        """
            SELECT * FROM queue
            WHERE uid = $1 AND status = 'error';
        """,
        uid,
    )
    if not row:
        raise Exception("Task not found or not failed.")

    task = TableQueue.model_validate(row)
    if task.status == Status.error:
        await db.execute("DELETE FROM queue WHERE uid = $1;", uid)
        task.alias = f"Retry {task.alias}"
        return await QueueUtil.insert(QueueInsert.model_validate(task))
    else:
        raise Exception("Task is not in error status.")


@queue_router.get("/download", response_model=DownloadStatus)
async def get_download_status(gid: str):
    """
    Get the download status of a file by its gid.
    Return the download status.
    """
    return await dl.status(gid)


@queue_router.get("/{state}", response_model=list[TableQueue])
async def ls_queue(state: Status):
    """
    Get the list of tasks in the queue. Return a paginated list of tasks.
    """
    rows = await db.fetch(
        """
            SELECT * FROM queue
            WHERE status = $1
            ORDER BY create_time DESC;
        """,
        state,
    )
    if not rows:
        return []
    return [TableQueue.model_validate(row) for row in rows]
