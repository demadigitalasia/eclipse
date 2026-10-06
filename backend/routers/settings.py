"""Settings API: manage Supadata keys and the download proxy from the UI.

All endpoints require the administrator key (``ADMIN_API_KEY``) to be
configured on the server; the panel is intentionally fail-closed so a public
deployment can never be reconfigured anonymously.
"""
import os
import re
import time
from typing import List, Optional, Union

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.config import logger
from backend.utils.admin_auth import configured_admin_key, require_admin_configured
from backend.utils.app_settings import (
    get_settings_proxy_url,
    get_settings_supadata_keys,
    parse_supadata_keys,
    update_settings,
)
from backend.utils.proxy import get_proxy_url, mask_proxy_url

router = APIRouter(tags=["Settings"])

_PROXY_SCHEME_RE = re.compile(r"^(https?|socks5h?)://", re.IGNORECASE)


class SettingsUpdateRequest(BaseModel):
    supadata_api_keys: Optional[Union[str, List[str]]] = None
    proxy_url: Optional[str] = None


class ProxyTestRequest(BaseModel):
    proxy_url: Optional[str] = None


def _mask_key(key: str) -> str:
    return f"{key[:7]}...{key[-4:]}" if len(key) >= 11 else "***"


def _build_status() -> dict:
    from backend.services.youtube_service import get_supadata_keys, get_supadata_usage_data

    keys = get_supadata_keys()
    settings_keys = get_settings_supadata_keys()
    env_keys_raw = (os.environ.get("SUPADATA_API_KEYS") or os.environ.get("SUPADATA_API_KEY") or "").strip()

    usage = None
    if keys:
        try:
            usage = get_supadata_usage_data(force=False)
        except Exception as exc:
            logger.warning(f"Failed to fetch Supadata usage for settings panel: {exc}")

    proxy = get_proxy_url()
    settings_proxy = get_settings_proxy_url()

    return {
        "admin_configured": bool(configured_admin_key()),
        "supadata": {
            "configured": bool(keys),
            "keys_count": len(keys),
            "masked_keys": [_mask_key(key) for key in keys],
            "source": "settings" if settings_keys else ("env" if env_keys_raw else "none"),
            "usage": usage,
        },
        "proxy": {
            "configured": bool(proxy),
            "masked_url": mask_proxy_url(proxy),
            "source": "settings" if settings_proxy else ("env" if proxy else "none"),
        },
    }


@router.get("/api/settings")
def get_settings_panel(authorized: bool = Depends(require_admin_configured)):
    """Returns the current integration status (secrets are masked)."""
    return _build_status()


@router.put("/api/settings")
def update_settings_panel(
    payload: SettingsUpdateRequest,
    authorized: bool = Depends(require_admin_configured),
):
    """Updates Supadata keys and/or the download proxy.

    Only fields explicitly present in the request body are modified. Sending an
    empty string (or empty list) clears the corresponding value.
    """
    values = {}

    if "supadata_api_keys" in payload.model_fields_set and payload.supadata_api_keys is not None:
        parsed_keys = parse_supadata_keys(payload.supadata_api_keys)
        has_input = bool(str(payload.supadata_api_keys).strip()) if isinstance(payload.supadata_api_keys, str) else bool(payload.supadata_api_keys)
        if has_input and (not parsed_keys or any(not key.startswith("sd_") for key in parsed_keys)):
            raise HTTPException(status_code=422, detail="Supadata keys must use the sd_ prefix.")
        values["supadata_api_keys"] = parsed_keys

    if "proxy_url" in payload.model_fields_set and payload.proxy_url is not None:
        proxy = payload.proxy_url.strip()
        if proxy and not _PROXY_SCHEME_RE.match(proxy):
            raise HTTPException(
                status_code=422,
                detail="Proxy URL must start with http://, https://, socks5:// or socks5h://",
            )
        values["proxy_url"] = proxy

    if values:
        try:
            update_settings(values)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to persist settings: {exc}")

    return {"success": True, **_build_status()}


@router.post("/api/settings/test-proxy")
def test_proxy(
    payload: Optional[ProxyTestRequest] = None,
    authorized: bool = Depends(require_admin_configured),
):
    """Checks a proxy URL (or the saved one) by fetching the egress IP."""
    proxy = (payload.proxy_url.strip() if payload and payload.proxy_url else "") or (get_proxy_url() or "")
    if not proxy:
        raise HTTPException(status_code=400, detail="No proxy configured to test.")

    proxies = {"http": proxy, "https": proxy}
    started = time.time()
    try:
        response = requests.get("https://api.ipify.org?format=json", proxies=proxies, timeout=20)
        latency_ms = int((time.time() - started) * 1000)
        if response.status_code == 200:
            egress_ip = response.json().get("ip")
            logger.info(f"Proxy test succeeded via {mask_proxy_url(proxy)} (egress {egress_ip})")
            return {
                "success": True,
                "ok": True,
                "egress_ip": egress_ip,
                "latency_ms": latency_ms,
                "proxy": mask_proxy_url(proxy),
            }
        return {
            "success": False,
            "ok": False,
            "error": f"Proxy responded with HTTP {response.status_code}",
            "latency_ms": latency_ms,
        }
    except Exception as exc:
        latency_ms = int((time.time() - started) * 1000)
        error_text = str(exc).replace(proxy, mask_proxy_url(proxy))
        return {"success": False, "ok": False, "error": error_text, "latency_ms": latency_ms}
