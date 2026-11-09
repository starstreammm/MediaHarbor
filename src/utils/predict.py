import asyncio
from datetime import datetime, timezone

import numpy as np

from base.database import DatabaseBase as db
from utils.sync_prediction import predict


class PredictUtil:
    @classmethod
    async def forecast(cls, uid: int) -> dict | None:
        account = await db.fetchrow(
            "SELECT platform, sync_checked_at FROM accounts WHERE uid = $1", uid
        )
        if account is None or account["sync_checked_at"] is None:
            return None
        observed = account["sync_checked_at"]
        rows = await db.fetch(
            """
            SELECT published_at FROM account_post_observations
            WHERE account_uid = $1 AND published_at <= $2
            ORDER BY published_at DESC LIMIT 1000
            """,
            uid, observed,
        ) or []
        times = sorted(row["published_at"] for row in rows)
        # Population information must predate the held-out validation suffix.
        distinct = sorted(set(times))
        cutoff = distinct[max(0, int(len(distinct) * 0.8) - 1)] if distinct else observed
        peers = await db.fetch(
            """
            WITH peers AS (
                SELECT uid FROM accounts WHERE platform = $1 AND uid <> $2
                ORDER BY uid LIMIT 30
            ), events AS (
                SELECT p.uid, o.published_at,
                    LAG(o.published_at) OVER (PARTITION BY p.uid ORDER BY o.published_at) AS previous
                FROM peers p CROSS JOIN LATERAL (
                    SELECT DISTINCT published_at FROM account_post_observations
                    WHERE account_uid = p.uid AND published_at <= $3
                    ORDER BY published_at DESC LIMIT 1000
                ) o
            )
            SELECT uid, percentile_cont(0.5) WITHIN GROUP (
                ORDER BY LN(EXTRACT(EPOCH FROM (published_at - previous)) / 3600)
            ) AS log_interval FROM events
            WHERE published_at > previous GROUP BY uid HAVING COUNT(*) >= 3
            """,
            account["platform"], uid, cutoff,
        ) or []
        prior = float(np.median([row["log_interval"] for row in peers])) if peers else float(np.log(24))
        return await asyncio.to_thread(
            predict, times, observed, datetime.now(timezone.utc), prior, len(peers)
        )

    @classmethod
    async def predict_from_uid(cls, uid: int) -> datetime:
        forecast = await cls.forecast(uid)
        if forecast is None:
            return datetime.now(timezone.utc)
        return datetime.fromisoformat(forecast["next_check_at"])

    @staticmethod
    async def predict_from_list(times: list[datetime], now: datetime | None = None) -> datetime:
        now = now or datetime.now(timezone.utc)
        forecast = await asyncio.to_thread(predict, times, now, now)
        return datetime.fromisoformat(forecast["next_check_at"])


if __name__ == "__main__":

    async def test_predict():
        """
        Test the predict function of AccountUtil. Return the predicted next sync time.
        """
        date = [
            [
                "2026-07-28 15:27:06+00",
                "2026-08-07 00:30:00+00",
                "2026-08-15 01:09:46+00",
            ],
        ]
        for times in date:
            times = sorted([datetime.fromisoformat(t) for t in times])

            print("\nInput times:")
            for t in times:
                print(t.isoformat(), end=" ")
            print()

            now = datetime.now(timezone.utc)
            print("Now:", now.isoformat())

            print(
                "Predicted next sync time:",
                (await PredictUtil.predict_from_list(times, now)).isoformat(),
            )

    import asyncio

    asyncio.run(test_predict())
