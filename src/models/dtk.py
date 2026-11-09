from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GuestPoolSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    minimum_size: int = Field(default=13, ge=0, strict=True)
    target_size: int = Field(default=33, ge=0, strict=True)
    use_proxy: bool = False

    @model_validator(mode="after")
    def validate_range(self):
        if self.minimum_size > self.target_size or (self.target_size > 0 and self.minimum_size == 0):
            raise ValueError("Pool range must be 0/0 or 1 <= minimum <= target")
        return self


class GuestProxySettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = ""
    username: str = ""
    password: str | None = Field(default=None, repr=False)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        value = value.strip()
        if not value:
            return value
        try:
            parsed = urlsplit(value)
            port = parsed.port
            valid = (
                parsed.scheme in {"http", "https", "socks5", "socks5h"}
                and parsed.hostname and (port is None or port > 0)
                and parsed.username is None and parsed.password is None
                and parsed.path in ("", "/") and not parsed.query and not parsed.fragment
                and not any(character.isspace() for character in value)
            )
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("Enter a proxy URL with a supported scheme and host; enter credentials separately")
        return value.rstrip("/")


class GuestSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    douyin: GuestPoolSettings = Field(default_factory=GuestPoolSettings)
    tiktok: GuestPoolSettings = Field(default_factory=GuestPoolSettings)
    proxy: GuestProxySettings = Field(default_factory=GuestProxySettings)


class GuestSettingsUpdate(GuestSettings):
    secret_key: str | None = Field(default=None, min_length=32, max_length=4096, repr=False)


class StoredGuestSettings(GuestSettings):
    secret_keys: list[str] = Field(default_factory=list, repr=False)


class BrowserCookie(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1, max_length=256)
    value: str = Field(max_length=65536, repr=False)
    domain: str = Field(min_length=1, max_length=256)
    path: str = Field(default="/", pattern=r"^/")
    expires: float = Field(default=-1, ge=-1, le=253402300799, allow_inf_nan=False)
    httpOnly: bool = False
    secure: bool = True
    sameSite: str = Field(default="Lax", pattern=r"^(Strict|Lax|None)$")


class AuthenticatedSessionImport(BaseModel):
    """Full browser records, never a platform-wide Cookie header."""

    model_config = ConfigDict(extra="forbid")

    origins: list[dict] = Field(default_factory=list, max_length=100, repr=False)
    cookies: list[BrowserCookie] = Field(min_length=1, max_length=500, repr=False)
    user_agent: str = Field(max_length=1000, pattern=r"^[^\r\n]*Chrome/\d+\.[^\r\n]*$")
    browser_platform: str = Field(min_length=1, max_length=100)
    screen: str = Field(pattern=r"^[1-9]\d{1,4}x[1-9]\d{1,4}$")
    language: str = Field(min_length=1, max_length=100)
    timezone: str = Field(min_length=1, max_length=100)
    hardware_concurrency: int | None = Field(default=None, ge=1, le=1024)
    device_memory: int | None = Field(default=None, ge=1, le=1024)
