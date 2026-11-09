import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from base.database import DatabaseBase as db
from models import ApiAccountSync, ApiAccountUpdate, QueueAccountSync
from utils.predict import PredictUtil


class SyncUtil:
    """Durable schedules and renewable ownership of account discovery jobs."""

    @staticmethod
    async def configure(data: ApiAccountUpdate):
        async with db._api.acquire() as con, con.transaction():
            account = await con.fetchrow(
                "SELECT * FROM accounts WHERE uid = $1 FOR UPDATE", data.uid
            )
            if account is None:
                raise HTTPException(404, "Account not found")
            if data.sync and (not account["platform"] or not account["pid"]):
                raise HTTPException(400, "This account has no platform identity")
            # Pending automatic work can be cancelled. A running discovery may finish,
            # but finish() reads the current preference before setting another due time.
            if not data.sync and account["sync_task"]:
                cancelled = await con.fetchval(
                    """
                    DELETE FROM queue WHERE uid = $1 AND status = 'pending'
                        AND COALESCE((job->>'automatic')::boolean, TRUE)
                    RETURNING uid
                    """,
                    account["sync_task"],
                )
                if cancelled:
                    await con.execute(
                        "UPDATE accounts SET sync_task = NULL WHERE uid = $1", data.uid
                    )
            await con.execute(
                """
                UPDATE accounts SET sync_enabled = $2, filter = $3,
                    sync_next_at = CASE WHEN $2 THEN COALESCE(sync_next_at, NOW()) END
                WHERE uid = $1
                """,
                data.uid,
                data.sync,
                data.filter.model_dump() if data.filter else {},
            )

    @classmethod
    async def enqueue(cls, data: ApiAccountSync, automatic: bool = False) -> int | None:
        async with db._api.acquire() as con, con.transaction():
            account = await con.fetchrow(
                "SELECT * FROM accounts WHERE uid = $1 FOR UPDATE", data.uid
            )
            if account is None:
                if automatic:
                    return None
                raise HTTPException(404, "Account not found")
            if not account["platform"] or not account["pid"]:
                raise HTTPException(400, "This account has no platform identity")
            now = datetime.now(timezone.utc)
            if automatic and (
                not account["sync_enabled"]
                or (account["sync_next_at"] and account["sync_next_at"] > now)
            ):
                return None
            job = await con.fetchrow(
                "SELECT * FROM queue WHERE uid = $1 FOR UPDATE", account["sync_task"]
            )
            if job and job["status"] == "pending":
                if not automatic:
                    await con.execute(
                        """
                        UPDATE queue SET scheduled = NOW(), job = job || $2::jsonb
                        WHERE uid = $1
                        """,
                        job["uid"],
                        {"automatic": False, "complete": data.complete or job["job"].get("complete", False)},
                    )
                return job["uid"]
            if job and job["status"] == "running":
                lease = account["sync_lease_until"]
                if lease is None and job["job"].get("claimed_at"):
                    lease = datetime.fromisoformat(job["job"]["claimed_at"]) + timedelta(minutes=2)
                if lease and lease > now:
                    # Discovery always covers the full listing, including manual full sync.
                    return job["uid"]
                await con.execute(
                    """
                    UPDATE queue SET status = 'error', detail = $2 WHERE uid = $1
                    """,
                    job["uid"],
                    {"type": "error", "msg": "Sync worker lease expired; discovery will be retried.", "progress": {}},
                )
            task = QueueAccountSync(uid=data.uid, complete=data.complete, automatic=automatic)
            uid = await con.fetchval(
                """
                INSERT INTO queue (alias, job, scheduled) VALUES ($1, $2, NOW())
                RETURNING uid
                """,
                f"Sync account {data.uid}",
                task.model_dump(mode="json"),
            )
            await con.execute(
                """
                UPDATE accounts SET sync_task = $2, sync_lease_until = NULL
                WHERE uid = $1
                """,
                data.uid,
                uid,
            )
            return uid

    @classmethod
    async def dispatch_due(cls):
        await db.execute(
            """
            WITH expired AS (
                UPDATE queue SET status = 'error', detail = jsonb_build_object(
                    'type', 'error', 'msg', 'Download worker lease expired.',
                    'progress', COALESCE(detail, '{}'::jsonb))
                WHERE status = 'running' AND job->>'type' = 'post_parse'
                    AND COALESCE((job->>'heartbeat_at')::timestamptz,
                        (job->>'claimed_at')::timestamptz, create_time)
                        < NOW() - INTERVAL '2 minutes'
                RETURNING job->>'account_uid' AS account_uid
            )
            UPDATE accounts SET sync_next_at = LEAST(sync_next_at, NOW() + INTERVAL '13 minutes')
            WHERE sync_enabled AND uid::text IN (SELECT account_uid FROM expired)
            """
        )
        rows = []
        # Keep both lookups on the indexed column. Null schedules are due now
        # and retain priority; dated schedules use the index's ascending order.
        for due_condition in ("IS NULL", "<= NOW()"):
            rows.extend(
                await db.fetch(
                    f"""
                    SELECT a.uid FROM accounts a LEFT JOIN queue q ON q.uid = a.sync_task
                    WHERE a.sync_enabled AND a.sync_next_at {due_condition}
                        AND a.platform IS NOT NULL AND a.pid IS NOT NULL
                        AND (q.uid IS NULL OR q.status NOT IN ('pending', 'running')
                            OR (q.status = 'running'
                                AND COALESCE(a.sync_lease_until,
                                    (q.job->>'claimed_at')::timestamptz + INTERVAL '2 minutes',
                                    '-infinity') <= NOW()))
                    ORDER BY a.sync_next_at LIMIT $1
                    """,
                    20 - len(rows),
                ) or []
            )
            if len(rows) == 20:
                break
        for row in rows:
            await cls.enqueue(ApiAccountSync(uid=row["uid"]), automatic=True)

    @staticmethod
    async def claim(uid: int, task_uid: int, automatic: bool) -> bool:
        async with db._api.acquire() as con, con.transaction():
            account = await con.fetchrow(
                "SELECT * FROM accounts WHERE uid = $1 FOR UPDATE", uid
            )
            if account is None:
                return False
            if automatic and not account["sync_enabled"]:
                await con.execute(
                    "UPDATE accounts SET sync_task = NULL WHERE uid = $1 AND sync_task = $2",
                    uid, task_uid,
                )
                return False
            if account["sync_task"] not in (None, task_uid):
                return False
            await con.execute(
                """
                UPDATE accounts SET sync_task = $2,
                    sync_lease_until = NOW() + INTERVAL '2 minutes'
                WHERE uid = $1
                """,
                uid, task_uid,
            )
            return True

    @staticmethod
    async def heartbeat(uid: int, task_uid: int, worker: asyncio.Task):
        try:
            while True:
                await asyncio.sleep(30)
                owned = await db.fetchval(
                    """
                    UPDATE accounts SET sync_lease_until = NOW() + INTERVAL '2 minutes'
                    WHERE uid = $1 AND sync_task = $2 RETURNING uid
                    """,
                    uid, task_uid,
                )
                if owned is None:
                    worker.cancel()
                    return
        except asyncio.CancelledError:
            raise
        except Exception:
            # Do not continue upstream work after ownership can no longer be renewed.
            worker.cancel()
            raise

    @staticmethod
    async def download_heartbeat(task_uid: int, worker: asyncio.Task):
        try:
            while True:
                owned = await db.fetchval(
                    """
                    UPDATE queue SET job = job || jsonb_build_object('heartbeat_at', NOW())
                    WHERE uid = $1 AND status = 'running' RETURNING uid
                    """,
                    task_uid,
                )
                if owned is None:
                    worker.cancel()
                    return
                await asyncio.sleep(30)
        except asyncio.CancelledError:
            raise
        except Exception:
            worker.cancel()
            raise

    @staticmethod
    async def finish(uid: int, task_uid: int):
        owned = await db.fetchval(
            """
            UPDATE accounts SET sync_task = NULL, sync_lease_until = NULL,
                sync_failures = 0, sync_error = NULL,
                sync_next_at = CASE WHEN sync_enabled THEN LEAST(NOW() + INTERVAL '30 days', GREATEST(
                    (sync_prediction->>'next_check_at')::timestamptz,
                    NOW() + INTERVAL '13 minutes')) END
            WHERE uid = $1 AND sync_task = $2 AND sync_lease_until > NOW()
            RETURNING uid
            """,
            uid, task_uid,
        )
        if owned is None:
            raise ValueError("Account discovery ownership expired")

    @staticmethod
    async def fail(uid: int, task_uid: int, error: Exception):
        await db.execute(
            """
            UPDATE accounts SET sync_task = NULL, sync_lease_until = NULL,
                sync_failures = sync_failures + 1, sync_error = $3,
                sync_next_at = CASE WHEN sync_enabled THEN
                    NOW() + LEAST(INTERVAL '6 hours',
                        INTERVAL '13 minutes' * POWER(2, LEAST(sync_failures, 5))) END
            WHERE uid = $1 AND sync_task = $2
            """,
            uid, task_uid, f"{type(error).__name__}: {error}"[:1000],
        )

    @staticmethod
    async def details(uid: int) -> dict:
        row = await db.fetchrow(
            """
            SELECT a.uid, a.sync_enabled AS enabled, a.sync_checked_at AS checked_at,
                a.sync_next_at AS next_check_at, a.sync_failures AS failures,
                a.sync_error AS error,
                COALESCE(q.status IN ('pending', 'running'), FALSE) AS sync_active,
                (SELECT COUNT(*) FROM account_post_observations WHERE account_uid = a.uid) AS observed_posts,
                (SELECT MAX(published_at) FROM account_post_observations WHERE account_uid = a.uid) AS latest_post_at
            FROM accounts a LEFT JOIN queue q ON q.uid = a.sync_task WHERE a.uid = $1
            """,
            uid,
        )
        if row is None:
            raise HTTPException(404, "Account not found")
        # Rebuild the display from stored observations without advancing confirmed
        # silence or changing the durable schedule when the dialog is viewed.
        row["prediction"] = await PredictUtil.forecast(uid)
        row["downloads"] = await db.fetch(
            """
            SELECT status, COUNT(*) AS count FROM queue
            WHERE job->>'type' = 'post_parse' AND job->>'account_uid' = $1
            GROUP BY status
            """,
            str(uid),
        ) or []
        return row
