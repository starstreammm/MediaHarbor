import logging
import sys
from asyncio import Queue
from datetime import datetime, timezone
from logging.handlers import TimedRotatingFileHandler
from collections import deque

from models import CACHE_PATH

LOG_PATH = CACHE_PATH / "logs" / "api.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


class LoggerMeta(type):

    def __getattr__(cls, name):
        if cls._log is None:
            raise RuntimeError("Logger not initialized.")

        return getattr(cls._log, name)


class SSEManager:
    MAX_LOGS = 1000
    recents: deque[str] = deque(maxlen=MAX_LOGS)
    queue: Queue[str] | None = None

    @classmethod
    def init(cls):
        if LOG_PATH.exists():
            with open(LOG_PATH, "r", encoding="utf-8") as f:
                cls.recents.extend(
                    line.rstrip("\n") for line in deque(f, maxlen=cls.MAX_LOGS)
                )

    @classmethod
    def subscribe(cls):
        cls.queue = Queue()

    @classmethod
    def unsubscribe(cls):
        cls.queue = None

    @classmethod
    def publish(cls, log_entry: str):
        if cls.queue:
            cls.queue.put_nowait(log_entry)


class SSELogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord):
        log_entry = self.format(record)
        SSEManager.recents.append(log_entry)
        SSEManager.publish(log_entry)


class LoggerBase(metaclass=LoggerMeta):
    _log: logging.Logger | None = None

    @staticmethod
    def _tran_log_level(level: str):
        level = level.upper()
        if level == "DEBUG":
            return logging.DEBUG
        if level == "INFO":
            return logging.INFO
        if level == "WARNING":
            return logging.WARNING
        if level == "ERROR":
            return logging.ERROR

        # fallback to INFO if the log level is not recognized
        print("Log Level Value Error.")
        return logging.INFO

    @classmethod
    def init(cls, log_level: str = "INFO"):
        # init SSEManager
        SSEManager.init()

        # Get logger
        logger = logging.getLogger("api_log")
        logger.setLevel(cls._tran_log_level(log_level))

        # File Handler
        file_handler = TimedRotatingFileHandler(
            LOG_PATH, when="midnight", interval=1, backupCount=7, encoding="utf-8"
        )
        file_handler.setLevel(cls._tran_log_level(log_level))
        file_handler.setFormatter(
            logging.Formatter(
                "{asctime}-{levelname:^7}-{filename}-{lineno}: {message}",
                style="{",
                datefmt=r"%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(file_handler)

        # SSE Handler
        sse_handler = SSELogHandler()
        sse_handler.setLevel(cls._tran_log_level(log_level))
        sse_handler.setFormatter(
            logging.Formatter(
                "{asctime}-{levelname:^7}-{filename}-{lineno}: {message}",
                style="{",
                datefmt=r"%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(sse_handler)

        # Stderr handler
        stderr_handler = logging.StreamHandler(sys.stderr)
        stderr_handler.setLevel(logging.ERROR)
        stderr_handler.setFormatter(
            logging.Formatter(
                "{asctime}-{levelname}-{filename}-{lineno}: {message}", style="{"
            )
        )
        logger.addHandler(stderr_handler)

        # Stdout handler
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setLevel(cls._tran_log_level(log_level))
        stdout_handler.setFormatter(
            logging.Formatter("{levelname:^7}: {message}", style="{")
        )
        logger.addHandler(stdout_handler)

        cls._log = logger
        cls.info(f"""
--------Program Start--------
UTC Time: {datetime.now(timezone.utc).isoformat()}
Local Time: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
""")
