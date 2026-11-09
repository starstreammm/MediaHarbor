import aria2p

from models import DownloadFile, DownloadStatus, Status
from base.settings import SettingsBase
from base.logger import LoggerBase as lg


class DownloaderBase:
    _client = None

    @classmethod
    async def init(cls):
        cls._client = aria2p.Client(
            host=SettingsBase._data.aria2_host,
            port=SettingsBase._data.aria2_port,
            secret=SettingsBase._data.aria2_secret,
        )
        cls._client.get_version()  # Test connection
        lg.info(
            f"Downloader initialized. Host: {SettingsBase._data.aria2_host}, Port: {SettingsBase._data.aria2_port}"
        )

    @classmethod
    async def insert(cls, info: DownloadFile) -> str:
        """
        Insert a download task and return the gid of the task.
        """
        assert cls._client is not None, "Downloader: Aria2 is not initialized."
        lg.debug(f"Downloader: Inserting download task: {info.model_dump(mode='json')}")

        return cls._client.add_uri(
            uris=info.urls,
            options={
                # file
                "dir": str(info.path.parent.resolve()),
                "out": str(info.path.name),
                "force-sequential": "false",
                "file-allocation": "trunc",
                # continuity
                "continue": "true",
                "always-resume": "true",
                "auto-file-renaming": "false",
                "allow-overwrite": "false",
                # split
                "split": "8",
                "max-connection-per-server": "8",
                "min-split-size": "2M",
                # retry
                "max-tries": "10",
                "retry-wait": "5",
                "timeout": "10",
                # multi-task
                "max-concurrent-downloads": "8",
                # cache
                "disk-cache": "64M",
                # headers
                "header": info.headers,
            },
        )

    @classmethod
    async def status(cls, gid: str) -> DownloadStatus:
        if cls._client is None:
            lg.error("Downloader: Aria2 is not initialized.")

        try:
            data = aria2p.API(cls._client).get_download(gid)
        except aria2p.ClientException as e:
            if "GID" in str(e) and "is not found" in str(e):
                return DownloadStatus(
                    path=SettingsBase._data.data_path,
                    progress=100.0,
                    status=Status.success,
                    msg="GID not found. Possibly the download is complete and removed from Aria2.",
                )
            else:
                raise e

        res = DownloadStatus(
            path=SettingsBase._data.data_path
            / data.files[0].path.relative_to(SettingsBase._data.aria2_path),
            status=Status.pending,
        )
        if data.status == "active":
            res.status = Status.running
            res.speed = data.download_speed_string(human_readable=True)
            res.progress = data.progress
            res.total = data.total_length_string(human_readable=True)
            res.completed = data.completed_length_string(human_readable=True)
            res.eta = data.eta_string()
        elif data.status == "waiting":
            pass
        elif data.status == "error":
            res.status = Status.error
            res.msg = f"{data.error_code}: {data.error_message}"
        elif data.status == "complete":
            res.status = Status.success
            res.progress = 100.0
            res.total = data.total_length_string(human_readable=True)
            res.completed = data.completed_length_string(human_readable=True)
        else:
            raise Exception(f"Downloader: Unknown error, status: {data.status}")

        return res
