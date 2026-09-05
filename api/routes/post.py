from fastapi import APIRouter, Depends

from models import *
from base.database import DatabaseBase as db
from base.health import HealthBase
from utils.ls import ListUtil
from utils.delete import DeleteUtil
from utils.queue import QueueUtil
from utils.queue.post import PostUtil
from apis import APIUtil

post_router = APIRouter(
    prefix="/post",
    tags=["Post"],
    dependencies=[Depends(HealthBase.all_check)],
)


@post_router.post("/ls", response_model=ApiList[TablePost])
async def get_post_list(cursor: CursorBase):
    return await ListUtil.post(cursor)


@post_router.get("/single", response_model=TablePost)
async def get_post_single(uid: int):
    post_info = await db.fetchrow(
        "SELECT * FROM posts WHERE uid = $1;",
        uid,
    )
    if post_info is None:
        raise Exception(f"Post uid {uid} not found.")
    else:
        return TablePost.model_validate(post_info)


@post_router.get("/check", response_model=tuple[str, tuple[Platform, str] | None])
async def check_post(url: str):
    """
    Check if the url post exists in the database.
    Return "true" if checked, other string if not checked or error.
    """
    return await APIUtil.check_post_url(url)


@post_router.post("/create", response_model=int)
async def create_post(data: ApiPostCreate):
    """
    Create a add_new_post task.
    Return the uid of the task in queue.
    """
    return await QueueUtil.insert(
        QueueInsert(
            alias=f"Post Create",
            job=QueuePostCreate.model_validate(data.model_dump()),
        )
    )


@post_router.post("/insert", response_model=int)
async def insert_post(data: ApiPostInsert):
    """
    Insert a new post manully. Return the uid of the post.
    """
    async for d in PostUtil.create(data):
        if isinstance(d, int):
            return d
    raise Exception("Api Post Insert: Failed to insert post.")


@post_router.post("/delete", response_model=None)
async def delete_post(data: ApiExeBase):
    await DeleteUtil.insert(Layer.post, data.uid)


@post_router.post("/update", response_model=None)
async def update_post(data: ApiPostUpdate):
    await db.execute(
        "UPDATE posts SET rate = $1 WHERE uid = $2;",
        data.rate,
        data.uid,
    )


@post_router.get("/creator/avatar_uid", response_model=None | TableCreator)
async def get_creator_avatar_uid(account_uid: int):
    """
    Get the avatar uid of the creator of the post.
    """
    creator_uid = await db.fetchval(
        "SELECT creator_uid FROM accounts WHERE uid = $1;",
        account_uid,
    )
    if creator_uid is None:
        return None

    creator_info = await db.fetchrow(
        "SELECT * FROM creators WHERE uid = $1;",
        creator_uid,
    )
    if creator_info is None:
        return None
    else:
        return TableCreator.model_validate(creator_info)


@post_router.get("/cover", response_model=None | int)
async def get_post_cover_uid(uid: int):
    """
    Get the cover uid of the post.
    """
    files = await db.fetchval(
        "SELECT files FROM posts WHERE uid = $1;",
        uid,
    )
    if not files:
        raise Exception("Post has no files.")

    for f in files:
        file_info = TableFile.model_validate(
            await db.fetchrow(
                "SELECT * FROM files WHERE uid = $1;",
                f,
            )
        )
        if file_info.path.suffix in PIC_SUFFIXES:
            return file_info.uid

    return None
