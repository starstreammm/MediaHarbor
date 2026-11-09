"""In-process browser minting; no HTTP server, RPC client or signing pages."""

from dataclasses import replace

from . import upstream
from browser_rpc.backends import build_backend
from browser_rpc.errors import BackendUnavailable
from browser_rpc.service import BrowserRpcService
from browser_rpc.settings import Settings
from browser_rpc.validation import Platform
from models import CACHE_PATH


class Browser:
    def __init__(self):
        self.service = None

    async def mint(self, platform: str, proxy_url: str | None):
        if self.service is None:
            settings = replace(
                Settings.from_env(),
                backend="cloak",
                prewarm=False,
                warm_contexts=0,
                max_concurrent_mints=1,
                profile_root=str(CACHE_PATH / "dtk-browser-profiles"),
            )
            self.service = BrowserRpcService(settings, build_backend(settings))
            await self.service.start()
        if self.service.health()["status"] != "ok":
            await self.close()
            raise BackendUnavailable(
                "CloakBrowser initialization failed; inspect backend logs"
            )
        return await self.service.mint(Platform(platform), proxy_url=proxy_url)

    async def close(self):
        if self.service is not None:
            try:
                await self.service.close()
            finally:
                self.service = None
