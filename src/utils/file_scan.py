import asyncio
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, field_validator

from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from base.settings import SettingsBase
from base.statistic import StatisticBase
from models import VIDEO_SUFFIXES
from utils.cron import cron_matches


class ScanRequest(BaseModel):
    data_path: Path | None = None
    aria2_path: Path | None = None

    @field_validator("data_path", "aria2_path")
    @classmethod
    def absolute_path(cls, value):
        if value is not None and not value.is_absolute():
            raise ValueError("Storage paths must be absolute")
        return value


class FileScan:
    task: asyncio.Task | None = None
    scheduler: asyncio.Task | None = None
    progress: dict = {"status": "idle", "step": 0}
    # Serializes path changes with uploads and profile preview downloads.
    storage_lock = asyncio.Lock()

    @classmethod
    def start(cls, request: ScanRequest) -> dict:
        if cls.task is not None and not cls.task.done():
            raise HTTPException(409, "A file scan is already running")
        cls.progress = {
            "id": uuid4().hex, "status": "running", "step": 0,
            "processed": 0, "total": 0, "missing": 0, "remapped": 0,
            "deleted": 0, "protected": 0, "errors": [],
        }
        cls.task = asyncio.create_task(cls.run(request))
        return cls.progress.copy()

    @classmethod
    async def run(cls, request: ScanRequest):
        try:
            async with cls.storage_lock, db._api.acquire() as con:
                # Also prevents another backend process from scanning concurrently.
                async with con.transaction():
                    await con.execute("SELECT pg_advisory_xact_lock(72481, 20)")
                    await con.execute("LOCK TABLE accounts, creators, posts, queue, files IN SHARE ROW EXCLUSIVE MODE")
                    if await con.fetchval("SELECT EXISTS(SELECT 1 FROM queue WHERE status = 'running')"):
                        raise ValueError("Wait for running tasks to finish before scanning files")
                    from base.downloader import DownloaderBase

                    if DownloaderBase._client is not None:
                        active = await asyncio.to_thread(DownloaderBase._client.tell_active)
                        waiting = await asyncio.to_thread(DownloaderBase._client.tell_waiting, 0, 1)
                        if active or waiting:
                            raise ValueError("Wait for aria2 downloads to finish before scanning files")
                    old = SettingsBase._data
                    old_roots = (old.data_path, old.data_path.resolve())
                    new = old.model_copy(update=request.model_dump(exclude_none=True))
                    if not await asyncio.to_thread(new.data_path.is_dir):
                        raise ValueError("The data path must be an existing directory visible to MediaHarbor")
                    await con.execute("""
                        WITH counts AS MATERIALIZED (
                            SELECT uid, COUNT(*) AS usage FROM file_references GROUP BY uid
                        )
                        UPDATE files f SET usage = COALESCE((SELECT usage FROM counts WHERE uid = f.uid), 0)
                    """)
                    rows = await con.fetch("SELECT * FROM files ORDER BY uid")
                    cls.progress.update(step=1, total=len(rows), processed=0)
                    for row in rows:
                        path = Path(row["path"])
                        if old.data_path != new.data_path:
                            for root in old_roots:
                                if path.is_relative_to(root):
                                    path = new.data_path / path.relative_to(root)
                                    cls.progress["remapped"] += 1
                                    break
                        exists = await asyncio.to_thread(path.is_file)
                        await con.execute("UPDATE files SET path = $2, exist = $3 WHERE uid = $1", row["uid"], str(path), exists)
                        cls.progress["missing"] += int(not exists)
                        cls.progress["processed"] += 1
                    for name in ("data_path", "aria2_path"):
                        await con.execute(
                            "INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value",
                            name, str(getattr(new, name)),
                        )
                SettingsBase._data = SettingsBase._data.model_copy(update=request.model_dump(exclude_none=True))
                cls.progress.update(step=2, processed=0)
                for row in rows:
                    if row["usage"] > 0:
                        cls.progress["processed"] += 1
                        continue
                    try:
                        removed = await cls.remove_unused(row["uid"])
                        cls.progress["deleted"] += int(removed)
                        cls.progress["protected"] += int(not removed and row["usage"] == 0)
                    except OSError as exc:
                        cls.progress["errors"].append(f"File {row['uid']}: {exc}")
                    cls.progress["processed"] += 1
            cls.progress.update(status="completed", step=3)
        except asyncio.CancelledError:
            cls.progress.update(status="error", error="Scan interrupted by shutdown")
            raise
        except Exception as exc:
            lg.exception("File scan failed")
            cls.progress.update(status="error", error=str(exc))

    @staticmethod
    async def remove_unused(uid: int, *, protect_recent: bool = True) -> bool:
        async with db._api.acquire() as con, con.transaction():
            # Reference writers and queue submissions cannot race the final check/unlink.
            await con.execute("LOCK TABLE accounts, creators, posts, queue, files IN SHARE ROW EXCLUSIVE MODE")
            row = await con.fetchrow("SELECT * FROM files WHERE uid = $1", uid)
            if row is None or await con.fetchval("SELECT EXISTS(SELECT 1 FROM file_references WHERE uid = $1)", uid):
                return False
            if await con.fetchval("SELECT EXISTS(SELECT 1 FROM queue WHERE status = 'running')"):
                return False
            jobs = await con.fetch("SELECT job FROM queue WHERE status <> 'success'")
            if any(uid in queued_file_ids(job["job"]) for job in jobs):
                return False
            if protect_recent and (datetime.now(timezone.utc) - row["touched_at"]).total_seconds() < 86400:
                return False
            path = Path(row["path"])
            # Unlink only managed entries inside the configured storage root.
            root = SettingsBase._data.data_path.resolve()
            if not path.resolve().is_relative_to(root) or path.is_symlink():
                raise OSError("Refusing to remove a file outside the data path or a symbolic link")
            if await con.fetchval("SELECT EXISTS(SELECT 1 FROM files WHERE path = $1 AND uid <> $2)", str(path), uid):
                raise OSError("Multiple file records use this path")
            await asyncio.to_thread(path.unlink, missing_ok=True)
            await con.execute("DELETE FROM files WHERE uid = $1", uid)
        StatisticBase.update_file(path.suffix in VIDEO_SUFFIXES, row["size_kb"] // 1024, True)
        return True

    @classmethod
    def init(cls):
        if cls.scheduler is None or cls.scheduler.done():
            cls.scheduler = asyncio.create_task(cls.schedule())

    @classmethod
    async def schedule(cls):
        last_minute = None
        while True:
            now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
            expression = SettingsBase._data.file_scan_cron
            if expression and now != last_minute:
                last_minute = now
                try:
                    if cron_matches(expression, now) and (cls.task is None or cls.task.done()):
                        cls.start(ScanRequest())
                except Exception:
                    lg.exception("Scheduled file scan failed")
            await asyncio.sleep(15)

    @classmethod
    async def close(cls):
        if cls.scheduler is not None:
            cls.scheduler.cancel()
            with suppress(asyncio.CancelledError):
                await cls.scheduler
        # Let filesystem operations finish while their database locks are held.
        if cls.task is not None:
            await cls.task


def queued_file_ids(value) -> set[int]:
    ids = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ("avatar", "cover") and isinstance(item, int):
                ids.add(item)
            elif key == "files" and isinstance(item, list):
                ids.update(file for file in item if isinstance(file, int))
            if isinstance(item, (dict, list)):
                ids.update(queued_file_ids(item))
    elif isinstance(value, list):
        for item in value:
            ids.update(queued_file_ids(item))
    return ids
