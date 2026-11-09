# Service integration

The public adapter boundary is `src/services/__init__.py`. Preserve its public calling interface, pagination, return models and downloader-header conventions; internal interfaces may change. Translate provider models inside the adapter; callers should not need to understand a provider response envelope.

## Request flow

1. `APIUtil` selects a platform adapter using upstream URL recognition or an existing platform/database key.
2. The adapter calls `IntegrationBase.invoke(service_uid, endpoint_key, IntegrationRequest(...))`.
3. The integration layer locks the service, loads its current configuration and checks whether the service, endpoint and credentials permit a request.
4. Transport dispatch selects an HTTP request or a Python provider call. Embedded operations include upstream parsing and conversion to the public models before reporting success.
5. `IntegrationBase.record` atomically updates endpoint counters, request history, credential-check status and any rotated Cookie header.
6. The adapter returns the existing `DetailsPost`, `DetailsAccount`, string or async page result. Failed observations raise a sanitized provider error to normal callers.

The built-in Python operations are `post-id`, `account-id`, `post`, `posts` and `profile`. Resolution takes `params.url`; other operations take `params.id`; `posts` optionally takes an opaque `params.cursor`. All values are strings. Request bodies and successful results are never copied into statistics tables. A raw dictionary passed to `get_post` is local parsing and does not create an upstream request observation.

`src/services/dtk/client.py` is the upstream boundary. It uses `dtk.platforms`, `dtk.signing`, `dtk.transport` and `dtk.urls`, without importing `dtk.services`, `dtk.api` or its database-dependent identity pool. All DTK-specific integration modules live directly in `src/services/dtk/`; the replaceable upstream source lives in `src/services/dtk/source/`. A request-local transport is closed after each operation. The adapter's `instance` is used for local parsing; it is not an upstream server client.

## Adding a provider

- Implement a provider client/adapter in `src/services/`. Reuse the provider's signing, authentication, transport and response parsing where available. Keep raw provider objects behind that boundary.
- Register the Python provider in `src/services/catalog.py` (`PROVIDERS`), with its module, client class and supported options (optional full-match validation patterns). Its module exposes `platform_for_url(text)` and `classify_error(exception)`. Its client accepts `(platform, cookie, options)` and implements `execute`, `parse_post`, `close`, `headers`, `cookie` and `http_status`, following `dtk/client.py`. Dispatch and validation use this registry; provider names are text identifiers in storage, not database enums.
- Give every service an explicit provider and optional platform. Give cross-platform endpoints their own platform identifiers and unique endpoint keys. A service UID identifies a particular configuration, not just a platform.
- Register the platform in `PLATFORMS` with its display name, provider, adapter class, descriptive URL and default `auth_type`. Subclass `ServiceAPI` and set `platform` for the existing five-operation contract. Add a media platform enum value and its display metadata where needed. Initialization and health models accept registered platform keys dynamically; the setup UI reads the catalog, so new cookie fields and frontend initialization branches are unnecessary. No new health table or statistics column is required.
- Send every completed operation through `record`, with source `user` or `health`, measured latency, status, safe error code and actual HTTP status when known. Complete response validation before marking Healthy. Do not duplicate records in callers or count local validation failures as outgoing requests.
- Use the service lock for credential/configuration changes and requests. Configure probes explicitly with safe sample parameters. Preserve request signatures, return models, pagination and the existing exception-based failure convention.
- Extend the frontend service-kind selection when the provider is intended to be configured there. Preserve `transport`, `platform`, `options` and endpoint platform metadata on edits.

HTTP services continue to support the existing v5 envelope and Generic JSON formats. The old `douyin_v5` template is retained for users who separately monitor a remote service; embedded adapters never use that template or contact its base URL. For Python services `base_url` is descriptive metadata retained for editor compatibility; the upstream endpoint registry supplies actual request URLs.

Service provider/platform/transport and the platform assigned to an existing endpoint key are immutable. Create a new service or endpoint key when the meaning changes so historical statistics retain their dimensions. Built-in services retain all five operation keys and can be disabled but cannot be deleted. Other endpoint removals and service deletions keep the existing cascading-history behavior.

## Initialization lifecycle

First-time setup starts only when the user starts each step: Database, Settings, Logger, Downloader, APIs, then Base Services. Database setup loads saved settings and starts DTK guest-pool maintenance for already registered no-login services; it does not complete the Settings step. API initialization registers platform services and, when the step succeeds, starts monitoring. Continuing from APIs only opens Base Services; its Start button launches the workers.

Each successful step is recorded immediately in `cache/startup.json`; database configuration and settings are also saved immediately. Later backend launches restore completed steps in order and stop at the first unfinished or failed step. The setup screen resumes at that step when the user selects Get Started. Keep the cache volume to retain this progress. Installations without this progress file, including older installations with only `database.json`, require one manual setup pass using their saved configuration. Bootstrap diagnostics remain available before the Logger setup step.

A service with `auth_type: "none"` uses a browser-generated guest identity, without a user cookie. A login service waits for saved or submitted credentials; disabled services stay stopped. Skipped services do not prevent completion of the API setup step. Adapter failures leave that step incomplete and are exposed through the catalog. API setup completion is reported separately from individual platform health.

`GET /init/api/catalog` returns registered platforms, authentication requirements, enabled state, credential presence and initialization state without secrets. `POST /init/api` accepts an empty body or `{}` to retry initialization, or a platform-to-cookie object for login services. It retains the newline-delimited status response: `""` means in progress, `"true"` initialized, `"false"` initialized with an old-cookie warning, `null` skipped, and other strings describe failure. The frontend treats interrupted streams and failed results as errors. Unknown platform submissions are rejected.

Service edits, enable/disable changes and reauthentication through API Health synchronize the affected built-in adapter immediately. Initialization is serialized; service mutations release their request lock before synchronizing adapters. Existing service records remain authoritative over legacy cookie settings. Initialization itself makes no platform request and creates no health observation; Ready means the local adapter can accept requests, while API Health reports actual observations.

## Verification policy

No MediaHarbor test suite or test script is currently defined. No tests, API smoke requests, builds or type checks were run. The repository has `npm run typecheck` for a manual frontend static check, and upstream has its own separate tests; neither verifies MediaHarbor's database initialization or the new adapter boundary automatically.

After starting MediaHarbor and initializing its database, these manual CLI requests inspect the shared records without making platform calls:

```sh
curl --fail-with-body http://localhost:8888/api/health/api
curl --fail-with-body http://localhost:8888/api/integrations/services
curl --fail-with-body 'http://localhost:8888/api/integrations/history?range=24h&platform=douyin&provider=dtk'
```

See [Douyin and TikTok](douyin-tiktok.md) for configuration and supported operations, and [Database](database.md) before deploying to existing data.
