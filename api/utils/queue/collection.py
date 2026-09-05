import asyncio

from typing import AsyncGenerator

from models import *
from base.database import DatabaseBase as db
from utils.queue import QueueUtil
from utils.queue.post import PostUtil
from utils.delete import DeleteUtil


class CollectionUtil:
    @staticmethod
    async def add_posts(
        task: QueueCollectionUpdate,
    ) -> AsyncGenerator[QueueDetailCollection, None]:
        """
        Add posts to a collection and return the uid of the collection.
        """
        collection = TableCollection.model_validate(
            await db.fetchrow(
                "SELECT * FROM collections WHERE uid = $1",
                task.uid,
            )
        )

        detail = QueueDetailCollection(
            msg="Setting up...",
            alias=collection.alias,
            posts=[
                QueueDetailPost(
                    url=p.url or "",
                    overview="",
                    files=[],
                )
                for p in task.add
            ],
        )

        post_uids = [-1 for _ in task.add]
        update = asyncio.Event()

        async def download_post(index: int, task: ApiPostCreate | ApiPostParse) -> None:
            async for d in PostUtil.create(task):
                if isinstance(d, int):
                    post_uids[index] = d
                else:
                    detail.posts[index] = d
                update.set()

        t = asyncio.gather(
            *[download_post(i, p) for i, p in enumerate(task.add)],
            return_exceptions=True,
        )

        while not t.done():
            await update.wait()
            yield detail
            update.clear()

        detail.msg = "Collection add new posts done."
        yield detail

        # Update the collection
        await db.execute(
            f"""
            UPDATE collections
            SET posts = $1
            WHERE uid = $2
            """,
            [*post_uids, *collection.posts],
            task.uid,
        )

    @staticmethod
    async def update(task: ApiCollectionUpdate) -> int | None:
        """
        Update an exist collection.
        If any posts need to be added, insert a job into the queue.
        return the uid of the task if any posts need to be added, otherwise return None.
        """
        if task.alias:
            await db.execute(
                f"""
                UPDATE collections
                SET alias = $1
                WHERE uid = $2;
                """,
                task.alias,
                task.uid,
            )
        if task.notes:
            await db.execute(
                f"""
                UPDATE collections
                SET notes = $1
                WHERE uid = $2;
                """,
                task.notes,
                task.uid,
            )
        if task.delete or task.exclude or task.add:
            posts: list[int] = await db.fetchval(
                "SELECT posts FROM collections WHERE uid = $1",
                task.uid,
            )
            new_posts = [
                p for p in posts if p not in task.delete and p not in task.exclude
            ]
            need_add = []
            for p in task.add:
                if isinstance(p, int) and p not in new_posts:
                    new_posts.append(p)
                elif not isinstance(p, int):
                    need_add.append(p)
            await db.execute(
                f"""
                UPDATE collections
                SET posts = $1
                WHERE uid = $2;
                """,
                new_posts,
                task.uid,
            )
            if task.delete:
                for p in task.delete:
                    if p in posts:
                        await DeleteUtil.insert(Layer.post, p)
            if need_add:
                return await QueueUtil.insert(
                    QueueInsert(
                        alias=f"Add posts to collection {task.uid}",
                        job=QueueCollectionUpdate(
                            uid=task.uid,
                            add=need_add,
                        ),
                    )
                )
