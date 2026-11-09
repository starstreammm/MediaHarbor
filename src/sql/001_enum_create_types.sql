DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'platform'
            AND n.nspname = 'public'
    ) THEN
        CREATE TYPE platform AS ENUM ('douyin', 'bilibili', 'xhs', 'ins', 'x', 'youtube', 'tiktok');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'status'
            AND n.nspname = 'public'
    ) THEN
        CREATE TYPE status AS ENUM ('pending', 'running', 'success', 'error', 'paused');
    END IF;
END $$;
