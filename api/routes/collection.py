from fastapi import APIRouter, Depends, Query

from models import *
from base.database import DatabaseBase as db
from base.health import HealthBase
from utils.queue.collection import CollectionUtil
from utils.ls import ListUtil
from utils.delete import DeleteUtil

collection_router = APIRouter(
    prefix="/collection",
    tags=["Collection"],
    dependencies=[Depends(HealthBase.all_check)],
)


@collection_router.post("/ls", response_model=ApiList[TableCollection])
async def get_collection_list(cursor: CursorBase):
    return await ListUtil.collection(cursor)


@collection_router.get("/single", response_model=TableCollection)
async def get_collection_single(uid: int = Query(..., description="Collection UID")):
    row = await db.fetchrow(
        f"""
            SELECT * FROM collections
            WHERE uid = $1;
        """,
        uid,
    )
    if not row:
        raise Exception(f"Collection UID {uid} not found.")
    return TableCollection.model_validate(row)


@collection_router.post("/create", response_model=int)
async def create_collection(data: ApiCollectionCreate):
    uid = await db.fetchval(
        f"""
            INSERT INTO collections (alias, notes, posts)
            VALUES ($1, $2, $3)
            RETURNING uid;
        """,
        data.alias,
        data.notes,
        data.posts,
    )
    return uid


@collection_router.post("/delete", response_model=None)
async def delete_collection(data: ApiExeBase):
    await DeleteUtil.insert(Layer.collection, data.uid)


@collection_router.post("/update", response_model=None | int)
async def update_collection(data: ApiCollectionUpdate):
    return await CollectionUtil.update(data)
