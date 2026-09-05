from typing import TypeVar
from datetime import datetime, timezone
from pydantic import BaseModel
from pathlib import Path

VERSION = "0.0.1-rc1"

T = TypeVar("T", bound=BaseModel)

CACHE_PATH = Path(__file__).parent.parent.parent / "cache"
CACHE_PATH.mkdir(parents=True, exist_ok=True)

UPTIME = datetime.now(timezone.utc)

PIC_SUFFIXES = [".jpg", ".jpeg", ".png", ".webp"]

VIDEO_SUFFIXES = [".mp4"]

SUPPORTED_SUFFIXES = PIC_SUFFIXES + VIDEO_SUFFIXES
