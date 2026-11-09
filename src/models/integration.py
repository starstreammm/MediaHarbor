import re
from typing import Literal
from urllib.parse import urlsplit

import httpx
from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator


class IntegrationEndpoint(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    name: str = Field(min_length=1, max_length=100)
    path: str = Field(min_length=1, max_length=300)
    platform: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    requires_auth: bool = False
    enabled: bool = True
    probe_enabled: bool = False
    probe_params: dict[str, str | int | float | bool] = Field(default_factory=dict)

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if not re.fullmatch(r"/[A-Za-z0-9_{}/-]*", value):
            raise ValueError(
                "Use an absolute API path without a host, query, or escapes"
            )
        if value.startswith("//"):
            raise ValueError("Invalid endpoint path")
        placeholders = re.findall(r"\{([^{}]+)\}", value)
        if any(not re.fullmatch(r"[a-z_]+", key) for key in placeholders):
            raise ValueError("Invalid path parameter")
        if "{" in re.sub(r"\{[a-z_]+\}", "", value) or "}" in re.sub(
            r"\{[a-z_]+\}", "", value
        ):
            raise ValueError("Invalid path parameter")
        return value

    @model_validator(mode="after")
    def validate_probe(self):
        if self.probe_enabled and "{" in self.path:
            raise ValueError("Automatic checks require a path without placeholders")
        return self


class IntegrationService(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field(default="douyin_v5", pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    transport: Literal["http", "python"] = "http"
    platform: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    options: dict[str, str] = Field(default_factory=dict)
    base_url: str = Field(max_length=500)
    api_key: str | None = Field(default=None, max_length=65536)
    auth_type: Literal["none", "login"] = "login"
    credential_expires_at: AwareDatetime | None = None
    auth_check_endpoint: str | None = None
    enabled: bool = True
    interval_seconds: int = Field(default=300, ge=60, le=86400)
    timeout_seconds: int = Field(default=10, ge=1, le=30)
    endpoints: list[IntegrationEndpoint] = Field(min_length=1, max_length=30)

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Use an HTTP or HTTPS service URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(
                "Service URL must not contain credentials, query, or fragment"
            )
        if any(character.isspace() for character in value) or "\\" in value:
            raise ValueError("Invalid service URL")
        try:
            return str(httpx.URL(value)).rstrip("/")
        except httpx.InvalidURL as exc:
            raise ValueError("Invalid service URL") from exc

    @field_validator("api_key")
    @classmethod
    def validate_key(cls, value: str | None) -> str | None:
        if value is not None and any(
            ord(character) < 32 or ord(character) > 126 for character in value
        ):
            raise ValueError("API key must contain printable ASCII characters")
        return value

    @model_validator(mode="after")
    def unique_endpoints(self):
        if self.transport == "python":
            from services.catalog import OPERATIONS, PLATFORMS, PROVIDERS

            platform = PLATFORMS.get(self.platform)
            if (
                platform is None
                or self.kind not in PROVIDERS
                or platform.provider != self.kind
            ):
                raise ValueError("Unsupported Python provider or platform")
            self.auth_type = "none"
            for endpoint in self.endpoints:
                endpoint.requires_auth = endpoint.key == "posts"
            allowed = set(OPERATIONS)
            if {endpoint.key for endpoint in self.endpoints} != allowed:
                raise ValueError(
                    "Python adapters require post-id, account-id, post, posts and profile"
                )
            if any(
                endpoint.platform not in (None, self.platform)
                for endpoint in self.endpoints
            ):
                raise ValueError("Python endpoints must belong to the service platform")
            options = PROVIDERS[self.kind].options
            if self.options.keys() - options.keys():
                raise ValueError("Unknown provider option")
            if any("\r" in value or "\n" in value for value in self.options.values()):
                raise ValueError("Provider options must not contain line breaks")
            for key, value in self.options.items():
                if options[key] is not None and not re.fullmatch(options[key], value):
                    raise ValueError(f"Invalid provider option: {key}")
        if len({endpoint.key for endpoint in self.endpoints}) != len(self.endpoints):
            raise ValueError("Endpoint keys must be unique within a service")
        if self.auth_type == "none":
            self.api_key = ""
            self.credential_expires_at = None
            self.auth_check_endpoint = None
        elif self.auth_check_endpoint is not None:
            endpoint = next(
                (
                    item
                    for item in self.endpoints
                    if item.key == self.auth_check_endpoint
                ),
                None,
            )
            if endpoint is None or "{" in endpoint.path:
                raise ValueError(
                    "Credential check must select an endpoint without path parameters"
                )
        return self


class IntegrationCredentials(BaseModel):
    api_key: str = Field(min_length=1, max_length=65536)
    credential_expires_at: AwareDatetime | None = None

    @field_validator("api_key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        return IntegrationService.validate_key(value)


class IntegrationRequest(BaseModel):
    params: dict[str, str | int | float | bool] = Field(default_factory=dict)
    path_params: dict[str, str] = Field(default_factory=dict)

    @field_validator("path_params")
    @classmethod
    def validate_path_params(cls, value: dict[str, str]) -> dict[str, str]:
        if any(
            not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", part) for part in value.values()
        ):
            raise ValueError(
                "Path values must contain only letters, numbers, underscores, or hyphens"
            )
        return value
