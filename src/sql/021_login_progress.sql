ALTER TABLE dtk_login_sessions ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'waiting'
    CHECK (phase IN ('waiting', 'scanned', 'preparing', 'validating'));
