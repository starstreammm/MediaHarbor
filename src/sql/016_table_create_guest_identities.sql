CREATE TABLE IF NOT EXISTS dtk_identities (
    uid UUID PRIMARY KEY,
    platform TEXT NOT NULL CHECK (platform IN ('douyin', 'tiktok')),
    cookies BYTEA NOT NULL,
    authenticated BOOLEAN NOT NULL DEFAULT FALSE,
    browser_state BYTEA,
    account_name TEXT,
    account_id TEXT,
    expires_at TIMESTAMPTZ,
    validated_at TIMESTAMPTZ,
    auth_failures INTEGER NOT NULL DEFAULT 0,
    fingerprint JSONB NOT NULL,
    proxy BYTEA,
    network JSONB NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'cooling', 'degraded', 'login_required', 'retired')),
    consecutive_fails INTEGER NOT NULL DEFAULT 0,
    total_requests BIGINT NOT NULL DEFAULT 0,
    successful_requests BIGINT NOT NULL DEFAULT 0,
    minted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    cooldown_until TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    last_error TEXT,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    budgets JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS dtk_identities_platform_state
    ON dtk_identities (platform, state);
CREATE INDEX IF NOT EXISTS dtk_identities_rotation
    ON dtk_identities (platform, authenticated, state);

CREATE TABLE IF NOT EXISTS dtk_identity_outcomes (
    uid BIGSERIAL PRIMARY KEY,
    identity_uid UUID NOT NULL REFERENCES dtk_identities(uid) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    outcome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dtk_identity_outcomes_window
    ON dtk_identity_outcomes (identity_uid, created_at);
CREATE INDEX IF NOT EXISTS dtk_identity_outcomes_endpoint
    ON dtk_identity_outcomes (endpoint, created_at);

CREATE TABLE IF NOT EXISTS dtk_pool_status (
    platform TEXT PRIMARY KEY,
    filling BOOLEAN NOT NULL DEFAULT FALSE,
    minimum_size INTEGER NOT NULL DEFAULT 13,
    target_size INTEGER NOT NULL DEFAULT 33,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    recent_errors JSONB NOT NULL DEFAULT '[]',
    failures INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    minting_until TIMESTAMPTZ,
    maintenance_at TIMESTAMPTZ
);
INSERT INTO dtk_pool_status (platform) VALUES ('douyin'), ('tiktok'), ('browser')
    ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS dtk_endpoint_circuits (
    endpoint TEXT PRIMARY KEY,
    open_until TIMESTAMPTZ,
    probe_after TIMESTAMPTZ
);
