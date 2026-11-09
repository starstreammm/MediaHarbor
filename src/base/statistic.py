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
                SELECT * FROM statistic_snapshots
                ORDER BY date DESC
                LIMIT 1;
            """,
        )
        if row:
            cls.today = TableStatistics.model_validate(row)

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
        data = cls.today
        await db.execute(
            """
                INSERT INTO statistic_snapshots
                    (date, post_counts, file_len_video, file_len_photo, file_size_video, file_size_photo)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (date) DO UPDATE SET
                    post_counts = EXCLUDED.post_counts,
                    file_len_video = EXCLUDED.file_len_video,
                    file_len_photo = EXCLUDED.file_len_photo,
                    file_size_video = EXCLUDED.file_size_video,
                    file_size_photo = EXCLUDED.file_size_photo;
            """,
            time.date(), data.post_counts, data.file_len_video, data.file_len_photo,
            data.file_size_video, data.file_size_photo,
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

        if platform is not None:
            key = platform.value
            cls.today.post_counts[key] = cls.today.post_counts.get(key, 0) + E
            legacy_field = f"post_len_{key}"
            if legacy_field in TableStatistics.model_fields:
                setattr(cls.today, legacy_field, cls.today.post_counts[key])

        cls.today.date = datetime.now().astimezone()
