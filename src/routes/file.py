import asyncio
import aiofiles
import random

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from datetime import datetime
from typing import Literal

from base.database import DatabaseBase as db
from base.settings import SettingsBase
from base.logger import LoggerBase as lg
from utils.file import FileUtil, HlsUtil
from utils.delete import DeleteUtil
from utils.file_scan import FileScan
from models import TableFile
from models import SUPPORTED_SUFFIXES, PIC_SUFFIXES

file_router = APIRouter(prefix="/file", tags=["File"])


@file_router.get("/info/{uid}", response_model=TableFile)
async def get_file_info(uid: int):
    row = await db.fetchrow("SELECT * FROM files WHERE uid = $1", uid)
    if row is None:
        raise HTTPException(404, "File not found")
    return row


async def file_path(uid: int) -> Path:
    row = await db.fetchrow("SELECT path, exist FROM files WHERE uid = $1", uid)
    if row is None:
        raise HTTPException(404, "File not found")
    path = Path(row["path"])
    if not row["exist"] or not await asyncio.to_thread(path.is_file):
        await db.execute("UPDATE files SET exist = FALSE WHERE uid = $1", uid)
        raise HTTPException(404, "This file is missing from storage. Update the data path and scan again.")
    return path


@file_router.get("/type/{uid}", response_model=Literal["image", "video"])
async def get_file_type(uid: int):
    """
    Get the type of a file by its UID.
    """

    row = await db.fetchrow("SELECT path FROM files WHERE uid = $1", uid)
    if row is None:
        raise HTTPException(404, "File not found")
    path = Path(row["path"])
    if path.suffix in PIC_SUFFIXES:
        return "image"
    else:
        return "video"


@file_router.get("/download/{uid}", response_class=FileResponse)
async def download_file(uid: int):
    """
    Download a file by its UID.
    """
    path = await file_path(uid)
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
    path = await file_path(uid)

    if path.suffix in PIC_SUFFIXES:
        response.headers["Cache-Control"] = "public, max-age=31536000"
        response.headers["X-File-Type"] = "image"
        return FileResponse(path, filename=f"{uid}{path.suffix}")
    else:
        session = await HlsUtil.get(uid)
        return RedirectResponse(
            url=f"/api/file/hls/{session.session_id}/index.m3u8",
            headers={"Cache-Control": "no-store"},
        )


@file_router.get("/hls/{session_id}/{filename}", response_class=FileResponse)
async def get_hls_file(session_id: str, filename: str):
    session = next((s for s in HlsUtil._sessions if s.session_id == session_id), None)
    if not session:
        raise HTTPException(
            404, "HLS session not found.", headers={"Cache-Control": "no-store"}
        )
    session.touch()

    path = session.dir_path / filename
    for _ in range(8):
        if path.exists():
            return FileResponse(path, headers={"Cache-Control": "no-store"})
        if session.process.returncode is not None:
            raise HTTPException(
                500,
                "Unable to prepare this media file.",
                headers={"Cache-Control": "no-store"},
            )
        await asyncio.sleep(0.8)
    raise HTTPException(
        503,
        "Media is still being prepared. Retry shortly.",
        headers={"Cache-Control": "no-store", "Retry-After": "1"},
    )


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

    async with FileScan.storage_lock:
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
    if not await DeleteUtil._file(uid, protect_recent=False):
        raise HTTPException(409, "File is referenced, reserved by a task, or already removed")
