"""Buffer compatibility through the original WreqTransport client hook."""

from . import upstream
from wreq import redirect
from dtk.transport.wreq_transport import ClientOptions, default_client_factory


class _WreqResponse:
    """Convert wreq 0.13 buffers to the bundled transport's bytes contract."""

    def __init__(self, response):
        self._response = response

    def __getattr__(self, name):
        return getattr(self._response, name)

    @property
    def headers(self) -> list[tuple[bytes, bytes]]:
        return [(bytes(name), bytes(value)) for name, value in self._response.headers]

    async def bytes(self) -> bytes:
        return bytes(await self._response.bytes())


class _WreqClient:
    def __init__(self, options: ClientOptions):
        self._client = default_client_factory(options)

    async def request(self, method, url: str, **kwargs) -> _WreqResponse:
        kwargs["redirect"] = redirect.Policy.none()
        return _WreqResponse(await self._client.request(method, url, **kwargs))

    def close(self) -> None:
        self._client.close()
