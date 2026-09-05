from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone

from models import ApiDeviceStatistics, TableStatistics, UPTIME, CursorFilter, Layer
from base.statistic import StatisticBase as st
from base.database import DatabaseBase as db
from base.health import HealthBase
from utils.ls import ListUtil

statistics_router = APIRouter(
    prefix="/statistics",
    tags=["Statistics"],
    dependencies=[Depends(HealthBase.all_check)],
)


@statistics_router.get(
    "/device",
    response_model=ApiDeviceStatistics,
    description="Return the status of the device.",
)
async def get_device_statistics():
    """
    null for uninitialzed; false for unhealthy; true for healthy.
    """
    interval = datetime.now(timezone.utc) - UPTIME
    return ApiDeviceStatistics(
        uptime=f"{interval.days} d {interval.seconds // 3600} h {(interval.seconds // 60) % 60} m",
        queue_running=await db.fetchval(
            "SELECT COUNT(*) FROM queue WHERE status = 'running';"
        ),
        queue_pending=await db.fetchval(
            "SELECT COUNT(*) FROM queue WHERE status = 'pending';"
        ),
        queue_error=await db.fetchval(
            "SELECT COUNT(*) FROM queue WHERE status = 'error';"
        ),
        queue_success=await db.fetchval(
            "SELECT COUNT(*) FROM queue WHERE status = 'success';"
        ),
    )


@statistics_router.get(
    "/today",
    response_model=TableStatistics,
    description="Return the statistics data.",
)
async def get_statistics_data():
    """
    Return the statistics data.
    """
    st.today.date = datetime.now(timezone.utc)
    return st.today


@statistics_router.get(
    "/all",
    response_model=list[TableStatistics],
    description="Return all of the history statistics data.",
)
async def get_all_statistics_data():
    """
    Return all of the history statistics data.
    Exclude the data of today for frequenctly update.
    """
    rows = await db.fetch("SELECT * FROM statistics ORDER BY date DESC;")
    if not rows:
        return []
    sta = [TableStatistics.model_validate(r) for r in rows]

    return sta


@statistics_router.post(
    "/total_lines",
    response_model=int,
    description="",
)
async def get_total_lines(
    filter: CursorFilter,
    table: Layer = Query(),
    accounts: str = Query(default=""),
):
    """
    Return the total lines of the table with the filter.
    """
    accounts_uid = [uid for uid in accounts.split(",")]

    return await ListUtil.total_lines(
        table,
        filter,
        extra=(
            f"account_uid IN ({','.join(accounts_uid)})"
            if accounts and table == Layer.post
            else None
        ),
    )
