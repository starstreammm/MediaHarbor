# Database schema

Schema SQL lives in `src/sql/`. `DatabaseBase.init` opens the existing asyncpg pool and executes `.sql` files in filename order. JSON/JSONB values use the existing JSON codec. These scripts run on every initialization; there is no separate migration framework or upstream database.

Each creation script defines the current schema directly, including service dimensions, account sync fields, file scan metadata and authenticated identities. There are no upgrade migrations or historical backfills during development. The scripts support fresh databases and repeated initialization of the same schema; they do not upgrade older schemas.

## Unified service records

| Table | Identity and dimensions | Stored data |
| --- | --- | --- |
| `api_services` | Numeric `uid`; text `provider`, optional text `platform`, `transport`; unique nullable `adapter_key` | JSONB configuration, credential state/timestamps, last scheduled check |
| `api_endpoint_stats` | Primary key `(service_uid, endpoint_key)`; optional `platform` | Latest status/error/HTTP status/latency, latest success/request/error timestamps, lifetime totals and latency sum |
| `api_requests` | Service and endpoint, optional platform, timestamp | Status, success, sanitized error, HTTP status, latency, `user`/`health` source |
| `statistic_snapshots` | Calendar `date` primary key | JSONB `post_counts` keyed by platform, existing file count/size totals |

Services have a provider identity independent of their platform. Multiple services can target one platform, and one HTTP service can expose multiple platforms through endpoint metadata. Service-level platform may be null for shared or cross-platform endpoints. Provider and platform dimensions are text, so adding another service provider does not require enum changes or platform-specific tables.

`adapter_key` identifies the built-in application binding (`dtk:douyin`, `dtk:tiktok`). It prevents duplicate registrations on restart. Other configured service rows have no adapter key. Built-in services are disabled rather than deleted because existing callers retain their service UID.

Initialization reads existing registrations without replacing their configuration. New registrations use the platform catalog's authentication default (`none` for Douyin and TikTok); legacy saved cookies select `login` only when a service is first created. Changing to no-sign-in mode clears the service secret and expiry, and startup does not restore them from the legacy settings mirror. These lifecycle changes use the existing schema and require no additional migration. Login-only services retain their requirement until explicitly changed in API Health.

Configuration continues using the existing API Health JSON structure, extended by `transport`, `platform`, browser `options` and optional endpoint `platform`. The `kind` field corresponds to the relational `provider`; all create/save paths update these consistently. Credentials remain in the service configuration and are omitted from overview responses. This preserves the project's current trusted-deployment access model; credentials are not newly encrypted at rest.

Provider/platform/transport and an existing endpoint's platform cannot be reassigned in place. This prevents old requests from appearing under a different provider after an edit. Rename an endpoint or create a new service for a different identity. Removing non-built-in endpoints deletes their counters and history. Deleting a non-built-in service cascades to both observation tables.

## Observation writes and queries

HTTP and Python execution both call `IntegrationBase.record`. A single transaction:

1. Persists a rotated embedded Cookie header when necessary.
2. Upserts endpoint status and increments `total`, `successful` and `latency_total`.
3. Inserts the completed operation into `api_requests` with the same service, endpoint, platform and result.
4. Updates credential status for the configured credential-check operation or an explicit Expired result.

Failures are `total - successful`. Average latency is the latency sum divided by total, including failures. Health probes and user operations use the same counters; history can filter by source. Service locks serialize configuration changes and execution; Python probes also run sequentially within the service. Use the existing single Uvicorn worker deployment. No distributed scheduling lock is introduced.

History supports `service_uid`, `platform` and `provider`, plus the existing time-range and source filters. Provider filtering joins the immutable service identity. Indexes cover request time, service/time and platform/time, and service provider/platform lookup. The monitor removes request rows older than seven days; endpoint lifetime totals remain. No upstream payloads or raw request parameters are stored in these observation tables.

## Media statistics

`012_table_create_statistics.sql` creates `statistic_snapshots`, whose `post_counts` JSONB map supports additional platforms without adding columns. The legacy `statistics` table is no longer created. File metrics remain unchanged because they describe media types, not providers.

`TableStatistics` expands stored platform counts into the existing `post_len_douyin`, `post_len_bilibili`, etc. response fields. It also exposes `post_len_tiktok` and the generic `post_counts` map. `StatisticBase.update_post` updates the map generically. Snapshots are cumulative totals and are upserted by calendar date; startup restores the latest totals even across a day boundary. Historical queries exclude the current day, and `/statistics/today` continues returning the live in-memory snapshot.

Statistics retain the application's existing daily/shutdown persistence cadence; abrupt process termination can lose changes since the last snapshot. This integration does not introduce an event ledger for media changes.

The media tables use the application's `platform` enum, which includes `tiktok` in its initial definition. Adding another media platform later requires adding its enum value and application models, while service health/statistics storage requires no redesign.

## Development initialization

Use a fresh database when moving from an older schema. Initialization does not alter existing tables, convert service configuration, copy legacy statistics, backfill account observations or recalculate file usage. Existing development databases must be recreated separately when their schema is incompatible; startup does not drop data.

All creation scripts run in one transaction under a PostgreSQL advisory lock. Tables and indexes use `IF NOT EXISTS`; the file-reference view, function and triggers use `CREATE OR REPLACE`. Guest-pool seed rows use `ON CONFLICT DO NOTHING`, with minimum/target defaults of 13/33. File usage starts at zero and is maintained by reference triggers during normal writes.

See [API Health](api-health.md) for status semantics and [Service Integration](service-integration.md) for adding providers.

## DTK guest identities

`016_table_create_guest_identities.sql` runs through the existing ordered schema initialization. `dtk_identities` stores AES-GCM encrypted cookies/proxies, browser fingerprints, network metadata, lifecycle state, quotas and fenced leases. `dtk_identity_outcomes` supplies the rolling health windows; `dtk_pool_status` coordinates refill pacing and records generation diagnostics; `dtk_endpoint_circuits` coordinates endpoint recovery probes. All use ordinary PostgreSQL tables, row locks and advisory locks. No extensions, Redis or additional migration system are required. Schema initialization is serialized across workers. Keep the shared `cache/dtk-identity.key` or deployment encryption secret when restoring a database; see [DTK integration](douyin-tiktok.md).
