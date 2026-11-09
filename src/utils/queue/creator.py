import asyncio

from typing import AsyncGenerator

from models import *
from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from utils.queue.account import AccountUtil


class CreatorUtil:

    @staticmethod
    async def create(
        data: ApiCreatorCreate | QueueCreatorCreate,
    ) -> AsyncGenerator[QueueDetailCreator, None]:
        """
        Create a creator and return the uid of the creator. If sync is true, also create a sync task for the creator.
        """
        detail = QueueDetailCreator(
            msg=f"Setting up...",
            alias=data.alias,
            accounts=[
                QueueDetailAccount(
                    alias=getattr(p, "alias", ""),
                    url=p.url or "",
                    posts=[],
                )
                for p in data.accounts
            ],
        )
        yield detail

        uid = await db.fetchval(
            """
                INSERT INTO creators (alias, overview, rate)
                VALUES ($1, $2, $3)
                RETURNING uid;
            """,
            data.alias,
            data.overview,
            data.rate,
        )

        update = asyncio.Event()

        async def create_accounts(
            index: int,
            account: ApiAccountInsert | ApiAccountCreate | ApiAccountParse,
        ) -> int:
            account.creator_uid = uid
            res = -1
            try:
                async for d in AccountUtil.create(account):
                    if isinstance(d, QueueDetailAccount):
                        detail.accounts[index] = d
                    else:
                        res = d
                    update.set()
            except Exception as e:
                detail.accounts[index].msg = f"{type(e).__name__}: {e}"
                update.set()
                lg.exception(f"Error creating account: {e}")
                raise
            return res

        task = asyncio.gather(
            *[create_accounts(i, account) for i, account in enumerate(data.accounts)],
            return_exceptions=True,
        )
        while not task.done():
            progress = asyncio.create_task(update.wait())
            try:
                await asyncio.wait((task, progress), return_when=asyncio.FIRST_COMPLETED)
            finally:
                progress.cancel()
            yield detail
            await asyncio.sleep(1)
            update.clear()
        results = await task

        result = next((r for r in results if isinstance(r, int)), None)
        if not isinstance(data.avatar, int) and result is not None:
            data.avatar = await db.fetchval(
                "SELECT avatar FROM accounts WHERE uid = $1",
                result,
            )
        if not isinstance(data.cover, int) and result is not None:
            data.cover = await db.fetchval(
                "SELECT cover FROM accounts WHERE uid = $1",
                result,
            )

        await db.execute(
            """
                UPDATE creators
                SET avatar = $1, cover = $2
                WHERE uid = $3
            """,
            data.avatar,
            data.cover,
            uid,
        )

        failures = [result for result in results if isinstance(result, Exception)]
        if failures:
            reasons = "; ".join(
                f"Account {index + 1} ({detail.accounts[index].alias or detail.accounts[index].url}): "
                f"{type(result).__name__}: {result}"
                for index, result in enumerate(results)
                if isinstance(result, Exception)
            )
            detail.msg = f"Creator saved, but {len(failures)} account(s) failed. {reasons}"
            yield detail
            raise RuntimeError(detail.msg) from failures[0]
        detail.msg = f"Create Creator {data.alias} done."
        yield detail
