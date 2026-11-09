CREATE TABLE IF NOT EXISTS dtk_login_sessions (
    uid UUID PRIMARY KEY,
    platform TEXT NOT NULL CHECK (platform = 'douyin'),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'expired', 'failed', 'cancelled')),
    qr_image BYTEA,
    qr_version INTEGER NOT NULL DEFAULT 0,
    identity_uid UUID REFERENCES dtk_identities(uid) ON DELETE SET NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '180 seconds',
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
