# API Health and integrations

Open **API Health** in the sidebar (`/api-health`) to inspect platforms, endpoint health and authenticated accounts. Platforms share one monitoring view. Authentication belongs to individual endpoints; built-in DTK account posts (`GET /posts`, key `posts`) require login. Douyin profiles try guest identities first and can fall back to an authenticated identity; other operations use guests. The page uses the same app bar as Posts and Dashboard, the existing MUI theme, and MUI X Charts. **Check** makes real upstream requests. Stored monitoring data refreshes automatically every 30 seconds.

## Supported services and configuration

Embedded Douyin and TikTok services are registered when the user starts the APIs setup step and run entirely inside MediaHarbor. Initialization is independent of account login. Later launches restore this step automatically only after it has been completed. Add authenticated accounts during initialization or in API Health; legacy platform-wide Cookie headers are no longer used for DTK requests. No upstream API server is needed. See [Douyin and TikTok](douyin-tiktok.md).

For developer-managed integrations, the optional external HTTP template targets [Evil0ctal/Douyin_TikTok_Download_API v5](https://github.com/Evil0ctal/Douyin_TikTok_Download_API). Run that service separately and use a URL reachable **from the MediaHarbor backend**. The template URL `http://douyin-api:8000` is a placeholder, not an automatically deployed service. Set the actual hostname, port, and optional base path for your deployment.

1. Initialize MediaHarbor's PostgreSQL database through the existing setup flow. Integration and guest-pool tables are created by the normal database initialization. Existing installations need a backend restart or database reinitialization to create them.
2. Built-in platforms appear after API initialization. Platform registration and configuration are developer-managed; the WebUI has no Add platform or Edit platform controls. Use **Add account** on Douyin or TikTok for QR login, or **Import session** for either platform, during initialization or on API Health.
3. Developers configure the check interval (60–86400 seconds, default 300) and request timeout (1–30 seconds, default 10) through platform configuration.
4. Review endpoint status and enabled switches in the platform details dialog. Readiness and capabilities probes are enabled in the template. Douyin and TikTok video, profile, posts, and task-result endpoints are also registered.
5. Content probes require valid, non-sensitive sample query parameters, such as `{"aweme_id":"YOUR_VIDEO_ID","wait":5}`. Developers should enable probes only when those requests are appropriate to repeat. The task-result path uses `{task_id}` and is observed through user requests, not scheduled probes.

For HTTP services, credentials are sent only by the backend as `X-API-Key`. A blank key field preserves the saved value; **Remove saved credentials** clears it. Configuration responses expose only `has_api_key`. External HTTP API keys retain their existing PostgreSQL storage without application-level encryption; restrict database and backup access. Probe parameters are visible in configuration responses, so do not put secrets in them.

### External HTTP API credentials

- **Reauthenticate:** issue or renew a key with the provider, then enter the replacement key and optional expiry. The backend replaces the credential, records the reauthentication time, and resets the observed health and credential status to Unknown. This API-key adapter does not automate the provider's login or key-issuance UI.
- **Refresh credentials:** calls the configured **Credential-check endpoint** with the saved key and that endpoint's probe query parameters. It checks the configured operation without extending credential expiry; DTK accounts instead persist rotated cookies through the encrypted identity pool. The default v5 endpoint is `capabilities`. For another API, select a safe endpoint that actually requires authentication; a public readiness URL cannot verify a key. The endpoint must be enabled; automatic probing may remain off.
- **Expiry:** enter the provider's expiry in local time; the backend stores an offset-aware timestamp. Blank means unknown, not a promise that the key never expires. A past configured expiry immediately makes the credential status Expired and the enabled service Expired. For HTTP services, Refresh can still contact the provider, but it does not override that expiry; DTK identities use their own cookie expiry and validation state. Have the deployment owner correct the configuration or replace it during reauthentication.
- **Credential state:** displays Missing, Unknown, Healthy, Expired, Error, or Unavailable, along with last check and reauthentication timestamps. Missing credentials block upstream requests locally. A failed credential-check endpoint does not turn every 401/403 into Expired.

Platform details expose monitoring, enable/disable and endpoint controls; general configuration editing is not shown in the WebUI. Built-in platforms can be disabled, while custom platforms can also be deleted. Guest cookies are generated automatically and remain separate from authenticated accounts.

**Access model:** MediaHarbor currently has no application authentication, users, or administrator roles. These routes use the same access boundary as existing settings routes; they do not provide an admin/user permission distinction. Use trusted access or a deployment authentication gateway. To separate administrators from callers, that gateway must restrict configuration, check, and monitoring routes to administrators while allowing the request route to authorized callers. Configured hosts may be private network services, so configuration access must be trusted. Callers cannot supply an arbitrary proxy URL, headers, or HTTP method. HTTP-service redirects and environment proxy discovery are disabled. Embedded URL resolution follows only hops validated by the upstream allowlist.

The embedded Douyin and TikTok adapters now use this same integration system. Initializing a platform creates its built-in Python service automatically; its requests appear in these charts without a separate upstream server. The old v5 HTTP template remains available for separately configured external services. See [Douyin and TikTok](douyin-tiktok.md) for direct integration details.

For other services, select **Generic JSON API**, replace the template endpoints, and configure GET paths. This adapter recognizes explicit `success: true`, `status: "ok"`, `code: 0/200` (numeric or string), or `status_code: 0`. Contradictory error fields take precedence. Arbitrary JSON or an HTTP 200 without a recognized success marker is an Error. For a different response contract or authentication scheme, add a small adapter branch in `src/base/integration.py` and a provider kind in the backend/frontend models and developer-managed platform configuration. POST upstream methods, binary downloads, and automatic endpoint discovery are not implemented.

Endpoint keys identify persisted statistics. Removing or renaming a key removes its old statistics and history. Other edits preserve counters but reset observed statuses to Unknown until the next request. Provider/platform/transport identities and endpoint platform assignments cannot be changed in place; create a new service or endpoint key. Built-in adapter services retain all operation keys and are disabled rather than deleted. Disabling retains history. Deleting a service deletes its credentials, endpoint statistics, and request history.

## DTK authenticated accounts and QR login

Douyin **Add account** opens a separate headless CloakBrowser session at `https://creator.douyin.com/creator-micro/content/upload`, using the same pinned Playwright and browser package as DTK guest generation. After the login page loads, the backend locates `#animate_qrcode_container img`, including inside page frames, and waits for the image to be visible and loaded. It decodes the image's Base64 `src` directly when it contains a supported PNG. For other image sources, unsupported formats or undecodable Base64, it falls back to a Playwright screenshot of that QR image element. It does not capture the full page or use DTK `browser_rpc` for login. If the page provides no QR image within 45 seconds after navigation, the session reports a failure. Scan and confirm in Douyin. A signed self-profile request must prove authentication before the account is saved; a redirect alone is not sufficient. `confirmed` means validation and persistence have completed.

TikTok **Add account** opens `https://www.tiktok.com/login/qrcode` in its own browser session. The backend locates the visible `div[class*="DivCodeImage"] canvas` and exports it with `canvas.toDataURL("image/png")`. The existing QR endpoint serves the decoded PNG to the frontend. TikTok reuses the same polling, expiry, cancellation, renewal, validation and encrypted persistence flow. Its session is validated against the TikTok account-info endpoint with cookies scoped to that endpoint; it does not require Douyin UIFID cookies or a creator-to-web handoff. Restart the backend after upgrading so normal database initialization applies `022_tiktok_qr_login.sql`, allowing TikTok login-session rows.

The same browser context stays alive through page redirects, QR display, scanning, confirmation and validation. The backend polls the selected image for changes and updates the displayed QR when its bytes change. Temporarily unavailable images are retried; one element timeout does not end the login session. There is no homepage login-button search or QR-tab clicking.

Pending logins expose a `phase`: `waiting` for the QR scan, `scanned` when the login page displays scan confirmation, `preparing` once login cookies arrive (and Douyin web is opened for Douyin), and `validating` while the account is checked and saved. Once a scan or login is detected, the backend clears the QR image and the dialog replaces it with a circular progress indicator and the current step. Scanned users are prompted to confirm on their phone; users who have confirmed are asked to keep the dialog open until preparation completes. The dialog continues polling and closes only after validation and persistence succeed. Scan detection depends on the login page's visible confirmation text; login cookies also trigger progress even if that text was missed. The phase column is added by the normal database initialization on backend restart.

After creator sign-in sets session cookies, the backend opens `https://www.douyin.com/` in a second tab in that same context, preserving the signed-in session, fingerprint and proxy. The creator tab stays open so its SSO callbacks can finish. The backend waits up to 45 seconds after web navigation for both a login cookie and a UIFID cookie recognized by DTK in the web API's scoped cookie jar. It then validates the session and encrypts the updated cookies and full browser state. Missing web signing cookies produce an explicit failure instead of saving an account that cannot supply DTK's web signature. The overall three-minute login deadline still applies. Accounts saved before this preparation step need a new QR login to collect the missing cookies.

QR login and session import open in dialogs that close automatically after successful validation and saving. The QR dialog polls pending logins every two seconds and offers **Cancel** and **New QR code** after expiry or failure. Up to four concurrent logins across backend workers have isolated browser processes and contexts. Sessions expire after three minutes; browser cleanup runs on completion, cancellation, timeout and shutdown. Heartbeats expire abandoned jobs after one minute, and terminal records are deleted after an hour. QR images are encrypted in PostgreSQL, served with `Cache-Control: no-store`, and erased on completion. Closing the QR dialog cancels its pending login. Completed or missing sessions clear the local session ID; old IDs are not restored from browser storage. Page navigation or reload leaves cleanup to the backend deadline. Account cards never display the transient QR-session controls. Images have a white background for scanning and a reload action if delivery fails.

Each platform has independent guest and authenticated pools. Complete original browser cookie records (including domains, paths, flags and expiry), browser storage metadata, the current transport cookie jar, and proxy credentials are encrypted through `IdentityManager`. Fingerprints and User-Agent are preserved. Proxy settings bind at login/import time and remain fixed for signing and transport. Install the shared browser with `uv run python -m cloakbrowser install`; Docker uses the same installer. Playwright's separate Chromium download is not used.

Use **Import session** for a browser session on either platform, including TikTok. Paste JSON with `cookies` (complete browser cookie records), `user_agent`, `browser_platform`, `screen` (for example `1440x900`), `language`, `timezone`, and optional `hardware_concurrency` and `device_memory`. The source browser must use the platform's configured proxy. An authenticated self/account-info response is required; public profiles never validate login. Unsupported or changed upstream validation responses fail closed. QR and validation contracts depend on the live websites and require deployment verification.

Accounts show health, lifetime success rate, last successful request and cooldown. Healthy identities are preferred and least-recently-used peers rotate. Expired session cookies immediately remove an account from rotation. Three explicit authentication failures require re-login; temporary failures cool down without a re-login warning. A warning also appears after at least ten recent samples below 30% success combined with repeated authentication failures. Accounts are revalidated on use when the last successful validation/request is over six hours old.

**Remove** immediately retires the account, erases encrypted credentials and fences outstanding leases. **Re-login** removes the old identity before replacement; other accounts remain available. Douyin and TikTok both use a new QR login. Requests already sent upstream cannot be recalled, but their completion cannot reactivate a removed identity.

Account posts use only authenticated identities, with at most three different accounts per request. Missing available accounts return `LOGIN_REQUIRED`; guest identities are never a fallback. Douyin profiles try six distinct guests for fetch failures, then one authenticated identity. They stop at the first success, move to the authenticated fallback early if no different guest is available, and report a profile-fetch failure if the fallback fails or is unavailable. Each profile attempt has the configured timeout; the total budget is seven times that timeout plus eight seconds for backoff. Other guest operations treat empty bodies as `BodyEmpty` failures and retry up to three distinct identities with exponential backoff and jitter within the configured overall timeout. A single empty body cools an identity without retiring it. API Health records every attempt, so a successful request after two empty bodies contributes three attempts and two failures to charts and counters.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/api/integrations/platforms/{platform}/accounts` | List safe account metadata / validate and import a browser session. |
| DELETE | `/api/integrations/platforms/{platform}/accounts/{uid}` | Retire and erase an authenticated account. |
| POST | `/api/integrations/platforms/{platform}/logins` | Start Douyin or TikTok QR login; optional `replace_identity` removes an old account atomically. |
| GET | `/api/integrations/logins/{uid}` | `pending`, `confirmed`, `expired`, `failed` or `cancelled`, progress phase, QR version and expiry. |
| GET | `/api/integrations/logins/{uid}/qr` | Original PNG; no cache. |
| DELETE | `/api/integrations/logins/{uid}` | Cancel login and release its browser. |
| POST | `/api/integrations/logins/{uid}/renew` | Cancel the old session and create an isolated replacement. |

## Status definitions

| Status | Meaning |
| --- | --- |
| Partial | Guest access remains available but authenticated endpoints are unavailable, or authenticated access remains while the guest pool is unavailable. |
| Degraded | An identity has recent failures or a sustained low success rate. Temporary risk control does not by itself require re-login. |
| Login Required | No usable authenticated identity, expired session cookies, or repeated explicit authentication failures. |
| Healthy | The latest request passed both HTTP and the adapter's response checks. |
| Expired | An explicit `TOKEN_EXPIRED`, `CREDENTIALS_EXPIRED`, `API_KEY_EXPIRED`, or `SESSION_EXPIRED` code was returned; service credential state also uses the configured expiry time. |
| Error | HTTP error (including 401/403), business error, failed upstream task, unexpected response, redirect, invalid URL, or response over 5 MiB. |
| Unavailable | A connection, TLS, network, or timeout failure prevented completion. |
| Unknown | No observation yet, or configuration changed since the last observation. |
| Disabled | The service or endpoint is switched off; requests are rejected locally. |

HTTP 401/403 alone never means expired credentials. The v5 adapter reads the `success`/`error` envelope, readiness probes read `status`, and task polling also detects `data.state: "failed"`. Upstream messages and response bodies are not persisted; errors contain HTTP status and sanitized error codes. Recovery clears the current endpoint error while retaining the most recent error and its timestamp.

External HTTP platforms report the worst enabled endpoint status in this order: Expired, Unavailable, Error, Unknown, Healthy. Missing external API keys make the platform Error; expired credentials make it Expired. Disabled endpoints are excluded; a disabled service or a service with no enabled endpoints is Disabled. Thus a successful readiness probe does not imply that untested content endpoints work. Last check is the latest observed request, including user requests. Last success remains available after failures.

## Backend endpoints

Paths below include the frontend's `/api` prefix. When calling Uvicorn directly, omit that prefix, as with existing backend routes.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/init/api/catalog` | Registered platforms, authenticated endpoint keys and initialization state; no secrets. |
| POST | `/api/init/api` | Initialize enabled platforms independently of account login; streamed statuses. |
| GET | `/api/integrations/templates` | Default v5 service configuration. |
| GET | `/api/integrations/services` | Configuration without keys, statuses, and lifetime statistics. |
| POST | `/api/integrations/services` | Create a service; returns `uid`. |
| PUT | `/api/integrations/services/{uid}` | Replace configuration; omit/null `api_key` to preserve it, or use `""` to clear it. |
| PATCH | `/api/integrations/services/{uid}/enabled` | Set `{"enabled":true}` or `false`. |
| POST | `/api/integrations/services/{uid}/auth/reauthenticate` | Replace credentials using `api_key` and optional offset-aware `credential_expires_at`. |
| POST | `/api/integrations/services/{uid}/auth/refresh` | Recheck the saved key using the configured credential-check endpoint. Returns `success`, `status`, `error`, and `latency_ms`. |
| DELETE | `/api/integrations/services/{uid}` | Delete service and history. |
| POST | `/api/integrations/services/{uid}/check` | Check all enabled, probe-configured endpoints. |
| POST | `/api/integrations/services/{uid}/endpoints/{key}/check` | Check one enabled, probe-configured endpoint. |
| POST | `/api/integrations/services/{uid}/endpoints/{key}/request` | Forward a GET request with JSON `params` and optional `path_params`. |
| GET | `/api/integrations/guest-settings` | Pool bounds, shared proxy address/username, per-platform proxy switches and secret-presence/source metadata; never passwords or encryption keys. |
| PUT | `/api/integrations/guest-settings` | Save pool settings. Nullable password/secret preserves its current value; an empty proxy password clears it. New encryption secrets must contain at least 32 characters. |
| GET | `/api/integrations/history?range=24h&source=all` | Aggregate history; range is `1h`, `24h`, or `7d`; source is `all`, `user`, or `health`; optional `service_uid`, `platform`, and `provider`. |

For compatibility, external HTTP configuration retains `auth_type: "none" | "login"`, `credential_expires_at` (ISO timestamp or null), and `auth_check_endpoint` (endpoint key or null). The request body is `{"params":{"aweme_id":"YOUR_VIDEO_ID","wait":5}}` for a video, or `{"path_params":{"task_id":"YOUR_TASK_ID"}}` for a task. All required path parameters must be present; values accept only letters, digits, underscores, and hyphens. Request parameters are sent as query parameters, never forwarded headers.

Forwarded responses consistently contain `success`, `service_uid`, `endpoint`, `status`, `upstream_status`, `latency_ms`, `data`, and `error`. `data` contains the complete successful upstream JSON, preserving its metadata and async task IDs. A v5 HTTP 202 means the upstream accepted work, not that scraping completed; poll the task endpoint to observe completion. A failed task is counted as a failed task-poll request. Successful HTTP status codes are preserved; upstream failures return 502, transport failures return 503, and DTK posts without an available authenticated identity return 409 with `error: "LOGIN_REQUIRED"`. Local missing/disabled/invalid requests use FastAPI's 404/409/422 `detail` responses and do not count as upstream attempts.

## Monitoring and statistics

The monitor starts when the APIs setup step completes or is restored on a later launch, checks for due services every 15 seconds, and stops before database shutdown. Services run independently with at most eight outgoing requests across the integration. Operations within a service are serialized with configuration changes, preventing late results from overwriting edited or deleted configuration. Embedded health probes are sequential; each operation selects from its own guest or authenticated pool. Use the project's existing single Uvicorn worker deployment; multiple workers would schedule duplicate probes.

Each completed service operation updates lifetime totals, successes, failures, average latency, latest latency, last check/request/success, and most recent error. The measurement covers provider initialization, signing, network time, response parsing, conversion and transport cleanup, excluding local queue time and database writes. HTTP services measure their request and response handling. One embedded operation may include several URL redirects; it is counted once with its combined latency and final observed HTTP status. A URL resolved without network IO has a null HTTP status. Raw-dictionary parsing through `get_post(dict)` is not counted. Statistics include health probes and credential refresh checks; chart source filters distinguish these from user requests. Saving replacement credentials does not itself count as an upstream request. Embedded adapter operations are counted. Media-file transfers through the downloader and calls made outside MediaHarbor are not counted.

Raw request metadata (service, endpoint, platform, timestamp, status, success, safe error, HTTP status, latency and source) is retained for seven days and pruned by the monitor. No response bodies, query values, or credentials are stored in request history. Lifetime counters survive pruning and restarts. Counter updates, request insertion, credential-check observations and embedded cookie rotation are committed in one database transaction. Cancelled operations do not produce a completed observation; persistence failures propagate instead of reporting success. The charts use 5-minute buckets for 1h, hourly buckets for 24h, and 6-hour buckets for 7d. Boundary buckets contain only requests in the selected window. Empty buckets have zero requests and no latency value. Latency is weighted across all requests, including failures. The health distribution shows current status across all services, independent of history filters.

## Troubleshooting and manual checks

- **Unknown:** wait for a scheduled check, configure a probe with valid sample inputs, or invoke the endpoint. A task endpoint can remain Unknown until polled.
- **Unavailable:** verify backend network access, URL, TLS certificate, and timeout.
- **401/403 or UNAUTHENTICATED:** check the key and upstream permissions. Rotate credentials when the provider explicitly reports expiry.
- **404 or response-envelope error:** confirm the deployed API version and configured path. An HTML login page is not a successful API response.
- **Empty charts:** make a request through this integration or enable a probe. No sample data is generated.
- **Database unavailable:** finish the existing setup flow. Integration routes return 503 until the pool is initialized.

No root-project test script or integration test suite is defined. Tests were not run. The existing frontend static-check command is `npm run typecheck` (not a test suite). After starting the application and configuring a service, these optional commands exercise the new routes manually; replace `1` with its service UID. The check command makes real upstream requests.

```sh
npm run typecheck
curl --fail-with-body http://localhost:8888/api/integrations/services
curl --fail-with-body 'http://localhost:8888/api/integrations/history?range=24h&source=all'
curl --fail-with-body -X POST http://localhost:8888/api/integrations/services/1/check
```


## Embedded provider status and storage

The initialization catalog reports Ready, Not initialized, Disabled or Error. Ready describes local adapter initialization, not a successful upstream request. Initialization does not increment request statistics. API Health platform edits synchronize the affected adapter. Authenticated accounts become available through the identity pool without restarting the adapter. The setup screen uses `/health/module`'s `apis` flag for successful completion of the API setup step; `/health/api` continues to report individual platform health independently.

DTK platforms additionally distinguish Partial and Login Required; account health includes Degraded. Upstream's response classifier distinguishes transport failures, business errors and platform risk controls. Business errors, captcha/risk signals, malformed payloads, missing media and non-advancing pagination are Error; dependency failures and network/timeouts are Unavailable. Only a fully parsed and converted result is Healthy. Error storage uses upstream rule identifiers, stable exception codes or exception class names, never arbitrary exception messages, signed URLs, query values or cookies.

Authenticated identity expiry comes from session-cookie expiry or repeated explicit authentication failures. HTTP 403 and risk control remain temporary cooldowns. Session validation uses authenticated self/account-info endpoints; public resource success alone does not establish login.

`/health/api` retains its existing per-platform nullable boolean format, with an added TikTok field. Before observations it retains initialization state. Persisted guest service errors and disabled state override it to false. Missing authenticated accounts do not disable otherwise available guest endpoints. URL-only success does not reset the live adapter's content status. API Health remains the detailed source of guest, authenticated and individual endpoint availability.

Observations describe the most recent operation, not continuous connectivity. Probes are opt-in for embedded services: configure `probe_enabled` and appropriate `probe_params` before expecting scheduled availability checks. With no probes and no user requests, an observation can remain old.

All providers share `api_services`, `api_endpoint_stats` and `api_requests`. Explicit provider, transport and platform dimensions allow platform/provider history filtering without a new table per integration. The separate `statistic_snapshots.post_counts` map stores media counts by platform and preserves old response fields for callers. See [Database](database.md) for development schema initialization.

## Header and service details

The header uses the shared Posts/Dashboard app bar and contains the platform/healthy count and time/platform/source filters. The Time range field is wide enough for its full labels. At `lg` container width the controls appear inline; on narrower layouts, the filter icon opens an anchored panel with filters, guest-pool settings and monitoring-card layout controls. Each platform summary has a right-aligned details icon with a tooltip. Details include statistics, guest-pool health and endpoint actions. Douyin profile has a **May require login** tag, while posts retain **Login required**. Initialization labels mixed-access platforms **Some features require login** and provides the same account dialogs. General Settings no longer displays API status or starts APIs when saving settings.

## Guest identity pools

Built-in DTK platforms include `identity_pool` in `GET /integrations/services`. The service details dialog distinguishes upstream request health from guest-pool health, and shows total, available/active, cooling, degraded or retired identities, minimum/target size, replenishment status, last successful mint and recent errors. These fields refresh with existing metrics every 30 seconds. A missing pool is Not applicable; missing dependencies or stale maintenance are Unavailable. Pool settings are editable through the header gear, with environment defaults and persistence documented in [DTK integration](douyin-tiktok.md).
