"""Server-side secret encryption for provider credentials."""
import os

from cryptography.fernet import Fernet

from backend.config import SETTINGS


def _fernet() -> Fernet:
    env_key = os.environ.get("ECLIPSE_MASTER_KEY", "").strip()
    if env_key:
        return Fernet(env_key.encode())
    os.makedirs(SETTINGS.data_dir, exist_ok=True)
    path = os.path.join(SETTINGS.data_dir, ".eclipse-master-key")
    try:
        with open(path, "rb") as handle:
            key = handle.read().strip()
    except FileNotFoundError:
        key = Fernet.generate_key()
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(key)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return Fernet(key)


def encrypt_secret(value: str) -> bytes:
    return _fernet().encrypt(value.encode())


def decrypt_secret(value: bytes | str) -> str:
    token = value.encode() if isinstance(value, str) else value
    return _fernet().decrypt(token).decode()
