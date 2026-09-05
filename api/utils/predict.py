import numpy as np

from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from scipy.optimize import minimize
from scipy.special import gamma

from base.database import DatabaseBase as db


class Result(BaseModel):
    k: float
    lambda_: float
    success: bool
    message: str


class PredictUtil:
    @classmethod
    async def predict_from_uid(cls, uid: int) -> datetime:
        """
        Get the history posts of an account.
        Return a list of datetime of the posts in sort.
        """
        rows = await db.fetch(
            """
            SELECT post_time FROM posts
            WHERE account_uid = $1
            ORDER BY post_time DESC
            LIMIT 188;
            """,
            uid,
        )
        if not rows:
            return datetime.now(timezone.utc) + timedelta(hours=8)

        return await cls.predict_from_list([row["post_time"] for row in rows])

    @classmethod
    async def predict_from_list(
        cls,
        times: list[datetime],
        now: datetime = datetime.now(timezone.utc),
    ) -> datetime:

        times.sort()

        if len(times) <= 1:
            return now + timedelta(hours=8)
        if len(times) == 2:
            return now + (times[1] - times[0])

        intervals = [
            (times[i] - times[i - 1]).total_seconds() for i in range(1, len(times))
        ]

        res = cls.fit_weibull_mle(intervals, (now - times[-1]).total_seconds())
        pre = res.lambda_ * gamma(1 + 1 / res.k)

        if not pre or pre <= 0:
            pre = sum(intervals) / len(intervals)

        return now + timedelta(seconds=pre)

    @staticmethod
    def weibull_neg_loglik(params, t_event, t_censor):
        """
        params = [k, lambda]
        t_event = already occurred posting intervals
        t_censor = current time without posting (right censored)
        """

        k, lam = params

        # Prevent invalid parameters
        if k <= 0 or lam <= 0:
            return np.inf

        # PDF for the observed events
        log_pdf = (
            np.log(k)
            - np.log(lam)
            + (k - 1) * (np.log(t_event) - np.log(lam))
            - (t_event / lam) ** k
        )

        # Survival function for the censored data
        log_survival = -((t_censor / lam) ** k)

        # Negative log-likelihood
        return -np.sum(log_pdf) - np.sum(log_survival)

    @classmethod
    def fit_weibull_mle(cls, t_event, t_censor) -> Result:
        """
        t_event = already occurred posting intervals
        t_censor = current time without posting (right censored)
        """
        if not isinstance(t_censor, list):
            t_censor = [t_censor]
        if not isinstance(t_event, list):
            t_event = [t_event]

        t_event = np.array(t_event)
        t_censor = np.array(t_censor)

        # Initial guess for k and λ
        init_k = 1.0
        init_lam = np.mean(np.concatenate([t_event, t_censor]))

        # MLE optimization
        result = minimize(
            cls.weibull_neg_loglik,
            x0=np.array([init_k, init_lam]),
            args=(t_event, t_censor),
            method="L-BFGS-B",
            bounds=[(1e-6, None), (1e-6, None)],
        )

        # Extract the estimated parameters
        k_hat, lam_hat = result.x

        return Result(
            k=k_hat,
            lambda_=lam_hat,
            success=result.success,
            message=result.message,
        )


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
