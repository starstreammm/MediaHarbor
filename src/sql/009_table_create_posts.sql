CREATE TABLE IF NOT EXISTS posts (
    uid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_uid BIGINT,
    platform platform,
    account_pid TEXT,
    pid TEXT,
    url TEXT,
    overview TEXT NOT NULL,
    rate SMALLINT NOT NULL DEFAULT 0,
    post_time TIMESTAMPTZ NOT NULL,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    files BIGINT[] NOT NULL,
    sync_status BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (platform, pid)
);
