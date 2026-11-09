CREATE OR REPLACE VIEW file_references AS
    SELECT avatar AS uid FROM accounts WHERE avatar IS NOT NULL
    UNION ALL SELECT cover FROM accounts WHERE cover IS NOT NULL
    UNION ALL SELECT avatar FROM creators WHERE avatar IS NOT NULL
    UNION ALL SELECT cover FROM creators WHERE cover IS NOT NULL
    UNION ALL SELECT unnest(files) FROM posts;

-- Count references, including separate uses of the same file in one record.
CREATE OR REPLACE FUNCTION update_file_usage() RETURNS TRIGGER AS $$
DECLARE
    previous_ids BIGINT[] := '{}';
    next_ids BIGINT[] := '{}';
    change RECORD;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        IF TG_TABLE_NAME = 'posts' THEN
            previous_ids := OLD.files;
        ELSE
            previous_ids := ARRAY[OLD.avatar, OLD.cover];
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF TG_TABLE_NAME = 'posts' THEN
            next_ids := NEW.files;
        ELSE
            next_ids := ARRAY[NEW.avatar, NEW.cover];
        END IF;
    END IF;
    FOR change IN
        SELECT uid, SUM(delta) AS delta FROM (
            SELECT unnest(previous_ids) AS uid, -1 AS delta
            UNION ALL SELECT unnest(next_ids), 1
        ) refs WHERE uid IS NOT NULL GROUP BY uid HAVING SUM(delta) <> 0 ORDER BY uid
    LOOP
        UPDATE files SET usage = GREATEST(0, usage + change.delta)
        WHERE uid = change.uid;
        IF NOT FOUND AND change.delta > 0 THEN
            RAISE EXCEPTION 'File % no longer exists. Please upload it again.', change.uid;
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER accounts_file_usage
    AFTER INSERT OR UPDATE OR DELETE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_file_usage();
CREATE OR REPLACE TRIGGER creators_file_usage
    AFTER INSERT OR UPDATE OR DELETE ON creators
    FOR EACH ROW EXECUTE FUNCTION update_file_usage();
CREATE OR REPLACE TRIGGER posts_file_usage
    AFTER INSERT OR UPDATE OR DELETE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_file_usage();
