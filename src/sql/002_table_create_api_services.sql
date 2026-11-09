CREATE TABLE IF NOT EXISTS api_services (
    uid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider TEXT NOT NULL,
    platform TEXT,
    transport TEXT NOT NULL DEFAULT 'http',
    adapter_key TEXT,
    config JSONB NOT NULL,
    last_check TIMESTAMPTZ,
    auth_status TEXT NOT NULL DEFAULT 'Unknown',
    auth_checked_at TIMESTAMPTZ,
    auth_error TEXT,
    reauthenticated_at TIMESTAMPTZ
);
