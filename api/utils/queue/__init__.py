from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from models import (
    QueueInsert,
    TableQueue,
    Status,
)


class QueueUtil:
    @staticmethod
    async def insert(job: QueueInsert) -> int:
        """
        Insert a new job into the queue and return the uid of the job.
        """
        uid = await db.fetchval(
            f"""
                INSERT INTO queue (alias, job, scheduled)
                VALUES ($1, $2, $3)
                RETURNING uid;
            """,
            job.alias,
            job.job.model_dump(mode="json"),
            job.scheduled,
        )
        lg.info(f"QueueUtil: Inserted {job.job.type} job.")
        lg.debug(f"QueueUtil: Inserted job details: {job.model_dump(mode='json')}")
        return uid

    @staticmethod
    async def get(uid: int) -> TableQueue:
        """
        Get a job in the queue by uid.
        """
        row = await db.fetchrow(
            f"""
                SELECT * FROM queue
                WHERE uid = $1;
            """,
            uid,
        )

        if not row:
            raise Exception(f"QueueUtil: No job found with uid {uid}.")

        return TableQueue.model_validate(row)

    @classmethod
    async def delete(cls, uid: int) -> int:
        """
        Delete a job in the queue by uid.
        """
        org = await cls.get(uid)
        if org.status == Status.running:
            raise Exception("Cannot delete a running job.")
        else:
            await db.execute(
                f"""
                    DELETE FROM queue
                    WHERE uid = $1;
                """,
                uid,
            )
            lg.info(f"QueueUtil: Deleted job. UID: {uid}.")
            return uid

    @staticmethod
    async def update_status(uid: int, status: Status):
        """
        Update the status of a job in the queue.
        """
        await db.execute(
            f"""
                UPDATE queue
                SET status = $1
                WHERE uid = $2;
            """,
            status,
            uid,
        )
