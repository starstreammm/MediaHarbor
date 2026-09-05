from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Annotated, TypeVar, Generic
from pydantic import BaseModel, Field

from models.enum import Platform
from models.build_in import UrlsFile

TFile = TypeVar("TFile", int, UrlsFile)


class AccountFilter(BaseModel):
    time: Optional[
        Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$")]
    ] = None
    include: Optional[list[str]] = None
    exclude: Optional[list[str]] = None


class DetailsCollection(BaseModel):
    alias: str
    notes: str = ""
    posts: list[int]


class DetailsPost(BaseModel, Generic[TFile]):
    platform: Optional[Platform] = None
    account_pid: Optional[str] = None
    pid: Optional[str] = None
    url: Optional[str] = None
    overview: str
    post_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    files: list[TFile]


class DetailsAccount(BaseModel, Generic[TFile]):
    platform: Optional[Platform] = None
    pid: Optional[str] = None
    url: Optional[str] = None
    alias: str
    overview: str
    avatar: TFile | None = None
    cover: TFile | None = None
    age: Optional[int] = None
    gender: Optional[bool] = None  # true male; false female
    ip: Optional[str] = None
    address: Optional[str] = None
    school: Optional[str] = None


class DetailsFile(BaseModel):
    path: Path
    size_kb: int
    hash: str
    usage: int


class DetailsCreator(BaseModel):
    alias: str
    overview: str
    rate: int = Field(..., ge=0, le=5)


class ApiHealthStatus(BaseModel):
    """
    None: not initialized; false: unhealthy; true healthy.
    """

    douyin: Optional[bool] = None
    bilibili: Optional[bool] = None
    xhs: Optional[bool] = None
    x: Optional[bool] = None
    ins: Optional[bool] = None
    youtube: Optional[bool] = None


class ModelHealthStatus(BaseModel):
    database: bool = False
    settings: bool = False
    logger: bool = False
    statistic: bool = False
    aria2: bool = False
    delete: bool = False
    queue: bool = False
