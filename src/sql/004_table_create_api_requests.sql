CREATE TABLE IF NOT EXISTS api_requests (
    service_uid BIGINT NOT NULL REFERENCES api_services(uid) ON DELETE CASCADE,
    endpoint_key TEXT NOT NULL,
    platform TEXT,
    requested_at TIMESTAMPTZ NOT NULL,
    success BOOLEAN NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    http_status INTEGER,
    latency_ms DOUBLE PRECISION NOT NULL,
    source TEXT NOT NULL
);
