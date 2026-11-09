from typing import Generic, Optional, Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator
from pathlib import Path

from models.build_in import UrlsFile
from models.cursor import CursorBase
from models.enum import Platform
from models.data import AccountFilter, DetailsAccount, DetailsCreator, DetailsPost
from models.const import T, VERSION
import utils.machine as machine


class ApiUrlCheck(BaseModel):
    status: Literal["passed", "exists", "error"]
    message: str
    platform: Platform | None = None
    pid: str | None = None


class ApiExeBase(BaseModel):
    uid: int


class ApiList(CursorBase, Generic[T]):
    data: list[T]


class ApiDeviceStatistics(BaseModel):
    os: str = machine.get_os_string()
    cpu: str = machine.get_cpu_string()
    memory: str = machine.get_memory_string()
    queue_running: int
    queue_pending: int
    queue_error: int
    queue_success: int
    uptime: str
    version: str = VERSION


class ApiAccountUpdate(ApiExeBase):
    sync: bool
    filter: Optional[AccountFilter] = None


class ApiAccountCreate(BaseModel):
    url: str
    creator_uid: int
    sync: bool
    filter: Optional[AccountFilter] = None


class ApiAccountInsert(DetailsAccount[int]):
    creator_uid: int


class ApiAccountParse(DetailsAccount[UrlsFile]):
    creator_uid: int
    sync: bool
    filter: Optional[AccountFilter] = None
    posts: list[DetailsPost[UrlsFile]]
    posts_scanned_at: AwareDatetime | None = None


class ApiAccountSync(ApiExeBase):
    complete: bool = False


class ApiCreatorCreate(DetailsCreator):
    avatar: int | None = None
    cover: int | None = None
    accounts: list[ApiAccountInsert | ApiAccountCreate | ApiAccountParse]


class ApiPostCreate(BaseModel):
    url: str
    rate: int = Field(0, ge=0, le=5)


class ApiPostParse(DetailsPost[UrlsFile]):
    rate: int = Field(0, ge=0, le=5)
    account_uid: Optional[int] = None


class ApiPostInsert(DetailsPost[int]):
    rate: int = Field(0, ge=0, le=5)
    account_uid: Optional[int]


class ApiPostUpdate(ApiExeBase):
    rate: int = Field(0, ge=0, le=5)


class ApiCollectionCreate(BaseModel):
    alias: str
    notes: str = ""
    posts: list[int] = []


class ApiCollectionUpdate(ApiExeBase):
    alias: Optional[str] = None
    notes: Optional[str] = None
    delete: list[int] = []
    exclude: list[int] = []
    add: list[int | ApiPostCreate | ApiPostParse] = []


class ApiInitStatus(BaseModel):
    model_config = ConfigDict(extra="allow")
    __pydantic_extra__: dict[str, str | None] = Field(init=False)

    # None for not initialized
    # "" for initializing
    # "true" for success
    # "false" for success but cookie expired
    # Other string for error message
    douyin: Optional[str] = None
    tiktok: Optional[str] = None
    bilibili: Optional[str] = None
    xhs: Optional[str] = None
    x: Optional[str] = None
    ins: Optional[str] = None
    youtube: Optional[str] = None


class ApiSettingsUpdate(BaseModel):
    file_scan_cron: str | None = None

    @field_validator("file_scan_cron")
    @classmethod
    def validate_scan_cron(cls, value):
        from utils.cron import parse_cron

        if value:
            parse_cron(value)
        return value

    data_path: Optional[Path] = None
    aria2_path: Optional[Path] = None
    aria2_host: Optional[str] = None
    aria2_port: Optional[int] = None
    aria2_secret: Optional[str] = None
    cookie_douyin: Optional[str] = None
    cookie_tiktok: Optional[str] = None
    cookie_bilibili: Optional[str] = None
    cookie_xhs: Optional[str] = None
    cookie_x: Optional[str] = None
    cookie_ins: Optional[str] = None
    cookie_youtube: Optional[str] = None
    log_level: Optional[Literal["DEBUG", "INFO", "WARNING", "ERROR"]] = None
