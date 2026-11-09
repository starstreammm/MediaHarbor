"""Platform and provider registration, independent of application initialization."""

from dataclasses import dataclass
from importlib import import_module


OPERATIONS = {
    "post-id": "Resolve post URL",
    "account-id": "Resolve account URL",
    "post": "Post details",
    "posts": "Account posts",
    "profile": "Account profile",
}


@dataclass(frozen=True)
class ProviderDefinition:
    module: str
    client_class: str
    options: dict[str, str | None]

    def load(self):
        return import_module(self.module)

    def client(self, platform: str, cookie: str, options: dict[str, str]):
        return getattr(self.load(), self.client_class)(platform, cookie, options)


@dataclass(frozen=True)
class PlatformDefinition:
    name: str
    provider: str
    adapter_module: str
    adapter_class: str
    base_url: str

    def adapter(self):
        return getattr(import_module(self.adapter_module), self.adapter_class)


PROVIDERS = {
    "dtk": ProviderDefinition(
        module="services.dtk",
        client_class="DtkClient",
        options={
            "user_agent": r".*Chrome/\d+\..*",
            "screen": r"[1-9]\d{1,4}x[1-9]\d{1,4}",
            "browser_platform": None,
            "language": None,
            "timezone": None,
        },
    ),
}

PLATFORMS = {
    "douyin": PlatformDefinition(
        name="Douyin",
        provider="dtk",
        adapter_module="services.douyin",
        adapter_class="DouyinAPI",
        base_url="https://www.douyin.com",
    ),
    "tiktok": PlatformDefinition(
        name="TikTok",
        provider="dtk",
        adapter_module="services.tiktok",
        adapter_class="TikTokAPI",
        base_url="https://www.tiktok.com",
    ),
}


def platform_for_url(text: str) -> str | None:
    # Let each provider own URL/share-text parsing and redirect validation.
    for provider_key in dict.fromkeys(item.provider for item in PLATFORMS.values()):
        key = PROVIDERS[provider_key].load().platform_for_url(text)
        if key in PLATFORMS and PLATFORMS[key].provider == provider_key:
            return key
    return None
