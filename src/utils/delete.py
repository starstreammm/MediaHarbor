import asyncio

from models import Layer, TablePost
from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from base.statistic import StatisticBase as sta


class DeleteUtil:
    _sem_task = asyncio.Semaphore(3)
    _sem_thread = asyncio.Semaphore(6)
    _queue: asyncio.Queue[tuple[Layer | None, int | None]] = asyncio.Queue()
    _task = None

    @classmethod
    async def init(cls):
        if cls._task is None:
            cls._task = asyncio.create_task(cls._cron())
        lg.info("DeleteUtil initialized.")

    @classmethod
    async def insert(cls, type: Layer, uid: int):
        await cls._queue.put((type, uid))
        lg.info(f"DeleteUtil: Delete {type}: {uid}.")

    @classmethod
    async def close(cls):
        if cls._task:
            await cls._queue.put((None, None))
            await cls._queue.join()
        lg.info("DeleteUtil closed.")

    @classmethod
    async def _cron(cls):
        while True:
            await cls._sem_task.acquire()

            type, uid = await cls._queue.get()
            if type is None or uid is None:
                cls._sem_task.release()
                cls._queue.task_done()
                break
            else:
                asyncio.create_task(cls._worker(type, uid))

    @classmethod
    async def _worker(cls, type: Layer, uid: int):
        try:
            if type == Layer.creator:
                await cls._creator(uid)
            elif type == Layer.account:
                await cls._account(uid)
            elif type == Layer.post:
                await cls._post(uid)
            elif type == Layer.collection:
                await cls._collection(uid)
            else:
                raise Exception(f"DeleteUtil: Invalid delete type: {type}")
        except Exception as e:
            lg.error(f"DeleteUtil: Failed to delete {type} {uid}: {e}")
        finally:
            cls._queue.task_done()
            cls._sem_task.release()

    @classmethod
    async def _creator(cls, uid: int):
        await db.execute(
            """
                DELETE FROM creators
                WHERE uid = $1
            """,
            uid,
        )

        rows = await db.fetch(
            """
                SELECT uid
                FROM accounts
                WHERE creator_uid = $1
            """,
            uid,
        )

        if not rows:
            return

        accouts = [r["uid"] for r in rows]

        results = await asyncio.gather(
            *[cls._account(a) for a in accouts],
            return_exceptions=True,
        )

        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            raise Exception("; ".join(str(e) for e in errors))

    @classmethod
    async def _account(cls, uid: int):
        """
        Delete an exist account and the posts related to the account.
        """
        await db.execute(
            """
                DELETE FROM accounts
                WHERE uid = $1
            """,
            uid,
        )

        rows = await db.fetch(
            """
                SELECT uid
                FROM posts
                WHERE account_uid = $1
            """,
            uid,
        )

        if not rows:
            return

        posts = [r["uid"] for r in rows]

        results = await asyncio.gather(
            *[cls._post(p) for p in posts],
            return_exceptions=True,
        )

        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            raise Exception("; ".join(str(e) for e in errors))

    @classmethod
    async def _post(cls, uid: int):
        row = await db.fetchrow("SELECT * FROM posts WHERE uid = $1;", uid)
        if not row:
            raise Exception(f"Post not found. uid: {uid}")
        org = TablePost.model_validate(row)

        await db.execute("DELETE FROM posts WHERE uid = $1;", uid)
        sta.update_post(org.platform, True)

        results = await asyncio.gather(
            *[cls._file(f) for f in org.files],  # type: ignore
            return_exceptions=True,
        )

        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            raise Exception("; ".join(str(e) for e in errors))

    @classmethod
    async def _file(cls, uid: int, *, protect_recent: bool = True):
        """
        Delete a file from the files table and delete the file from the disk.
        """
        from utils.file_scan import FileScan

        return await FileScan.remove_unused(uid, protect_recent=protect_recent)

    @classmethod
    async def _collection(cls, uid: int):
        await db.execute(
            f"""
                DELETE FROM collections
                WHERE uid = $1;
            """,
            uid,
        )
