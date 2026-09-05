from pydantic import BaseModel
from pathlib import Path
from typing import Optional

from models.enum import Status


class DatabaseConfig(BaseModel):
    """
    Database configuration model.
    This model is used to store the database connection details for the application.
    It includes the host, port, user, password, and database name.
    """

    host: str
    port: int
    user: str
    password: str
    database: str


class UrlsFile(BaseModel):
    """
    A model to represent a file with a list of URLs.
    """

    urls: list[str]
    suffix: str  # The suffix of the file, e.g., ".jpg", ".mp4", etc.


class DownloadFile(BaseModel):
    path: Path
    urls: list[str]
    headers: list[str]


class DownloadStatus(BaseModel):
    path: Path
    status: Status
    speed: str = "N/A"
    progress: float = 0.0
    total: str = "N/A"
    completed: str = "N/A"
    eta: str = "N/A"
    msg: Optional[str] = None
