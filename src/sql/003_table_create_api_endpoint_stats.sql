CREATE TABLE IF NOT EXISTS api_endpoint_stats (
    service_uid BIGINT NOT NULL REFERENCES api_services(uid) ON DELETE CASCADE,
    endpoint_key TEXT NOT NULL,
    platform TEXT,
    status TEXT NOT NULL DEFAULT 'Unknown',
    latency_ms DOUBLE PRECISION,
    last_check TIMESTAMPTZ,
    last_success TIMESTAMPTZ,
    last_request TIMESTAMPTZ,
    error TEXT,
    http_status INTEGER,
    most_recent_error TEXT,
    last_error_at TIMESTAMPTZ,
    total BIGINT NOT NULL DEFAULT 0,
    successful BIGINT NOT NULL DEFAULT 0,
    latency_total DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (service_uid, endpoint_key)
);
