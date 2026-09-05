import asyncio
from typing import AsyncGenerator

from models import *
from base.database import DatabaseBase as db
from base.downloader import DownloaderBase as dl
from base.statistic import StatisticBase as sta
from base.settings import SettingsBase
from utils.file import FileUtil
from apis import APIUtil


class PostUtil:

    @classmethod
    async def create(
        cls,
        data: (
            ApiPostCreate
            | QueuePostCreate
            | ApiPostParse
            | QueuePostParse
            | ApiPostInsert
        ),
    ) -> AsyncGenerator[QueueDetailPost | int, None]:
        """
        Create a new post and return the uid of the post.
        Accept url and DetailsPost as input. Allow manually insert post.
        """
        detail = QueueDetailPost(
            msg="Setting up...",
            overview="",
            url=data.url or "",
            files=[],
        )
        yield detail

        # Manually insert post
        if isinstance(data, ApiPostInsert):
            row = data.model_dump()
            uid = await db.fetchval(
                f"""
                INSERT INTO posts ({", ".join(row.keys())})
                VALUES ({", ".join(f"${i}" for i in range(1, len(row) + 1))})
                ON CONFLICT (platform, pid) DO NOTHING
                RETURNING uid;
                """,
                *row.values(),
            )
            if not uid:
                raise Exception(
                    "Api Post Insert: Post already exists with the same platform and pid."
                )
            sta.update_post(data.platform, False)
            yield uid

        # Create post from url or details
        else:
            if isinstance(data, (ApiPostCreate, QueuePostCreate)):
                try:
                    detail.msg = "Fetching post detail..."
                    post = await APIUtil.get_post_from_url(data.url)
                    assert post.platform is not None and post.pid is not None
                    existing = await db.fetchval(
                        "SELECT uid FROM accounts WHERE platform = $1 AND pid = $2",
                        post.platform.value,
                        post.account_pid,
                    )
                except Exception as e:
                    detail.msg = f"Fetching post detail failed. {str(e)}."
                    yield detail
                    raise e

            else:
                post = DetailsPost[UrlsFile].model_validate(data.model_dump())
                assert post.platform is not None and post.pid is not None
                if data.account_uid:
                    existing = data.account_uid
                else:
                    existing = await db.fetchval(
                        "SELECT uid FROM accounts WHERE platform = $1 AND pid = $2",
                        post.platform.value,
                        post.account_pid,
                    )
            detail.overview = post.overview

            # Insert into the posts table
            row = post.model_dump(exclude={"files", "uid"})
            result = await db.fetchrow(
                f"""
                WITH inserted AS (
                    INSERT INTO posts ({", ".join(row.keys())}, rate, account_uid, files)
                    VALUES ({", ".join(f"${i+1}" for i in range(len(row) + 3))})
                    ON CONFLICT (platform, pid) DO NOTHING
                    RETURNING uid, sync_status
                )
                SELECT uid, sync_status, true AS inserted
                FROM inserted

                UNION ALL

                SELECT uid, sync_status, false AS inserted
                FROM posts
                WHERE platform = ${len(row) + 4} AND pid = ${len(row) + 5}
                LIMIT 1;
                """,
                *row.values(),
                data.rate,
                existing,
                [],
                post.platform,
                post.pid,
            )

            if not result:
                detail.msg = "Save post failed. Database error."
                yield detail
                raise Exception("Save post failed. Database error.")
            elif not result["inserted"] and result["sync_status"]:
                detail.msg = "Post already exists."
                yield detail
                yield result["uid"]
                return
            elif not result["inserted"] and not result["sync_status"]:
                detail.msg = "Post already exists but not synced. Updating..."
            else:
                sta.update_post(post.platform, False)
                detail.msg = "Post saved. Downloading files..."
            yield detail

            # Start downloading
            gids: list[str | None] = []
            uids: list[int] = []
            name, header = await APIUtil.get_download_info(post.platform.value)
            for index, file in enumerate(post.files, start=1):
                path = (
                    SettingsBase._data.aria2_path
                    / "posts"
                    / name
                    / post.pid
                    / f"{index}.{file.suffix}"
                )
                gid = await dl.insert(
                    DownloadFile(
                        path=path,
                        urls=file.urls,
                        headers=header,
                    )
                )
                gids.append(gid)
                uids.append(-1)
                detail.files.append(
                    QueueDetailFile(
                        index=index,
                        path=path,
                        gid=gid,
                    )
                )
            yield detail

            while any(gid is not None for gid in gids):
                await asyncio.sleep(3)
                for index, gid in enumerate(gids):
                    if gid is None:
                        continue
                    status = await dl.status(gid)
                    if status.status == Status.success:
                        gids[index] = None
                        uids[index] = await FileUtil.insert_table(status.path)
                        detail.files[index].msg = (
                            f"Download file success. UID: {uids[index]}."
                        )
                    elif status.status == Status.error:
                        gids[index] = None
                        detail.files[index].msg = f"Download file error: {status.msg}."
                yield detail

            if any(uid == -1 for uid in uids):
                detail.msg = "Files are downloaded. Some files are failed."
                await db.execute(
                    "UPDATE posts SET files = $1 WHERE uid = $2;",
                    [uid for uid in uids if uid != -1],
                    result["uid"],
                )
            else:
                detail.msg = "Files are all downloaded."
                await db.execute(
                    "UPDATE posts SET sync_status = TRUE, files = $1 WHERE uid = $2;",
                    uids,
                    result["uid"],
                )
            yield detail
            yield result["uid"]
            if any(uid == -1 for uid in uids):
                raise Exception("Some files are failed to download.")
