# Mathematics of account posting-time prediction

This document describes the implemented mathematical model. It distinguishes exact probability identities from numerical approximations and empirical modeling choices. All durations are measured in **hours**; calendar coordinates use UTC. All logarithms are natural logarithms.

## 1. Observations and the prediction target

Start with at most the latest 1,000 observed posts whose publication times do not exceed the verified observation boundary. Collapse equal publication timestamps into distinct posting events:

$$
t_1 < t_2 < \cdots < t_n \le c.
$$

Here $c$ is the time through which successful observation establishes coverage. Consequently $n$ can be smaller than the number of posts. Batch size is not modeled.

Define the completed intervals and the unfinished interval:

$$
x_i=t_i-t_{i-1},\qquad i=2,\ldots,n,
$$

$$
a=c-t_n.
$$

The first event is conditioned on; its preceding interval is unknown. The unfinished interval contributes evidence that no subsequent event occurred during $a$ hours. This is **right censoring**.

Let $D$ be the time from $c$ until the next event. The prediction target is the entire conditional distribution

$$
F_D(d)=P(D\le d\mid\mathcal D_c),\qquad d\ge0,
$$

where $\mathcal D_c$ contains the observed events and the confirmed silence.

Wall-clock time $w$ can be later than $c$. The interval $(c,w]$ is not automatically additional observed silence: a post may already have appeared there.

## 2. Empirical population prior

When suitable same-platform histories exist, define one summary for each eligible peer account:

$$
m_j=\operatorname{median}_i(\log x_{j,i}).
$$

The shared location parameter is

$$
\mu_0=\operatorname{median}_j(m_j).
$$

The implementation considers at most 30 peers, at most 1,000 distinct timestamps per peer, and requires at least three positive intervals for a peer summary. Peer observations are restricted to a time preceding the target account's validation suffix. Each eligible account contributes one median, so prolific peers do not automatically receive more weight.

Without eligible peers:

$$
\mu_0=\log24.
$$

This is an empirical-Bayes input: the estimated $\mu_0$ is treated as fixed. The model does not integrate over uncertainty in this population estimate or jointly fit a full population hierarchy.

## 3. Conjugate Bayesian baseline

The baseline assumes exponentially distributed completed intervals given a constant posting rate:

$$
X\mid\lambda\sim\operatorname{Exponential}(\lambda).
$$

Use a Gamma prior in **shape–rate** form:

$$
\lambda\sim\operatorname{Gamma}(\alpha_0,\beta_0),
\qquad
\alpha_0=2,\quad\beta_0=2e^{\mu_0}.
$$

Therefore

$$
E[\lambda]=\frac{\alpha_0}{\beta_0}=e^{-\mu_0}.
$$

With $n\ge1$, the event count and exposure after the first event are

$$
m=n-1,
\qquad
T=\sum_{i=2}^{n}x_i+a=c-t_1.
$$

The exact posterior is

$$
\lambda\mid\mathcal D_c
\sim\operatorname{Gamma}(\alpha,\beta),
\qquad
\alpha=2+m,\quad\beta=2e^{\mu_0}+T.
$$

Integrating over $\lambda$ gives the remaining-wait survival function:

$$
S_0(d)=P(D>d\mid\mathcal D_c)
=\left(\frac{\beta}{\beta+d}\right)^\alpha.
$$

Its density and quantile are

$$
f_0(d)=\frac{\alpha\beta^\alpha}{(\beta+d)^{\alpha+1}},
$$

$$
d_q=\beta\left[(1-q)^{-1/\alpha}-1\right].
$$

With zero events, the baseline retains the prior: there is no known first event from which to measure exposure. With one event, its observed silence updates $\beta$, although no completed interval exists.

The default expected rate is one event per 24 hours. This does **not** mean that the prior predictive expected wait is 24 hours:

$$
E[D]=\frac{\beta_0}{\alpha_0-1}=48\text{ hours}
$$

under the default prior. Integrating rate uncertainty creates a longer-tailed waiting-time distribution.

## 4. Mixture renewal candidates

Three richer candidates use $K=1,2,3$ log-normal mixture components:

$$
f_K(x)=\sum_{k=1}^{K}\pi_kf_k(x),
\qquad
\pi_k\ge0,\quad\sum_k\pi_k=1,
$$

$$
f_k(x)=\frac{1}{x\sigma_k\sqrt{2\pi}}
\exp\left[-\frac{(\log x-\mu_k)^2}{2\sigma_k^2}\right],
\qquad x>0.
$$

Using the standard normal cumulative distribution function $\Phi$:

$$
S_k(x)=1-\Phi\left(\frac{\log x-\mu_k}{\sigma_k}\right),
\qquad
S_K(x)=\sum_k\pi_kS_k(x).
$$

The baseline hazard is

$$
h_K(x)=\frac{f_K(x)}{S_K(x)}.
$$

Multiple components permit multiple likely interval ranges. Components are not persistent hidden activity states. Mixture locations are not ordered; their labels have no intrinsic behavioral interpretation.

Weights use $K-1$ free logits and one fixed reference logit:

$$
\pi_k=\frac{e^{z_k}}{\sum_{\ell=1}^{K}e^{z_\ell}},
\qquad z_K=0.
$$

## 5. Calendar, recent activity, and drift

For $t_i<t\le t_{i+1}$, with the final interval ending at $c$, define event age $u=t-t_i$. The conditional intensity is

$$
\lambda_K(t\mid\mathcal H_{t^-},\theta)
=h_K(u)\exp\{g(t)+bR_i(t)+d(t)\}.
$$

An intensity is a rate, not a probability. Approximately, conditional on the history, the probability of an event in a sufficiently short duration $\Delta$ is $\lambda_K(t)\Delta$.

### Calendar effects

The calendar term contains one daily harmonic and two weekly harmonics:

$$
\begin{aligned}
g(t)={}&\gamma_1\sin(2\pi t/24)+\gamma_2\cos(2\pi t/24)\\
&+\gamma_3\sin(2\pi t/168)+\gamma_4\cos(2\pi t/168)\\
&+\gamma_5\sin(4\pi t/168)+\gamma_6\cos(4\pi t/168).
\end{aligned}
$$

The time coordinate is hours since the UTC Unix epoch. Learned phase shifts represent preferred hours and weekly patterns. No creator timezone is inferred.

The harmonic functions have zero mean over a complete week, but their exponentiated multiplier is not explicitly normalized to mean one. Interval and calendar parameters are fitted jointly.

### Recent activity

The implemented recent-activity feature uses events **before the most recent event** $t_i$:

$$
R_i(t)=\tanh\left(\sum_{j<i}e^{-(t-t_j)/24}\right).
$$

The latest event already determines the age $u$; the additional feature summarizes earlier nearby events. This differs from a Hawkes model that adds excitation from every event, including the latest one.

The feature lies in $[0,1)$. Its coefficient $b$ can be positive or negative, allowing recent clusters to increase or decrease the modeled rate.

### Historical drift

Four equally spaced knots span $[t_1,\max(c,t_1+1)]$. Let their locations be $\kappa_1,\ldots,\kappa_4$ and their coefficients be $\delta_1,\ldots,\delta_4$.

The drift $d(t)$ linearly interpolates these coefficients. Beyond the final knot:

$$
d(t)=\delta_4e^{-(t-\kappa_4)/2160},\qquad t>\kappa_4,
$$

where 2,160 hours equals 90 days. This is a low-dimensional Gaussian random-walk drift representation with mean-reverting extrapolation, not an unrestricted Gaussian process.

## 6. Likelihood and regularization

Conditional on the first event, the log likelihood is

$$
\ell_K(\theta)
=\sum_{i=2}^{n}\log\lambda_K(t_i\mid\mathcal H_{t_i^-},\theta)
-\int_{t_1}^{c}\lambda_K(s\mid\mathcal H_{s^-},\theta)\,ds.
$$

At an event endpoint, the intensity is evaluated before resetting event age. The integral covers completed intervals and the current unfinished interval. Thus confirmed silence contributes to estimation even when no new post arrives.

The Gaussian penalties correspond to:

$$
\mu_k\sim\mathcal N(\mu_0,1.5^2),
\qquad
\log\sigma_k\sim\mathcal N(\log0.9,0.6^2),
$$

$$
z_k\sim\mathcal N(0,1.5^2),\qquad k<K,
$$

$$
\gamma_r\sim\mathcal N(0,0.35^2),\quad r=1,\ldots,6,
\qquad
b\sim\mathcal N(0,0.35^2),
$$

$$
\delta_1\sim\mathcal N(0,0.35^2),
$$

$$
\delta_j-\delta_{j-1}\sim
\mathcal N\left(0,
0.3^2\max\left\{\frac{\kappa_j-\kappa_{j-1}}{720},0.1\right\}\right),
\qquad j=2,3,4.
$$

MAP estimation minimizes

$$
J_K(\theta)=-\ell_K(\theta)-\log p(\theta)
$$

up to constants, subject to these optimization bounds:

| Parameter | Bounds |
|---|---|
| $\mu_k$ | $[-10,14]$ |
| $\log\sigma_k$ | $[-2.5,1.5]$ |
| Free mixture logits | $[-5,5]$ |
| Calendar, recent-activity, and drift coefficients | $[-3,3]$ |

The candidate has $3K+10$ free parameters: 13, 16, or 19. Prior scales and temporal decay constants are fixed modeling choices, not quantities learned from the account.

## 7. Approximate parameter and future-activity uncertainty

The optimizer uses the analytic gradient $g(\theta)=\nabla J_K(\theta)$. At the MAP estimate $\hat\theta$, compute each Hessian column by central differences of that gradient:

$$
\widetilde H_{:,i}=\frac{g(\hat\theta+h_i e_i)-g(\hat\theta-h_i e_i)}{2h_i},
\qquad h_i=10^{-3}(1+|\hat\theta_i|),
\qquad H=\frac{\widetilde H+\widetilde H^\mathsf T}{2}.
$$

If it is finite and positive definite, use the Laplace approximation

$$
\theta\mid\mathcal D_c\approx\mathcal N(\hat\theta,H^{-1}).
$$

A candidate with a failed optimization or invalid curvature is excluded. The conjugate baseline remains available.

For each retained renewal candidate, take 64 reproducible parameter draws. Numerical clipping keeps mixture locations within $[-10,14]$, log scales within $[-2.5,1.5]$, and remaining parameters within $[-5,5]$. These clipped draws are not samples from an exact truncated posterior; the coefficient clipping range also differs from its MAP fitting range.

Additional future log-activity noise starts at zero at $c$. On forecast offsets $v_0=0<v_1<\cdots$, simulate

$$
\eta_0=0,
$$

$$
\eta_j=\rho_j\eta_{j-1}
+0.35\sqrt{1-\rho_j^2}\,\epsilon_j,
\qquad
\rho_j=e^{-(v_j-v_{j-1})/2160},
\qquad
\epsilon_j\sim\mathcal N(0,1).
$$

The draw-specific future intensity multiplies the deterministic intensity by $e^{\eta_j}$. This mean-reverting noise introduces future process uncertainty in addition to parameter uncertainty. Its amplitude and time scale are assumed rather than estimated from the historical drift.

## 8. Remaining-wait survival

For a parameter and future-noise draw, evaluate the rate along a path with **no intervening new event**:

$$
S_K^{(r)}(d)
=\exp\left[-\int_0^d
\lambda_K^{(r)}(c+v\mid\mathcal H_c,\text{ no event before }c+v)
\,dv\right].
$$

Event age on this path is $a+v$; recent activity decays without adding hypothetical new posts. The posterior predictive approximation is

$$
\widehat S_K(d)=\frac{1}{64}\sum_{r=1}^{64}S_K^{(r)}(d).
$$

For a fixed ordinary renewal distribution, without calendar or drift modulation, this reduces to the familiar identity

$$
P(D>d\mid X>a)=\frac{S_X(a+d)}{S_X(a)}.
$$

The unconditional mean interval is not added to the current time.

## 9. Chronological model weighting

With fewer than five distinct events, use only the conjugate baseline. Otherwise define

$$
r=\max(3,\lfloor0.8n\rfloor).
$$

Fit renewal candidates on $t_1,\ldots,t_r$, ending the training exposure at $t_r$. Score the remaining $n-r$ intervals chronologically. Candidate scores are mean unpenalized log densities:

$$
s_K=\frac{1}{n-r}\sum_{i=r+1}^{n}
\left[
\log\lambda_K(t_i)-\int_{t_{i-1}}^{t_i}\lambda_K(s)\,ds
\right].
$$

Renewal parameters remain fixed at their training MAP estimates during scoring. Features may use preceding validation events once those events are part of the available past; they do not use later events.

The baseline uses its exact predictive density for each validation interval and updates its Gamma parameters after observing that interval:

$$
\log f_0(x)=\log\alpha+\alpha\log\beta-(\alpha+1)\log(\beta+x),
$$

$$
\alpha\leftarrow\alpha+1,\qquad\beta\leftarrow\beta+x.
$$

This makes the scoring procedures asymmetric: the baseline updates its parameters online, whereas the renewal candidates retain their training parameters.

Refit eligible renewal candidates using all observed events and the right-censored interval, and retain candidates with valid curvature. Across the baseline and retained candidates, define

$$
w_m=\frac{e^{s_m-s_{\max}}}{\sum_j e^{s_j-s_{\max}}}.
$$

The final survival distribution is

$$
\widehat S(d)=\sum_mw_m\widehat S_m(d),
\qquad
\widehat F(d)=1-\widehat S(d).
$$

These are soft weights from mean historical log scores. They are neither exact Bayesian model probabilities nor weights optimized by predictive stacking. Using mean scores keeps their effective temperature at one nat per interval rather than allowing weights to sharpen automatically with validation sample size.

## 10. Successful empty observations

If a successful observation extends the boundary from $c$ to $c'>c$ without a new event, the event timestamps stay unchanged and the censored age increases from $c-t_n$ to $c'-t_n$.

For a fixed model, the additional likelihood factor is

$$
\frac{S_X(c'-t_n)}{S_X(c-t_n)}.
$$

Equivalently, in the intensity formulation, it is the survival probability over the newly observed interval $(c,c']$.

The implemented calculation refits from the event history and the new complete censored interval. It does not multiply previously included silence into the likelihood again. Renewal parameters, drift, and future predictions can therefore change even without a new post. Historical validation weights are not themselves an exact Bayesian update on this new silence.

For illustration, keep a renewal distribution fixed and suppose

$$
F_X(24)=0.50,\qquad F_X(30)=0.80.
$$

After observing no event for 24 hours:

$$
P(X\le30\mid X>24)
=\frac{0.80-0.50}{1-0.50}=0.60.
$$

There is a 60% conditional probability of an event in the next six hours. The event clock still starts at the last publication time.

## 11. Quantiles and the check-time decision

For $0<q<1$, define

$$
d_q=\inf\{d:\widehat F(d)\ge q\}.
$$

The absolute median is $c+d_{0.5}$. The approximate central 90% prediction interval is

$$
[c+d_{0.05},\ c+d_{0.95}].
$$

The model also reports $\widehat F(1)$, $\widehat F(6)$, $\widehat F(24)$, and $\widehat F(168)$.

The probabilistic check-time target uses the 63rd percentile. If $w$ is the calculation's current-time reference, its bounded decision rule is

$$
t_{\mathrm{check}}
=\max\left\{w+\frac{13}{60},\ \min\{c+d_{0.63},w+720\}\right\}.
$$

The lower and upper limits are 13 minutes and 30 days, expressed in hours. They are policy choices, not learned properties of the account. If the percentile is beyond the numerical horizon, the upper check limit is used. This forecast rule is separate from operational completion guards and error retries.

## 12. Numerical approximations and interpretation limits

The likelihood integral uses 12-point Gauss–Legendre quadrature on subintervals formed from a daily subdivision and logarithmically spaced near-event boundaries. Future cumulative hazards use trapezoidal integration on a grid refined near zero, spaced by 15 minutes through 48 hours, and by two hours thereafter, through 366 days. Quantiles are obtained by interpolation. Unreached quantiles are reported as unavailable beyond that horizon rather than forced to the horizon boundary.

Log-sum-exp and log survival calculations stabilize mixture arithmetic. Ages are floored at $10^{-10}$ hours when taking logarithms. Log rates are clipped to $[-700,100]$ in likelihood integration and $[-700,50]$ in forecasting. These are numerical safeguards that can affect extreme parameter combinations.

The model assumes the retained event history is sufficiently representative of the creator's posting process. Missing or deleted posts can distort inferred intervals; the model has no explicit missing-event mechanism. Equal timestamps lose batch-count information when grouped. Calendar effects, recent activity, and drift can partially explain the same behavior, so regularization is important.

The renewal posterior is approximated around one local optimum; mixture multimodality, parameter boundaries, and empirical population uncertainty are not fully integrated. Calendar and drift uncertainty during validation scoring is also omitted. Consequently a reported 90% interval is a nominal model-based interval, not a demonstrated 90% coverage guarantee. Calibration, accuracy, and the choice of fixed hyperparameters require evaluation on chronological forecasts from representative histories.
