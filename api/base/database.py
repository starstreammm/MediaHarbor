import asyncpg
import json

from models import (
    DatabaseConfig,
    Platform,
    Status,
    CACHE_PATH,
)

TABLE = {
    "settings": {
        "name": "TEXT NOT NULL PRIMARY KEY",
        "value": "TEXT NOT NULL",
    },
    "creators": {
        "uid": "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        "alias": "TEXT NOT NULL UNIQUE",
        "overview": "TEXT NOT NULL",
        "avatar": "BIGINT",
        "cover": "BIGINT",
        "rate": "SMALLINT NOT NULL DEFAULT 0",
        "create_time": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "accounts": {
        "uid": "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        "creator_uid": "BIGINT NOT NULL",
        "platform": "platform",
        "pid": "TEXT",
        "url": "TEXT",
        "alias": "TEXT NOT NULL",
        "overview": "TEXT NOT NULL",
        "avatar": "BIGINT",
        "cover": "BIGINT",
        "age": "SMALLINT",
        "gender": "BOOLEAN",
        "ip": "TEXT",
        "address": "TEXT",
        "school": "TEXT",
        "filter": "JSONB",
        "latest_update": "TIMESTAMPTZ",
        "sync_task": "BIGINT",
        "sync_status": "BOOLEAN NOT NULL DEFAULT FALSE",
        "create_time": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "": "UNIQUE (platform, pid)",
    },
    "profile_history": {
        "uid": "BIGINT NOT NULL",
        "key": "TEXT NOT NULL",
        "value": "TEXT NOT NULL",
        "last_seen": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "posts": {
        "uid": "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        "account_uid": "BIGINT",
        "platform": "platform",
        "account_pid": "TEXT",
        "pid": "TEXT",
        "url": "TEXT",
        "overview": "TEXT NOT NULL",
        "rate": "SMALLINT NOT NULL DEFAULT 0",
        "post_time": "TIMESTAMPTZ NOT NULL",
        "create_time": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "files": "BIGINT[] NOT NULL",
        "sync_status": "BOOLEAN NOT NULL DEFAULT FALSE",
        "": "UNIQUE (platform, pid)",
    },
    "files": {
        "uid": "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        "path": "TEXT NOT NULL",
        "size_kb": "BIGINT NOT NULL",
        "hash": "TEXT NOT NULL",
        "usage": "SMALLINT NOT NULL DEFAULT 1",
        "": "UNIQUE (hash, size_kb)",
    },
    "collections": {
        "uid": "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        "alias": "TEXT NOT NULL UNIQUE",
        "notes": "TEXT NOT NULL DEFAULT ''",
        "posts": "BIGINT[] NOT NULL",
        "create_time": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
    "statistics": {
        "post_len_douyin": "INTEGER NOT NULL",
        "post_len_bilibili": "INTEGER NOT NULL",
        "post_len_xhs": "INTEGER NOT NULL",
        "post_len_x": "INTEGER NOT NULL",
        "post_len_ins": "INTEGER NOT NULL",
        "post_len_youtube": "INTEGER NOT NULL",
        "file_len_video": "INTEGER NOT NULL",
        "file_len_photo": "INTEGER NOT NULL",
        "file_size_video": "BIGINT NOT NULL",
        "file_size_photo": "BIGINT NOT NULL",
        "date": "TEXT NOT NULL PRIMARY KEY",
    },
    "queue": {
        "uid": "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        "alias": "TEXT NOT NULL",
        "job": "JSONB NOT NULL",
        "scheduled": "TIMESTAMPTZ NOT NULL",
        "status": "status NOT NULL DEFAULT 'pending'",
        "detail": "JSONB",
        "create_time": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
}

INDEX = {
    "creators": [
        'alias COLLATE "zh-Hans-CN-x-icu"',
        "rate DESC",
        "create_time DESC",
    ],
    "accounts": [
        "creator_uid",
    ],
    "profile_history": [
        "uid, key",
    ],
    "posts": [
        "create_time DESC",
        "account_uid",
        "rate DESC",
    ],
    "collections": [
        "create_time DESC",
        'alias COLLATE "zh-Hans-CN-x-icu"',
    ],
    "queue": [
        "scheduled DESC",
        "status",
    ],
}


class DatabaseBase:
    _api = None
    _config = DatabaseConfig(
        host="postgres",
        port=5432,
        user="admin",
        password="mediaharbor",
        database="mediaharbor",
    )

    @classmethod
    async def init(cls, config: DatabaseConfig):
        try:
            # Connect
            cls._api = await asyncpg.create_pool(
                user=config.user,
                password=config.password,
                database=config.database,
                host=config.host,
                port=config.port,
                init=cls._init_connection,
            )

            # Add ENUM
            values = {"platform": Platform, "status": Status}
            for key, value in values.items():
                await cls._api.execute(f"""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_type t
                            JOIN pg_namespace n ON n.oid = t.typnamespace
                            WHERE t.typname = '{key}'
                            AND n.nspname = 'public'
                        ) THEN
                            CREATE TYPE {key} AS ENUM ({", ".join(f"'{e.value}'" for e in value)});
                        END IF;
                    END $$;
                    """)

            # Add Table
            for name, col in TABLE.items():
                await cls._api.execute(
                    f"CREATE TABLE IF NOT EXISTS {name} ({", ".join(f"{colname} {detail}" for colname, detail in col.items())})"
                )

            # Add INDEX
            for key, value in INDEX.items():
                for i in value:
                    await cls._api.execute(f"""
                            CREATE INDEX IF NOT EXISTS
                            idx_{key}_{i.replace(", ", "_").split(" ", 1)[0]}
                            ON {key} ({i});
                        """)

            # Save config
            cls._config = config

        except Exception as e:
            cls._api = None
            raise e

    @classmethod
    async def close(cls):
        if cls._api:
            await cls._api.close()
        with open(CONFIG_PATH, "w") as f:
            f.write(cls._config.model_dump_json())

    @classmethod
    async def fetch(cls, sql: str, *args) -> list[dict] | None:
        assert cls._api is not None, "Database: Not initialized."

        rows = await cls._api.fetch(sql, *args)
        if rows:
            return [dict(row) for row in rows]
        else:
            return None

    @classmethod
    async def fetchval(cls, sql: str, *args):
        assert cls._api is not None, "Database: Not initialized."
        return await cls._api.fetchval(sql, *args)

    @classmethod
    async def fetchrow(cls, sql: str, *args) -> dict | None:
        assert cls._api is not None, "Database: Not initialized."

        row = await cls._api.fetchrow(sql, *args)
        if row:
            return dict(row)
        else:
            return None

    @classmethod
    async def execute(cls, sql: str, *args):
        assert cls._api is not None, "Database: Not initialized."
        return await cls._api.execute(sql, *args)

    @classmethod
    async def executemany(cls, sql: str, *args):
        assert cls._api is not None, "Database: Not initialized."
        return await cls._api.executemany(sql, *args)

    @staticmethod
    async def _init_connection(con: asyncpg.Connection):
        await con.set_type_codec(
            "json",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )
        await con.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )


CONFIG_PATH = CACHE_PATH / "database.json"

if CONFIG_PATH.exists():
    with open(CONFIG_PATH, "r") as f:
        DatabaseBase._config = DatabaseConfig.model_validate_json(f.read())
