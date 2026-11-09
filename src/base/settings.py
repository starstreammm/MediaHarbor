from models import TableSettings, ApiSettingsUpdate, Platform
from base.database import DatabaseBase as db
from base.logger import LoggerBase


class SettingsBase:
    _data = TableSettings()

    @classmethod
    async def init(cls):
        rows = await db.fetch("SELECT * FROM settings;")
        if rows:
            cls._data = TableSettings.model_validate(
                {row["name"]: row["value"] for row in rows}
            )

    @classmethod
    async def update(cls, new: ApiSettingsUpdate):
        from utils.file_scan import FileScan

        async with FileScan.storage_lock:
            changes = new.model_dump(exclude_none=True, exclude_unset=True)

            # Existing libraries must remap paths through the scan workflow.
            for name in ("data_path", "aria2_path"):
                if name in changes and changes[name] != getattr(cls._data, name):
                    if not changes[name].is_absolute():
                        raise ValueError("Storage paths must be absolute")
                    if await db.fetchval("SELECT EXISTS(SELECT 1 FROM files)"):
                        raise ValueError("Use the storage path scan to change paths")
            if "data_path" in changes:
                changes["data_path"].mkdir(parents=True, exist_ok=True)

            # platform cookies
            for p in Platform:
                if f"cookie_{p.value}" in changes:
                    raise Exception(f"Settings: Please use /init/api to update cookie(s).")

            # log_level
            if "log_level" in changes:
                LoggerBase.init(changes["log_level"])

            cls._data = cls._data.model_copy(update=changes)
            await cls.close()

    @classmethod
    async def close(cls):
        await db.executemany(
            """
                    INSERT INTO settings (name, value)
                    VALUES ($1, $2)
                    ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;
                """,
            list(
                (str(k), str(v)) for k, v in cls._data.model_dump(mode="json").items()
            ),
        )
