CREATE TABLE IF NOT EXISTS profile_history (
    uid BIGINT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
