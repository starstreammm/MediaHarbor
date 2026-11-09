from typing import Literal
from pathlib import Path
import tempfile

from pydantic import BaseModel, Field

from models import CACHE_PATH


StartupStep = Literal["database", "settings", "logger", "aria2", "apis", "base"]
STARTUP_PATH = CACHE_PATH / "startup.json"


class StartupProgress(BaseModel):
    completed: set[StartupStep] = Field(default_factory=set)


class StartupBase:
    progress = StartupProgress()

    @classmethod
    def load(cls):
        cls.progress = (
            StartupProgress.model_validate_json(STARTUP_PATH.read_text())
            if STARTUP_PATH.exists()
            else StartupProgress()
        )

    @classmethod
    def complete(cls, step: StartupStep):
        progress = StartupProgress(completed=cls.progress.completed | {step})
        with tempfile.NamedTemporaryFile(
            mode="w", dir=CACHE_PATH, prefix=".startup-", delete=False
        ) as temporary:
            temporary.write(progress.model_dump_json(indent=4))
        Path(temporary.name).replace(STARTUP_PATH)
        cls.progress = progress
