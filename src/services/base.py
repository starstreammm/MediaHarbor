from __future__ import annotations

import asyncio
import random
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from base.integration import IntegrationBase
from services.catalog import PLATFORMS, PROVIDERS
from models import DetailsAccount, DetailsPost, Platform, UrlsFile
from models.integration import IntegrationRequest


class ProviderError(Exception):
    def __init__(self, status: str, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


class ServiceAPI:
    """Shared implementation of MediaHarbor's platform adapter contract."""

    platform: Platform

    def __init__(self, cookie: str, cookie_date: datetime):
        self.cookie_date = cookie_date
        self.tag = self.platform
        self.sem = asyncio.Semaphore(1)
        self.provider = PROVIDERS[PLATFORMS[self.tag.value].provider]
        self.instance = self.provider.client(self.tag.value, cookie, {})
        self.headers = self.instance.headers
        self.service_uid = None

    @classmethod
    async def init(cls, cookie: str, cookie_date: datetime) -> ServiceAPI:
        service_uid = await IntegrationBase.ensure_adapter(cls.platform.value, cookie)
        config = (await IntegrationBase.get(service_uid))["config"]
        cookie = ""
        self = cls(cookie, cookie_date)
        self.service_uid = service_uid
        await self.instance.close()
        self.instance = self.provider.client(
            self.tag.value, cookie, config.get("options", {})
        )
        self.headers = self.instance.headers
        return self

    async def get_download_headers(self) -> list[str]:
        config = (await IntegrationBase.get(self.service_uid))["config"]
        cookie = ""
        client = self.provider.client(self.tag.value, cookie, config.get("options", {}))
        try:
            return await client.download_headers()
        finally:
            await client.close()

    async def _request(self, operation: str, **params):
        result = await IntegrationBase.invoke(
            self.service_uid, operation, IntegrationRequest(params=params)
        )
        if not result["success"]:
            raise ProviderError(result["status"], result["error"])
        return result["data"]

    async def get_post_id(self, url: str) -> str:
        return await self._request("post-id", url=url)

    async def get_account_id(self, url: str) -> str:
        return await self._request("account-id", url=url)

    async def get_post(self, data: str | dict) -> DetailsPost[UrlsFile]:
        if isinstance(data, dict):
            return self.instance.parse_post(data)
        async with self._delayed_sem():
            return DetailsPost[UrlsFile].model_validate(
                await self._request("post", id=data)
            )

    async def get_post_list(
        self,
        sec_user_id: str,
        latest: datetime = datetime.fromtimestamp(0, timezone.utc),
    ) -> AsyncGenerator[list[DetailsPost[UrlsFile]], None]:
        cursor = None
        seen = set()
        cutoff = latest.timestamp()
        while True:
            async with self._delayed_sem():
                data = await self._request(
                    "posts", id=sec_user_id, **({"cursor": cursor} if cursor else {})
                )
            posts = [
                DetailsPost[UrlsFile].model_validate(item) for item in data["posts"]
            ]
            yield [post for post in posts if post.post_time.timestamp() > cutoff]
            # Pinned posts can be older than later entries; do not stop on them.
            if not data["has_more"]:
                return
            cursor = data["cursor"]
            if cursor in seen:
                raise ValueError("Post pagination repeated a cursor")
            seen.add(cursor)

    async def get_profile(self, sec_user_id: str) -> DetailsAccount[UrlsFile]:
        async with self._delayed_sem():
            return DetailsAccount[UrlsFile].model_validate(
                await self._request("profile", id=sec_user_id)
            )

    @asynccontextmanager
    async def _delayed_sem(self, delay=random.randint(3, 8)):
        await self.sem.acquire()
        try:
            yield
        finally:
            asyncio.create_task(self._release_after(delay))

    async def _release_after(self, delay):
        await asyncio.sleep(delay)
        self.sem.release()
