"""Runtime-editable application settings persisted to the ECLIPSE data dir.

Values configured from the web Settings panel (``settings.json`` inside
``ECLIPSE_DATA_DIR``) take precedence over environment variables so operators
can rotate Supadata keys or switch proxies without redeploying the container.
"""
import json
import os
import re
from typing import Any, Dict, List, Optional

from backend.config import logger

try:
    from backend.video_engine import DATA_DIR
except ImportError:  # Running from inside the backend/ directory directly
    from video_engine import DATA_DIR

SETTINGS_PATH = DATA_DIR / "settings.json"

_ALLOWED_KEYS = ("supadata_api_keys", "proxy_url")
_SUPADATA_KEY_RE = re.compile(r"sd_[a-zA-Z0-9]+")


def _read() -> Dict[str, Any]:
    try:
        if SETTINGS_PATH.exists():
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {k: v for k, v in data.items() if k in _ALLOWED_KEYS and v}
    except Exception as exc:
        logger.warning(f"Failed to read settings file {SETTINGS_PATH}: {exc}")
    return {}


def update_settings(values: Dict[str, Any]) -> Dict[str, Any]:
    """Merges ``values`` into the settings file; empty values remove a key."""
    data = _read()
    for key, value in values.items():
        if key not in _ALLOWED_KEYS:
            continue
        if value in (None, "", [], {}):
            data.pop(key, None)
        else:
            data[key] = value

    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = SETTINGS_PATH.with_name(SETTINGS_PATH.name + ".tmp")
    tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp_path, SETTINGS_PATH)
    try:
        SETTINGS_PATH.chmod(0o600)
    except OSError:
        # The container filesystem may not support chmod; keep settings usable.
        pass
    return data


def parse_supadata_keys(raw: Any) -> List[str]:
    """Extracts unique Supadata keys (``sd_*``) from a string or list input."""
    if isinstance(raw, (list, tuple)):
        candidates = [str(item) for item in raw]
    else:
        candidates = [part for part in re.split(r"[,\s]+", str(raw or ""))]

    keys: List[str] = []
    for candidate in candidates:
        for match in _SUPADATA_KEY_RE.findall(candidate):
            if match not in keys:
                keys.append(match)

    if not keys:
        for candidate in candidates:
            cleaned = candidate.strip().strip("\"'")
            if cleaned and cleaned not in keys:
                keys.append(cleaned)
    return keys


def get_settings_supadata_keys() -> List[str]:
    raw = _read().get("supadata_api_keys")
    return parse_supadata_keys(raw) if raw else []


def get_settings_proxy_url() -> Optional[str]:
    proxy = str(_read().get("proxy_url") or "").strip()
    return proxy or None


def get_settings_snapshot() -> Dict[str, Any]:
    data = _read()
    return {
        "supadata_api_keys": parse_supadata_keys(data.get("supadata_api_keys")) if data.get("supadata_api_keys") else [],
        "proxy_url": str(data.get("proxy_url") or "").strip(),
        "path": str(SETTINGS_PATH),
    }
