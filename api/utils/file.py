import hashlib
import asyncio
import shlex
import shutil
import uuid

from pathlib import Path
from models import CACHE_PATH, VIDEO_SUFFIXES
from base.logger import LoggerBase as lg
from base.database import DatabaseBase as db
from base.statistic import StatisticBase as sta

HLS_PATH = CACHE_PATH / "tmp_hls"
shutil.rmtree(HLS_PATH, ignore_errors=True)
TIMEOUT = 888  # seconds


class FileUtil:
    @staticmethod
    async def insert_table(path: Path, reuse: bool = True) -> int:
        """
        Calculate the SHA256 hash and insert a file into the files table and return the uid of the file.
        """

        def calc_hash():
            sha256 = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(8 * 1024), b""):
                    sha256.update(chunk)
            return sha256.hexdigest()

        hash = await asyncio.to_thread(calc_hash)

        result = await db.fetchrow(
            f"""
                INSERT INTO files
                (path, size_kb, hash, usage)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (hash, size_kb)
                DO UPDATE SET usage = files.usage{" + 1" if reuse else ""}
                RETURNING uid, (xmax = 0) AS inserted;
            """,
            str(path.resolve()),
            path.stat().st_size // 1024,
            hash,
            1,
        )
        if not result:
            raise Exception("FileUtil: Failed to insert file into database.")

        if not result["inserted"]:
            try:
                lg.debug(f"FileUtil: File already exists. UID: {result['uid']}")
                path.unlink(missing_ok=True)
            except Exception as e:
                lg.debug(f"FileUtil: Failed to delete repeated file: {e}")
        else:
            sta.update_file(
                path.suffix in VIDEO_SUFFIXES,
                path.stat().st_size // (1024 * 1024),
                False,
            )
            lg.debug(
                f"FileUtil: Inserted file. UID: {result['uid']}, Path: {path}, Hash: {hash}, Size: {path.stat().st_size // 1024} KB."
            )
        return result["uid"]


class HlsUtil:
    _sessions: list[HlsUtil] = []

    def __init__(self, uid: int):
        self.uid = uid
        self.session_id = uuid.uuid4().hex
        self.dir_path = HLS_PATH / self.session_id
        self.index_path = HLS_PATH / self.session_id / "index.m3u8"
        self.dir_path.mkdir(parents=True, exist_ok=True)

        self.video_path: Path
        self.process: asyncio.subprocess.Process
        self.clean: asyncio.Task

    @classmethod
    async def get(cls, uid: int, path: Path | None = None) -> HlsUtil:
        # Check if the session already exists
        for session in cls._sessions:
            if session.uid == uid:
                return session

        if path is None:
            # Fetch the video path from the database
            row = await db.fetchval(
                """
                    SELECT path
                    FROM files
                    WHERE uid = $1
                """,
                uid,
            )
            if not row:
                raise Exception(f"HlsUtil: No video found for uid {uid}.")
            path = Path(row)

        self = HlsUtil(uid)
        self.video_path = path
        self.process = await asyncio.create_subprocess_exec(
            *self._command(),
            stderr=asyncio.subprocess.PIPE,
        )
        self.clean = asyncio.create_task(self._cleanup())

        lg.debug(f"HlsUtil: Created new HLS session for {uid}:{self.session_id}.")
        cls._sessions.append(self)
        return self

    def touch(self):
        self.clean.cancel()
        self.clean = asyncio.create_task(self._cleanup())

    def _command(self) -> list[str]:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(self.video_path.resolve()),
            "-codec",
            "copy",
            "-hls_time",
            "6",  # 6 seconds each segment
            "-hls_list_size",
            "0",  # keep the latest 5 segments in the m3u8 file
            "-hls_allow_cache",
            "1",
            str(self.index_path.resolve()),
        ]
        lg.debug(f"HlsUtil: CMD: {' '.join(shlex.quote(arg) for arg in cmd)}")

        return cmd

    async def _cleanup(self):
        try:
            await asyncio.sleep(TIMEOUT)
            shutil.rmtree(self.dir_path, ignore_errors=True)
            self._sessions.remove(self)
        except asyncio.CancelledError:
            return
        except Exception as e:
            lg.error(f"HlsUtil: Cleanup: {e}")
