from typing import Annotated, Literal, Union, Optional
from pydantic import BaseModel, Field
from pathlib import Path
from datetime import datetime, timezone

from models.enum import QueueJobType, Status
from models.api import (
    ApiCreatorCreate,
    ApiAccountCreate,
    ApiAccountParse,
    ApiPostCreate,
    ApiAccountSync,
    ApiPostParse,
)
from models.table import TableBase


# Queue Job Data Structure
class QueueCreatorCreate(ApiCreatorCreate):
    type: Literal[QueueJobType.creator_add] = QueueJobType.creator_add


class QueueAccountCreate(ApiAccountCreate):
    type: Literal[QueueJobType.account_add] = QueueJobType.account_add


class QueueAccountParse(ApiAccountParse):
    type: Literal[QueueJobType.account_parse] = QueueJobType.account_parse


class QueueAccountSync(ApiAccountSync):
    type: Literal[QueueJobType.account_sync] = QueueJobType.account_sync


class QueuePostCreate(ApiPostCreate):
    type: Literal[QueueJobType.post_add] = QueueJobType.post_add


class QueuePostParse(ApiPostParse):
    type: Literal[QueueJobType.post_parse] = QueueJobType.post_parse


class QueueCollectionUpdate(BaseModel):
    uid: int
    add: list[ApiPostCreate | ApiPostParse] = []
    type: Literal[QueueJobType.collection_update] = QueueJobType.collection_update


QueueTaskType = Annotated[
    Union[
        QueueCreatorCreate,
        QueueAccountCreate,
        QueueAccountParse,
        QueueAccountSync,
        QueuePostCreate,
        QueuePostParse,
        QueueCollectionUpdate,
    ],
    Field(discriminator="type"),
]


# Queue Item Data Structure
class QueueItemBase(BaseModel):
    msg: str = ""


class QueueDetailFile(QueueItemBase):
    index: int = Field(ge=1)
    path: Path
    gid: Optional[str]
    type: Literal["file"] = "file"


class QueueDetailPost(QueueItemBase):
    overview: str
    url: str
    files: list[QueueDetailFile]
    type: Literal["post"] = "post"


class QueueDetailAccount(QueueItemBase):
    alias: str
    url: str
    posts: list[QueueDetailPost]
    type: Literal["account"] = "account"


class QueueDetailCollection(QueueItemBase):
    alias: str
    posts: list[QueueDetailPost]
    type: Literal["collection"] = "collection"


class QueueDetailCreator(QueueItemBase):
    alias: str
    accounts: list[QueueDetailAccount]
    type: Literal["creator"] = "creator"


class QueueDetailError(QueueItemBase):
    progress: dict
    type: Literal["error"] = "error"


QueueItemDetail = Annotated[
    Union[
        QueueDetailCreator,
        QueueDetailAccount,
        QueueDetailPost,
        QueueDetailCollection,
        QueueDetailFile,
        QueueDetailError,
        None,
    ],
    Field(discriminator="type"),
]


class QueueInsert(BaseModel):
    alias: str
    job: QueueTaskType = Field(discriminator="type")
    scheduled: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TableQueue(TableBase, QueueInsert):
    """
    If detail is dict, it will automatically convert to the corresponding QueueItemDetail subclass according to the keys in the dict.
    Else it will be save as the original value.
    """

    create_time: datetime
    status: Status
    detail: Optional[QueueItemDetail]
