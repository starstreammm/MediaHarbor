CREATE TABLE IF NOT EXISTS statistic_snapshots (
    date DATE PRIMARY KEY,
    post_counts JSONB NOT NULL DEFAULT '{}',
    file_len_video INTEGER NOT NULL,
    file_len_photo INTEGER NOT NULL,
    file_size_video BIGINT NOT NULL,
    file_size_photo BIGINT NOT NULL
);
