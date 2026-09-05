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
        changes = new.model_dump(exclude_none=True, exclude_unset=True)

        # data_path
        if (
            "data_path" in changes
            and changes["data_path"] != cls._data.data_path
            and cls._data.data_path.exists()
            and any(cls._data.data_path.iterdir())
        ):
            raise Exception("Settings: data_path changed. Not support.")
        elif "data_path" in changes and changes["data_path"] != cls._data.data_path:
            changes["data_path"].mkdir(parents=True, exist_ok=True)

        # platform cookies
        for p in Platform:
            if f"cookie_{p.value}" in changes:
                raise Exception(f"Settings: Please use /init/api to update cookie(s).")

        # log_level
        if "log_level" in changes:
            LoggerBase.init(changes["log_level"])

        cls._data = cls._data.model_copy(update=changes)

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
