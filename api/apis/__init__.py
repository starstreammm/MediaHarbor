"""
Standerd API exports for MediaHarbor.

All backends are saved here. For each platform, some methods are provided:
- `last_update`: The last update time of the cookie.
- `tag`: The platform tag.
- `init`: Initialized the api.
- `get_post_id`: Get the platform id of a post.
- `get_account_id`: Get the platform id of a account.
- `get_post`: Get the detail of a post, return in DetailsPost.
- `get_post_list`: Get the list of posts of an account, return in AsyncGenerator[DetailsPost, None].
- `get_profile`: Get the profile of an account, return in DetailsAccount.
"""

import asyncio

from typing import Union, AsyncGenerator
from datetime import datetime, timezone
from collections.abc import AsyncGenerator

from apis.douyin import DouyinAPI

from models import *
from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from base.settings import SettingsBase

APIs = Union[DouyinAPI]
CLASS_MAP = {
    Platform.douyin: DouyinAPI,
}


class APIUtil:
    sta: ApiHealthStatus = ApiHealthStatus()
    _instance: dict[str, APIs] = {}

    @classmethod
    async def init(
        cls,
        which: ApiInitStatus | None = None,
    ) -> AsyncGenerator[ApiInitStatus, None]:
        """
        Initialize all APIs.
        """
        tasks: dict[str, asyncio.Task] = {}
        sta = ApiInitStatus()
        if which is None:
            which = ApiInitStatus(
                douyin=SettingsBase._data.cookie_douyin,
                bilibili=SettingsBase._data.cookie_bilibili,
                xhs=SettingsBase._data.cookie_xhs,
                x=SettingsBase._data.cookie_x,
                ins=SettingsBase._data.cookie_ins,
                youtube=SettingsBase._data.cookie_youtube,
            )

        for p in Platform:
            if cls._instance.get(p.value):
                if cls._date_expired_warning(cls._instance[p.value].cookie_date):
                    sta.__setattr__(p.value, "false")
                else:
                    sta.__setattr__(p.value, "true")

            if getattr(which, p.value):
                if getattr(which, p.value) != getattr(
                    SettingsBase._data,
                    f"cookie_{p.value}",
                ):
                    SettingsBase._data.__setattr__(
                        f"cookie_{p.value}",
                        getattr(which, p.value),
                    )
                    SettingsBase._data.__setattr__(
                        f"cookie_{p.value}_date",
                        datetime.now(timezone.utc),
                    )

                tasks[p.value] = asyncio.create_task(
                    CLASS_MAP[p].init(
                        getattr(which, p.value),
                        getattr(
                            SettingsBase._data,
                            f"cookie_{p.value}_date",
                        ),
                    )
                )
                sta.__setattr__(p.value, "")

        yield sta

        while tasks:
            done, _ = await asyncio.wait(
                tasks.values(),
                timeout=3,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in done:
                key = next(k for k, v in tasks.items() if v is task)
                try:
                    cls._instance[key] = task.result()
                    if cls._date_expired_warning(cls._instance[key].cookie_date):
                        setattr(sta, key, "false")
                        cls.sta.__setattr__(key, False)
                    else:
                        setattr(sta, key, "true")
                        cls.sta.__setattr__(key, True)
                except Exception as e:
                    lg.exception(f"APIUtil: {key} API initialization failed: {e}")
                    setattr(sta, key, str(e))
                finally:
                    del tasks[key]

            yield sta

        lg.info(f"APIs initialized: {cls.sta.model_dump()}")

    @classmethod
    async def get_profile(
        cls, key: str | int | tuple[str, Platform]
    ) -> DetailsAccount[UrlsFile]:
        """
        Get the profile of the account.
        The key can be one of url or uid.
        """
        if isinstance(key, str):
            api = await cls._match(key)
            pid = await api.get_account_id(key)
            res = await api.get_profile(pid)
        elif isinstance(key, tuple):
            api = await cls._match(key[1])
            res = await api.get_profile(key[0])
        else:
            row = await db.fetchrow(
                """
                    SELECT pid, platform
                    FROM accounts
                    WHERE uid = $1;
                """,
                key,
            )
            if not row:
                raise Exception("APIUtil: Account not found in database.")

            api = await cls._match(row["platform"])
            res = await api.get_profile(row["pid"])

        lg.info(f"APIUtil: Get profile for {res.platform}:{res.alias}.")
        lg.debug(f"APIUtil: Get Profile: {res.model_dump(mode='json')}.")
        return res

    @classmethod
    async def get_post_from_url(cls, key: str) -> DetailsPost[UrlsFile]:
        """
        Get the post details from the post url.
        """
        api = await cls._match(key)
        pid = await api.get_post_id(key)
        res = await api.get_post(pid)
        lg.info(f"APIUtil: Get post for {res.platform}:{res.pid}.")
        lg.debug(f"APIUtil: Get Post: {res.model_dump(mode='json')}.")
        return res

    @classmethod
    async def get_post_list(
        cls,
        key: str | int | tuple[str, Platform],
        latest: datetime | None = datetime.fromtimestamp(0, timezone.utc),
    ) -> AsyncGenerator[list[DetailsPost[UrlsFile]], None]:
        if latest is None:
            latest = datetime.fromtimestamp(0, timezone.utc)

        if isinstance(key, str):
            api = await cls._match(key)
            pid = await api.get_account_id(key)

        elif isinstance(key, tuple):
            pid = key[0]
            api = await cls._match(key[1])

        else:
            row = await db.fetchrow(
                """
                    SELECT pid, platform
                    FROM accounts
                    WHERE uid = $1;
                """,
                key,
            )
            if not row:
                raise Exception("APIUtil: Account not found in database.")

            api = await cls._match(row["platform"])
            pid = row["pid"]

        count = 0
        async for posts in api.get_post_list(pid, latest):
            count += len(posts)
            yield posts

        lg.info(f"APIUtil: Get {count} posts for {api.tag.value}:{pid}.")

    @classmethod
    async def check_post_url(cls, url: str) -> tuple[str, tuple[Platform, str] | None]:
        """
        Check if the url is valid, the platform is initialized and account is exists.
        Return the platform if valid, otherwise return None.
        """
        try:
            api = await cls._match(url)
        except Exception:
            return "Platform not supported or API not initialized.", None

        pid = await api.get_post_id(url)
        existing = await db.fetchrow(
            f"""
                SELECT *
                FROM posts
                WHERE platform = $1 AND pid = $2;
            """,
            api.tag.value,
            pid,
        )
        if not existing:
            return "true", (api.tag, pid)
        else:
            data = TablePost.model_validate(existing)
            return (
                f"Post already exists. UID: {data.uid}, Created: {data.create_time}.{" Under account: " + str(data.account_uid) if data.account_uid else ''}.",
                (api.tag, pid),
            )

    @classmethod
    async def check_account_url(
        cls,
        url: str,
    ) -> tuple[str, tuple[Platform, str] | None]:
        """
        Check if the url is valid, the platform is initialized and account is exists.
        Return the platform if valid, otherwise return None.
        """
        try:
            api = await cls._match(url)
        except Exception:
            return "Platform not supported or API not initialized.", None

        pid = await api.get_account_id(url)
        existing = await db.fetchrow(
            f"""
                SELECT *
                FROM accounts
                WHERE platform = $1 AND pid = $2;
            """,
            api.tag.value,
            pid,
        )
        if not existing:
            return "true", (api.tag, pid)
        else:
            data = TableAccount.model_validate(existing)
            return (
                f"Account already exists. UID: {data.uid}, Creator: {data.creator_uid}.",
                (api.tag, pid),
            )

    @classmethod
    async def get_download_info(
        cls, key: str | tuple[int, Layer]
    ) -> tuple[str, list[str]]:
        """
        Get the download information of the post.
        The key can be one of url or a tuple of (uid: int, form: str).
        Return a tuple of (platform, download_headers).
        """
        api = await cls._match(key)

        return (api.tag.value, api.headers)

    @classmethod
    async def _match(cls, key: str | tuple[int, Layer]) -> APIs:
        """
        Get the platform infomation.
        The key can be one of url or a tuple of (uid: int, form: str).
        """
        res = None

        if isinstance(key, str):
            for p in Platform:
                if p.value in key:
                    res = cls._instance.get(p.value)
                    break

        elif isinstance(key, tuple):
            uid, layer = key
            pt: str = await db.fetchval(
                f"""
                    SELECT platform 
                    FROM {layer.value}
                    WHERE uid = $1;
                """,
                uid,
            )
            if pt in Platform.__members__:
                res = cls._instance.get(pt)

        else:
            raise ValueError(
                "Invalid key type. Key must be a string or a tuple of (uid, Layer)."
            )

        if not res:
            raise Exception("APIs: unsupport key.")
        else:
            lg.debug(f"APIUtil: Match {res.tag} API for {key}.")
            return res

    @staticmethod
    def _date_expired_warning(date: datetime) -> bool:
        """
        Check if the cookie is expired.
        Return True if expired, otherwise False.
        """
        delta = (datetime.now(timezone.utc) - date).days
        if delta > 30:
            lg.warning(f"APIUtil: Cookie expired for {delta} days.")
            return True
        else:
            return False
