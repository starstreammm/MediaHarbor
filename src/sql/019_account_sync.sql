CREATE TABLE IF NOT EXISTS account_post_observations (
    account_uid BIGINT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
    platform_post_id TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_uid, platform_post_id)
);

CREATE INDEX IF NOT EXISTS account_observations_time
    ON account_post_observations (account_uid, published_at DESC);
CREATE INDEX IF NOT EXISTS accounts_sync_due
    ON accounts (sync_next_at) WHERE sync_enabled;
CREATE INDEX IF NOT EXISTS queue_account_downloads
    ON queue ((job->>'account_uid'), (job->>'pid'))
    WHERE job->>'type' = 'post_parse';
