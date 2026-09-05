from fastapi import APIRouter, Query, Depends

from models import *
from base.database import DatabaseBase as db
from base.health import HealthBase
from utils.ls import ListUtil
from utils.delete import DeleteUtil
from utils.queue import QueueUtil

creator_router = APIRouter(
    prefix="/creator",
    tags=["Creator"],
    dependencies=[
        Depends(HealthBase.all_check),
    ],
)


@creator_router.post("/ls", response_model=ApiList[TableCreator])
async def get_creator_list(cursor: CursorBase):
    return await ListUtil.creator(cursor)


@creator_router.post("/create", response_model=int)
async def create_creator(data: ApiCreatorCreate):
    """
    Create a new creator. Return the uid of the task in queue.
    """
    return await QueueUtil.insert(
        QueueInsert(
            alias=f"Creator Create: {data.alias}",
            job=QueueCreatorCreate.model_validate(data.model_dump()),
        )
    )


@creator_router.post("/delete", response_model=None)
async def delete_creator(data: ApiExeBase):
    await DeleteUtil.insert(Layer.creator, data.uid)


@creator_router.post("/update", response_model=None)
async def update_creator(
    data: DetailsCreator,
    uid: int = Query(description="The uid of the creator to update."),
):
    await db.execute(
        """
                UPDATE creators
                SET alias = $1, overview = $2, rate = $3
                WHERE uid = $4
            """,
        data.alias,
        data.overview,
        data.rate,
        uid,
    )


@creator_router.get("/details", response_model=TableCreator)
async def get_creator_details(
    uid: int = Query(description="The uid of the creator to get details."),
):
    return TableCreator.model_validate(
        await db.fetchrow(
            """
            SELECT *
            FROM creators
            WHERE uid = $1
            """,
            uid,
        )
    )


@creator_router.get("/accounts", response_model=list[TableAccount])
async def get_accounts_belongs_to(
    uid: int = Query(description="The uid of the creator to get accounts belongs to."),
):
    return await ListUtil.account(uid)


@creator_router.post("/posts", response_model=ApiList[TablePost])
async def get_creator_posts(
    cursor: CursorBase,
    accounts: str = Query(
        description="The uids of the accounts belongs to the creator."
    ),
):
    """
    Return the posts of the creator.
    """
    accounts_uid = [uid for uid in accounts.split(",")]

    return await ListUtil.post(
        cursor, extra=f"account_uid IN ({','.join(accounts_uid)})"
    )
