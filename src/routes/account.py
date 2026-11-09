import asyncio
from contextlib import aclosing

from pydantic import TypeAdapter
from fastapi import APIRouter, Query, Depends
from fastapi.responses import JSONResponse, StreamingResponse

from models import *
from base.health import HealthBase
from base.database import DatabaseBase as db
from utils.delete import DeleteUtil
from utils.queue import QueueUtil
from utils.queue.account import AccountUtil
from utils.sync import SyncUtil
from utils.ls import ListUtil
from services import APIUtil
from services.base import ProviderError

account_router = APIRouter(
    prefix="/account",
    tags=["Account"],
    dependencies=[Depends(HealthBase.all_check)],
)


def _account_provider_error_response(exc: ProviderError) -> JSONResponse:
    invalid_url = exc.code in ("INVALID_PARAM", "INVALID_URL")
    detail = exc.code
    if invalid_url:
        detail = (
            f"{exc.code}: Could not resolve the account request. "
            "Check that the link points to an account profile."
        )
    elif exc.code == "body.empty" or exc.code.startswith("BodyEmpty"):
        detail = (
            "The upstream platform returned an empty response. "
            "Account data could not be retrieved; this does not mean the account "
            "has no posts. Check API Health for the upstream request status."
        )
    elif exc.code == "LOGIN_REQUIRED":
        detail = "Account posts require an available authenticated account. Add an account or re-login in API Health."
    return JSONResponse(
        status_code=400 if invalid_url else 409 if exc.code == "LOGIN_REQUIRED" else 503 if exc.status == "Unavailable" else 502,
        content={
            "code": exc.code,
            "detail": detail,
        },
    )


@account_router.post("/avatar/preview", response_model=int | None)
async def preview_account_avatar(url: str):
    from utils.file_scan import FileScan

    async with FileScan.storage_lock, asyncio.timeout(300):
        profile = await APIUtil.get_profile(url)
        if profile.avatar is None:
            return None
        profile.cover = None
        downloaded = await AccountUtil._download_profile(profile)
        if downloaded.avatar is None:
            raise ValueError("Unable to download the account avatar. Please retry.")
        return downloaded.avatar


@account_router.get("/check", response_model=ApiUrlCheck)
async def check_account(url: str = Query(description="The url of the account.")):
    """Return passed, exists, or error without fetching details."""
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
    return await SyncUtil.enqueue(data)


@account_router.get("/sync/details")
async def get_sync_details(uid: int):
    return await SyncUtil.details(uid)


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
    await SyncUtil.configure(data)


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
    try:
        return await APIUtil.get_profile(url)
    except ProviderError as exc:
        return _account_provider_error_response(exc)


@account_router.get("/posts/url", response_class=StreamingResponse)
async def get_posts_by_url(url: str = Query(description="The url of the account.")):
    """
    Return the posts of the account. From url.
    """
    ADAPTER = TypeAdapter(list[DetailsPost[UrlsFile]])
    posts = APIUtil.get_post_list(url)
    # Resolve the URL and fetch the first page before committing HTTP 200.
    try:
        first_batch = await anext(posts, None)
    except ProviderError as exc:
        return _account_provider_error_response(exc)

    async def progress_stream():
        async with aclosing(posts):
            if first_batch is not None:
                yield ADAPTER.dump_json(first_batch) + b"\n"
            async for resp in posts:
                yield ADAPTER.dump_json(resp) + b"\n"

    return StreamingResponse(progress_stream(), media_type="application/json")


@account_router.get("/creator_uid", response_model=int)
async def get_creator_uid(uid: int):
    return await db.fetchval("SELECT creator_uid FROM accounts WHERE uid = $1;", uid)
