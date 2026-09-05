import asyncio

from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from models import *
from utils.queue.creator import CreatorUtil
from utils.queue.account import AccountUtil
from utils.queue.post import PostUtil
from utils.queue.collection import CollectionUtil


class QueueBase:
    _task = None
    _gate = asyncio.Event()
    _cond = asyncio.Condition()
    _active = 0

    @classmethod
    async def init(cls):
        cls._gate.set()
        if not cls._task:
            cls._task = asyncio.create_task(cls._cron())
            lg.info("Queue initialized.")

    @classmethod
    async def close(cls):
        if cls._task:
            cls._task.cancel()
            try:
                await cls._task
            except Exception as e:
                lg.exception(f"Queue: Error occurred while closing: {e}")
            else:
                lg.info("Queue closed.")

    @classmethod
    async def _done(cls):
        if cls._active <= 0:
            raise Exception("DeleteUtil: Raise task done too many times.")
        async with cls._cond:
            cls._active -= 1
            lg.debug(f"Queue: Task done. Active tasks: {cls._active}")
            cls._cond.notify_all()

    @staticmethod
    async def _update_detail(uid: int, detail: QueueItemDetail):
        await db.execute(
            f"""
                UPDATE queue
                SET detail = $1
                WHERE uid = $2;
            """,
            detail.model_dump(mode="json") if detail else None,
            uid,
        )

    @classmethod
    async def _get_job(cls) -> TableQueue | None:
        row = await db.fetchrow(
            """
            UPDATE queue
            SET status = $1
            WHERE uid = (
                SELECT uid
                FROM queue
                WHERE status = $2
                  AND scheduled <= NOW()
                ORDER BY scheduled ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING *;
            """,
            Status.running,
            Status.pending,
        )

        if not row:
            return None

        job = TableQueue.model_validate(row)
        lg.debug(f"Queue: Job fetched: {job.model_dump(mode='json')}")
        return job

    @classmethod
    async def _worker(cls, job: TableQueue):
        detail: QueueItemDetail | None = None
        try:
            if job.job.type == QueueJobType.creator_add:
                async for d in CreatorUtil.create(job.job):
                    detail = d
                    await cls._update_detail(job.uid, d)

            elif (
                job.job.type == QueueJobType.account_add
                or job.job.type == QueueJobType.account_parse
            ):
                async for d in AccountUtil.create(job.job):
                    if not isinstance(d, int):
                        detail = d
                        await cls._update_detail(job.uid, d)

            elif job.job.type == QueueJobType.account_sync:
                async for d in AccountUtil.sync(job.job, job.uid):
                    detail = d
                    await cls._update_detail(job.uid, d)

            elif job.job.type == QueueJobType.post_add:
                async for d in PostUtil.create(job.job):
                    if not isinstance(d, int):
                        detail = d
                        await cls._update_detail(job.uid, d)

            elif job.job.type == QueueJobType.collection_update:
                async for d in CollectionUtil.add_posts(job.job):
                    detail = d
                    await cls._update_detail(job.uid, d)

        except Exception as e:
            lg.exception(f"Queue: {job.alias} {job.uid} failed:\n{e}")
            await cls._update_detail(
                job.uid,
                QueueDetailError(
                    msg=str(e),
                    progress=detail.model_dump() if detail else {},
                ),
            )
            await db.execute(
                """
                UPDATE queue
                SET status = $1
                WHERE uid = $2;
                """,
                Status.error,
                job.uid,
            )
        else:
            lg.info(f"Queue: {job.alias} {job.uid} done.")
            await db.execute(
                """
                UPDATE queue
                SET status = $1
                WHERE uid = $2;
                """,
                Status.success,
                job.uid,
            )
        finally:
            await cls._done()

    @classmethod
    async def _cron_job(cls) -> bool:
        try:
            job = await cls._get_job()

            if job:
                async with cls._cond:
                    cls._active += 1
                    cls._cond.notify_all()

                lg.info(f"Queue: {job.alias} {job.uid} started.")
                asyncio.create_task(cls._worker(job))
                return True

            else:
                return False

        except Exception as e:
            lg.exception(f"Queue: Cron job failed:\n{e}")
            return False

    @classmethod
    async def _cron(cls):
        try:
            while True:
                # Wait for the gate to be opened
                await cls._gate.wait()
                async with cls._cond:
                    await cls._cond.wait_for(lambda: cls._active < 3)

                # Execute the cron job
                executed = await asyncio.shield(cls._cron_job())

                if not executed:
                    await asyncio.sleep(3)

        except asyncio.CancelledError:
            async with cls._cond:
                await cls._cond.wait_for(lambda: cls._active == 0)
