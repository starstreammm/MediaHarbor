"""Private, atomic guest settings shared by the UI and identity pool."""

import os
import tempfile
from urllib.parse import quote, unquote, urlsplit, urlunsplit

from base.database import DatabaseBase as db
from models import CACHE_PATH
from models.dtk import GuestPoolSettings, GuestProxySettings, GuestSettingsUpdate, StoredGuestSettings


CONFIG_PATH = CACHE_PATH / "dtk-settings.json"


def load_settings() -> StoredGuestSettings:
    try:
        return _load_settings()
    except (ValueError, OSError):
        raise RuntimeError("Guest settings could not be loaded; check the saved configuration and environment") from None


def _load_settings() -> StoredGuestSettings:
    if CONFIG_PATH.exists():
        return StoredGuestSettings.model_validate_json(CONFIG_PATH.read_text())
    platforms = {}
    proxy_urls = []
    for platform in ("douyin", "tiktok"):
        prefix = f"MEDIAHARBOR_DTK_{platform.upper()}_"
        proxy_url = os.environ.get(prefix + "PROXY_URL", "")
        if proxy_url:
            proxy_urls.append(proxy_url)
        platforms[platform] = GuestPoolSettings(
            minimum_size=int(os.environ.get(prefix + "MIN_SIZE", "13")),
            target_size=int(os.environ.get(prefix + "TARGET_SIZE", "33")),
            use_proxy=bool(proxy_url),
        )
    proxy = GuestProxySettings()
    if proxy_urls:
        parsed = urlsplit(proxy_urls[0])
        proxy = GuestProxySettings(
            url=urlunsplit((parsed.scheme, parsed.netloc.rsplit("@", 1)[-1], "", "", "")),
            username=unquote(parsed.username or ""),
            password=unquote(parsed.password or ""),
        )
    return StoredGuestSettings(**platforms, proxy=proxy)


def public_settings():
    settings = load_settings()
    result = settings.model_dump(exclude={"secret_keys": True, "proxy": {"password"}})
    result["proxy"]["has_password"] = bool(settings.proxy.password)
    result["secret_source"] = (
        "Saved settings" if settings.secret_keys
        else "Environment" if os.environ.get("MEDIAHARBOR_DTK_SECRET_KEY")
        else "Shared cache file"
    )
    legacy = {os.environ.get(f"MEDIAHARBOR_DTK_{platform.upper()}_PROXY_URL") for platform in ("douyin", "tiktok")}
    result["different_legacy_proxies"] = not CONFIG_PATH.exists() and len(legacy - {None, ""}) > 1
    return result


def proxy_for(platform: str) -> str | None:
    if not CONFIG_PATH.exists():
        return os.environ.get(f"MEDIAHARBOR_DTK_{platform.upper()}_PROXY_URL") or None
    settings = load_settings()
    if not getattr(settings, platform).use_proxy:
        return None
    parsed = urlsplit(settings.proxy.url)
    credentials = ""
    if settings.proxy.username:
        credentials = quote(settings.proxy.username, safe="")
        if settings.proxy.password:
            credentials += ":" + quote(settings.proxy.password, safe="")
        credentials += "@"
    return urlunsplit((parsed.scheme, credentials + parsed.netloc, "", "", ""))


async def save_settings(update: GuestSettingsUpdate):
    from .identity import identities

    async with db._api.acquire() as connection:
        await connection.execute("SELECT pg_advisory_lock(72481, 2)")
        try:
            current = load_settings()
            values = update.model_dump(exclude={"secret_key"})
            if update.proxy.password is None:
                values["proxy"]["password"] = current.proxy.password
            if (update.douyin.use_proxy or update.tiktok.use_proxy) and not update.proxy.url:
                raise ValueError("Configure the shared proxy URL before enabling it")
            if values["proxy"]["password"] and not update.proxy.username:
                raise ValueError("A proxy username is required when a password is set")
            keys = current.secret_keys
            if update.secret_key is not None:
                previous = await identities._cipher(connection)
                # Retain old keys so existing and in-flight identities remain readable.
                keys = list(dict.fromkeys([update.secret_key, *previous.secrets]))
            saved = StoredGuestSettings(**values, secret_keys=keys)
            descriptor, temporary = tempfile.mkstemp(dir=CACHE_PATH, prefix=".dtk-settings-")
            try:
                with os.fdopen(descriptor, "w") as stream:
                    stream.write(saved.model_dump_json(indent=4))
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, CONFIG_PATH)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        finally:
            await connection.execute("SELECT pg_advisory_unlock(72481, 2)")
    return public_settings()
