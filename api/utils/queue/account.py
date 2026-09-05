import asyncio
import random
import string
import os

from typing import AsyncGenerator, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from base.database import DatabaseBase as db
from base.downloader import DownloaderBase as dl
from base.logger import LoggerBase as lg
from base.settings import SettingsBase
from utils.queue import QueueUtil
from utils.queue.post import PostUtil
from utils.predict import PredictUtil
from utils.file import FileUtil
from apis import APIUtil
from models import *


class AccountUtil:
    @classmethod
    async def create(
        cls,
        data: (
            ApiAccountCreate
            | QueueAccountCreate
            | ApiAccountParse
            | QueueAccountParse
            | ApiAccountInsert
        ),
    ) -> AsyncGenerator[QueueDetailAccount | int, None]:
        """
        Create a new account, including downloading posts, avatar and cover and fetching profile.
        Before completed, yield QueueDetailAccount with the progress of the task.
        If completed, yield the uid of the account.
        """
        detail = QueueDetailAccount(
            msg="Setting up...",
            alias="",
            url="",
            posts=[],
        )
        yield detail

        # Get profile
        try:
            if isinstance(data, ApiAccountInsert):
                profile = DetailsAccount[int].model_validate(data.model_dump())
            elif isinstance(data, ApiAccountParse) or isinstance(
                data, QueueAccountParse
            ):
                profile = await cls._download_profile(data)
            else:
                detail.msg = "Getting profile..."
                yield detail
                res = await APIUtil.get_profile(data.url)
                profile = await cls._download_profile(res)
        except Exception as e:
            detail.msg = f"Fetch profile failed. {str(e)}."
            yield detail
            raise e

        # Insert account to table
        detail.msg = f"Profile fetched. Saving account {profile.alias}..."
        yield detail

        account = TableAccount(
            **profile.model_dump(),
            uid=-1,
            creator_uid=data.creator_uid,
            filter=getattr(data, "filter", None),
            latest_update=datetime.now(timezone.utc),
            sync_status=False,
            create_time=datetime.now(timezone.utc),
        )
        row = account.model_dump(exclude={"uid", "create_time", "sync_status"})
        result = await db.fetchrow(
            f"""
            WITH inserted AS (
                INSERT INTO accounts ({",".join(row.keys())})
                VALUES ({",".join(f"${i + 1}" for i in range(len(row)))})
                ON CONFLICT (platform, pid) DO NOTHING
                RETURNING uid
            )
            SELECT uid, true AS inserted
            FROM inserted

            UNION ALL

            SELECT uid, false AS inserted
            FROM accounts
            WHERE platform = ${len(row) + 1} AND pid = ${len(row) + 2}
            LIMIT 1;
            """,
            *row.values(),
            account.platform,
            account.pid,
        )
        if not result:
            detail.msg = "Save account failed. Database error."
            yield detail
            raise RuntimeError("Save account failed. Database error.")

        account.uid = result["uid"]
        if not result["inserted"]:
            detail.msg = f"Save account failed. Account {profile.platform}, {profile.alias} already exists."
            yield detail
            raise RuntimeError(
                f"Save account failed. Account {profile.platform}, {profile.alias} already exists."
            )

        detail.msg = f"{profile.alias} profile saved. Downloading posts..."
        yield detail

        # Download posts
        try:
            async for d in cls._get_posts(
                account,
                True,
                posts=(
                    data.posts
                    if isinstance(data, ApiAccountParse)
                    or isinstance(data, QueueAccountParse)
                    else None
                ),
            ):
                detail = d
                yield d
        except Exception as e:
            detail.msg = f"Download posts failed. {str(e)}."
            yield detail
            raise e
        else:
            await db.execute(
                "UPDATE accounts SET sync_status = TRUE WHERE uid = $1",
                account.uid,
            )

        if getattr(data, "sync", False):
            sync_task = await cls.insert_sync_task(account.uid)
            detail.msg = f"Create account done. Next sync task: {sync_task[1]}."
            yield detail
        else:
            detail.msg = f"Creating account done. No sync task."
            yield detail
        yield account.uid

    @classmethod
    async def sync(
        cls,
        data: ApiAccountSync | QueueAccountSync,
        self_task_uid: int,
    ) -> AsyncGenerator[QueueDetailAccount, None]:
        detail = QueueDetailAccount(
            msg=f"Getting account detail...",
            alias="",
            url="",
            posts=[],
        )
        yield detail

        # Get the account from the table
        account = TableAccount.model_validate(
            await db.fetchrow(
                """
                    SELECT *
                    FROM accounts
                    WHERE uid = $1
                """,
                data.uid,
            )
        )
        if not account.platform or not account.pid:
            raise ValueError(f"Account {account.alias} has no platform or pid.")
        detail.alias = account.alias
        detail.url = account.url or ""

        # Check if the account has a sync task and if it's running
        if account.sync_task:
            sync_task = await QueueUtil.get(account.sync_task)
            if sync_task.status == Status.running and sync_task.uid != self_task_uid:
                detail.msg = "Sync task already in running."
                yield detail
                raise Exception("Sync task already in running.")
            elif sync_task.status == Status.pending and sync_task.uid != self_task_uid:
                await QueueUtil.delete(account.sync_task)

        # Fetch profile
        try:
            detail.msg = "Fetching profile..."
            yield detail
            res = await APIUtil.get_profile((account.pid, account.platform))
            profile = await cls._download_profile(res)
        except Exception as e:
            detail.msg = f"Syncing account {account.alias} failed. {str(e)}."
            yield detail
            raise e

        # Handle profile history
        detail.msg = "Handling profile history..."
        yield detail
        changes = {}
        if profile.alias != account.alias:
            await cls._insert_history(account.uid, "alias", account.alias)
            changes["alias"] = profile.alias
        if profile.overview != account.overview:
            await cls._insert_history(account.uid, "overview", account.overview)
            changes["overview"] = profile.overview
        if profile.avatar != account.avatar and profile.avatar:
            await cls._insert_history(account.uid, "avatar", str(account.avatar))
            changes["avatar"] = profile.avatar
        if profile.cover != account.cover and profile.cover:
            await cls._insert_history(account.uid, "cover", str(account.cover))
            changes["cover"] = profile.cover
        if profile.age != account.age:
            await cls._insert_history(account.uid, "age", str(account.age))
            changes["age"] = profile.age
        if profile.gender != account.gender:
            await cls._insert_history(account.uid, "gender", str(account.gender))
            changes["gender"] = profile.gender
        if profile.ip != account.ip:
            await cls._insert_history(account.uid, "ip", str(account.ip))
            changes["ip"] = profile.ip
        if profile.address != account.address:
            await cls._insert_history(account.uid, "address", str(account.address))
            changes["address"] = profile.address
        if profile.school != account.school:
            await cls._insert_history(account.uid, "school", str(account.school))
            changes["school"] = profile.school

        await db.execute(
            f"""
                UPDATE accounts
                SET {",".join([f"{key} = ${i+1}" for i, key in enumerate(changes.keys())])}
                WHERE uid = ${len(changes) + 1};
            """,
            *changes.values(),
            data.uid,
        )

        # Handle posts
        async for d in cls._get_posts(
            account, data.complete if account.sync_status else True
        ):
            detail = d
            yield d

        detail.msg = f"Registering sync task..."
        yield detail

        if account.sync_task:
            sync_task = await cls.insert_sync_task(data.uid)
        else:
            sync_task = None

        await db.execute(
            f"""
                UPDATE accounts
                SET latest_update = $1, sync_task = $2
                WHERE uid = $3;
            """,
            datetime.now(timezone.utc),
            sync_task,
            data.uid,
        )

        if sync_task:
            detail.msg = f"Syncing account {account.alias} done. Next: {sync_task[1]}."
        else:
            detail.msg = f"Syncing account {account.alias} done. No sync task."
        yield detail

    @staticmethod
    async def insert_sync_task(uid: int) -> tuple[int, datetime]:
        """
        Insert a sync task to queue and return the uid of the task.
        """
        time = await PredictUtil.predict_from_uid(uid)
        sync_task = await QueueUtil.insert(
            QueueInsert(
                alias=f"Sync account {uid}",
                job=QueueAccountSync(uid=uid),
                scheduled=time,
            )
        )
        await db.execute(
            """
                UPDATE accounts
                SET sync_task = $1
                WHERE uid = $2
            """,
            sync_task,
            uid,
        )
        return (sync_task, time)

    @staticmethod
    async def _insert_history(uid: int, key: str, value: str) -> None:
        await db.execute(
            """
                INSERT INTO profile_history (uid, key, value)
                VALUES ($1, $2, $3)
            """,
            uid,
            key,
            value,
        )

    @staticmethod
    async def _download_profile(data: DetailsAccount[UrlsFile]) -> DetailsAccount[int]:
        """
        Download the avatar and cover of the account and return the uid of the files.
        """
        assert data.platform is not None
        name, header = await APIUtil.get_download_info(data.platform)
        suffix = random.choices(string.ascii_letters + string.digits, k=6)

        cover_path = (
            SettingsBase._data.aria2_path
            / "cover"
            / name
            / f"{data.pid}_{int(datetime.now(timezone.utc).timestamp())}_{"".join(suffix)}.jpeg"
        )
        avatar_path = (
            SettingsBase._data.aria2_path
            / "avatar"
            / name
            / f"{data.pid}_{int(datetime.now(timezone.utc).timestamp())}_{"".join(suffix)}.jpeg"
        )

        async def wait_for_download(info: UrlsFile | None, path: Path) -> int | None:
            if not info:
                return None
            gid = await dl.insert(
                DownloadFile(
                    urls=info.urls,
                    path=path,
                    headers=header,
                )
            )
            while True:
                await asyncio.sleep(3)
                sta = (await dl.status(gid)).status
                if sta == Status.success:
                    return await FileUtil.insert_table(
                        SettingsBase._data.data_path
                        / path.relative_to(SettingsBase._data.aria2_path)
                    )
                elif sta == Status.error:
                    return None

        cover_uid, avatar_uid = await asyncio.gather(
            wait_for_download(data.cover, cover_path),
            wait_for_download(data.avatar, avatar_path),
            return_exceptions=True,
        )

        return DetailsAccount[int](
            **data.model_dump(exclude={"cover", "avatar"}),
            cover=cover_uid if isinstance(cover_uid, int) else None,
            avatar=avatar_uid if isinstance(avatar_uid, int) else None,
        )

    @staticmethod
    async def _filter_check(
        detail: DetailsPost[UrlsFile],
        filter: Optional[AccountFilter],
    ) -> bool:
        """
        Check if the post matches the filter.
        """
        if not filter:
            return True
        if filter.include:
            for keyword in filter.include:
                if not keyword in detail.overview:
                    return False
        if filter.exclude:
            for keyword in filter.exclude:
                if keyword in detail.overview:
                    return False
        if filter.time:
            local_tz_name = os.getenv("TZ", "UTC")
            local_tz = ZoneInfo(local_tz_name)

            start, end = filter.time.split("-")

            start_dt = datetime.strptime(
                start + "_00:00:00", r"%Y-%m-%d_%H:%M:%S"
            ).replace(tzinfo=None)
            end_dt = datetime.strptime(end + "_23:59:59", r"%Y-%m-%d_%H:%M:%S").replace(
                tzinfo=None
            )

            # Convert the time to local timezone
            start_dt = start_dt.replace(tzinfo=local_tz)
            end_dt = end_dt.replace(tzinfo=local_tz)

            if not start_dt <= detail.post_time <= end_dt:
                return False

        return True

    @classmethod
    async def _get_posts(
        cls,
        account: TableAccount,
        completed: bool,
        posts: Optional[list[DetailsPost[UrlsFile]]] = None,
    ) -> AsyncGenerator[QueueDetailAccount, None]:
        """
        Get the posts of an account.
        If completed is set, fetch all posts from the account.
        Yield QueueDetailAccount with the progress of the task.
        """
        if not account.pid or not account.platform:
            raise ValueError("Account pid or platform is missing.")

        detail = QueueDetailAccount(
            msg=f"Fetching posts list...",
            alias=account.alias,
            url=account.url or "",
            posts=[],
        )
        yield detail

        # If copleted is set, fetch all posts from the account
        if completed:
            account.latest_update = datetime.fromtimestamp(0, tz=timezone.utc)

        if not posts:
            try:
                posts = []
                async for part in APIUtil.get_post_list(
                    (account.pid, account.platform), account.latest_update
                ):
                    posts += [
                        p for p in part if await cls._filter_check(p, account.filter)
                    ]
                    print(f"Posting: {posts}")
            except Exception as e:
                detail.msg = f"Fetching {account.platform}, {account.alias} posts failed. {str(e)}."
                yield detail
                raise e

        detail.msg = f"Downloading posts..."
        detail.posts = [
            QueueDetailPost(
                msg="",
                overview=post.overview,
                url=post.url or "",
                files=[],
            )
            for post in posts
        ]
        yield detail

        update = asyncio.Event()

        async def download_posts(index: int, post: ApiPostParse):
            try:
                async for d in PostUtil.create(post):
                    if isinstance(d, QueueDetailPost):
                        detail.posts[index] = d
                    update.set()
            except Exception as e:
                lg.exception(f"Error downloading post: {e}")
                raise e

        task = asyncio.gather(
            *[
                download_posts(
                    i, ApiPostParse(**post.model_dump(), account_uid=account.uid)
                )
                for i, post in enumerate(posts)
            ],
            return_exceptions=True,
        )

        while not task.done():
            await update.wait()
            yield detail
            await asyncio.sleep(1)
            update.clear()

        results = await task
        detail.msg = f"Downloading posts done."
        if any(t is not None for t in results):
            detail.msg = f"Downloading posts done. Some posts failed to download."
            yield detail
            raise Exception("Some posts failed to download.")
        yield detail
