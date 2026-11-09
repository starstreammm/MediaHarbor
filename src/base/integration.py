import asyncio
import logging
import re
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from time import perf_counter
from traceback import walk_tb

import httpx
from fastapi import HTTPException

from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from models.integration import (
    IntegrationCredentials,
    IntegrationRequest,
    IntegrationService,
)


logger = logging.getLogger(__name__)
EXPIRED_CODES = {
    "TOKEN_EXPIRED",
    "CREDENTIALS_EXPIRED",
    "API_KEY_EXPIRED",
    "SESSION_EXPIRED",
}
DOUYIN_ENDPOINTS = [
    {"key": "readiness", "name": "Readiness", "path": "/readyz", "probe_enabled": True},
    {
        "key": "capabilities",
        "name": "Capabilities",
        "path": "/api/v1/system/capabilities",
        "probe_enabled": True,
    },
    *[
        {
            "key": f"{platform}-{key}",
            "name": f"{platform.title()} {name}",
            "path": f"/api/v1/{platform}/{path}",
            "platform": platform,
        }
        for platform in ("douyin", "tiktok")
        for key, name, path in (
            ("video", "video", "video"),
            ("user", "profile", "user"),
            ("posts", "posts", "user/posts"),
        )
    ],
    {"key": "task", "name": "Task result", "path": "/api/v1/tasks/{task_id}"},
]


def classify_response(
    kind: str, path: str, http_status: int, payload
) -> tuple[str, str | None]:
    # Never retain arbitrary upstream messages: they can contain credentials or user data.
    code = None
    if isinstance(payload, dict):
        error = payload.get("error")
        if kind == "douyin_v5" and path == "/api/v1/tasks/{task_id}":
            data = payload.get("data")
            if isinstance(data, dict) and data.get("state") == "failed":
                error = data.get("error")
        code = error.get("code") if isinstance(error, dict) else payload.get("code")
    safe_code = (
        str(code)
        if code is not None and re.fullmatch(r"[A-Z0-9_-]{1,64}", str(code))
        else None
    )
    if safe_code in EXPIRED_CODES:
        return "Expired", f"Upstream credentials expired ({safe_code})"
    if not 200 <= http_status < 300:
        return "Error", f"Upstream HTTP {http_status}" + (
            f" ({safe_code})" if safe_code else ""
        )
    if not isinstance(payload, dict):
        return "Error", "Expected a JSON object response"
    if kind == "douyin_v5" and path in ("/readyz", "/healthz"):
        return (
            ("Healthy", None)
            if payload.get("status") == "ok"
            else ("Error", "Upstream is not ready")
        )
    if kind == "douyin_v5":
        if path == "/api/v1/tasks/{task_id}":
            data = payload.get("data")
            if isinstance(data, dict) and data.get("state") == "failed":
                return "Error", f"Upstream task failed ({safe_code or 'task failure'})"
        if payload.get("success") is True and payload.get("error") is None:
            return "Healthy", None
        return (
            "Error",
            f"Upstream business error ({safe_code or 'invalid response envelope'})",
        )
    # Generic JSON services must signal success explicitly; HTTP 200 alone is insufficient.
    failed = (
        payload.get("success") is False
        or bool(payload.get("error"))
        or ("code" in payload and payload["code"] not in (0, 200, "0", "200"))
        or ("status_code" in payload and payload["status_code"] not in (0, "0"))
        or ("status" in payload and payload["status"] != "ok")
    )
    explicit_success = (
        payload.get("success") is True
        or payload.get("status") == "ok"
        or payload.get("code") in (0, 200, "0", "200")
        or payload.get("status_code") in (0, "0")
    )
    if failed or not explicit_success:
        return (
            "Error",
            f"Upstream business error ({safe_code or 'unrecognized success response'})",
        )
    return "Healthy", None


class IntegrationBase:
    _task: asyncio.Task | None = None
    _checks: dict[int, asyncio.Task] = {}
    _locks: dict[int, asyncio.Lock] = {}
    _semaphore = asyncio.Semaphore(8)

    @classmethod
    async def ensure_adapter(cls, platform: str, cookie: str) -> int:
        """Register the legacy adapter once; preserve health configuration on restart."""
        from services.catalog import OPERATIONS, PLATFORMS

        definition = PLATFORMS[platform]
        key = f"{definition.provider}:{platform}"
        existing = await db.fetchval(
            "SELECT uid FROM api_services WHERE adapter_key = $1", key
        )
        if existing is not None:
            return existing
        config = IntegrationService(
            name=definition.name,
            kind=definition.provider,
            transport="python",
            platform=platform,
            base_url=definition.base_url,
            auth_type="none",
            api_key="",
            timeout_seconds=30,
            auth_check_endpoint=None,
            endpoints=[
                {
                    "key": operation,
                    "name": name,
                    "path": f"/{operation}",
                    "platform": platform,
                    "requires_auth": operation == "posts",
                }
                for operation, name in OPERATIONS.items()
            ],
        ).model_dump(mode="json")
        return await db.fetchval(
            """
            INSERT INTO api_services (config, provider, platform, transport, adapter_key)
            VALUES ($1, $2, $3, 'python', $4)
            ON CONFLICT (adapter_key) DO UPDATE SET adapter_key = EXCLUDED.adapter_key
            RETURNING uid
        """,
            config,
            definition.provider,
            platform,
            key,
        )

    @classmethod
    async def _python_request(cls, uid, config, endpoint, request, source):
        operation = endpoint["key"]
        required = {"url"} if operation in ("post-id", "account-id") else {"id"}
        allowed = required | ({"cursor"} if operation == "posts" else set())
        if (
            request.path_params
            or not required <= request.params.keys()
            or request.params.keys() - allowed
        ):
            raise HTTPException(422, "Invalid parameters for this adapter operation")
        if any(
            not isinstance(value, str) or not value.strip()
            for value in request.params.values()
        ):
            raise HTTPException(422, "Adapter parameters must be nonempty strings")
        client = None
        provider = None
        payload, http_status = None, None
        async with cls._semaphore:
            started = perf_counter()
            requested_at = datetime.now(timezone.utc)
            try:
                from services.catalog import PROVIDERS

                definition = PROVIDERS[config["kind"]]
                provider = definition.load()
                cookie = ""
                client = definition.client(
                    config["platform"], cookie, config.get("options", {})
                )
                if config["kind"] == "dtk" and config["platform"] == "douyin" and operation == "profile":
                    # Six guests and one authenticated fallback each receive the
                    # configured timeout; leave room for bounded retry backoff.
                    async with asyncio.timeout(7 * config["timeout_seconds"] + 8):
                        payload = await client.execute(
                            operation, request.params, attempt_timeout=config["timeout_seconds"]
                        )
                else:
                    async with asyncio.timeout(config["timeout_seconds"]):
                        payload = await client.execute(operation, request.params)
                status, error = "Healthy", None
            except ImportError:
                status, error = (
                    "Unavailable",
                    "Python provider dependencies are unavailable",
                )
            except TimeoutError, httpx.RequestError:
                status, error = "Unavailable", "Upstream connection failed or timed out"
            except OSError:
                status, error = "Unavailable", "Python provider runtime is unavailable"
            except Exception as exc:
                if provider is not None:
                    status, error = provider.classify_error(exc)
                else:
                    status, error = "Error", f"Provider failure ({type(exc).__name__})"
                frames = " -> ".join(
                    f"{frame.f_globals.get('__name__', '<unknown>')}.{frame.f_code.co_name}:{line}"
                    for frame, line in walk_tb(exc.__traceback__)
                )
                lg.error(
                    "Provider request failed: service=%s operation=%s "
                    "auth_type=%s status=%s error=%s upstream_status=%s "
                    "exception=%s frames=%s",
                    uid,
                    operation,
                    config["auth_type"],
                    status,
                    error,
                    client.http_status if client is not None else None,
                    type(exc).__name__,
                    frames,
                )
            finally:
                if client is not None:
                    http_status = client.http_status
                    await client.close()
            latency = round((perf_counter() - started) * 1000, 2)
        attempts = client.attempts if client is not None else []
        for attempt in attempts or [{
            "requested_at": requested_at, "status": status, "error": error,
            "latency": latency, "http_status": http_status,
        }]:
            await cls.record(
                uid, config, endpoint, source, attempt["requested_at"],
                attempt["status"], attempt["error"], attempt["latency"],
                attempt["http_status"], False,
            )
        # Keep the legacy health endpoint in sync with observed adapter outcomes.
        from services import APIUtil

        active = APIUtil._instance.get(config["platform"])
        if active is not None and active.service_uid == uid:
            if operation != "posts" and (operation in ("post", "profile") or status != "Healthy"):
                setattr(APIUtil.sta, config["platform"], status == "Healthy")
            if client is not None and operation != "posts":
                active.headers = client.headers
        return {
            "success": status == "Healthy",
            "service_uid": uid,
            "endpoint": operation,
            "status": status,
            "upstream_status": http_status,
            "latency_ms": latency,
            "data": payload if status == "Healthy" else None,
            "error": error,
        }

    @classmethod
    def lock(cls, uid: int) -> asyncio.Lock:
        return cls._locks.setdefault(uid, asyncio.Lock())

    @classmethod
    def start(cls):
        if cls._task is None or cls._task.done():
            cls._task = asyncio.create_task(cls._monitor())

    @classmethod
    async def close(cls):
        if cls._task:
            cls._task.cancel()
            with suppress(asyncio.CancelledError):
                await cls._task
            cls._task = None
        tasks = list(cls._checks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        cls._checks.clear()

    @classmethod
    async def _monitor(cls):
        while True:
            try:
                rows = await db.fetch("SELECT * FROM api_services") or []
                now = datetime.now(timezone.utc)
                for row in rows:
                    config = row["config"]
                    previous = cls._checks.get(row["uid"])
                    if previous and not previous.done():
                        continue
                    due = (
                        row["last_check"] is None
                        or (now - row["last_check"]).total_seconds()
                        >= config["interval_seconds"]
                    )
                    has_credentials = config.get("transport") == "python" or config["auth_type"] == "none" or bool(
                        config["api_key"]
                    )
                    if config["enabled"] and has_credentials and due:
                        cls._checks[row["uid"]] = asyncio.create_task(
                            cls._scheduled_check(row["uid"])
                        )
                await db.execute(
                    "DELETE FROM api_requests WHERE requested_at < NOW() - INTERVAL '7 days'"
                )
            except Exception:
                logger.exception("API Health monitoring iteration failed")
            await asyncio.sleep(15)

    @classmethod
    async def _scheduled_check(cls, uid: int):
        try:
            await cls.check(uid)
        except HTTPException as exc:
            if exc.status_code not in (404, 409):
                logger.exception("API Health check failed for service %s", uid)
        except Exception:
            logger.exception("API Health check failed for service %s", uid)

    @staticmethod
    async def get(uid: int) -> dict:
        row = await db.fetchrow("SELECT * FROM api_services WHERE uid = $1", uid)
        if row is None:
            raise HTTPException(404, "API service not found")
        return row

    @classmethod
    async def save(cls, data: IntegrationService, uid: int | None = None):
        config = data.model_dump(mode="json")
        if uid is None:
            config["api_key"] = config["api_key"] or ""
            return await db.fetchval(
                """
                INSERT INTO api_services (config, reauthenticated_at, provider, platform, transport)
                VALUES ($1, CASE WHEN $2 THEN NOW() END, $3, $4, $5) RETURNING uid
            """,
                config,
                bool(config["api_key"]),
                data.kind,
                data.platform,
                data.transport,
            )
        async with cls.lock(uid):
            old = await cls.get(uid)
            if (data.kind, data.platform, data.transport) != (
                old["provider"],
                old["platform"],
                old["transport"],
            ):
                raise HTTPException(
                    409,
                    "Create a new service to change its provider, platform or transport",
                )
            old_platforms = {
                item["key"]: item.get("platform") for item in old["config"]["endpoints"]
            }
            if any(
                item.key in old_platforms and item.platform != old_platforms[item.key]
                for item in data.endpoints
            ):
                raise HTTPException(
                    409, "Create a new endpoint key to change its platform"
                )
            if config["api_key"] is None:
                config["api_key"] = old["config"]["api_key"]
            keys = [endpoint.key for endpoint in data.endpoints]
            async with db._api.acquire() as connection:
                async with connection.transaction():
                    await connection.execute(
                        """
                        UPDATE api_services SET config = $2, last_check = NULL,
                            auth_status = 'Unknown', auth_checked_at = NULL, auth_error = NULL,
                            reauthenticated_at = CASE WHEN $3 THEN NOW() ELSE reauthenticated_at END,
                            provider = $4, platform = $5, transport = $6
                        WHERE uid = $1
                    """,
                        uid,
                        config,
                        bool(config["api_key"])
                        and config["api_key"] != old["config"]["api_key"],
                        data.kind,
                        data.platform,
                        data.transport,
                    )
                    await connection.execute(
                        "DELETE FROM api_endpoint_stats WHERE service_uid = $1 AND NOT (endpoint_key = ANY($2::text[]))",
                        uid,
                        keys,
                    )
                    await connection.execute(
                        "DELETE FROM api_requests WHERE service_uid = $1 AND NOT (endpoint_key = ANY($2::text[]))",
                        uid,
                        keys,
                    )
                    await connection.execute(
                        "UPDATE api_endpoint_stats SET status = 'Unknown', error = NULL WHERE service_uid = $1",
                        uid,
                    )
        return uid

    @classmethod
    async def reauthenticate(cls, uid: int, credentials: IntegrationCredentials):
        async with cls.lock(uid):
            config = (await cls.get(uid))["config"]
            if config.get("transport") == "python":
                raise HTTPException(409, "Manage authenticated accounts in API Health")
            if config["auth_type"] != "login":
                raise HTTPException(409, "This service does not require login")
            config.update(credentials.model_dump(mode="json"))
            async with db._api.acquire() as connection:
                async with connection.transaction():
                    await connection.execute(
                        """
                        UPDATE api_services SET config = $2, last_check = NULL,
                            auth_status = 'Unknown', auth_checked_at = NULL, auth_error = NULL,
                            reauthenticated_at = NOW() WHERE uid = $1
                    """,
                        uid,
                        config,
                    )
                    await connection.execute(
                        "UPDATE api_endpoint_stats SET status = 'Unknown', error = NULL WHERE service_uid = $1",
                        uid,
                    )

    @classmethod
    async def refresh_credentials(cls, uid: int):
        async with cls.lock(uid):
            config = (await cls.get(uid))["config"]
            if config.get("transport") == "python":
                raise HTTPException(409, "Manage authenticated accounts in API Health")
            if config["auth_type"] != "login":
                raise HTTPException(409, "This service does not require login")
            cls.require_credentials(config)
            if not config["enabled"]:
                raise HTTPException(409, "Service is disabled")
            endpoint = next(
                (
                    item
                    for item in config["endpoints"]
                    if item["key"] == config["auth_check_endpoint"]
                ),
                None,
            )
            if endpoint is None or not endpoint["enabled"]:
                raise HTTPException(
                    409, "Configure an enabled credential-check endpoint first"
                )
            result = await cls._request(
                uid,
                config,
                endpoint,
                IntegrationRequest(params=endpoint["probe_params"]),
                "health",
            )
            return {
                key: result[key] for key in ("success", "status", "error", "latency_ms")
            }

    @staticmethod
    def require_credentials(config: dict):
        if config.get("transport") == "python":
            return
        if config["auth_type"] == "login" and not config["api_key"]:
            raise HTTPException(
                409, "Reauthenticate this service before making requests"
            )
        expiry = config.get("credential_expires_at")
        if (
            config.get("transport") == "python"
            and expiry
            and datetime.fromisoformat(expiry) <= datetime.now(timezone.utc)
        ):
            raise HTTPException(
                409, "Replace expired credentials before making requests"
            )

    @classmethod
    async def delete(cls, uid: int):
        async with cls.lock(uid):
            row = await cls.get(uid)
            if row["adapter_key"]:
                raise HTTPException(
                    409, "Disable built-in adapters instead of deleting their history"
                )
            await db.execute("DELETE FROM api_services WHERE uid = $1", uid)

    @classmethod
    async def set_enabled(cls, uid: int, enabled: bool):
        async with cls.lock(uid):
            await cls.get(uid)
            await db.execute(
                "UPDATE api_services SET config = jsonb_set(config, '{enabled}', $2::jsonb), last_check = NULL WHERE uid = $1",
                uid,
                enabled,
            )
            await db.execute(
                "UPDATE api_endpoint_stats SET status = 'Unknown', error = NULL WHERE service_uid = $1",
                uid,
            )

    @classmethod
    async def check(cls, uid: int, endpoint_key: str | None = None):
        async with cls.lock(uid):
            row = await cls.get(uid)
            config = row["config"]
            if not config["enabled"]:
                raise HTTPException(409, "Service is disabled")
            cls.require_credentials(config)
            endpoints = config["endpoints"]
            if endpoint_key is not None:
                endpoints = [
                    endpoint
                    for endpoint in endpoints
                    if endpoint["key"] == endpoint_key
                ]
                if not endpoints:
                    raise HTTPException(404, "Endpoint not found")
                if not endpoints[0]["enabled"] or not endpoints[0]["probe_enabled"]:
                    raise HTTPException(
                        409, "Enable this endpoint and configure its health probe first"
                    )
            endpoints = [
                endpoint
                for endpoint in endpoints
                if endpoint["enabled"] and endpoint["probe_enabled"]
            ]
            if config.get("transport") == "python":
                # Cookie rotation from one probe must reach the next signed request.
                results = [
                    await cls._request(
                        uid,
                        config,
                        endpoint,
                        IntegrationRequest(params=endpoint["probe_params"]),
                        "health",
                    )
                    for endpoint in endpoints
                ]
            else:
                results = await asyncio.gather(
                    *[
                        cls._request(
                            uid,
                            config,
                            endpoint,
                            IntegrationRequest(params=endpoint["probe_params"]),
                            "health",
                        )
                        for endpoint in endpoints
                    ],
                    return_exceptions=True,
                )
            for result in results:
                if isinstance(result, BaseException):
                    raise result
            if endpoint_key is None:
                await db.execute(
                    "UPDATE api_services SET last_check = NOW() WHERE uid = $1", uid
                )
            return {
                "checked": len(results),
                "failed": sum(not result["success"] for result in results),
            }

    @classmethod
    async def invoke(cls, uid: int, endpoint_key: str, request: IntegrationRequest):
        async with cls.lock(uid):
            config = (await cls.get(uid))["config"]
            endpoint = next(
                (item for item in config["endpoints"] if item["key"] == endpoint_key),
                None,
            )
            if endpoint is None:
                raise HTTPException(404, "Endpoint not found")
            if not config["enabled"] or not endpoint["enabled"]:
                raise HTTPException(409, "Service or endpoint is disabled")
            cls.require_credentials(config)
            return await cls._request(uid, config, endpoint, request, "user")

    @classmethod
    async def _request(
        cls,
        uid: int,
        config: dict,
        endpoint: dict,
        request: IntegrationRequest,
        source: str,
    ):
        if config.get("transport") == "python":
            return await cls._python_request(uid, config, endpoint, request, source)
        required = set(re.findall(r"\{([a-z_]+)\}", endpoint["path"]))
        if required != set(request.path_params):
            raise HTTPException(
                422, "Path parameters must exactly match the configured endpoint"
            )
        path = endpoint["path"].format(**request.path_params)
        headers = {"Accept": "application/json"}
        if config["auth_type"] == "login" and config["api_key"]:
            headers["X-API-Key"] = config["api_key"]
        payload, http_status = None, None
        async with cls._semaphore:
            started = perf_counter()
            requested_at = datetime.now(timezone.utc)
            try:
                async with httpx.AsyncClient(
                    timeout=config["timeout_seconds"],
                    follow_redirects=False,
                    trust_env=False,
                ) as client:
                    async with asyncio.timeout(config["timeout_seconds"]):
                        async with client.stream(
                            "GET",
                            config["base_url"] + path,
                            params=request.params,
                            headers=headers,
                        ) as response:
                            http_status = response.status_code
                            body = bytearray()
                            async for chunk in response.aiter_bytes(chunk_size=65536):
                                body.extend(chunk)
                                if len(body) > 5 * 1024 * 1024:
                                    raise ValueError("Upstream response exceeded 5 MiB")
                            try:
                                payload = httpx.Response(
                                    http_status, content=bytes(body)
                                ).json()
                            except ValueError:
                                payload = None
                            status, error = classify_response(
                                config["kind"], endpoint["path"], http_status, payload
                            )
            except httpx.RequestError, TimeoutError:
                status, error = "Unavailable", "Upstream connection failed or timed out"
            except ValueError, httpx.InvalidURL:
                status, error = "Error", "Invalid or oversized upstream response"
            latency = round((perf_counter() - started) * 1000, 2)
        await cls.record(
            uid,
            config,
            endpoint,
            source,
            requested_at,
            status,
            error,
            latency,
            http_status,
        )
        return {
            "success": status == "Healthy",
            "service_uid": uid,
            "endpoint": endpoint["key"],
            "status": status,
            "upstream_status": http_status,
            "latency_ms": latency,
            "data": payload if status == "Healthy" else None,
            "error": error,
        }

    @classmethod
    async def record(
        cls,
        uid,
        config,
        endpoint,
        source,
        requested_at,
        status,
        error,
        latency,
        http_status,
        credentials_changed=False,
    ):
        """Atomic observation writer shared by HTTP services and Python providers."""
        success = status == "Healthy"
        platform = endpoint.get("platform") or config.get("platform")
        async with db._api.acquire() as connection:
            async with connection.transaction():
                if credentials_changed:
                    await connection.execute(
                        "UPDATE api_services SET config = $2 WHERE uid = $1",
                        uid,
                        config,
                    )
                await connection.execute(
                    """
                    INSERT INTO api_endpoint_stats
                        (service_uid, endpoint_key, status, latency_ms, last_check, last_success,
                         last_request, error, most_recent_error, last_error_at, total, successful, latency_total, platform, http_status)
                    VALUES ($1, $2, $3, $4, $5::timestamptz, CASE WHEN $6 THEN $5::timestamptz END, $5::timestamptz, $7, $7,
                        CASE WHEN NOT $6 THEN $5::timestamptz END, 1, CASE WHEN $6 THEN 1 ELSE 0 END, $4, $8, $9)
                    ON CONFLICT (service_uid, endpoint_key) DO UPDATE SET
                        status = EXCLUDED.status, latency_ms = EXCLUDED.latency_ms,
                        platform = EXCLUDED.platform, http_status = EXCLUDED.http_status,
                        last_check = EXCLUDED.last_check, last_request = EXCLUDED.last_request,
                        last_success = COALESCE(EXCLUDED.last_success, api_endpoint_stats.last_success),
                        error = EXCLUDED.error,
                        most_recent_error = COALESCE(EXCLUDED.error, api_endpoint_stats.most_recent_error),
                        last_error_at = COALESCE(EXCLUDED.last_error_at, api_endpoint_stats.last_error_at),
                        total = api_endpoint_stats.total + 1,
                        successful = api_endpoint_stats.successful + EXCLUDED.successful,
                        latency_total = api_endpoint_stats.latency_total + EXCLUDED.latency_total
                """,
                    uid,
                    endpoint["key"],
                    status,
                    latency,
                    requested_at,
                    success,
                    error,
                    platform,
                    http_status,
                )
                await connection.execute(
                    """
                    INSERT INTO api_requests (service_uid, endpoint_key, requested_at, success, latency_ms, source, platform, status, error, http_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """,
                    uid,
                    endpoint["key"],
                    requested_at,
                    success,
                    latency,
                    source,
                    platform,
                    status,
                    error,
                    http_status,
                )
                if config["auth_type"] == "login" and (
                    endpoint["key"] == config["auth_check_endpoint"]
                    or status == "Expired"
                ):
                    await connection.execute(
                        """
                        UPDATE api_services SET auth_status = $2, auth_checked_at = $3, auth_error = $4
                        WHERE uid = $1
                    """,
                        uid,
                        status,
                        requested_at,
                        error,
                    )

    @classmethod
    async def overview(cls):
        services = await db.fetch("SELECT * FROM api_services ORDER BY uid") or []
        rows = await db.fetch("SELECT * FROM api_endpoint_stats") or []
        stats = {(row["service_uid"], row["endpoint_key"]): row for row in rows}
        pools = {}
        accounts = {}
        for service in services:
            config = service["config"]
            if (
                config.get("transport") == "python"
                and config["kind"] == "dtk"
            ):
                platform = config["platform"]
                if platform not in pools:
                    try:
                        from services.dtk.identity import identities

                        pools[platform] = await identities.status(platform)
                        accounts[platform] = await identities.accounts(platform)
                    except ImportError:
                        pools[platform] = {
                            "health": "Unavailable",
                            "error": "Guest identity dependencies are unavailable",
                        }
        result = []
        for service in services:
            config = dict(service["config"])
            config["has_api_key"] = bool(config.pop("api_key"))
            auth_status = service["auth_status"]
            if config["auth_type"] == "none":
                auth_status = "Not required"
            elif not config["has_api_key"]:
                auth_status = "Missing"
            elif config["credential_expires_at"] and datetime.fromisoformat(
                config["credential_expires_at"]
            ) <= datetime.now(timezone.utc):
                auth_status = "Expired"
            managed = config.get("transport") == "python" and config["kind"] == "dtk"
            platform_accounts = accounts.get(config.get("platform"), []) if managed else []
            usable_accounts = [account for account in platform_accounts if account["state"] in ("active", "degraded") and account["ready"]]
            if managed:
                auth_status = "Healthy" if usable_accounts else "Unavailable" if any(account["state"] in ("cooling", "degraded") for account in platform_accounts) else "Login Required"
            endpoints = []
            for endpoint in config["endpoints"]:
                state = stats.get((service["uid"], endpoint["key"]), {})
                total, successful = state.get("total", 0), state.get("successful", 0)
                endpoints.append(
                    {
                        **endpoint,
                        **state,
                        "requires_auth": endpoint["key"] == "posts" if managed else endpoint.get("requires_auth", False),
                        "status": (auth_status if managed and endpoint["key"] == "posts" and not usable_accounts else state.get("status", "Unknown"))
                        if config["enabled"] and endpoint["enabled"]
                        else "Disabled",
                        "total": total,
                        "successful": successful,
                        "failed": total - successful,
                        "success_rate": successful / total * 100 if total else None,
                        "average_latency_ms": state.get("latency_total", 0) / total
                        if total
                        else None,
                    }
                )
            active = [
                endpoint for endpoint in endpoints if endpoint["status"] != "Disabled"
                and (not managed or not endpoint["requires_auth"])
            ]
            status = "Disabled"
            if active:
                status = next(
                    value
                    for value in (
                        "Expired",
                        "Unavailable",
                        "Error",
                        "Unknown",
                        "Healthy",
                    )
                    if any(endpoint["status"] == value for endpoint in active)
                )
                if not managed and auth_status == "Expired":
                    status = "Expired"
                elif not managed and auth_status == "Missing":
                    status = "Error"
            guest_status = pools.get(config.get("platform"), {}).get("health", status) if managed else status
            if managed:
                auth_endpoints = [endpoint for endpoint in endpoints if endpoint["requires_auth"] and endpoint["enabled"]]
                if not config["enabled"]:
                    guest_status = "Disabled"
                elif not active:
                    guest_status = "Disabled"
                    status = auth_status if auth_endpoints else "Disabled"
                elif guest_status == "Unavailable":
                    status = "Partial" if usable_accounts and auth_endpoints else "Unavailable"
                elif auth_endpoints and (
                    auth_status != "Healthy"
                    or any(endpoint["status"] not in ("Healthy", "Unknown") for endpoint in auth_endpoints)
                ) and status in ("Healthy", "Unknown"):
                    status = "Partial"
            total = sum(endpoint["total"] for endpoint in endpoints)
            successful = sum(endpoint["successful"] for endpoint in endpoints)
            latest = max(
                endpoints,
                key=lambda item: (
                    item.get("last_request")
                    or datetime.min.replace(tzinfo=timezone.utc)
                ),
            )
            errors = [
                endpoint for endpoint in endpoints if endpoint.get("most_recent_error")
            ]
            latest_error = (
                max(errors, key=lambda item: item["last_error_at"]) if errors else None
            )
            result.append(
                {
                    **config,
                    "uid": service["uid"],
                    "adapter_key": service["adapter_key"],
                    "endpoints": endpoints,
                    "status": status,
                    "identity_pool": pools.get(config.get("platform"))
                    if config.get("transport") == "python"
                    and config["kind"] == "dtk"
                    else None,
                    "guest_status": guest_status,
                    "authenticated_status": auth_status if managed else None,
                    "accounts": platform_accounts,
                    "auth_status": auth_status,
                    "auth_checked_at": service["auth_checked_at"],
                    "auth_error": service["auth_error"],
                    "reauthenticated_at": service["reauthenticated_at"],
                    "last_check": max(
                        (
                            item["last_check"]
                            for item in endpoints
                            if item.get("last_check")
                        ),
                        default=None,
                    ),
                    "last_success": max(
                        (
                            item["last_success"]
                            for item in endpoints
                            if item.get("last_success")
                        ),
                        default=None,
                    ),
                    "last_request": latest.get("last_request"),
                    "latency_ms": latest.get("latency_ms"),
                    "most_recent_error": latest_error["most_recent_error"]
                    if latest_error
                    else None,
                    "total": total,
                    "successful": successful,
                    "failed": total - successful,
                    "success_rate": successful / total * 100 if total else None,
                    "average_latency_ms": sum(
                        endpoint.get("latency_total", 0) for endpoint in endpoints
                    )
                    / total
                    if total
                    else None,
                }
            )
        return result

    @staticmethod
    async def history(
        time_range: str,
        service_uid: int | None,
        source: str,
        platform: str | None = None,
        provider: str | None = None,
    ):
        hours, bucket_seconds = {"1h": (1, 300), "24h": (24, 3600), "7d": (168, 21600)}[
            time_range
        ]
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        rows = (
            await db.fetch(
                """
            SELECT FLOOR(EXTRACT(EPOCH FROM requested_at) / $1::int)::bigint AS bucket,
                COUNT(*)::int AS total, COUNT(*) FILTER (WHERE success)::int AS successful,
                COUNT(*) FILTER (WHERE NOT success)::int AS failed, AVG(latency_ms) AS average_latency_ms
            FROM api_requests request JOIN api_services service ON service.uid = request.service_uid
            WHERE requested_at >= $2 AND requested_at <= $3
                AND ($4::bigint IS NULL OR service_uid = $4)
                AND ($5 = 'all' OR source = $5)
                AND ($6::text IS NULL OR request.platform = $6)
                AND ($7::text IS NULL OR service.provider = $7)
            GROUP BY bucket ORDER BY bucket
        """,
                bucket_seconds,
                start,
                end,
                service_uid,
                source,
                platform,
                provider,
            )
            or []
        )
        by_bucket = {row["bucket"]: row for row in rows}
        return [
            {
                "time": datetime.fromtimestamp(bucket * bucket_seconds, timezone.utc),
                **by_bucket.get(
                    bucket,
                    {
                        "total": 0,
                        "successful": 0,
                        "failed": 0,
                        "average_latency_ms": None,
                    },
                ),
            }
            for bucket in range(
                int(start.timestamp() // bucket_seconds),
                int(end.timestamp() // bucket_seconds) + 1,
            )
        ]
