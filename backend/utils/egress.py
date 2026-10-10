"""Egress identity helpers.

YouTube binds authentication cookies to the public IP they were issued for. On
datacenter deployments the backend must reach YouTube through a single stable
egress (the configured proxy) *and* the operator must export cookies from that
same egress. These helpers resolve the public IP YouTube actually sees so the
cookies manager can verify the two match.
"""
import time
from typing import Optional

import httpx

from backend.config import logger

_EGRESS_CACHE = {"proxy": None, "ip": None, "timestamp": 0.0}
_EGRESS_TTL = 60.0

_IP_ECHO_ENDPOINTS = (
    "https://api.ipify.org?format=json",
    "https://api64.ipify.org?format=json",
    "https://ifconfig.me/all.json",
)


def get_egress_ip(
    proxy_url: Optional[str] = None,
    timeout: float = 8.0,
    force: bool = False,
) -> Optional[str]:
    """Returns the public egress IP (through ``proxy_url`` when provided).

    Results are cached for a short window so repeated UI/status calls do not
    hammer the IP echo services.
    """
    now = time.time()
    if (
        not force
        and _EGRESS_CACHE["proxy"] == proxy_url
        and _EGRESS_CACHE["ip"]
        and (now - _EGRESS_CACHE["timestamp"] < _EGRESS_TTL)
    ):
        return _EGRESS_CACHE["ip"]

    ip: Optional[str] = None
    for endpoint in _IP_ECHO_ENDPOINTS:
        try:
            resp = httpx.get(endpoint, proxy=proxy_url, timeout=timeout)
            if resp.status_code == 200:
                data = resp.json()
                candidate = (data.get("ip") or data.get("ip_addr")) if isinstance(data, dict) else None
                if candidate:
                    ip = str(candidate).strip()
                    break
        except Exception as exc:
            message = str(exc)
            if proxy_url:
                try:
                    from backend.utils.proxy import redact_proxy_secret
                    message = redact_proxy_secret(message, proxy_url)
                except Exception:
                    message = "proxy connection failed"
            logger.debug(f"Egress IP probe failed via {endpoint}: {message}")
            continue

    if ip:
        _EGRESS_CACHE.update({"proxy": proxy_url, "ip": ip, "timestamp": now})
    return ip


def get_proxy_egress_ip(force: bool = False, timeout: float = 8.0) -> Optional[str]:
    """Returns the egress IP as seen through the configured download proxy.

    When no proxy is configured this resolves the server's own public IP, which
    is still useful for warning about cookie/egress mismatches.
    """
    try:
        from backend.utils.proxy import get_proxy_url
    except ImportError:
        from utils.proxy import get_proxy_url

    return get_egress_ip(get_proxy_url(), timeout=timeout, force=force)
