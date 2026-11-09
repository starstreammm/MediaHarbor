import asyncio
import random
import string
import os

from typing import AsyncGenerator, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from contextlib import suppress

from base.database import DatabaseBase as db
from base.downloader import DownloaderBase as dl
from base.settings import SettingsBase
from utils.predict import PredictUtil
from utils.sync import SyncUtil
from utils.file import FileUtil
from utils.queue.post import PostUtil
from services import APIUtil
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
        detail.alias = profile.alias
        detail.url = profile.url or getattr(data, "url", "") or ""
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

        await db.execute(
            """
            UPDATE posts SET account_uid = $1
            WHERE platform = $2 AND account_pid = $3 AND account_uid IS NULL
            """,
            account.uid, account.platform, account.pid,
        )

        detail.msg = f"Account {account.uid} saved."
        yield detail

        if not isinstance(data, ApiAccountInsert):
            posts = (
                data.posts
                if isinstance(data, (ApiAccountParse, QueueAccountParse))
                else None
            )
            async for detail in cls._download_initial_posts(
                account, posts, scanned_at=getattr(data, "posts_scanned_at", None)
            ):
                yield detail
            await SyncUtil.configure(
                ApiAccountUpdate(uid=account.uid, sync=data.sync, filter=account.filter)
            )
        detail.msg = "Account created."
        yield detail
        yield account.uid

    @classmethod
    async def _download_initial_posts(
        cls,
        account: TableAccount,
        posts: list[DetailsPost[UrlsFile]] | None,
        *,
        scanned_at: datetime | None = None,
    ) -> AsyncGenerator[QueueDetailAccount, None]:
        detail = QueueDetailAccount(
            msg="Fetching posts...",
            alias=account.alias,
            url=account.url or "",
            posts=[],
        )
        yield detail
        started = datetime.now(timezone.utc)
        if scanned_at is not None:
            started = min(scanned_at, started)
        complete = posts is None or scanned_at is not None
        if posts is None:
            selected = []
            async for page in APIUtil.get_post_list((account.pid, account.platform)):
                selected.extend(
                    await cls._record_page(account, page, None, queue_downloads=False)
                )
                detail.msg = f"Fetching posts... {len(selected)} selected."
                yield detail
        else:
            selected = await cls._record_page(account, posts, None, queue_downloads=False)

        detail.msg = "Downloading posts..."
        detail.posts = [
            QueueDetailPost(msg="", overview=post.overview, url=post.url or "", files=[])
            for post in selected
        ]
        yield detail
        update = asyncio.Event()

        async def download_post(index, post):
            try:
                async for progress in PostUtil.create(
                    ApiPostParse(**post.model_dump(), account_uid=account.uid)
                ):
                    if isinstance(progress, QueueDetailPost):
                        detail.posts[index] = progress
                    update.set()
            except Exception as error:
                detail.posts[index].msg = f"{type(error).__name__}: {error}"
                update.set()
                raise

        downloads = asyncio.gather(
            *[download_post(index, post) for index, post in enumerate(selected)],
            return_exceptions=True,
        )
        try:
            while not downloads.done():
                update.clear()
                progress = asyncio.create_task(update.wait())
                try:
                    await asyncio.wait(
                        (downloads, progress), return_when=asyncio.FIRST_COMPLETED
                    )
                finally:
                    progress.cancel()
                    with suppress(asyncio.CancelledError):
                        await progress
                yield detail
                await asyncio.sleep(1)
            results = await downloads
        finally:
            if not downloads.done():
                downloads.cancel()
                with suppress(asyncio.CancelledError):
                    await downloads

        failures = [result for result in results if isinstance(result, Exception)]
        if failures:
            detail.msg = f"{len(failures)} post(s) failed to download."
            yield detail
            raise RuntimeError(detail.msg) from failures[0]

        await db.execute(
            "UPDATE accounts SET sync_status = TRUE WHERE uid = $1", account.uid
        )
        if complete:
            await db.execute(
                "UPDATE accounts SET sync_checked_at = $2, latest_update = $2 WHERE uid = $1",
                account.uid,
                started,
            )
            detail.msg = "Calculating the next check from posting history..."
            yield detail
            forecast = await PredictUtil.forecast(account.uid)
            if forecast is not None:
                await db.execute(
                    """
                    UPDATE accounts SET sync_prediction = $2,
                        sync_next_at = ($2::jsonb->>'next_check_at')::timestamptz
                    WHERE uid = $1
                    """,
                    account.uid,
                    forecast,
                )
        detail.msg = "Downloading posts done."
        yield detail

    @classmethod
    async def sync(
        cls,
        data: ApiAccountSync | QueueAccountSync,
        self_task_uid: int,
    ) -> AsyncGenerator[QueueDetailAccount, None]:
        if not await SyncUtil.claim(data.uid, self_task_uid, getattr(data, "automatic", False)):
            yield QueueDetailAccount(msg="Sync cancelled or superseded.", alias="", url="", posts=[])
            return
        heartbeat = asyncio.create_task(SyncUtil.heartbeat(data.uid, self_task_uid, asyncio.current_task()))
        try:
            async with asyncio.timeout(3600):
                async for detail in cls._sync_account(data, self_task_uid):
                    yield detail
            await SyncUtil.finish(data.uid, self_task_uid)
        except Exception as error:
            await SyncUtil.fail(data.uid, self_task_uid, error)
            raise
        finally:
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat

    @classmethod
    async def _sync_account(cls, data, task_uid):
        account = TableAccount.model_validate(
            await db.fetchrow("SELECT * FROM accounts WHERE uid = $1", data.uid)
        )
        detail = QueueDetailAccount(alias=account.alias, url=account.url or "", posts=[])
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
        history = []
        if profile.alias != account.alias:
            history.append((account.uid, "alias", account.alias))
            changes["alias"] = profile.alias
        if profile.overview != account.overview:
            history.append((account.uid, "overview", account.overview))
            changes["overview"] = profile.overview
        if profile.avatar != account.avatar and profile.avatar:
            history.append((account.uid, "avatar", str(account.avatar)))
            changes["avatar"] = profile.avatar
        if profile.cover != account.cover and profile.cover:
            history.append((account.uid, "cover", str(account.cover)))
            changes["cover"] = profile.cover
        if profile.age != account.age:
            history.append((account.uid, "age", str(account.age)))
            changes["age"] = profile.age
        if profile.gender != account.gender:
            history.append((account.uid, "gender", str(account.gender)))
            changes["gender"] = profile.gender
        if profile.ip != account.ip:
            history.append((account.uid, "ip", str(account.ip)))
            changes["ip"] = profile.ip
        if profile.address != account.address:
            history.append((account.uid, "address", str(account.address)))
            changes["address"] = profile.address
        if profile.school != account.school:
            history.append((account.uid, "school", str(account.school)))
            changes["school"] = profile.school

        if changes:
            async with db._api.acquire() as con, con.transaction():
                owned = await con.fetchval(
                    """
                    SELECT uid FROM accounts WHERE uid = $1 AND sync_task = $2
                        AND sync_lease_until > NOW() FOR UPDATE
                    """,
                    account.uid, task_uid,
                )
                if owned is None:
                    raise ValueError("Account discovery ownership expired")
                await con.executemany(
                    "INSERT INTO profile_history (uid, key, value) VALUES ($1, $2, $3)",
                    history,
                )
                await con.execute(
                    f"""
                    UPDATE accounts
                    SET {",".join(f"{key} = ${i + 1}" for i, key in enumerate(changes))}
                    WHERE uid = ${len(changes) + 1}
                    """,
                    *changes.values(), account.uid,
                )

        async for detail in cls._get_posts(account, task_uid):
            yield detail
        detail.msg = "Discovery complete. Downloads and the next check are scheduled independently."
        yield detail

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
            / f"{data.pid}_{int(datetime.now(timezone.utc).timestamp())}_{''.join(suffix)}.jpeg"
        )
        avatar_path = (
            SettingsBase._data.aria2_path
            / "avatar"
            / name
            / f"{data.pid}_{int(datetime.now(timezone.utc).timestamp())}_{''.join(suffix)}.jpeg"
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

            start, end = filter.time.split("_")

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
        task_uid: int,
    ) -> AsyncGenerator[QueueDetailAccount, None]:
        detail = QueueDetailAccount(
            msg="Fetching post observations...", alias=account.alias,
            url=account.url or "", posts=[],
        )
        yield detail
        started = datetime.now(timezone.utc)
        queued = 0
        observed = 0
        # Full pagination records unfiltered history and avoids pinned/late-post
        # watermark gaps. Existing posts and active downloads are deduplicated.
        async for page in APIUtil.get_post_list((account.pid, account.platform)):
            queued += await cls._record_page(account, page, task_uid)
            observed += len(page)
            detail.msg = f"Observed {observed} posts; queued {queued} downloads."
            yield detail
        owned = await db.fetchval(
            """
            UPDATE accounts SET sync_checked_at = $2, latest_update = $2,
                sync_status = TRUE
            WHERE uid = $1 AND sync_task = $3 AND sync_lease_until > NOW()
            RETURNING uid
            """,
            account.uid, started, task_uid,
        )
        if owned is None:
            raise ValueError("Account discovery ownership expired")
        detail.msg = "Calculating the next check from posting history..."
        yield detail
        forecast = await PredictUtil.forecast(account.uid)
        if forecast is not None:
            await db.execute(
                """
                UPDATE accounts SET sync_prediction = $2,
                    sync_next_at = ($2::jsonb->>'next_check_at')::timestamptz
                WHERE uid = $1 AND sync_task = $3 AND sync_lease_until > NOW()
                """,
                account.uid, forecast, task_uid,
            )
        detail.msg = f"Observed {observed} posts; queued {queued} downloads."
        yield detail

    @classmethod
    async def _record_page(cls, account, posts, task_uid, *, queue_downloads=True):
        selected = []
        records = []
        for post in posts:
            if not post.pid or post.platform != account.platform:
                raise ValueError("Platform returned a post without a matching identity")
            records.append((account.uid, post.pid, post.post_time))
            if await cls._filter_check(post, account.filter):
                selected.append(post)
        async with db._api.acquire() as con, con.transaction():
            owner = await con.fetchrow(
                "SELECT sync_task, sync_lease_until FROM accounts WHERE uid = $1 FOR UPDATE",
                account.uid,
            )
            if owner is None:
                raise ValueError("Account was deleted during discovery")
            if task_uid is not None and (
                owner["sync_task"] != task_uid or owner["sync_lease_until"] is None
                or owner["sync_lease_until"] <= datetime.now(timezone.utc)
            ):
                raise ValueError("Account discovery ownership expired")
            if records:
                await con.execute(
                    """
                    UPDATE posts SET account_uid = $1
                    WHERE platform = $2 AND pid = ANY($3::text[])
                        AND account_uid IS NULL
                    """,
                    account.uid, account.platform, [post.pid for post in posts],
                )
                await con.executemany(
                    """
                    INSERT INTO account_post_observations
                        (account_uid, platform_post_id, published_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (account_uid, platform_post_id) DO UPDATE
                    SET published_at = EXCLUDED.published_at
                    """,
                    records,
                )
            if not queue_downloads:
                return selected
            queued = 0
            for post in selected:
                exists = await con.fetchval(
                    """
                    SELECT EXISTS(SELECT 1 FROM posts
                        WHERE platform = $1 AND pid = $2 AND sync_status)
                    OR EXISTS(SELECT 1 FROM queue
                        WHERE job->>'type' = 'post_parse'
                            AND job->>'account_uid' = $3 AND job->>'pid' = $2
                            AND status IN ('pending', 'running'))
                    """,
                    post.platform, post.pid, str(account.uid),
                )
                if exists:
                    continue
                job = QueuePostParse(**post.model_dump(), account_uid=account.uid)
                await con.execute(
                    "INSERT INTO queue (alias, job, scheduled) VALUES ($1, $2, NOW())",
                    f"Download post {post.pid}", job.model_dump(mode="json"),
                )
                queued += 1
            return queued
