"""Independent guest and authenticated PostgreSQL identity pools."""

import asyncio
import json
import os
import random
import secrets
import tempfile
import uuid
from contextlib import suppress
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from .upstream import health, policies
from .browser import Browser
from dtk.core.crypto import Cipher
from cryptography.exceptions import InvalidTag
from dtk.core.types import BrowserFamily, Outcome, Platform
from dtk.transport.base import Fingerprint, TransportIdentity
from base.database import DatabaseBase as db
from base.logger import LoggerBase as lg
from models import CACHE_PATH
from services.base import ProviderError
from .config import load_settings, proxy_for


class IdentityKeyMissing(RuntimeError):
    def __init__(self):
        super().__init__(
            "Identity encryption key is missing. Restore cache/dtk-identity.key, "
            "the saved identity settings, or MEDIAHARBOR_DTK_SECRET_KEY before using existing identities."
        )


class IdentityCipher:
    def __init__(self, secrets):
        self.secrets = secrets
        self.ciphers = [Cipher(secret) for secret in secrets]

    def encrypt(self, plaintext, *, aad=""):
        return self.ciphers[0].encrypt(plaintext, aad=aad)

    def decrypt(self, payload, *, aad=""):
        for cipher in self.ciphers:
            try:
                return cipher.decrypt(payload, aad=aad)
            except InvalidTag:
                continue
        raise InvalidTag("No saved key can decrypt this identity")


class IdentityManager:
    def __init__(self):
        self.task = None
        self.browser = Browser()
        self.error = None
        self._start_lock = asyncio.Lock()

    async def start(self):
        async with self._start_lock:
            if self.task is not None and not self.task.done():
                return
            self.task = asyncio.create_task(self._maintain(), name="dtk-identities")

    async def close(self):
        if self.task is not None:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
            self.task = None
        from .login import logins

        await logins.close()
        await self.browser.close()

    async def _cipher(self, database=db):
        saved_keys = load_settings().secret_keys
        if saved_keys:
            return IdentityCipher(saved_keys)
        secret = os.environ.get("MEDIAHARBOR_DTK_SECRET_KEY")
        path = CACHE_PATH / "dtk-identity.key"
        if not secret:
            if not path.exists():
                if (
                    await database.fetchval(
                        "SELECT EXISTS(SELECT 1 FROM dtk_identities WHERE state != 'retired')"
                    )
                    and not path.exists()
                ):
                    raise IdentityKeyMissing()
                # Publish a complete, private file atomically. All workers sharing
                # this cache see one key, never a partially written secret.
                fd, temporary = tempfile.mkstemp(dir=CACHE_PATH, prefix=".dtk-key-")
                try:
                    with os.fdopen(fd, "w") as stream:
                        stream.write(secrets.token_urlsafe(48))
                        stream.flush()
                        os.fsync(stream.fileno())
                    try:
                        os.link(temporary, path)
                    except FileExistsError:
                        pass
                finally:
                    os.unlink(temporary)
            secret = path.read_text().strip()
        return IdentityCipher([secret])

    @staticmethod
    def marks(platform: str) -> tuple[int, int]:
        settings = getattr(load_settings(), platform)
        return settings.minimum_size, settings.target_size

    @staticmethod
    async def _recover(connection, platform: str):
        await connection.execute(
            """
            UPDATE dtk_identities SET state = 'login_required', last_error = 'SESSION_EXPIRED',
                lease_token = NULL, lease_until = NULL
            WHERE platform = $1 AND authenticated AND state NOT IN ('retired', 'login_required')
                AND expires_at <= NOW()
            """,
            platform,
        )
        await connection.execute(
            """
            UPDATE dtk_identities SET state = 'active', cooldown_until = NULL
            WHERE platform = $1 AND state IN ('cooling', 'degraded')
                AND (cooldown_until IS NULL OR cooldown_until <= NOW())
        """,
            platform,
        )

    async def acquire(self, platform: str, endpoint: str, *, authenticated=False, exclude=()):
        await self.start()
        cipher = await self._cipher()
        policy = policies.policy_for(endpoint)
        deadline = asyncio.get_running_loop().time() + 10
        seed = random.getrandbits(32)
        while True:
            async with db._api.acquire() as connection:
                await self._recover(connection, platform)
                rows = await connection.fetch(
                    """
                    SELECT i.*, COALESCE(h.total_15m, 0) AS total_15m,
                        COALESCE(h.ok_15m, 0) AS ok_15m,
                        COALESCE(h.total_60m, 0) AS total_60m,
                        COALESCE(h.risk_60m, 0) AS risk_60m
                    FROM dtk_identities i
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes') AS total_15m,
                            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes' AND outcome = 'ok') AS ok_15m,
                            COUNT(*) AS total_60m,
                            COUNT(*) FILTER (WHERE outcome = 'risk_control') AS risk_60m
                        FROM dtk_identity_outcomes
                        WHERE identity_uid = i.uid AND created_at > NOW() - INTERVAL '60 minutes'
                    ) h ON TRUE
                    WHERE i.platform = $1 AND i.authenticated = $2
                        AND NOT (i.uid = ANY($3::uuid[]))
                        AND i.state IN ('active', 'degraded')
                        AND (i.cooldown_until IS NULL OR i.cooldown_until <= NOW())
                        AND (i.lease_until IS NULL OR i.lease_until <= NOW())
                """,
                    platform,
                    authenticated,
                    [uuid.UUID(value) for value in exclude],
                )
                if authenticated and not rows:
                    raise ProviderError("Login Required", "LOGIN_REQUIRED")

                def rank(row):
                    score = health.score(
                        health.HealthInput(
                            row["total_15m"],
                            row["ok_15m"],
                            row["total_60m"],
                            row["risk_60m"],
                            row["consecutive_fails"],
                        )
                    )
                    used = row["last_used_at"].timestamp() if row["last_used_at"] else 0
                    return (
                        row["state"] != "active",
                        -health.bucket(score),
                        int(used / 0.5),
                        hash((row["uid"], seed)) & 0xFFFF,
                    )

                for candidate in sorted(rows, key=rank):
                    async with connection.transaction():
                        row = await connection.fetchrow(
                            """
                            SELECT *, EXTRACT(EPOCH FROM clock_timestamp()) AS clock
                            FROM dtk_identities WHERE uid = $1 AND state IN ('active', 'degraded')
                                AND authenticated = $2
                                AND (cooldown_until IS NULL OR cooldown_until <= NOW())
                                AND (expires_at IS NULL OR expires_at > NOW())
                                AND (lease_until IS NULL OR lease_until <= NOW())
                            FOR UPDATE SKIP LOCKED
                        """,
                            candidate["uid"],
                            authenticated,
                        )
                        if row is None:
                            continue
                        now = float(row["clock"])
                        budgets = row["budgets"]
                        budget = budgets.get(
                            endpoint, {"tokens": policy.capacity, "at": now}
                        )
                        tokens = min(
                            policy.capacity,
                            budget["tokens"]
                            + max(0, now - budget["at"]) * policy.refill_per_sec,
                        )
                        if tokens < 1:
                            continue
                        fingerprint = dict(row["fingerprint"])
                        fingerprint["browser_family"] = BrowserFamily(
                            fingerprint["browser_family"]
                        )
                        identity = TransportIdentity(
                            id=str(row["uid"]),
                            platform=Platform(platform),
                            fingerprint=Fingerprint(**fingerprint),
                            cookies=json.loads(
                                cipher.decrypt(row["cookies"], aad=str(row["uid"]))
                            ),
                            proxy_url=cipher.decrypt(
                                row["proxy"], aad=str(row["uid"]) + ":proxy"
                            )
                            if row["proxy"]
                            else None,
                        )
                        # A single half-open probe per endpoint across all workers.
                        await connection.execute(
                            """
                            INSERT INTO dtk_endpoint_circuits (endpoint) VALUES ($1) ON CONFLICT DO NOTHING
                        """,
                            endpoint,
                        )
                        circuit = await connection.fetchrow(
                            """
                            SELECT *, NOW() AS clock FROM dtk_endpoint_circuits
                            WHERE endpoint = $1 FOR UPDATE
                        """,
                            endpoint,
                        )
                        if (
                            circuit["open_until"]
                            and circuit["open_until"] > circuit["clock"]
                        ):
                            if (
                                circuit["probe_after"]
                                and circuit["probe_after"] > circuit["clock"]
                            ):
                                raise ProviderError(
                                    "Unavailable",
                                    "Endpoint circuit is cooling down",
                                )
                            await connection.execute(
                                """
                                UPDATE dtk_endpoint_circuits SET probe_after = NOW() + INTERVAL '60 seconds'
                                WHERE endpoint = $1
                            """,
                                endpoint,
                            )
                        token = uuid.uuid4()
                        budgets[endpoint] = {"tokens": tokens - 1, "at": now}
                        await connection.execute(
                            """
                            UPDATE dtk_identities SET lease_token = $2,
                                lease_until = NOW() + INTERVAL '150 seconds',
                                last_used_at = NOW(), budgets = $3 WHERE uid = $1
                        """,
                            row["uid"],
                            token,
                            budgets,
                        )
                        return identity, token
            if asyncio.get_running_loop().time() >= deadline:
                raise ProviderError(
                    "Login Required" if authenticated else "Unavailable",
                    "LOGIN_REQUIRED" if authenticated else "Guest identity pool is empty, cooling down, busy or exhausted",
                )
            await asyncio.sleep(0.25)

    async def finish(self, identity, token, endpoint: str, outcome, error: str | None):
        """Fence stale owners, persist rotated cookies and fold upstream outcomes."""
        cipher = await self._cipher()
        uid = uuid.UUID(identity.id)
        async with db._api.acquire() as connection:
            async with connection.transaction():
                row = await connection.fetchrow(
                    """
                    SELECT *, clock_timestamp() AS clock FROM dtk_identities WHERE uid = $1 AND lease_token = $2
                    FOR UPDATE
                """,
                    uid,
                    token,
                )
                if row is None:
                    return
                streak, state, cooldown = (
                    row["consecutive_fails"],
                    row["state"],
                    row["cooldown_until"],
                )
                auth_failures = row["auth_failures"]
                if outcome is Outcome.OK:
                    streak = 0
                    auth_failures = 0
                    state, cooldown = "active", None
                elif outcome in (Outcome.NETWORK_ERROR, Outcome.RISK_CONTROL):
                    streak += 1
                    if outcome is Outcome.RISK_CONTROL:
                        seconds = health.cooldown_seconds(
                            streak,
                            base=60,
                            maximum=21600,
                            risk_weight=policies.policy_for(endpoint).risk_weight,
                        )
                        cooldown = row["clock"] + timedelta(seconds=seconds)
                        state = "degraded" if seconds >= 21600 else "cooling"
                if row["authenticated"] and error == "LOGIN_REQUIRED":
                    auth_failures += 1
                    state = "login_required" if auth_failures >= 3 else "cooling"
                    cooldown = row["clock"] + timedelta(minutes=2)
                elif error == "BodyEmpty" or outcome is Outcome.NETWORK_ERROR:
                    state = "cooling"
                    cooldown = row["clock"] + timedelta(seconds=min(300, 5 * 2 ** min(streak, 6)))
                budgets = row["budgets"]
                if outcome in (None, Outcome.NETWORK_ERROR):
                    policy = policies.policy_for(endpoint)
                    budget = budgets[endpoint]
                    now = row["clock"].timestamp()
                    budget["tokens"] = min(
                        policy.capacity,
                        budget["tokens"]
                        + max(0, now - budget["at"]) * policy.refill_per_sec
                        + 1,
                    )
                    budget["at"] = now
                await connection.execute(
                    """
                    UPDATE dtk_identities SET cookies = $3, consecutive_fails = $4,
                        state = $5, cooldown_until = $6, lease_token = NULL, lease_until = NULL,
                        total_requests = total_requests + CASE WHEN $7::text IS NULL THEN 0 ELSE 1 END,
                        successful_requests = successful_requests + CASE WHEN $7 = 'ok' THEN 1 ELSE 0 END,
                        last_success_at = CASE WHEN $7 = 'ok' THEN NOW() ELSE last_success_at END,
                        last_error = CASE WHEN $7 = 'ok' THEN NULL ELSE COALESCE($8, last_error) END,
                        budgets = $9, auth_failures = $10,
                        validated_at = CASE WHEN $7 = 'ok' AND authenticated THEN NOW() ELSE validated_at END
                    WHERE uid = $1 AND lease_token = $2
                """,
                    uid,
                    token,
                    cipher.encrypt(json.dumps(dict(identity.cookies)), aad=identity.id),
                    streak,
                    state,
                    cooldown,
                    outcome.value if outcome else None,
                    error,
                    budgets,
                    auth_failures,
                )
                if outcome is not None:
                    await connection.execute(
                        """
                        INSERT INTO dtk_identity_outcomes (identity_uid, endpoint, outcome) VALUES ($1, $2, $3)
                    """,
                        uid,
                        endpoint,
                        outcome.value,
                    )
                    await self._circuit_outcome(connection, endpoint, outcome)

    @staticmethod
    async def _circuit_outcome(connection, endpoint, outcome):
        await connection.fetchrow(
            "SELECT endpoint FROM dtk_endpoint_circuits WHERE endpoint = $1 FOR UPDATE",
            endpoint,
        )
        if outcome is Outcome.OK:
            await connection.execute(
                """
                UPDATE dtk_endpoint_circuits SET open_until = NULL, probe_after = NULL WHERE endpoint = $1
            """,
                endpoint,
            )
        elif outcome is Outcome.RISK_CONTROL:
            await connection.execute(
                """
                UPDATE dtk_endpoint_circuits SET open_until = NOW() + INTERVAL '300 seconds',
                    probe_after = NOW() + INTERVAL '60 seconds'
                WHERE endpoint = $1 AND (
                    SELECT COUNT(*) >= 20
                        AND COUNT(*) FILTER (WHERE outcome = 'risk_control')::float / NULLIF(COUNT(*), 0) >= 0.6
                        AND COUNT(DISTINCT identity_uid) FILTER (WHERE outcome = 'risk_control') >= 3
                    FROM dtk_identity_outcomes
                    WHERE endpoint = $1 AND created_at > NOW() - INTERVAL '300 seconds'
                )
            """,
                endpoint,
            )

    async def retire(self, uid: uuid.UUID, reason: str):
        """Explicit retirement wipes credentials; failures alone remain recoverable."""
        await db.execute(
            """
            UPDATE dtk_identities SET state = 'retired', cookies = ''::bytea,
                proxy = NULL, browser_state = NULL, retired_at = NOW(), last_error = $2,
                lease_token = NULL, lease_until = NULL
            WHERE uid = $1
        """,
            uid,
            reason,
        )

    async def save_authenticated(self, identity, browser_state, account, *, connection=None):
        database = connection or db
        cipher = await self._cipher(database)
        expiry = [
            cookie["expires"] for cookie in browser_state["cookies"]
            if cookie["name"] in ("sessionid", "sessionid_ss", "sid_tt")
            and cookie["domain"].lstrip(".") in (identity.platform.value + ".com", "www." + identity.platform.value + ".com")
            and cookie.get("expires", -1) > 0
        ]
        await database.execute(
            """
            INSERT INTO dtk_identities
                (uid, platform, authenticated, cookies, browser_state, fingerprint, proxy,
                 account_id, account_name, expires_at, validated_at)
            VALUES ($1, $2, TRUE, $3, $4, $5, $6, $7, $8, $9, NOW())
            """,
            uuid.UUID(identity.id), identity.platform.value,
            cipher.encrypt(json.dumps(dict(identity.cookies)), aad=identity.id),
            cipher.encrypt(json.dumps(browser_state), aad=identity.id + ":browser"),
            asdict(identity.fingerprint),
            cipher.encrypt(identity.proxy_url, aad=identity.id + ":proxy") if identity.proxy_url else None,
            account["id"], account["name"],
            datetime.fromtimestamp(min(expiry), timezone.utc) if expiry else None,
        )

    async def mark_validated(self, uid, token):
        await db.execute(
            "UPDATE dtk_identities SET validated_at = NOW(), auth_failures = 0 WHERE uid = $1 AND lease_token = $2",
            uuid.UUID(uid), token,
        )

    async def needs_validation(self, uid):
        return await db.fetchval(
            "SELECT validated_at IS NULL OR validated_at < NOW() - INTERVAL '6 hours' FROM dtk_identities WHERE uid = $1",
            uuid.UUID(uid),
        )

    async def import_authenticated(self, platform, session):
        from .client import DtkClient

        cookies = [cookie.model_dump() for cookie in session.cookies]
        host = "www.douyin.com" if platform == "douyin" else "www.tiktok.com"
        now = datetime.now(timezone.utc).timestamp()
        scoped = [cookie for cookie in cookies if (
            host == cookie["domain"].lstrip(".") or (
                cookie["domain"].startswith(".") and host.endswith(cookie["domain"])
            )
        ) and cookie["path"] == "/" and (cookie["expires"] <= 0 or cookie["expires"] > now)]
        if not any(cookie["name"] in ("sessionid", "sessionid_ss", "sid_tt") for cookie in scoped):
            raise ValueError("Include unexpired session cookies for the selected platform")
        client = DtkClient(platform, "", {
            "user_agent": session.user_agent, "browser_platform": session.browser_platform,
            "screen": session.screen, "language": session.language, "timezone": session.timezone,
        })
        from dataclasses import replace

        identity = replace(
            client.identity, id=str(uuid.uuid4()), cookies={cookie["name"]: cookie["value"] for cookie in scoped},
            fingerprint=replace(client.identity.fingerprint, hardware_concurrency=session.hardware_concurrency, device_memory=session.device_memory),
            proxy_url=proxy_for(platform),
        )
        try:
            async with asyncio.timeout(30):
                account = await client.validate_login(identity)
            await self.save_authenticated(client.identity, {"cookies": cookies, "origins": session.origins, "source": "browser_import"}, account)
            return {"uid": identity.id}
        finally:
            await client.close()

    async def accounts(self, platform):
        async with db._api.acquire() as connection:
            await self._recover(connection, platform)
            rows = await connection.fetch(
                """
                SELECT uid, account_id, account_name, state, total_requests, successful_requests,
                    last_success_at, last_error, expires_at, validated_at, cooldown_until,
                    consecutive_fails, auth_failures, proxy IS NOT NULL AS proxy_bound,
                    (lease_until IS NULL OR lease_until <= NOW()) AS idle,
                    (cooldown_until IS NULL OR cooldown_until <= NOW()) AS ready,
                    (SELECT COUNT(*) >= 10 AND COUNT(*) FILTER (WHERE outcome = 'ok')::float
                        / NULLIF(COUNT(*), 0) < 0.3 FROM dtk_identity_outcomes
                        WHERE identity_uid = i.uid AND created_at > NOW() - INTERVAL '60 minutes') AS declining
                FROM dtk_identities i
                WHERE platform = $1 AND authenticated AND state != 'retired'
                ORDER BY minted_at
                """,
                platform,
            )
        accounts = []
        for row in rows:
            account = dict(row)
            account["health"] = (
                "Login Required" if row["state"] == "login_required"
                else "Unavailable" if row["state"] == "cooling" or not row["ready"]
                else "Degraded" if row["consecutive_fails"] or row["declining"]
                else "Healthy"
            )
            account["available"] = row["state"] in ("active", "degraded") and row["ready"] and row["idle"]
            account["reauthentication_recommended"] = row["state"] == "login_required" or (
                row["declining"] and row["auth_failures"] >= 2
            )
            account["success_rate"] = (
                row["successful_requests"] / row["total_requests"] * 100 if row["total_requests"] else None
            )
            accounts.append(account)
        return accounts

    async def _maintain(self):
        while True:
            try:
                await self._tick()
                self.error = None
            except Exception as exc:
                self.error = f"Identity maintenance unavailable ({type(exc).__name__})"
                lg.error(self.error)
            await asyncio.sleep(15)

    async def _tick(self):
        from .login import logins

        await logins.cleanup()
        # A session advisory lock spans the browser await, with no open SQL
        # transaction. PostgreSQL drops it on worker death. The persisted next
        # attempt prevents replicas from multiplying the mint rate.
        async with db._api.acquire() as connection:
            if not await connection.fetchval("SELECT pg_try_advisory_lock(72481, 1)"):
                return
            try:
                await self._tick_locked(connection)
            finally:
                await connection.execute("SELECT pg_advisory_unlock(72481, 1)")

    async def _tick_locked(self, connection):
        await connection.execute(
            "DELETE FROM dtk_identity_outcomes WHERE created_at < NOW() - INTERVAL '60 minutes'"
        )
        await connection.execute(
            "DELETE FROM dtk_identities WHERE state = 'retired' AND retired_at < NOW() - INTERVAL '30 days'"
        )
        targets = []
        enabled = await connection.fetch("""
            SELECT DISTINCT platform FROM api_services WHERE provider = 'dtk' AND transport = 'python'
                AND (config->>'enabled')::boolean
        """)
        enabled = {row["platform"] for row in enabled}
        for platform in ("douyin", "tiktok"):
            minimum, target = self.marks(platform)
            await self._recover(connection, platform)
            counts = await connection.fetchrow(
                """
                SELECT COUNT(*) FILTER (WHERE state IN ('active', 'cooling')) AS live,
                    COUNT(*) FILTER (WHERE state IN ('active', 'cooling') AND consecutive_fails < 3) AS usable
                FROM dtk_identities WHERE platform = $1 AND NOT authenticated
            """,
                platform,
            )
            # Follow PoolFiller: all live identities failing is an incident,
            # not a shortage; cooling identities still count toward capacity.
            usable = counts["usable"] or counts["live"]
            row = await connection.fetchrow(
                """
                UPDATE dtk_pool_status SET minimum_size = $2, target_size = $3,
                    maintenance_at = NOW(), filling = CASE
                        WHEN NOT $5 OR $3 = 0 OR $4 >= $3 THEN FALSE
                        WHEN $4 < $2 THEN TRUE ELSE filling END
                WHERE platform = $1 RETURNING *
            """,
                platform,
                minimum,
                target,
                usable,
                platform in enabled,
            )
            if row["filling"]:
                targets.append(
                    (
                        usable,
                        row["last_success_at"]
                        or datetime.min.replace(tzinfo=timezone.utc),
                        platform,
                    )
                )
        if not targets:
            return
        route = await connection.fetchrow("""
            UPDATE dtk_pool_status SET next_attempt_at = NOW() + INTERVAL '60 seconds',
                minting_until = NOW() + INTERVAL '300 seconds'
            WHERE platform = 'browser' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
                AND (minting_until IS NULL OR minting_until <= NOW())
            RETURNING failures
        """)
        if route is None:
            return
        platform = min(targets)[2]
        await connection.execute(
            "UPDATE dtk_pool_status SET minting_until = NOW() + INTERVAL '240 seconds' WHERE platform = $1",
            platform,
        )
        try:
            cipher = await self._cipher()
            proxy = proxy_for(platform)
            async with asyncio.timeout(240):
                minted = await self.browser.mint(platform, proxy)
            profile = minted.profile
            fingerprint = Fingerprint(
                browser_family=BrowserFamily(profile.browser_family),
                browser_major=profile.browser_major,
                user_agent=profile.user_agent,
                platform=profile.navigator_platform,
                screen=profile.screen,
                language=profile.language,
                timezone=profile.timezone,
                hardware_concurrency=profile.hardware_concurrency,
                device_memory=profile.device_memory,
            )
            if (
                not profile.cookies
                or not fingerprint.emulatable
                or not fingerprint.user_agent
            ):
                raise ValueError("Browser returned an unusable identity")
            uid = uuid.uuid4()
            async with connection.transaction():
                await connection.execute(
                    """
                    INSERT INTO dtk_identities (uid, platform, cookies, fingerprint, proxy, network)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """,
                    uid,
                    platform,
                    cipher.encrypt(json.dumps(dict(profile.cookies)), aad=str(uid)),
                    asdict(fingerprint),
                    cipher.encrypt(proxy, aad=str(uid) + ":proxy") if proxy else None,
                    {
                        "exit_ip": minted.exit_ip,
                        "country": minted.geo.country,
                        "timezone": minted.geo.timezone,
                    },
                )
                await connection.execute(
                    """
                    UPDATE dtk_pool_status SET last_success_at = NOW(), failures = 0,
                        last_error = NULL, minting_until = NULL WHERE platform = $1
                """,
                    platform,
                )
                await connection.execute(
                    "UPDATE dtk_pool_status SET failures = 0, minting_until = NULL, last_error = NULL WHERE platform = 'browser'"
                )
        except asyncio.CancelledError:
            await connection.execute(
                "UPDATE dtk_pool_status SET minting_until = NULL WHERE platform IN ($1, 'browser')",
                platform,
            )
            raise
        except Exception as exc:
            # Only expose our fixed missing-key message; browser errors may
            # contain cookies, signed URLs or proxy credentials.
            error = str(exc) if isinstance(exc, IdentityKeyMissing) else f"Guest generation failed ({type(exc).__name__})"
            delay = min(3600, 60 * 2 ** min(route["failures"], 6))
            async with connection.transaction():
                row = await connection.fetchrow(
                    "SELECT recent_errors FROM dtk_pool_status WHERE platform = $1 FOR UPDATE",
                    platform,
                )
                errors = (
                    row["recent_errors"]
                    + [{"at": datetime.now(timezone.utc).isoformat(), "message": error}]
                )[-5:]
                await connection.execute(
                    """
                    UPDATE dtk_pool_status SET failures = failures + 1, last_error = $2,
                        last_error_at = NOW(), recent_errors = $3, minting_until = NULL WHERE platform = $1
                """,
                    platform,
                    error,
                    errors,
                )
                await connection.execute(
                    """
                    UPDATE dtk_pool_status SET failures = failures + 1, minting_until = NULL,
                        next_attempt_at = NOW() + $1 * INTERVAL '1 second',
                        last_error = $2, last_error_at = NOW() WHERE platform = 'browser'
                """,
                    delay,
                    error,
                )
            lg.error("DTK %s: %s", platform, error)

    async def status(self, platform: str):
        row = await db.fetchrow(
            """
            SELECT p.*, b.next_attempt_at AS next_generation_at, b.failures AS browser_failures, b.last_error AS browser_error,
                NOW() AS clock, counts.*
            FROM dtk_pool_status p CROSS JOIN dtk_pool_status b
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE state = 'active') AS active,
                    COUNT(*) FILTER (WHERE state = 'active' AND (lease_until IS NULL OR lease_until <= NOW())) AS available,
                    COUNT(*) FILTER (WHERE state = 'cooling') AS cooling,
                    COUNT(*) FILTER (WHERE state = 'degraded' AND (cooldown_until IS NULL OR cooldown_until <= NOW()) AND (lease_until IS NULL OR lease_until <= NOW())) AS fallback,
                    COUNT(*) FILTER (WHERE state IN ('degraded', 'retired')) AS unusable
                FROM dtk_identities WHERE platform = p.platform AND NOT authenticated
            ) counts ON TRUE
            WHERE p.platform = $1 AND b.platform = 'browser'
        """,
            platform,
        )
        if row is None:
            return {
                "health": "Unavailable",
                "error": "Identity pool has not been initialized",
            }
        running = (
            row["maintenance_at"]
            and (row["clock"] - row["maintenance_at"]).total_seconds() < 300
        )
        health_state = (
            "Healthy"
            if row["available"] >= row["minimum_size"] and row["available"] > 0
            else "Degraded"
            if row["available"] or row["fallback"]
            else "Unavailable"
        )
        minting = row["minting_until"] and row["minting_until"] > row["clock"]
        backoff = (
            row["browser_failures"]
            and row["next_generation_at"]
            and row["next_generation_at"] > row["clock"]
        )
        return {
            "health": health_state,
            "total": row["total"],
            "active": row["active"],
            "available": row["available"],
            "cooling": row["cooling"],
            "unusable": row["unusable"],
            "minimum_size": row["minimum_size"],
            "target_size": row["target_size"],
            "replenishment": "Unavailable"
            if not running or self.error
            else "Disabled"
            if row["target_size"] == 0
            else "Minting"
            if minting
            else "Backing off"
            if backoff and row["filling"]
            else "Pending"
            if row["filling"]
            else "Satisfied",
            "last_success_at": row["last_success_at"],
            "recent_errors": row["recent_errors"],
            "next_attempt_at": row["next_generation_at"],
            "error": self.error
            or (row["browser_error"] if backoff and row["filling"] else None),
        }


identities = IdentityManager()
