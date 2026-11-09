"""Independent QR login using DTK's pinned browser package and private sessions."""

import asyncio
import base64
import re
import uuid
from contextlib import suppress
from urllib.parse import unquote, urlsplit

from cloakbrowser import launch_async
from fastapi import HTTPException
from playwright.async_api import Error as PlaywrightError, TimeoutError as PlaywrightTimeoutError

from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from services.base import ProviderError
from .config import proxy_for
from .identity import IdentityKeyMissing, identities
from dtk.core.types import BrowserFamily, Platform
from dtk.signing.native.websign import pick_uifid
from dtk.transport.base import Fingerprint, TransportIdentity


LOGIN_SETTINGS = {
    "douyin": {
        "name": "Douyin",
        "entrypoint": "https://creator.douyin.com/creator-micro/content/upload",
        "account_url": "https://www.douyin.com/aweme/v1/web/user/profile/self/",
        "locale": "zh-CN",
        "timezone": "Asia/Shanghai",
    },
    "tiktok": {
        "name": "TikTok",
        "entrypoint": "https://www.tiktok.com/login/qrcode",
        "account_url": "https://www.tiktok.com/passport/web/account/info/",
        "locale": "en-US",
        "timezone": "America/Los_Angeles",
    },
}


def login_failure(stage, error, platform):
    """Describe known failures without exposing Playwright URLs or call logs."""
    reason = type(error).__name__
    if isinstance(error, PlaywrightTimeoutError):
        reason = "Browser operation timed out"
        message = str(error)
        if "intercepts pointer events" in message:
            reason = "The login control is covered by another page element"
        elif "element is not enabled" in message:
            reason = "The login control is disabled"
        elif "element is not stable" in message:
            reason = "The login control is still moving or loading"
        elif "element is not visible" in message:
            reason = "The login control is no longer visible"
    elif isinstance(error, PlaywrightError):
        message = str(error)
        if "Executable doesn't exist" in message:
            reason = (
                "The CloakBrowser Chromium binary is missing. "
                "Run `uv run python -m cloakbrowser install` as the backend user"
            )
        elif "Host system is missing dependencies" in message or "error while loading shared libraries" in message:
            reason = "Chromium system libraries are missing; run `uv run python -m playwright install-deps chromium`"
        elif match := re.search(r"\bnet::(ERR_[A-Z_]{1,80})\b", message):
            reason = f"Chromium network error: {match.group(1)}; check network and proxy settings"
        elif "Target page, context or browser has been closed" in message:
            reason = "The browser or page closed unexpectedly"
    return f"{LOGIN_SETTINGS[platform]['name']} login failed while {stage}: {reason}"


class LoginManager:
    def __init__(self):
        self.tasks = {}

    async def create(self, platform, replace_uid=None):
        if platform not in LOGIN_SETTINGS:
            raise HTTPException(422, "QR login is available for Douyin and TikTok only")
        # Check persistence before launching a browser or retiring a replaced account.
        try:
            await identities._cipher()
        except IdentityKeyMissing as exc:
            raise HTTPException(409, str(exc)) from None
        await identities.start()
        await self.cleanup()
        uid = uuid.uuid4()
        # Bind egress once: later configuration changes cannot split this session.
        proxy = proxy_for(platform)
        async with db._api.acquire() as connection:
            async with connection.transaction():
                await connection.execute("SELECT pg_advisory_xact_lock(72481, 3)")
                if await connection.fetchval("SELECT COUNT(*) FROM dtk_login_sessions WHERE status = 'pending'") >= 4:
                    raise HTTPException(429, "Four login sessions are already pending; finish or cancel one")
                if replace_uid:
                    retired = await connection.fetchval(
                        """
                        UPDATE dtk_identities SET state = 'retired', cookies = ''::bytea,
                            browser_state = NULL, proxy = NULL, retired_at = NOW(),
                            lease_token = NULL, lease_until = NULL, last_error = 'Re-login requested'
                        WHERE uid = $1 AND platform = $2 AND authenticated AND state != 'retired'
                        RETURNING uid
                        """,
                        replace_uid, platform,
                    )
                    if retired is None:
                        raise HTTPException(404, "Authenticated account not found")
                await connection.execute(
                    "INSERT INTO dtk_login_sessions (uid, platform) VALUES ($1, $2)", uid, platform
                )
        self.tasks[uid] = asyncio.create_task(self._run(uid, proxy, platform), name=f"{platform}-login-{uid}")
        self.tasks[uid].add_done_callback(lambda task: self.tasks.pop(uid, None))
        return await self.status(uid)

    async def status(self, uid):
        row = await db.fetchrow(
            """
            SELECT uid, platform, status, phase, error, identity_uid, expires_at, qr_version,
                qr_image IS NOT NULL AS qr_ready FROM dtk_login_sessions WHERE uid = $1
            """, uid,
        )
        if row is None:
            raise HTTPException(404, "Login session not found; start a new login")
        return row

    async def cancel(self, uid):
        await db.execute(
            "UPDATE dtk_login_sessions SET status = 'cancelled', qr_image = NULL WHERE uid = $1 AND status = 'pending'",
            uid,
        )
        task = self.tasks.get(uid)
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def cleanup(self):
        await db.execute(
            """
            UPDATE dtk_login_sessions SET status = 'expired', qr_image = NULL,
                error = 'Login expired; request a new QR code'
            WHERE status = 'pending' AND (expires_at <= NOW() OR heartbeat_at < NOW() - INTERVAL '60 seconds')
            """
        )
        await db.execute("DELETE FROM dtk_login_sessions WHERE created_at < NOW() - INTERVAL '1 hour' AND status != 'pending'")

    async def close(self):
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def image(self, uid):
        row = await db.fetchrow(
            "SELECT qr_image FROM dtk_login_sessions WHERE uid = $1 AND status = 'pending' AND phase = 'waiting' AND expires_at > NOW()", uid
        )
        if not row or not row["qr_image"]:
            raise HTTPException(404, "QR image is not available")
        cipher = await identities._cipher()
        return base64.b64decode(cipher.decrypt(row["qr_image"], aad=str(uid) + ":qr"))

    async def _save_qr(self, uid, image):
        # Serve PNG only, from the original image, canvas export or element screenshot.
        if len(image) > 2_000_000 or not image.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Unsupported upstream QR image")
        cipher = await identities._cipher()
        await db.execute(
            """
            UPDATE dtk_login_sessions SET qr_image = $2, qr_version = qr_version + 1
            WHERE uid = $1 AND status = 'pending' AND phase = 'waiting'
            """,
            uid, cipher.encrypt(base64.b64encode(image).decode(), aad=str(uid) + ":qr"),
        )

    async def _progress(self, uid, phase):
        await db.execute(
            """
            UPDATE dtk_login_sessions SET phase = $2, qr_image = NULL, heartbeat_at = NOW()
            WHERE uid = $1 AND status = 'pending' AND expires_at > NOW()
            """, uid, phase,
        )

    @staticmethod
    async def _qr_image(frame, platform):
        if platform == "tiktok":
            qr = frame.locator('div[class*="DivCodeImage"] canvas').filter(visible=True).first
            if not await qr.is_visible():
                return None
            source = await qr.evaluate("""canvas => {
                if (!canvas.width || !canvas.height) return null;
                return canvas.toDataURL('image/png');
            }""", timeout=1000)
            if source is None:
                return None
            return base64.b64decode(source.split(",", 1)[1], validate=True)
        qr = frame.locator("#animate_qrcode_container img").filter(visible=True).first
        if not await qr.is_visible():
            return None
        values = await qr.evaluate("""img => ({
            src: img.getAttribute('src') || '',
            ready: img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
        })""", timeout=1000)
        if not values["ready"]:
            return None
        source = values["src"]
        if source.startswith("data:") and ";base64," in source:
            try:
                image = base64.b64decode(source.split(",", 1)[1], validate=True)
            except ValueError:
                lg.warning("Douyin QR Base64 could not be decoded; using an element screenshot")
            else:
                if len(image) <= 2_000_000 and image.startswith(b"\x89PNG\r\n\x1a\n"):
                    return image
        # Non-PNG data URLs, blob/remote sources and undecodable Base64 use
        # only the loaded QR image element, never the surrounding login page.
        return await qr.screenshot(type="png", timeout=1000)

    async def _run(self, uid, proxy, platform):
        browser = None
        settings = LOGIN_SETTINGS[platform]
        name = settings["name"]
        stage = "starting CloakBrowser"
        try:
            async with asyncio.timeout(180):
                stage = "configuring the login proxy"
                options = {"headless": True, "locale": settings["locale"], "timezone": settings["timezone"]}
                if proxy:
                    parsed = urlsplit(proxy)
                    if parsed.scheme in ("socks5", "socks5h") and parsed.username:
                        raise ValueError("Chromium does not support authenticated SOCKS proxies")
                    options["proxy"] = {
                        "server": f"{parsed.scheme.replace('socks5h', 'socks5')}://{parsed.netloc.rsplit('@', 1)[-1]}",
                        **({"username": unquote(parsed.username), "password": unquote(parsed.password or "")} if parsed.username else {}),
                    }
                stage = "launching CloakBrowser Chromium"
                # Use the same binary resolver as DTK, without its RPC service,
                # guest contexts or profiles. Closing this browser stops its driver.
                launch = asyncio.create_task(launch_async(**options))
                try:
                    browser = await asyncio.shield(launch)
                except asyncio.CancelledError:
                    # Finish a launch already in progress so its process and
                    # Playwright driver can be closed even after cancellation.
                    try:
                        browser = await launch
                    except Exception as exc:
                        lg.error("%s (session=%s)", login_failure(stage, exc, platform), uid)
                    else:
                        await browser.close()
                    raise
                try:
                    stage = "creating the isolated browser context"
                    context = await browser.new_context(
                        locale=settings["locale"], timezone_id=settings["timezone"],
                        viewport={"width": 1440, "height": 900},
                    )
                    page = await context.new_page()
                    stage = f"opening the {name} QR login page"
                    await page.goto(
                        settings["entrypoint"],
                        wait_until="domcontentloaded", timeout=30000,
                    )
                    last_qr = None
                    scanned = False
                    validation_attempts = 0
                    web_page = None
                    web_cookie_deadline = None
                    qr_deadline = asyncio.get_running_loop().time() + 45
                    while True:
                        stage = "checking the login session"
                        pending = await db.fetchval(
                            """
                            UPDATE dtk_login_sessions SET heartbeat_at = NOW()
                            WHERE uid = $1 AND status = 'pending' AND expires_at > NOW() RETURNING uid
                            """, uid,
                        )
                        if pending is None:
                            return
                        if web_page is not None:
                            stage = f"waiting for {name} web login cookies"
                            # Check the same scoped jar that validation will save
                            # for transport, not unrelated creator-domain cookies.
                            scoped = await context.cookies(settings["account_url"])
                            jar = {cookie["name"]: cookie["value"] for cookie in scoped}
                            if (
                                not (jar.get("sessionid") or jar.get("sessionid_ss"))
                                or (platform == "douyin" and not pick_uifid(jar))
                            ):
                                if asyncio.get_running_loop().time() >= web_cookie_deadline:
                                    await self._terminal(
                                        uid, "failed",
                                        "Creator login completed, but Douyin web did not provide both login and UIFID signing cookies within 45 seconds. Request a new login and check the platform proxy."
                                        if platform == "douyin" else
                                        "TikTok did not provide web login cookies within 45 seconds. Request a new login and check the platform proxy.",
                                    )
                                    return
                            else:
                                stage = "validating and saving the authenticated web session"
                                await self._progress(uid, "validating")
                                validation_attempts += 1
                                saved = await self._confirm(uid, context, web_page, proxy, platform)
                                if saved:
                                    return
                                if validation_attempts >= 3:
                                    await self._terminal(uid, "failed", "Session validation failed; renew the QR code and try again")
                                    return
                            await asyncio.sleep(2)
                            continue
                        stage = "waiting for login confirmation"
                        cookies = (
                            await context.cookies() if platform == "douyin"
                            else await context.cookies(settings["account_url"])
                        )
                        session_cookies = [cookie for cookie in cookies if cookie["name"] in ("sessionid", "sessionid_ss") and cookie["value"]]
                        if session_cookies:
                            # Publish progress before navigation or cookie collection
                            # so the UI no longer displays an already-used QR code.
                            await self._progress(uid, "preparing")
                            if platform == "douyin":
                                stage = "opening Douyin web with the signed-in browser session"
                                # Keep the creator page alive for any remaining SSO
                                # callbacks; the new tab shares its cookies and proxy.
                                web_page = await context.new_page()
                                await web_page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=30000)
                            else:
                                web_page = page
                            web_cookie_deadline = asyncio.get_running_loop().time() + 45
                            continue
                        # Poll the same context so redirects, QR renewal and the
                        # user's scan/confirmation all retain their browser session.
                        for frame in page.frames:
                            expired = frame.get_by_text(re.compile(
                                "二维码.*(过期|失效)" if platform == "douyin" else r"QR code.*expired|expired.*QR code", re.I
                            )).filter(visible=True).first
                            if await expired.is_visible():
                                await self._terminal(uid, "expired", "QR code expired; request a new one")
                                return
                            if not scanned:
                                scan_confirmation = frame.get_by_text(re.compile(
                                    "扫码成功|扫描成功|已扫码|已扫描" if platform == "douyin" else r"QR code scanned|scanned successfully", re.I
                                )).filter(visible=True).first
                                if await scan_confirmation.is_visible():
                                    scanned = True
                                    await self._progress(uid, "scanned")
                        if scanned:
                            await asyncio.sleep(2)
                            continue
                        stage = f"extracting the {name} login QR image"
                        for frame in page.frames:
                            try:
                                image = await self._qr_image(frame, platform)
                            except PlaywrightTimeoutError:
                                # A loading/replaced image will be retried on the next poll.
                                lg.debug("%s QR image is not ready; retrying (session=%s)", name, uid)
                                continue
                            if image is not None:
                                if image != last_qr:
                                    await self._save_qr(uid, image)
                                    last_qr = image
                                break
                        if last_qr is None and asyncio.get_running_loop().time() >= qr_deadline:
                            await self._terminal(uid, "failed", f"{name} login did not provide a QR image within 45 seconds. Check the platform proxy and request a new QR code.")
                            return
                        await asyncio.sleep(2)
                finally:
                    await browser.close()
        except TimeoutError:
            await self._terminal(uid, "expired", "Login expired; request a new QR code")
        except asyncio.CancelledError:
            await self._terminal(uid, "cancelled", None)
            raise
        except ProviderError as exc:
            await self._terminal(uid, "failed", f"Session validation failed ({exc.code}); renew the QR code and try again")
        except Exception as exc:
            failure = login_failure(stage, exc, platform)
            lg.error("%s (session=%s)", failure, uid)
            await self._terminal(uid, "failed", failure)

    async def _terminal(self, uid, status, error):
        await db.execute(
            "UPDATE dtk_login_sessions SET status = $2, error = $3, qr_image = NULL WHERE uid = $1 AND status = 'pending'",
            uid, status, error,
        )

    async def _confirm(self, uid, context, page, proxy, platform):
        from .client import DtkClient

        values = await page.evaluate("""() => ({
            user_agent: navigator.userAgent, platform: navigator.platform,
            screen: `${screen.width}x${screen.height}`, language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardware_concurrency: navigator.hardwareConcurrency, device_memory: navigator.deviceMemory
        })""")
        chrome = re.search(r"(?:Headless)?Chrome/(\d+)", values["user_agent"])
        if not chrome:
            raise ValueError("Unsupported browser fingerprint")
        fingerprint = Fingerprint(browser_family=BrowserFamily.CHROME, browser_major=int(chrome.group(1)), **values)
        browser_state = await context.storage_state(indexed_db=True)
        # Full cookie records stay encrypted; transport gets only cookies matching its host/path.
        scoped = await context.cookies(LOGIN_SETTINGS[platform]["account_url"])
        identity = TransportIdentity(
            id=str(uuid.uuid4()), platform=Platform(platform), fingerprint=fingerprint,
            cookies={cookie["name"]: cookie["value"] for cookie in scoped}, proxy_url=proxy,
        )
        client = DtkClient(platform, "", {})
        try:
            async with asyncio.timeout(25):
                account = await client.validate_login(identity)
        except ProviderError as exc:
            if exc.code != "LOGIN_REQUIRED":
                raise
            return False
        finally:
            await client.close()
        async with db._api.acquire() as connection:
            async with connection.transaction():
                pending = await connection.fetchval(
                    "SELECT uid FROM dtk_login_sessions WHERE uid = $1 AND status = 'pending' AND expires_at > NOW() FOR UPDATE", uid
                )
                if pending is None:
                    return True
                await identities.save_authenticated(client.identity, browser_state, account, connection=connection)
                await connection.execute(
                    "UPDATE dtk_login_sessions SET status = 'confirmed', identity_uid = $2, qr_image = NULL WHERE uid = $1",
                    uid, uuid.UUID(identity.id),
                )
        return True


logins = LoginManager()
