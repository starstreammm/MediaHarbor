from models import ModelHealthStatus


class HealthBase:
    sta = ModelHealthStatus()

    @classmethod
    def db_check(cls) -> bool:
        return cls.sta.database

    @classmethod
    def db_st_check(cls) -> bool:
        return cls.sta.database and cls.sta.settings

    @classmethod
    def all_check(cls) -> bool:
        return all(cls.sta.model_dump().values())

    @classmethod
    def base_ready(cls) -> None:
        cls.sta.statistic = True
        cls.sta.delete = True
        cls.sta.queue = True
