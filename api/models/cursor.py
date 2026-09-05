from datetime import datetime
from typing import Optional, Annotated, Literal
from pydantic import BaseModel, Field

from models.enum import Platform
from models.data import AccountFilter


class CursorFilter(AccountFilter):
    """
    alias for the specific creator, include/exclude for the description.
    """

    alias: Optional[str] = None
    rate: Optional[Annotated[str, Field(pattern=r"^[0-5]-[0-5]$")]] = None
    platform: list[Platform] = []


class CursorBase(BaseModel):
    page: int = Field(1, ge=1)
    per_page: Literal[10, 20, 50, 100]
    last_cursor: Optional[str | int | Platform | datetime] = None
    last_uid: Optional[int] = None
    filter: Optional[CursorFilter] = None
    sort: Literal[
        "alias",
        "alias DESC",
        "post_time",
        "post_time DESC",
        "create_time",
        "create_time DESC",
        "rate",
        "rate DESC",
        "platform",
    ] = "create_time DESC"
