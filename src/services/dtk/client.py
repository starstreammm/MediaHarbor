"""Use the pinned upstream library without importing its application services."""

import re
import random
from time import perf_counter
from dataclasses import replace
from datetime import datetime, timezone
from http.cookies import SimpleCookie

import asyncio
from contextlib import asynccontextmanager

from models import DetailsAccount, DetailsPost, Platform, UrlsFile
from services.base import ProviderError

from . import upstream
from .identity import identities
from .signing import sign
from .transport import _WreqClient

from dtk.core.errors import DtkError, InvalidParam, UpstreamChanged, UpstreamRiskControl
from dtk.core.types import (
    BrowserFamily,
    Outcome,
    Platform as UpstreamPlatform,
)
from dtk.platforms.registry import get_adapter
from dtk.platforms.douyin.params import base_params as douyin_base_params
from dtk.transport.base import (
    Fingerprint,
    RequestSpec,
    TransportFailure,
    TransportIdentity,
    with_signed_cookies,
)
from dtk.transport.headers import build_headers
from dtk.transport.wreq_transport import WreqTransport
from dtk.urls import ResourceKind, identify, first_url, resolve

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


def classify_error(error: Exception) -> tuple[str, str]:
    if isinstance(error, ProviderError):
        return error.status, error.code
    if isinstance(error, TransportFailure):
        return "Unavailable", "Upstream transport failed"
    if isinstance(error, DtkError):
        return "Error", error.code.value
    return "Error", f"Provider failure ({type(error).__name__})"


class DtkClient:
    def __init__(self, platform: str, cookie: str, options: dict[str, str]):
        self.platform = UpstreamPlatform(platform)
        self.adapter = get_adapter(platform)
        user_agent = options.get("user_agent", DEFAULT_USER_AGENT)
        chrome = re.search(r"Chrome/(\d+)\.", user_agent)
        if not chrome:
            raise InvalidParam(
                "Configure a Chrome User-Agent matching the cookie browser"
            )
        fingerprint = Fingerprint(
            browser_family=BrowserFamily.CHROME,
            browser_major=int(chrome.group(1)),
            user_agent=user_agent,
            platform=options.get("browser_platform", "Win32"),
            screen=options.get("screen", "1920x1080"),
            language=options.get(
                "language", "zh-CN" if platform == "douyin" else "en-US"
            ),
            timezone=options.get(
                "timezone",
                "Asia/Shanghai" if platform == "douyin" else "America/Los_Angeles",
            ),
        )
        jar = SimpleCookie()
        jar.load(cookie)
        if cookie and not jar:
            raise InvalidParam("Invalid Cookie header")
        self.identity = TransportIdentity(
            id=f"mediaharbor-{platform}",
            platform=self.platform,
            fingerprint=fingerprint,
            cookies={key: item.value for key, item in jar.items()},
        )
        self.transport = WreqTransport(
            cookie_sink=self._rotate_cookies, client_factory=_WreqClient
        )
        self.guest = True
        self.attempts = []
        self.outcome = None
        self.error = None
        self.sent = False
        self.http_status = None

    @property
    def cookie(self) -> str:
        return "; ".join(
            f"{key}={value}" for key, value in self.identity.cookies.items()
        )

    @property
    def headers(self) -> list[str]:
        headers = build_headers(self.identity.fingerprint, self.adapter.default_headers)
        headers["Cookie"] = self.cookie
        return [f"{key}: {value}" for key, value in headers.items()]

    async def _rotate_cookies(self, identity_id, cookies):
        self.identity = replace(
            self.identity, cookies={**self.identity.cookies, **cookies}
        )

    async def close(self):
        await self.transport.close()

    @asynccontextmanager
    async def _session(self, endpoint: str, *, authenticated=False, exclude=()):
        token = None
        self.outcome = None
        self.error = None
        self.sent = False
        self.http_status = None
        self.guest = not authenticated
        self.identity, token = await identities.acquire(
            self.platform.value, endpoint, authenticated=authenticated, exclude=exclude
        )
        try:
            # The SQL lease lasts longer than this hard request budget.
            async with asyncio.timeout(120):
                yield token
        except TransportFailure, TimeoutError:
            self.outcome = Outcome.NETWORK_ERROR
            self.error = "transport_failure"
            raise
        except asyncio.CancelledError:
            if self.sent and self.outcome is None:
                self.outcome = Outcome.NETWORK_ERROR
                self.error = "request_cancelled"
            raise
        except DtkError as exc:
            if isinstance(exc, UpstreamRiskControl):
                self.outcome = Outcome.RISK_CONTROL
            elif self.outcome is Outcome.OK:
                self.outcome = Outcome.BUSINESS_ERROR
            self.error = exc.code.value
            raise
        finally:
            if token is not None:
                completion = asyncio.create_task(
                    identities.finish(
                        self.identity,
                        token,
                        endpoint,
                        self.outcome,
                        self.error,
                    )
                )
                try:
                    await asyncio.shield(completion)
                except asyncio.CancelledError:
                    await completion
                    raise

    async def download_headers(self):
        if self.guest:
            # Like DTK's media worker, Aria2 must not receive a guest jar: it
            # cannot reproduce that identity's TLS fingerprint or bound proxy.
            headers = build_headers(
                self.identity.fingerprint, self.adapter.default_headers
            )
            return [f"{key}: {value}" for key, value in headers.items()]
        return self.headers

    async def _fetch(self, operation: str, **params):
        endpoint = f"{self.platform.value}.{operation}"
        spec = self.adapter.build_request(
            endpoint,
            profile=self.adapter.profile_for(self.identity.fingerprint),
            **params,
        )
        return await self._send(spec, endpoint)

    async def _send(self, spec, endpoint):
        signed = await sign(spec, self.identity)
        self.sent = True
        response = await self.transport.request(
            with_signed_cookies(self.identity, signed.cookies),
            RequestSpec(
                url=signed.signed_url(spec["url"]),
                method=spec["method"],
                headers={**spec["headers"], **signed.headers},
                body=spec["body"],
                endpoint=endpoint,
            ),
        )
        self.http_status = response.status
        if not response.body.strip():
            self.outcome, self.error = Outcome.NETWORK_ERROR, "BodyEmpty"
            raise ProviderError("Error", "BodyEmpty")
        if not self.guest and response.status == 401:
            self.outcome, self.error = Outcome.BUSINESS_ERROR, "LOGIN_REQUIRED"
            raise ProviderError("Login Required", "LOGIN_REQUIRED")
        payload = response.json_or_none()
        # Explicit login responses differ from captcha/rate limiting (including HTTP 403).
        if isinstance(payload, dict) and not self.guest and (
            payload.get("status_code") in (8, "8")
            or payload.get("status_msg") in ("login required", "Login required", "用户未登录")
            or (self.platform is UpstreamPlatform.TIKTOK and isinstance(payload.get("data"), dict)
                and payload["data"].get("error_code") in (7, "7"))
        ):
            self.outcome, self.error = Outcome.BUSINESS_ERROR, "LOGIN_REQUIRED"
            raise ProviderError("Login Required", "LOGIN_REQUIRED")
        classification = self.transport.classify(response, empty_body_is_normal=False)
        self.outcome = classification.outcome
        self.error = classification.rule if self.outcome is not Outcome.OK else None
        if self.outcome is not Outcome.OK:
            status = "Unavailable" if self.outcome is Outcome.NETWORK_ERROR else "Error"
            raise ProviderError(status, classification.rule)
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamChanged("Invalid upstream JSON") from exc
        if not isinstance(payload, dict):
            raise UpstreamChanged("Expected a JSON object")
        if self.adapter.detect_risk_control(payload):
            self.outcome = Outcome.RISK_CONTROL
            self.error = "UPSTREAM_RISK_CONTROL"
            raise ProviderError("Error", self.error)
        return payload

    async def _resolve(self, text: str, resource: ResourceKind):
        if resource is ResourceKind.USER:
            candidate = first_url(text)
            if candidate:
                # Profile pages can carry a video modal_id/vid. Account queries
                # need the profile path; post queries retain DTK's video priority.
                profile = identify(candidate.partition("?")[0])
                if (
                    profile.platform == self.platform
                    and profile.resource is ResourceKind.USER
                ):
                    text = profile.url

        transport = WreqTransport(client_factory=_WreqClient)

        async def fetch_redirect(url):
            # DTK validates every hop. The original transport carries the bound
            # fingerprint/egress but never credentials to a resolution host.
            self.sent = True
            response = await transport.request(
                replace(self.identity, cookies={}),
                RequestSpec(url=url),
                timeout=10,
            )
            self.http_status = response.status
            if 300 <= response.status < 400:
                return response.header("location")
            if response.ok and not response.body.strip():
                self.outcome, self.error = Outcome.NETWORK_ERROR, "BodyEmpty"
                raise ProviderError("Error", "BodyEmpty")
            if not response.ok:
                self.outcome = self.transport.classify(response).outcome
                self.error = "URL resolution failed"
                raise ProviderError("Unavailable", self.error)
            return None

        try:
            kind = await resolve(text, fetch_redirect)
        finally:
            await transport.close()
        if (
            kind.platform != self.platform
            or kind.resource is not resource
            or not kind.resource_id
        ):
            raise InvalidParam("URL does not identify the requested platform resource")
        self.outcome = Outcome.OK
        return kind

    def parse_post(self, data: dict) -> DetailsPost[UrlsFile]:
        envelope = (
            {"aweme_detail": data}
            if self.platform is UpstreamPlatform.DOUYIN
            else {"itemInfo": {"itemStruct": data}}
        )
        content = self.adapter.parse_content(
            envelope, fetched_at=datetime.now(timezone.utc)
        )
        return self._post(content)

    def _post(self, content) -> DetailsPost[UrlsFile]:
        files = []
        for image in content.media.images:
            media = image.video or image
            files.append(
                UrlsFile(
                    urls=media.urls or [media.url],
                    suffix="mp4" if image.video else "jpeg",
                )
            )
        if not files and content.media.video:
            video = content.media.video
            files.append(UrlsFile(urls=video.urls or [video.url], suffix="mp4"))
        if not files or content.created_at is None:
            raise UpstreamChanged(
                "Post has no downloadable media or publication timestamp"
            )
        account_pid = content.author.sec_uid
        if not account_pid:
            raise UpstreamChanged("Post author has no sec_uid")
        return DetailsPost[UrlsFile](
            platform=Platform(self.platform.value),
            account_pid=account_pid,
            pid=content.content_id,
            url=(content.raw or {}).get("share_url") or content.web_url,
            overview=content.description,
            post_time=content.created_at.astimezone(timezone.utc),
            files=files,
        )

    def _profile(self, author, account_id: str) -> DetailsAccount[UrlsFile]:
        raw = author.raw or {}
        covers = raw.get("cover_url") or []
        cover = UrlsFile(urls=covers[0]["url_list"], suffix="jpeg") if covers else None
        gender = raw.get("gender")
        return DetailsAccount[UrlsFile](
            platform=Platform(self.platform.value),
            pid=account_id,
            url=(raw.get("share_info") or {}).get("share_url") or author.web_url,
            alias=author.nickname,
            overview=author.signature or "",
            avatar=UrlsFile(
                urls=author.avatar.urls or [author.avatar.url], suffix="jpeg"
            )
            if author.avatar
            else None,
            cover=cover,
            age=raw.get("user_age"),
            address="·".join(
                filter(None, [raw.get("country"), raw.get("province"), raw.get("city")])
            ),
            gender=None if gender in (None, 0) else gender == 1,
            ip=raw["ip_location"].replace("IP属地：", "")
            if raw.get("ip_location")
            else None,
            school=raw.get("school_name"),
        )

    async def execute(self, operation: str, params: dict, *, attempt_timeout=None):
        operations = {
            "post-id": "url_resolution",
            "account-id": "author_profile",
            "post": "content_detail",
            "profile": "author_profile",
            "posts": "author_posts",
        }
        if operation not in operations:
            raise InvalidParam("Unsupported adapter operation")
        endpoint = f"{self.platform.value}.{operations[operation]}"
        attempted = set()
        profile_fallback = self.platform is UpstreamPlatform.DOUYIN and operation == "profile"
        guest_pool_exhausted = False
        last_empty = False
        for attempt in range(7 if profile_fallback else 3):
            authenticated = operation == "posts" or (
                profile_fallback and (attempt == 6 or guest_pool_exhausted)
            )
            started = perf_counter()
            requested_at = datetime.now(timezone.utc)
            status, error = "Healthy", None
            self.sent = False
            acquired = False
            try:
                async with asyncio.timeout(attempt_timeout), self._session(
                    endpoint, authenticated=authenticated, exclude=attempted
                ) as token:
                    acquired = True
                    attempted.add(self.identity.id)
                    if authenticated and await identities.needs_validation(self.identity.id):
                        await self.validate_login(self.identity)
                        await identities.mark_validated(self.identity.id, token)
                    return await self._execute(operation, params)
            except Exception as exc:
                status, error = classify_error(exc)
                if profile_fallback:
                    if isinstance(exc, TimeoutError):
                        status, error = "Unavailable", "Profile attempt timed out"
                    if authenticated:
                        reason = "no authenticated identity is available" if error == "LOGIN_REQUIRED" and not acquired else error
                        raise ProviderError(
                            "Error", f"Douyin profile fetch failed after guest retries and authenticated fallback: {reason}"
                        ) from exc
                    # Never reuse a guest when fewer than six are available.
                    # Continue with the authenticated fallback after pool exhaustion.
                    if not acquired:
                        guest_pool_exhausted = True
                else:
                    retry = error == "BodyEmpty" if not authenticated else (
                        self.outcome in (Outcome.NETWORK_ERROR, Outcome.RISK_CONTROL)
                        or error == "LOGIN_REQUIRED"
                    )
                    if not retry or not self.sent:
                        if last_empty and not acquired:
                            raise ProviderError("Unavailable", "BodyEmpty retries exhausted: no different guest identity is available") from exc
                        raise
                    if attempt == 2:
                        if not authenticated:
                            raise ProviderError("Unavailable", "BodyEmpty retries exhausted after 3 different guest identities") from exc
                        raise
            except asyncio.CancelledError:
                status, error = "Unavailable", "Request cancelled or timed out"
                raise
            finally:
                self.attempts.append({
                    "requested_at": requested_at, "status": status, "error": error,
                    "latency": round((perf_counter() - started) * 1000, 2),
                    "http_status": self.http_status,
                })
            last_empty = not authenticated and error == "BodyEmpty"
            delay = 0.3 * 2 ** attempt
            await asyncio.sleep((min(delay, 1) if profile_fallback else delay) + random.uniform(0, 0.2))

    async def validate_login(self, identity):
        """A self-profile response proves login; a public profile never does."""
        self.identity, self.guest = identity, False
        if self.platform is UpstreamPlatform.TIKTOK:
            payload = await self._send({
                "method": "GET", "url": "https://www.tiktok.com/passport/web/account/info/",
                "params": {"aid": "1459"}, "headers": dict(self.adapter.default_headers), "body": None,
            }, "tiktok.author_profile")
            data = payload.get("data") or {}
            if payload.get("message") != "success" or not data.get("user_id"):
                self.outcome, self.error = Outcome.BUSINESS_ERROR, "LOGIN_REQUIRED"
                raise ProviderError("Login Required", "LOGIN_REQUIRED")
            return {"id": str(data["user_id"]), "name": data.get("screen_name") or str(data["user_id"])}
        # Self-profile identifies the account from its cookies. The public
        # author-profile builder requires a sec_user_id and cannot build this request.
        spec = {
            "method": "GET",
            "url": "https://www.douyin.com/aweme/v1/web/user/profile/self/",
            "params": {
                **douyin_base_params(self.adapter.profile_for(identity.fingerprint)),
                "publish_video_strategy_type": "2",
                "personal_center_strategy": "1",
            },
            "headers": dict(self.adapter.default_headers),
            "body": None,
        }
        payload = await self._send(spec, "douyin.author_profile")
        user = payload.get("user") or {}
        if payload.get("status_code") != 0 or not user.get("uid") or not user.get("sec_uid"):
            self.outcome, self.error = Outcome.BUSINESS_ERROR, "LOGIN_REQUIRED"
            raise ProviderError("Login Required", "LOGIN_REQUIRED")
        return {"id": str(user["uid"]), "name": user.get("nickname") or str(user["uid"])}

    async def _execute(self, operation: str, params: dict):
        if operation == "post-id":
            return (await self._resolve(params["url"], ResourceKind.VIDEO)).resource_id
        if operation == "account-id":
            kind = await self._resolve(params["url"], ResourceKind.USER)
            if self.platform is UpstreamPlatform.DOUYIN:
                return kind.resource_id
            payload = await self._fetch("author_profile", unique_id=kind.resource_id)
            author = self.adapter.parse_author(payload)
            if not author.sec_uid:
                raise UpstreamChanged("TikTok profile has no sec_uid")
            return author.sec_uid
        if operation == "post":
            key = "aweme_id" if self.platform is UpstreamPlatform.DOUYIN else "item_id"
            payload = await self._fetch("content_detail", **{key: params["id"]})
            content = self.adapter.parse_content(
                payload, fetched_at=datetime.now(timezone.utc)
            )
            return self._post(content).model_dump(mode="json")
        key = "sec_user_id" if self.platform is UpstreamPlatform.DOUYIN else "sec_uid"
        if operation == "profile":
            payload = await self._fetch("author_profile", **{key: params["id"]})
            return self._profile(
                self.adapter.parse_author(payload), params["id"]
            ).model_dump(mode="json")
        if operation == "posts":
            payload = await self._fetch(
                "author_posts",
                **{key: params["id"]},
                cursor=params.get("cursor"),
                count=18,
            )
            page = self.adapter.parse_author_posts(
                payload, fetched_at=datetime.now(timezone.utc)
            )
            if page.has_more and (
                not page.cursor or page.cursor == params.get("cursor")
            ):
                raise UpstreamChanged("Post pagination did not advance")
            return {
                "posts": [
                    self._post(item).model_dump(mode="json") for item in page.items
                ],
                "cursor": page.cursor,
                "has_more": page.has_more,
            }
        raise InvalidParam("Unsupported adapter operation")


def platform_for_url(text: str) -> str | None:
    candidate = first_url(text)
    kind = identify(candidate) if candidate else None
    return kind.platform.value if kind and kind.allowed and kind.platform else None
