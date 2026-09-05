from pydantic import TypeAdapter
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse

from models import *
from base.health import HealthBase
from base.database import DatabaseBase as db
from utils.delete import DeleteUtil
from utils.queue import QueueUtil
from utils.queue.account import AccountUtil
from utils.ls import ListUtil
from apis import APIUtil

account_router = APIRouter(
    prefix="/account",
    tags=["Account"],
    dependencies=[Depends(HealthBase.all_check)],
)


@account_router.post("/check", response_model=tuple[str, tuple[Platform, str] | None])
async def check_account(url: str = Query(description="The url of the account.")):
    """
    Check if the account is valid, the platform is initialized and account is exists.
    Return the platform if valid, otherwise return None.
    """
    return await APIUtil.check_account_url(url)


@account_router.post("/create", response_model=int)
async def create_account(data: ApiAccountCreate):
    """
    Create a new account. Return the uid of the task in queue.
    """

    return await QueueUtil.insert(
        QueueInsert(
            alias=f"Create Account",
            job=QueueAccountCreate.model_validate(data.model_dump()),
        )
    )


@account_router.post("/parse", response_model=int)
async def parse_account(data: ApiAccountParse):
    """
    Parse a new account with posts. Return the uid of the task in queue.
    """
    return await QueueUtil.insert(
        QueueInsert(
            alias=f"Parse {data.platform} Account",
            job=QueueAccountParse.model_validate(data.model_dump()),
        )
    )


@account_router.post("/insert", response_model=int)
async def insert_account(
    data: ApiAccountInsert,
):
    """
    Insert a new account manually. Return the uid of the account.
    """
    async for d in AccountUtil.create(data):
        if isinstance(d, int):
            return d

    raise Exception("Failed to insert account.")


@account_router.post("/sync", response_model=int)
async def sync_account(data: ApiAccountSync):
    """
    Start sync task of an exist account. Return the uid of task in queue.
    """
    return await QueueUtil.insert(
        QueueInsert(
            alias=f"Sync Account {data.uid}",
            job=QueueAccountSync.model_validate(data.model_dump()),
        )
    )


@account_router.post("/delete", response_model=None)
async def delete_account(data: ApiExeBase):
    """
    Delete an exist account.
    """
    await DeleteUtil.insert(Layer.account, data.uid)


@account_router.post("/update", response_model=None)
async def update_account(data: ApiAccountUpdate):
    """
    Update the sync and filter settings of a n exist account.
    """
    sync_task = None
    if data.sync:
        org = await db.fetchval(
            "SELECT sync_task FROM accounts WHERE uid = $1",
            data.uid,
        )

        if not org:
            sync_task = await AccountUtil.insert_sync_task(data.uid)
        else:
            sync_task = org

    await db.execute(
        """
                UPDATE accounts
                SET sync_task = $1, filter = $2
                WHERE uid = $3
            """,
        sync_task,
        data.filter.model_dump() if data.filter else {},
        data.uid,
    )


@account_router.get("/history", response_model=list[TableProfileHistory])
async def get_account_history(uid: int = Query(description="The uid of the account.")):
    """
    Return the profile history of the account.
    """
    rows = await db.fetch(
        """
            SELECT *
            FROM profile_history
            WHERE uid = $1
            ORDER BY last_seen DESC
        """,
        uid,
    )
    if not rows:
        return []
    return [TableProfileHistory.model_validate(row) for row in rows]


@account_router.post("/posts", response_model=ApiList[TablePost])
async def get_account_posts(
    cursor: CursorBase,
    uid: int = Query(description="The uid of the account."),
):
    """
    Return the posts of the account.
    """
    return await ListUtil.post(cursor, extra=f"account_uid = {uid}")


@account_router.get("/profile/uid", response_model=TableAccount)
async def get_profile(uid: int = Query(description="The uid of the account.")):
    """
    Return the profile of the account. From uid.
    """
    row = await db.fetchrow(
        """
            SELECT *
            FROM accounts
            WHERE uid = $1
        """,
        uid,
    )
    return TableAccount.model_validate(row)


@account_router.get("/profile/url", response_model=DetailsAccount)
async def get_profile_by_url(url: str = Query(description="The url of the account.")):
    """
    Return the profile of the account. From url.
    """
    return await APIUtil.get_profile(url)


@account_router.get("/posts/url", response_class=StreamingResponse)
async def get_posts_by_url(url: str = Query(description="The url of the account.")):
    """
    Return the posts of the account. From url.
    """
    ADAPTER = TypeAdapter(list[DetailsPost[UrlsFile]])

    async def progress_stream():
        async for resp in APIUtil.get_post_list(url):
            yield ADAPTER.dump_json(resp) + b"\n"

    return StreamingResponse(progress_stream(), media_type="application/json")


@account_router.get("/creator_uid", response_model=int)
async def get_creator_uid(uid: int):
    return await db.fetchval("SELECT creator_uid FROM accounts WHERE uid = $1;", uid)
