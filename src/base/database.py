import asyncpg
import json
import os
import tempfile
from pathlib import Path

from models import (
    DatabaseConfig,
    CACHE_PATH,
)

SQL_PATH = Path(__file__).resolve().parent.parent / "sql"


class DatabaseBase:
    _api = None
    _config = DatabaseConfig(
        host="postgres",
        port=5432,
        user="admin",
        password=os.getenv("SERVICES_PASSWORD", "mediaharbor"),
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

            # Initialize the schema in filename order.
            async with cls._api.acquire() as connection:
                async with connection.transaction():
                    await connection.execute("SELECT pg_advisory_xact_lock(72481, 0)")
                    for script in sorted(SQL_PATH.iterdir()):
                        if script.suffix == ".sql":
                            await connection.execute(script.read_text(encoding="utf-8"))

            # Save config
            cls._config = config
            with tempfile.NamedTemporaryFile(
                mode="w", dir=CACHE_PATH, prefix=".database-", delete=False
            ) as temporary:
                temporary.write(config.model_dump_json(indent=4))
            Path(temporary.name).replace(CONFIG_PATH)

        except Exception as e:
            cls._api = None
            raise e

    @classmethod
    async def close(cls):
        if cls._api:
            await cls._api.close()

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
