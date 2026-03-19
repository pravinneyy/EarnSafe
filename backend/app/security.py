import base64
import binascii
import hashlib
import hmac
import secrets

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SALT_BYTES = 16
_DKLEN = 64
_ALGORITHM = "scrypt"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_DKLEN,
    )
    salt_b64 = base64.b64encode(salt).decode("ascii")
    digest_b64 = base64.b64encode(digest).decode("ascii")
    return f"{_ALGORITHM}${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt_b64}${digest_b64}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, n_value, r_value, p_value, salt_b64, digest_b64 = encoded_hash.split("$", 5)
        if algorithm != _ALGORITHM:
            return False

        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected_digest = base64.b64decode(digest_b64.encode("ascii"))
        actual_digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n_value),
            r=int(r_value),
            p=int(p_value),
            dklen=len(expected_digest),
        )
        return hmac.compare_digest(actual_digest, expected_digest)
    except (ValueError, TypeError, binascii.Error):
        return False
