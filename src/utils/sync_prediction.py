"""Regularized renewal forecasts; posterior uncertainty uses a Laplace approximation.

Time is measured in hours. Fits include right-censored silence. Candidate complexity
is weighted by chronological held-out predictive density, never by post-count tiers.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import minimize
from scipy.special import log_ndtr, logsumexp, softmax


MIN_CHECK_HOURS = 13 / 60
MAX_CHECK_HOURS = 24.0 * 30
CHECK_PROBABILITY = 0.63
FORECAST_HOURS = 24.0 * 366
DRAW_COUNT = 64
NODES, NODE_WEIGHTS = np.polynomial.legendre.leggauss(12)


@dataclass
class Exposure:
    ages: np.ndarray
    weights: np.ndarray
    features: np.ndarray
    event_ages: np.ndarray
    event_features: np.ndarray


def features(clock, burst, knots):
    daily = clock * (2 * np.pi / 24)
    weekly = clock * (2 * np.pi / 168)
    # UTC avoids assuming the creator's timezone. Cyclic phase learns their hours.
    calendar = np.column_stack((
        np.sin(daily), np.cos(daily), np.sin(weekly), np.cos(weekly),
        np.sin(2 * weekly), np.cos(2 * weekly), np.tanh(burst),
    ))
    drift = np.column_stack([
        np.interp(clock, knots, np.eye(len(knots))[i]) for i in range(len(knots))
    ])
    # Beyond the fitted window, activity reverts toward the account baseline.
    drift *= np.exp(-np.maximum(clock - knots[-1], 0)[:, None] / (24 * 90))
    return np.column_stack((calendar, drift))


def exposure(times, observed, knots, start_event=1):
    ages, weights, clocks, bursts = [], [], [], []
    event_ages, event_clocks, event_bursts = [], [], []
    activity = 0.0
    for i, start in enumerate(times):
        if i:
            activity = (activity + 1) * np.exp(-(start - times[i - 1]) / 24)
        end = times[i + 1] if i + 1 < len(times) else observed
        duration = max(0.0, end - start)
        if i + 1 < start_event or duration == 0:
            continue
        # Daily subdivisions resolve calendar peaks; logarithmic edges resolve bursts.
        edges = np.unique(np.concatenate((
            np.linspace(0, duration, max(2, int(np.ceil(duration / 24)) + 1)),
            np.geomspace(min(duration, 1e-4), duration, 16),
        )))
        half = np.diff(edges) / 2
        nodes = (edges[:-1, None] + half[:, None] * (NODES + 1)).ravel()
        ages.extend(nodes)
        weights.extend((half[:, None] * NODE_WEIGHTS).ravel())
        clocks.extend(start + nodes)
        bursts.extend(activity * np.exp(-nodes / 24))
        if i + 1 < len(times):
            event_ages.append(duration)
            event_clocks.append(end)
            event_bursts.append(activity * np.exp(-duration / 24))
    return Exposure(
        np.asarray(ages), np.asarray(weights),
        features(np.asarray(clocks), np.asarray(bursts), knots),
        np.asarray(event_ages),
        features(np.asarray(event_clocks), np.asarray(event_bursts), knots),
    )


@dataclass
class RenewalFit:
    components: int
    parameters: np.ndarray
    knots: np.ndarray
    prior_mu: float
    covariance: np.ndarray | None = None

    def log_hazard(self, ages, design, parameters=None, gradient=False):
        p = self.parameters if parameters is None else parameters
        k = self.components
        mu, sigma = p[:k], np.exp(p[k:2 * k])
        logits = np.concatenate((p[2 * k:3 * k - 1], [0.0]))
        log_weights = logits - logsumexp(logits)
        log_age = np.log(np.maximum(ages, 1e-10))[:, None]
        z = (log_age - mu) / sigma
        log_density = -0.5 * z ** 2 - np.log(sigma) - log_age - 0.5 * np.log(2 * np.pi)
        log_survival = log_ndtr(-z)
        density_sum = logsumexp(log_density + log_weights, axis=1)
        survival_sum = logsumexp(log_survival + log_weights, axis=1)
        value = density_sum - survival_sum + design @ p[3 * k - 1:]
        if not gradient:
            return value
        density_share = np.exp(log_density + log_weights - density_sum[:, None])
        survival_share = np.exp(log_survival + log_weights - survival_sum[:, None])
        mills = np.exp(-0.5 * z ** 2 - 0.5 * np.log(2 * np.pi) - log_survival)
        derivatives = np.column_stack((
            (density_share * z - survival_share * mills) / sigma,
            density_share * (z ** 2 - 1) - survival_share * z * mills,
            (density_share - survival_share)[:, :k - 1],
            design,
        ))
        return value, derivatives

    def loss(self, p, data, penalized=True, gradient=False):
        rates = self.log_hazard(data.ages, data.features, p, gradient)
        event_rates = self.log_hazard(data.event_ages, data.event_features, p, gradient)
        if gradient:
            log_rate, rate_gradient = rates
            events, event_gradient = event_rates
        else:
            log_rate, events = rates, event_rates
        exposure_rate = data.weights * np.exp(np.clip(log_rate, -700, 100))
        value = exposure_rate.sum() - events.sum()
        if gradient:
            derivative = rate_gradient.T @ (exposure_rate * ((log_rate > -700) & (log_rate < 100))) - event_gradient.sum(axis=0)
        if penalized:
            k = self.components
            value += 0.5 * np.sum(((p[:k] - self.prior_mu) / 1.5) ** 2)
            value += 0.5 * np.sum(((p[k:2 * k] - np.log(0.9)) / 0.6) ** 2)
            value += 0.5 * np.sum((p[2 * k:3 * k - 1] / 1.5) ** 2)
            coefficients = p[3 * k - 1:]
            value += 0.5 * np.sum((coefficients[:7] / 0.35) ** 2)
            drift = coefficients[7:]
            value += 0.5 * (drift[0] / 0.35) ** 2
            scale = 0.3 * np.sqrt(np.maximum(np.diff(self.knots) / (24 * 30), 0.1))
            value += 0.5 * np.sum((np.diff(drift) / scale) ** 2)
            if gradient:
                derivative[:k] += (p[:k] - self.prior_mu) / 1.5 ** 2
                derivative[k:2 * k] += (p[k:2 * k] - np.log(0.9)) / 0.6 ** 2
                derivative[2 * k:3 * k - 1] += p[2 * k:3 * k - 1] / 1.5 ** 2
                derivative[3 * k - 1:3 * k + 6] += coefficients[:7] / 0.35 ** 2
                drift_gradient = derivative[3 * k + 6:]
                drift_gradient[0] += drift[0] / 0.35 ** 2
                differences = np.diff(drift) / scale ** 2
                drift_gradient[:-1] -= differences
                drift_gradient[1:] += differences
        return (float(value), derivative) if gradient else float(value)

    @classmethod
    def fit(cls, times, observed, components, prior_mu):
        knots = np.linspace(times[0], max(observed, times[0] + 1), 4)
        data = exposure(times, observed, knots)
        gaps = np.diff(times)
        mu = np.quantile(np.log(gaps), np.linspace(0.2, 0.8, components))
        initial = np.concatenate((
            mu,
            np.full(components, np.log(0.9)),
            np.zeros(components - 1 + 11),
        ))
        fit = cls(components, initial, knots, prior_mu)
        bounds = (
            [(-10, 14)] * components + [(-2.5, 1.5)] * components
            + [(-5, 5)] * (components - 1) + [(-3, 3)] * 11
        )
        result = minimize(
            fit.loss, initial, args=(data, True, True), jac=True, method="L-BFGS-B",
            bounds=bounds, options={"maxiter": 250, "ftol": 1e-8},
        )
        if not result.success or not np.isfinite(result.fun) or not np.all(np.isfinite(result.x)):
            raise ValueError(f"Renewal fit did not converge: {result.message}")
        fit.parameters = result.x
        return fit, data

    def posterior_covariance(self, data):
        # Differentiate the analytic gradient: 2p evaluations instead of O(p²)
        # scalar losses, retaining the full posterior curvature.
        p = self.parameters
        n = len(p)
        steps = 1e-3 * (1 + np.abs(p))
        hessian = np.empty((n, n))
        for i in range(n):
            di = np.eye(n)[i] * steps[i]
            hessian[:, i] = (
                self.loss(p + di, data, gradient=True)[1]
                - self.loss(p - di, data, gradient=True)[1]
            ) / (2 * steps[i])
        hessian = (hessian + hessian.T) / 2
        eigenvalues, vectors = np.linalg.eigh(hessian)
        if not np.all(np.isfinite(eigenvalues)) or eigenvalues.min() <= 0:
            raise ValueError("Renewal posterior curvature is not positive definite")
        self.covariance = (vectors * (1 / eigenvalues)) @ vectors.T

    def survival(self, times, observed, grid, rng):
        ages = observed - times[-1] + grid
        recent = np.sum(np.exp(-(observed - times[:-1]) / 24))
        design = features(observed + grid, recent * np.exp(-grid / 24), self.knots)
        draws = rng.multivariate_normal(self.parameters, self.covariance, size=DRAW_COUNT)
        curves = []
        # Future log-activity follows a mean-reverting process. The draws below add
        # future process uncertainty to uncertainty in fitted historical parameters.
        for p in draws:
            k = self.components
            p[:k] = np.clip(p[:k], -10, 14)
            p[k:2 * k] = np.clip(p[k:2 * k], -2.5, 1.5)
            p[2 * k:] = np.clip(p[2 * k:], -5, 5)
            noise = np.zeros(len(grid))
            for j, step in enumerate(np.diff(grid), start=1):
                decay = np.exp(-step / (24 * 90))
                noise[j] = decay * noise[j - 1] + rng.normal() * 0.35 * np.sqrt(1 - decay ** 2)
            rate = np.exp(np.clip(self.log_hazard(ages, design, p) + noise, -700, 50))
            integral = cumulative_trapezoid(rate, grid, initial=0)
            curves.append(np.exp(-integral))
        return np.mean(curves, axis=0)


@lru_cache(maxsize=32)
def _fit_prediction(usable: tuple[datetime, ...], observed: datetime, prior_mu: float, prior_accounts: int):
    hours = np.array([t.timestamp() / 3600 for t in usable])
    at = observed.timestamp() / 3600
    # Short intervals resolve polling decisions; the long tail resolves uncertainty.
    grid = np.unique(np.concatenate((
        [0.0], np.geomspace(1e-6, 0.25, 80), np.linspace(0, 48, 193),
        np.arange(48, FORECAST_HOURS + 2, 2),
    )))
    warnings = []
    fits = []
    scores = []
    prior_rate = np.exp(-prior_mu)
    alpha = 2.0 + max(0, len(hours) - 1)
    beta = 2.0 / prior_rate + (max(0, at - hours[0]) if len(hours) else 0)
    baseline = np.exp(alpha * (np.log(beta) - np.log(beta + grid)))
    curves = [baseline]
    names = ["Bayesian exponential"]
    # Hold out a chronological suffix. This only makes complex candidates eligible;
    # sample count does not select a model. No future events enter a training fit.
    if len(hours) >= 5:
        cut = max(3, int(len(hours) * 0.8))
        train = hours[:cut]
        heldout = np.diff(hours[cut - 1:])
        a = 2.0 + len(train) - 1
        b = 2.0 / prior_rate + train[-1] - train[0]
        baseline_score = 0.0
        for gap in heldout:
            baseline_score += np.log(a) + a * np.log(b) - (a + 1) * np.log(b + gap)
            a += 1
            b += gap
        scores.append(baseline_score / len(heldout))
        for components in (1, 2, 3):
            try:
                trained, _ = RenewalFit.fit(train, train[-1], components, prior_mu)
                validation = exposure(hours, hours[-1], trained.knots, start_event=cut)
                score = -trained.loss(trained.parameters, validation, penalized=False) / len(heldout)
                if not np.isfinite(score):
                    raise ValueError("Non-finite chronological validation score")
                fitted, data = RenewalFit.fit(hours, at, components, prior_mu)
                fitted.posterior_covariance(data)
                fits.append(fitted)
                scores.append(score)
            except (ValueError, FloatingPointError, np.linalg.LinAlgError) as error:
                warnings.append(f"{components}-component model excluded: {error}")
    else:
        scores.append(0.0)
    rng = np.random.default_rng(19421)
    for fitted in fits:
        curves.append(fitted.survival(hours, at, grid, rng))
        names.append(f"{fitted.components}-component calendar renewal")
    # Soft predictive weights deliberately avoid claiming calibrated stacking weights.
    # Temperature is one nat per held-out interval; no in-sample score is used.
    weights = softmax(np.asarray(scores) - max(scores))
    survival = np.sum(np.asarray(curves) * weights[:, None], axis=0)
    if not np.all(np.isfinite(survival)):
        raise ValueError("Prediction produced non-finite probabilities")
    survival = np.minimum.accumulate(np.clip(survival, 0, 1))
    cdf = 1 - survival

    def quantile(probability):
        if cdf[-1] < probability:
            return None
        return observed + timedelta(hours=float(np.interp(probability, cdf, grid)))

    target = quantile(CHECK_PROBABILITY)
    if not usable:
        warnings.append("No observed posting intervals; using the explicit population/default prior.")
    # Plot the same predictive CDF used for quantiles, without renormalizing its tail.
    plot_end = float(np.interp(0.95, cdf, grid)) if cdf[-1] >= 0.95 else FORECAST_HOURS
    plot_grid = np.geomspace(8, max(24, plot_end), 97)
    forecast = {
        "version": "renewal-v1",
        "observed_through": observed.isoformat(),
        "sample_count": len(usable),
        "prior_accounts": prior_accounts,
        "prior_source": "Same-platform account medians" if prior_accounts else "Explicit 24-hour cadence prior",
        "inference": "MAP with Laplace parameter uncertainty and simulated future activity",
        "calendar_timezone": "UTC",
        "models": [
            {"name": name, "weight": float(weight), "validation_log_score": float(score)}
            for name, weight, score in zip(names, weights, scores)
        ],
        "median_at": quantile(0.5).isoformat() if quantile(0.5) else None,
        "interval_90": [value.isoformat() if value else None for value in (quantile(0.05), quantile(0.95))],
        "horizon_days": 366,
        "distribution": [
            {
                "at": (observed + timedelta(hours=float(hour))).isoformat(),
                "probability": float(np.interp(hour, grid, cdf)),
            }
            for hour in plot_grid
        ],
        "probabilities": {str(h): float(np.interp(h, grid, cdf)) for h in (1, 6, 24, 168)},
        "warnings": warnings,
    }
    return forecast, target, grid, cdf


def predict(
    times: list[datetime], observed: datetime, now: datetime,
    prior_mu: float = np.log(24), prior_accounts: int = 0,
) -> dict:
    usable = tuple(sorted({t.astimezone(timezone.utc) for t in times if t <= observed})[-1000:])
    # Wall-clock time changes scheduling, not the distribution conditioned on the
    # last verified observation. Any history, observation, or prior change refits.
    forecast, target, grid, cdf = _fit_prediction(usable, observed, prior_mu, prior_accounts)
    minimum = now + timedelta(hours=MIN_CHECK_HOURS)
    maximum = now + timedelta(hours=MAX_CHECK_HOURS)
    next_check = max(minimum, min(target or maximum, maximum))
    if target is None or target > maximum:
        reason = "Maximum 30-day interval"
    elif target < minimum:
        reason = "Minimum 13-minute interval; a post may already be available"
    else:
        reason = f"{CHECK_PROBABILITY:.0%} predicted probability of a new post"
    return {
        **forecast,
        "calculated_at": now.isoformat(),
        "probability_by_next_check": float(np.interp((next_check - observed).total_seconds() / 3600, grid, cdf)),
        "next_check_at": next_check.isoformat(),
        "reason": reason,
    }
