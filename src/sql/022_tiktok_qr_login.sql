ALTER TABLE dtk_login_sessions
    DROP CONSTRAINT IF EXISTS dtk_login_sessions_platform_check,
    ADD CONSTRAINT dtk_login_sessions_platform_check
        CHECK (platform IN ('douyin', 'tiktok'));
