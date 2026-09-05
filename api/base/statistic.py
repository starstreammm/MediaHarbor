import asyncio

from datetime import datetime, timedelta

from models import TableStatistics, Platform
from base.database import DatabaseBase as db


class StatisticBase:
    today: TableStatistics = TableStatistics()
    _cron = None

    @classmethod
    async def init(cls):
        row = await db.fetchrow(
            """
                SELECT * FROM statistics
                ORDER BY date DESC
                LIMIT 1;
            """,
        )
        if row:
            today = datetime.now().astimezone()
            last = TableStatistics.model_validate(row)
            if last.date.strftime(r"%Y-%m-%d") == today.strftime(r"%Y-%m-%d"):
                cls.today = last
                await db.execute(
                    "DELETE FROM statistics WHERE date = $1;",
                    last.date.strftime(r"%Y-%m-%d"),
                )

        cls._cron = asyncio.create_task(cls._daily_update())

    @classmethod
    async def close(cls):
        if cls._cron:
            cls._cron.cancel()
        await cls._save(datetime.now().astimezone())

    @classmethod
    async def _daily_update(cls):
        """
        Update the statistics data daily. This function should be called by a scheduler.
        """
        while True:
            now = datetime.now().astimezone()
            target = now.replace(hour=23, minute=59, second=56, microsecond=0)

            if now >= target:
                target += timedelta(days=1)
                target = target.replace(hour=23, minute=59, second=56, microsecond=0)

            await asyncio.sleep((target - now).total_seconds())

            await cls._save(target)

    @classmethod
    async def _save(cls, time: datetime):
        time_str = time.strftime(r"%Y-%m-%d")

        row = await db.fetchrow(
            """
                SELECT * FROM statistics
                ORDER BY date DESC
                LIMIT 1;
            """,
        )
        if row and row["date"] == time_str:
            await db.execute("DELETE FROM statistics WHERE date = $1;", time_str)

        data = cls.today.model_dump()
        data["date"] = time_str
        await db.execute(
            f"""
                INSERT INTO statistics
                ({', '.join(data.keys())})
                VALUES ({', '.join(['$' + str(i+1) for i in range(len(data))])});
            """,
            *data.values(),
        )

    @classmethod
    def update_file(cls, is_video: bool, size: int, is_delete: bool):
        """
        Update the statistics based on the provided parameters.
        excute: True for adding a post, False for deleting a post.
        file_type: True for video, False for photo.
        """
        E = -1 if is_delete else 1

        if is_video:
            cls.today.file_len_video += E
            cls.today.file_size_video += size * E
        else:
            cls.today.file_len_photo += E
            cls.today.file_size_photo += size * E

        cls.today.date = datetime.now().astimezone()

    @classmethod
    def update_post(cls, platform: Platform | None, is_delete: bool):
        """
        Update the statistics based on the provided parameters.
        is_delete: True for deleting a post, False for adding a post.
        """
        E = -1 if is_delete else 1

        if platform == Platform.douyin:
            cls.today.post_len_douyin += E
        elif platform == Platform.bilibili:
            cls.today.post_len_bilibili += E
        elif platform == Platform.xhs:
            cls.today.post_len_xhs += E
        elif platform == Platform.x:
            cls.today.post_len_x += E
        elif platform == Platform.ins:
            cls.today.post_len_ins += E
        elif platform == Platform.youtube:
            cls.today.post_len_youtube += E

        cls.today.date = datetime.now().astimezone()
