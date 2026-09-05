import asyncio
import aiofiles
import random

from fastapi import APIRouter, Query, Response, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from datetime import datetime
from typing import Literal

from base.database import DatabaseBase as db
from base.settings import SettingsBase
from base.logger import LoggerBase as lg
from utils.file import FileUtil, HlsUtil
from utils.delete import DeleteUtil
from models import SUPPORTED_SUFFIXES, PIC_SUFFIXES

file_router = APIRouter(prefix="/file", tags=["File"])


@file_router.get("/type/{uid}", response_model=Literal["image", "video"])
async def get_file_type(uid: int):
    """
    Get the type of a file by its UID.
    """

    path = Path(await db.fetchval("SELECT path FROM files WHERE uid = $1;", uid))
    if not path.is_file():
        raise Exception("APIs get_file: File not found.")
    if path.suffix in PIC_SUFFIXES:
        return "image"
    else:
        return "video"


@file_router.get("/download/{uid}", response_class=FileResponse)
async def download_file(uid: int):
    """
    Download a file by its UID.
    """
    path = Path(await db.fetchval("SELECT path FROM files WHERE uid = $1;", uid))
    if not path.is_file():
        raise Exception("APIs download_file: File not found.")
    return FileResponse(
        path,
        filename=path.name,
        headers={
            "Cache-Control": "no-store",
            "X-Content-Filename": path.name,
            "X-Content-Fullpath": str(path.resolve()),
        },
    )


@file_router.get("/{uid}", response_class=FileResponse)
async def get_file(response: Response, uid: int):
    path = Path(await db.fetchval("SELECT path FROM files WHERE uid = $1;", uid))
    if not path.is_file():
        raise Exception("APIs get_file: File not found.")

    if path.suffix in PIC_SUFFIXES:
        response.headers["Cache-Control"] = "public, max-age=31536000"
        response.headers["X-File-Type"] = "image"
        return FileResponse(path, filename=f"{uid}{path.suffix}")
    else:
        session = await HlsUtil.get(uid)
        return RedirectResponse(url=f"/api/file/hls/{session.session_id}/index.m3u8")


@file_router.get("/hls/{session_id}/{filename}", response_class=FileResponse)
async def get_hls_file(session_id: str, filename: str):
    session = next((s for s in HlsUtil._sessions if s.session_id == session_id), None)
    if not session:
        raise FileNotFoundError("APIs get_hls_file: Session not found.")
    session.touch()

    path = session.dir_path / filename
    for _ in range(8):
        if path.exists():
            return FileResponse(path)
        await asyncio.sleep(0.8)
    raise FileNotFoundError("APIs get_hls_file: File not found in session.")


@file_router.post("/upload", response_model=int)
async def upload_file(file: UploadFile = File(description="The file to upload.")):
    """
    Upload a file.
    Return the uid of the file in the files table.
    """
    if not file.filename:
        raise Exception("APIs upload_file: No file uploaded.")
    if not SettingsBase._data.data_path:
        raise Exception("APIs upload_file: cache_path is not set.")

    suffix = Path(file.filename).suffix
    if suffix not in SUPPORTED_SUFFIXES:
        raise Exception("APIs upload_file: Unsupported file type.")

    filename = f"{datetime.now().strftime(r'%Y%m%d_%H%M%S')}_{random.randint(1000, 9999)}{suffix}"
    path = SettingsBase._data.data_path / "uploads" / filename

    path.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)  # 1MB
            if not chunk:
                break
            await f.write(chunk)

    uid = await FileUtil.insert_table(path)
    lg.info(f"FileUtil: Uploaded file. UID: {uid}.")
    return uid


@file_router.post("/delete", response_model=None)
async def delete_file(uid: int = Query(description="The uid of the file to delete.")):
    await DeleteUtil._file(uid)
