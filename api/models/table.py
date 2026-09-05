from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Literal
from pydantic import BaseModel, Field

from models.data import (
    AccountFilter,
    DetailsAccount,
    DetailsCollection,
    DetailsCreator,
    DetailsFile,
    DetailsPost,
)


class TableBase(BaseModel):
    uid: int


class TableFile(TableBase, DetailsFile):
    pass


class TableCreator(TableBase, DetailsCreator):
    avatar: int | None = None
    cover: int | None = None
    create_time: datetime


class TableAccount(TableBase, DetailsAccount[int]):
    creator_uid: int
    filter: Optional[AccountFilter] = None
    latest_update: Optional[datetime] = None
    sync_task: Optional[int] = None
    sync_status: bool
    create_time: datetime


class TablePost(TableBase, DetailsPost[int]):
    uid: int = -1
    rate: int = Field(0, ge=0, le=5)
    account_uid: Optional[int]
    create_time: datetime
    sync_status: bool


class TableCollection(TableBase, DetailsCollection):
    create_time: datetime


class TableProfileHistory(TableBase):
    key: str
    value: str
    last_seen: datetime


class TableStatistics(BaseModel):
    post_len_douyin: int = 0
    post_len_bilibili: int = 0
    post_len_xhs: int = 0
    post_len_x: int = 0
    post_len_ins: int = 0
    post_len_youtube: int = 0
    file_len_video: int = 0
    file_len_photo: int = 0
    file_size_video: int = 0
    file_size_photo: int = 0
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TableSettings(BaseModel):
    data_path: Path = Path("/data")
    aria2_path: Path = Path("/data")
    aria2_host: str = "http://aria2"
    aria2_port: int = 6800
    aria2_secret: str = "mediaharbor"
    cookie_douyin: str = ""
    cookie_douyin_date: datetime = datetime.fromtimestamp(0, timezone.utc)
    cookie_bilibili: str = ""
    cookie_bilibili_date: datetime = datetime.fromtimestamp(0, timezone.utc)
    cookie_xhs: str = ""
    cookie_xhs_date: datetime = datetime.fromtimestamp(0, timezone.utc)
    cookie_x: str = ""
    cookie_x_date: datetime = datetime.fromtimestamp(0, timezone.utc)
    cookie_ins: str = ""
    cookie_ins_date: datetime = datetime.fromtimestamp(0, timezone.utc)
    cookie_youtube: str = ""
    cookie_youtube_date: datetime = datetime.fromtimestamp(0, timezone.utc)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
