"""Convert transport inputs to DTK's native signer contracts."""

from . import upstream
from dtk.signing.base import RequestSpec, SigningSession, StaticFingerprint
from dtk.signing.native.signer import NativeSigner


async def sign(spec: dict, identity):
    return await NativeSigner(identity.platform).sign(
        RequestSpec.of(spec),
        StaticFingerprint.of(identity.fingerprint),
        SigningSession(
            cookies=identity.cookies,
            identity_id=identity.id,
            proxy_url=identity.proxy_url,
        ),
    )
