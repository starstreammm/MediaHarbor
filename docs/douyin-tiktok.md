# Douyin and TikTok integration

MediaHarbor imports the unmodified [upstream DTK source](https://github.com/Evil0ctal/Douyin_TikTok_Download_API/tree/b5505e3830a2e4b9b8608962f58e96dfe75f23c5), pinned to `b5505e3830a2e4b9b8608962f58e96dfe75f23c5`. The Git submodule is `src/services/dtk/source`; its original `src/dtk` and `docker/browser_rpc` paths are preserved. All MediaHarbor adaptations live directly in `src/services/dtk`. Neither bundled component runs an HTTP server, and they never communicate over HTTP RPC.

## Installation and lifecycle

Use Python 3.14 or newer, as declared in MediaHarbor's `pyproject.toml`:

```sh
git submodule sync
git submodule update --init --recursive
uv sync --locked
uv run python -m cloakbrowser install
uv run src/start.py
```

On Linux, Chromium also needs system libraries and fonts. The application Dockerfile installs these on a glibc-based Python image; Alpine is unsuitable for this browser stack. CloakBrowser comes from `CloakHQ/cloakbrowser` at `fbf005bc199920b592df17ac4d489324e29d56d8`. Its Playwright, greenlet, pyee, cryptography, cffi, pycparser and SOCKS dependencies match the pins in upstream's browser requirements. Do not install the complete upstream application: its database and scheduler dependencies are not needed.

The application starts identity maintenance after PostgreSQL initialization. It mints guests for enabled DTK platforms, independently of their authenticated accounts. Browser startup is lazy and happens within the application's maintenance task. `BrowserRpcService`, `build_backend` and `Settings` are imported directly from the unchanged browser package. The adapter enforces the real CloakBrowser backend, disables prewarming and signing contexts, and calls `BrowserRpcService.mint()` directly. Shutdown cancels maintenance and closes browser resources before closing PostgreSQL.

First-time setup still registers and initializes the platform services through the APIs step. Pool generation runs in the background; an empty pool reports Unavailable until a usable identity exists. Local adapter initialization does not claim successful upstream access.

## Identity storage and configuration

Guest and authenticated cookies, complete authenticated browser state, QR images and proxy URLs use upstream's AES-256-GCM `Cipher`, with the identity UUID bound as additional authenticated data. Fingerprints, measured egress metadata, state, counters, cooldowns, leases and recent generation errors use standard PostgreSQL tables initialized by `src/sql/016_table_create_guest_identities.sql` and `018_authenticated_identities.sql`. There are no PostgreSQL extensions, Redis instances, or separate migration commands.

By default an encryption key is generated atomically in `cache/dtk-identity.key`, readable only by its owner. Back up that file with the database and keep it outside database backups exposed to readers. Workers must share the cache volume or receive the same `MEDIAHARBOR_DTK_SECRET_KEY` (at least 32 characters). Losing the encryption keys makes existing encrypted identities unreadable; no fallback key is created over an existing pool. Guest generation reports the missing key explicitly, and QR login checks key availability before starting a browser or retiring an account for re-login. Restore the original key or deliberately retire the unreadable credentials before generating replacements. Encryption keys are deployment-managed and are not editable in the WebUI. Preserve prior keys when performing an operator-managed key rotation.

Open **API Health → Guest pool settings** (the header gear) to edit minimum/target sizes, the shared proxy URL and username/password, and each platform’s proxy switch. The defaults are **13 / 33** for both platforms. Saved settings take precedence over these deployment defaults:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MEDIAHARBOR_DTK_DOUYIN_MIN_SIZE` | `13` | Douyin low-water mark |
| `MEDIAHARBOR_DTK_DOUYIN_TARGET_SIZE` | `33` | Douyin refill target |
| `MEDIAHARBOR_DTK_TIKTOK_MIN_SIZE` | `13` | TikTok low-water mark |
| `MEDIAHARBOR_DTK_TIKTOK_TARGET_SIZE` | `33` | TikTok refill target |
| `MEDIAHARBOR_DTK_DOUYIN_PROXY_URL` | direct | Egress for new Douyin identities and logins |
| `MEDIAHARBOR_DTK_TIKTOK_PROXY_URL` | direct | Egress for new TikTok identities |
| `MEDIAHARBOR_DTK_SECRET_KEY` | shared cache file | Stable encryption secret |

The dialog saves to `cache/dtk-settings.json` with owner-only permissions and an atomic replacement. Keep that file and `cache/dtk-identity.key` with the deployment’s protected cache backup. Passwords and keys are write-only in the API: blank fields preserve existing secrets, and an explicit checkbox removes a proxy password. Operator-managed key rotation through the backend retains prior keys in the private settings file so existing and in-flight guest identities remain readable; new writes use the new secret. Configuration writes are serialized with a PostgreSQL advisory lock. All workers must share the same cache volume when using saved settings.

Pool bounds apply on the next maintenance cycle (normally within 15 seconds). Proxy changes apply only to new identities and login sessions; existing identities retain their original egress. Before the first UI save, legacy per-platform proxy environment variables still apply. After saving, both platform switches select the same shared proxy, with authentication encoded from the separate username/password fields. If legacy platform proxies differ, the dialog calls out that saving replaces them with the shared proxy.


Use `1 <= minimum <= target`; `0/0` disables replenishment. Use identical settings on all application workers. An identity retains its minting proxy and fingerprint for its lifetime, including after deployment settings change. Browser-specific timeout and geographic settings still use upstream's `DTK_BROWSER_*` environment variables. Backend choice, profile directory, prewarm and signing-context settings are controlled by MediaHarbor.

The refill loop preserves DTK's strategy: count active plus cooling identities, enter refill below the minimum, and continue to the target. Identities with three consecutive failures do not count toward the usable level; if every live identity is failing, hold the live level rather than treating a platform incident as a shortage. Only one identity is minted at a time across workers, no more than once per minute. Failed minting backs off exponentially from 60 seconds to one hour, shared by both browser-backed platforms. PostgreSQL advisory locks and a persisted generation deadline coordinate the loop.

Selection reuses upstream's pure health scoring and endpoint policies without importing its Redis-dependent scheduler package. It ranks active identities before degraded fallback identities, then health tier, half-second least-recently-used buckets and per-call jitter. Per-endpoint token buckets and UUID-fenced leases are acquired atomically under PostgreSQL row locks. Requests have a 120-second hard budget within a 150-second lease. Network failures refund quota; business errors do not harm the identity. Risk control applies upstream's exponential cooldown and endpoint risk weight, capped at six hours. Elapsed cooldowns recover on demand and during maintenance without erasing failure history. Endpoint circuits use upstream's five-minute window, 20-sample minimum, 60% risk threshold, three distinct identities and one half-open probe per minute.

Retirement is explicit through `IdentityManager.retire`, wipes encrypted credentials and invalidates outstanding leases so their completions cannot restore the account. Risk failures remain recoverable instead of causing arbitrary permanent retirement. Maintenance removes retired rows after 30 days and old health-window observations after one hour.

## Requests and credentials

Each platform module is a thin `ServiceAPI` subclass. `src/services/__init__.py` preserves the public `APIUtil` interface and return models. DTK owns URL identification/resolution, endpoint parameters, native signing, `WreqTransport`, response classification and parsers. MediaHarbor acquires an identity, converts its fingerprint/cookies/proxy into the upstream contracts, adapts normalized results to MediaHarbor models and records the outcome. Set-Cookie rotation is encrypted back into the same guest row before releasing the lease.

The transport compatibility hook converts wreq response buffers to bytes and disables automatic redirects. DTK's URL resolver validates every redirect hop; resolution requests carry no cookies and cannot modify an identity's jar. Guest cookies are also kept out of Aria2, which cannot reproduce the identity's TLS fingerprint and bound egress; media downloads retain ordinary platform headers, as in upstream's cookie-free media worker. Authenticated account cookies are also kept out of media download headers.

Only account posts (`GET /posts`, key `posts`) require an authenticated identity. Douyin profile fetching tries up to six different guest identities and, if they all fail, one available authenticated identity. If the guest pool runs out sooner, it proceeds to the authenticated fallback without reusing a guest. A failed or unavailable fallback returns a profile-fetch failure. Other operations use guests, regardless of legacy platform-wide login configuration or upstream paging metadata. Posts never fall back to guests: no available authenticated identity returns `LOGIN_REQUIRED`. Add accounts in API Health; older single Cookie-header settings must be replaced through QR login or validated browser-session import.

Douyin and TikTok QR login call CloakBrowser's async launcher directly, using the same pinned Playwright package and browser binary resolver as DTK guest generation. Each login owns an independent browser process and context; it never uses `browser_rpc` or guest profiles. There is no separate Playwright Chromium installation. The pinned CloakBrowser release ships different native builds: macOS uses `145.0.7632.109.2`, Linux x64 uses `146.0.7680.177.5`, and Linux ARM64 uses `146.0.7680.177.3` by default. Both paths share CloakBrowser's environment overrides and cache selection on each host; the package pin does not imply identical Chromium versions across operating systems.

After creator QR sign-in, login opens `https://www.douyin.com/` in a second tab in the same browser context and waits for web login and UIFID signing cookies. Successful scans are then validated through an authenticated self-profile request using the same fingerprint and proxy before encrypted storage. TikTok opens `https://www.tiktok.com/login/qrcode`, exports `div[class*="DivCodeImage"] canvas` as PNG, and validates the signed-in session through its account-info endpoint before saving it to its own pool. Both platforms also support validated browser-session import. Complete cookie records are retained alongside the current transport jar. See [API Health](api-health.md) for lifecycle, import format, management routes and re-login behavior.

Guest `BodyEmpty` responses are failures, retried with at most three distinct identities and bounded backoff, except Douyin profiles, which use the six-guest/one-authenticated sequence for fetch failures. Each Douyin profile attempt receives the configured timeout, with a total limit of seven times that timeout plus eight seconds for backoff; the profile dialog allows this longer sequence to finish. Authenticated posts requests rotate only authenticated identities. API Health counts every attempt independently and displays separate guest and authenticated capabilities, including Partial availability. A single temporary failure does not retire an identity or demand re-login.

## Updating upstream and manual verification

Replace or update the submodule as one dependency. Review browser pins and the external compatibility layer together. Do not edit upstream files, copy its algorithms into platform services, or start upstream's server. `upstream.py` loads the pure health and policy modules from their original files under MediaHarbor's namespace to avoid the scheduler package's infrastructure imports.

Tests not run (per instruction). No MediaHarbor test command is defined. These are manual static and runtime inspection commands; run the curl commands only after starting MediaHarbor and initializing its database:

```sh
npm run typecheck
git -C src/services/dtk/source status --short
curl --fail-with-body http://localhost:38888/integrations/services
curl --fail-with-body http://localhost:38888/init/api/catalog
```

Browser minting, PostgreSQL concurrency, content retrieval and container startup still require runtime verification. Live QR extraction, session validation and proxy compatibility were not exercised. Python syntax was parsed. The repository TypeScript check includes the separate bundled DTK web app and reports missing dependencies and aliases there; no live browser sessions or API requests were run.
