import random
import asyncio
import yaml
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent / "Douyin"))

from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

from models import Platform, DetailsPost, DetailsAccount, UrlsFile
from base.logger import LoggerBase as lg

if TYPE_CHECKING:
    from apis.Douyin.crawlers.douyin.web.web_crawler import DouyinWebCrawler


class DouyinAPI:
    def __init__(self, cookie: str, cookie_date: datetime):

        # Update date
        self.cookie_date = cookie_date
        self.tag = Platform.douyin
        self.sem = asyncio.Semaphore(1)

        # Write cookie to the api config file.
        config_path = (
            Path(__file__).parent
            / "Douyin"
            / "crawlers"
            / "douyin"
            / "web"
            / "config.yaml"
        )

        with open(config_path, mode="r", encoding="utf-8") as f:

            config = yaml.safe_load(f)

            config["TokenManager"]["douyin"]["headers"]["Cookie"] = cookie

            self.headers = [
                f"Accept-Language: {config["TokenManager"]["douyin"]["headers"]["Accept-Language"]}",
                f"User-Agent: {config["TokenManager"]["douyin"]["headers"]["User-Agent"]}",
                f"Referer: {config["TokenManager"]["douyin"]["headers"]["Referer"]}",
                f"Cookie: {cookie}",
            ]

        with open(config_path, mode="w", encoding="utf-8") as f:
            yaml.dump(config, f, allow_unicode=True, sort_keys=False)

        # Instantiate the api obj
        self.instance: DouyinWebCrawler

        # Cookie date check
        lg.info("APIs Douyin: Initialization successful.")

    # Factory method to get the instance of the API.
    @classmethod
    async def init(cls, cookie: str, cookie_date: datetime) -> DouyinAPI:
        self = cls(cookie, cookie_date)

        from apis.Douyin.crawlers.douyin.web.web_crawler import DouyinWebCrawler

        self.instance = DouyinWebCrawler()

        return self

    # Light Risk API, no lock needed.
    async def get_post_id(self, url: str) -> str:
        """
        Tran url to the post pid.
        """
        return await self.instance.get_aweme_id(url)

    async def get_account_id(self, url: str) -> str:
        """
        Tran url to the account pid.
        """
        return await self.instance.get_sec_user_id(url)

    # Heavy Risk API, lock needed.
    async def get_post(self, data: str | dict) -> DetailsPost[UrlsFile]:
        if isinstance(data, str):
            async with self._delayed_sem():
                post: dict = (await self.instance.fetch_one_video(data))["aweme_detail"]

        else:
            post = data

        files: list[UrlsFile] = []
        if "2" in str(post["media_type"]):
            for item in post["images"]:
                item: dict
                if item.get("video"):
                    files.append(
                        UrlsFile(
                            urls=item["video"]["play_addr"]["url_list"],
                            suffix="mp4",
                        )
                    )
                else:
                    files.append(
                        UrlsFile(
                            urls=item["url_list"],
                            suffix="jpeg",
                        )
                    )
        else:
            files.append(
                UrlsFile(
                    urls=post["video"]["bit_rate"][0]["play_addr"]["url_list"],
                    suffix="mp4",
                )
            )

        return DetailsPost[UrlsFile](
            platform=Platform.douyin,
            account_pid=post["author"]["sec_uid"],
            pid=post["aweme_id"],
            url=post["share_url"],
            overview=post["desc"],
            post_time=datetime.fromtimestamp(post["create_time"]),
            files=files,
        )

    async def get_post_list(
        self,
        sec_user_id: str,
        latest: datetime = datetime.fromtimestamp(0, timezone.utc),
    ) -> AsyncGenerator[list[DetailsPost[UrlsFile]], None]:
        posts = []
        max_cursor = 0
        retry = 0

        while True:
            if retry >= 3:
                raise Exception("APIs Douyin: Can not get post list.")

            async with self._delayed_sem():
                try:
                    data: dict = await self.instance.fetch_user_post_videos(
                        sec_user_id, max_cursor, 18
                    )
                except Exception:
                    retry += 1
                    lg.error(f"APIs Douyin: Failed to get post list. Retry {retry}.")
                    await asyncio.sleep(8)
                    continue

            ls: list[dict] = data["aweme_list"]

            if len(ls) == 0:
                retry += 1
                lg.error(f"APIs Douyin: Failed to get post list. Retry {retry}.")
                await asyncio.sleep(8)
                continue

            for item in ls:
                if (
                    datetime.fromtimestamp(item["create_time"], tz=timezone.utc)
                    <= latest
                ):
                    break
                else:
                    posts.append(await self.get_post(item))

            yield posts

            posts = []
            max_cursor = data["max_cursor"]
            if not data["has_more"]:
                break

    async def get_profile(self, sec_user_id: str) -> DetailsAccount[UrlsFile]:
        async with self._delayed_sem():
            data: dict = (await self.instance.handler_user_profile(sec_user_id))["user"]

        return DetailsAccount[UrlsFile](
            platform=Platform.douyin,
            pid=sec_user_id,
            url=data["share_info"]["share_url"],
            alias=data["nickname"],
            overview=data["signature"],
            avatar=UrlsFile(urls=data["avatar_larger"]["url_list"], suffix="jpeg"),
            cover=UrlsFile(urls=data["cover_url"][0]["url_list"], suffix="jpeg"),
            age=data.get("user_age"),
            address="·".join(
                filter(
                    None,
                    [
                        data.get("country"),
                        data.get("province"),
                        data.get("city"),
                    ],
                )
            ),
            gender=(
                None if data["gender"] == 0 else True if data["gender"] == 1 else False
            ),
            ip=(
                data["ip_location"].replace("IP属地：", "")
                if data.get("ip_location")
                else None
            ),
            school=data.get("school_name"),
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
