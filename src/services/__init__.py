"""
Public service exports for MediaHarbor.

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

from datetime import datetime, timezone
from collections.abc import AsyncGenerator

from services.base import ServiceAPI
from services.catalog import PLATFORMS, platform_for_url
from base.integration import IntegrationBase

from models import *
from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from base.settings import SettingsBase

APIs = ServiceAPI


class APIUtil:
    sta: ApiHealthStatus = ApiHealthStatus()
    _instance: dict[str, APIs] = {}
    _errors: dict[str, str] = {}
    _init_lock = asyncio.Lock()

    @classmethod
    async def close(cls):
        for instance in cls._instance.values():
            await instance.instance.close()
        cls._instance.clear()

    @classmethod
    async def catalog(cls) -> list[dict]:
        rows = (
            await db.fetch("SELECT * FROM api_services WHERE adapter_key IS NOT NULL")
            or []
        )
        services = {row["adapter_key"]: row for row in rows}
        result = []
        for key, definition in PLATFORMS.items():
            row = services.get(f"{definition.provider}:{key}")
            config = row["config"] if row else {}
            enabled = config.get("enabled", True)
            if not enabled:
                state = "Disabled"
            elif key in cls._errors:
                state = "Error"
            else:
                state = "Ready" if key in cls._instance else "Not initialized"
            result.append(
                {
                    "key": key,
                    "name": definition.name,
                    "provider": definition.provider,
                    "service_uid": row["uid"] if row else None,
                    "authenticated_endpoints": ["posts"],
                    "enabled": enabled,
                    "state": state,
                    "error": cls._errors.get(key),
                }
            )
        return result

    @classmethod
    async def init(
        cls,
        which: ApiInitStatus | None = None,
    ) -> AsyncGenerator[ApiInitStatus, None]:
        """Start enabled platforms independently of authenticated endpoint availability."""
        async for progress in cls._initialize(which, PLATFORMS):
            yield progress

    @classmethod
    async def sync_service(cls, uid: int):
        row = await IntegrationBase.get(uid)
        for key, definition in PLATFORMS.items():
            if row["adapter_key"] == f"{definition.provider}:{key}":
                async for _ in cls._initialize(None, {key: definition}):
                    pass
                return

    @classmethod
    async def _initialize(cls, which, platforms) -> AsyncGenerator[ApiInitStatus, None]:
        submitted = which.model_dump(exclude_none=True) if which is not None else {}
        unknown = set(submitted) - PLATFORMS.keys()
        if unknown:
            raise ValueError("No adapter registered for: " + ", ".join(sorted(unknown)))
        async with cls._init_lock:
            progress = ApiInitStatus()
            for key, definition in platforms.items():
                cls._errors.pop(key, None)
                previous = cls._instance.pop(key, None)
                if previous is not None:
                    await previous.instance.close()
                setattr(cls.sta, key, None)
                setattr(progress, key, "")
                yield progress
                try:
                    # Existing service settings take precedence over the legacy mirror.
                    legacy_cookie = getattr(SettingsBase._data, f"cookie_{key}", "")
                    uid = await IntegrationBase.ensure_adapter(key, legacy_cookie)
                    row = await IntegrationBase.get(uid)
                    config = row["config"]
                    if not config["enabled"]:
                        setattr(progress, key, None)
                        yield progress
                        continue
                    if submitted.get(key):
                        raise ValueError("Manage authenticated accounts in API Health")
                    cookie = ""
                    cookie_date = row["reauthenticated_at"] or getattr(
                        SettingsBase._data,
                        f"cookie_{key}_date",
                        datetime.fromtimestamp(0, timezone.utc),
                    )
                    cls._instance[key] = await definition.adapter().init(
                        cookie, cookie_date
                    )
                    stale = bool(cookie) and cls._date_expired_warning(cookie_date)
                    setattr(progress, key, "false" if stale else "true")
                    setattr(cls.sta, key, not stale)
                except Exception as error:
                    cls._instance.pop(key, None)
                    message = (
                        error.detail
                        if hasattr(error, "detail")
                        else f"Initialization failed ({type(error).__name__})"
                    )
                    cls._errors[key] = message
                    setattr(progress, key, message)
                    setattr(cls.sta, key, False)
                    lg.error(
                        f"APIUtil: {key} initialization failed ({type(error).__name__})"
                    )
                yield progress
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
    async def check_post_url(cls, url: str) -> ApiUrlCheck:
        """Resolve the URL and check for duplicates before fetching details."""
        try:
            api = await cls._match(url)
            pid = await api.get_post_id(url)
            if not pid:
                return ApiUrlCheck(status="error", message="Could not resolve the post URL.")
            existing = await db.fetchrow(
                "SELECT uid FROM posts WHERE platform = $1 AND pid = $2;",
                api.tag.value,
                pid,
            )
            return ApiUrlCheck(
                status="exists" if existing else "passed",
                message=f"Post already exists. UID: {existing['uid']}." if existing else "URL checked successfully.",
                platform=api.tag,
                pid=pid,
            )
        except Exception as exc:
            lg.warning(f"Failed to check post URL: {exc}")
            return ApiUrlCheck(status="error", message=str(exc) or "Unable to check the post URL.")

    @classmethod
    async def check_account_url(cls, url: str) -> ApiUrlCheck:
        """Resolve the URL and check for duplicates before fetching details."""
        try:
            api = await cls._match(url)
            pid = await api.get_account_id(url)
            if not pid:
                return ApiUrlCheck(status="error", message="Could not resolve the account URL.")
            existing = await db.fetchrow(
                "SELECT uid FROM accounts WHERE platform = $1 AND pid = $2;",
                api.tag.value,
                pid,
            )
            return ApiUrlCheck(
                status="exists" if existing else "passed",
                message=f"Account already exists. UID: {existing['uid']}." if existing else "URL checked successfully.",
                platform=api.tag,
                pid=pid,
            )
        except Exception as exc:
            lg.warning(f"Failed to check account URL: {exc}")
            return ApiUrlCheck(status="error", message=str(exc) or "Unable to check the account URL.")

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

        return (api.tag.value, await api.get_download_headers())

    @classmethod
    async def _match(cls, key: str | tuple[int, Layer]) -> APIs:
        """
        Get the platform infomation.
        The key can be one of url or a tuple of (uid: int, form: str).
        """
        res = None

        if isinstance(key, str):
            if key in PLATFORMS:
                res = cls._instance.get(key)
            else:
                res = cls._instance.get(platform_for_url(key))

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
            if pt in PLATFORMS:
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
