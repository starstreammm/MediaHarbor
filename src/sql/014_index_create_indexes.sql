CREATE UNIQUE INDEX IF NOT EXISTS idx_api_services_adapter_key
    ON api_services (adapter_key);

CREATE INDEX IF NOT EXISTS idx_api_services_provider_platform
    ON api_services (provider, platform);

CREATE INDEX IF NOT EXISTS idx_api_requests_requested_at
    ON api_requests (requested_at);

CREATE INDEX IF NOT EXISTS idx_api_requests_service_uid_requested_at
    ON api_requests (service_uid, requested_at);

CREATE INDEX IF NOT EXISTS idx_api_requests_platform_time
    ON api_requests (platform, requested_at);

CREATE INDEX IF NOT EXISTS idx_creators_alias
    ON creators (alias COLLATE "zh-Hans-CN-x-icu");

CREATE INDEX IF NOT EXISTS idx_creators_rate
    ON creators (rate DESC);

CREATE INDEX IF NOT EXISTS idx_creators_create_time
    ON creators (create_time DESC);

CREATE INDEX IF NOT EXISTS idx_accounts_creator_uid
    ON accounts (creator_uid);

CREATE INDEX IF NOT EXISTS idx_profile_history_uid_key
    ON profile_history (uid, key);

CREATE INDEX IF NOT EXISTS idx_posts_create_time
    ON posts (create_time DESC);

CREATE INDEX IF NOT EXISTS idx_posts_account_uid
    ON posts (account_uid);

CREATE INDEX IF NOT EXISTS idx_posts_rate
    ON posts (rate DESC);

CREATE INDEX IF NOT EXISTS idx_collections_create_time
    ON collections (create_time DESC);

CREATE INDEX IF NOT EXISTS idx_collections_alias
    ON collections (alias COLLATE "zh-Hans-CN-x-icu");

CREATE INDEX IF NOT EXISTS idx_queue_scheduled
    ON queue (scheduled DESC);

CREATE INDEX IF NOT EXISTS idx_queue_status
    ON queue (status);
