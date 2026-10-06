"""Shared administrator authentication helpers.

The settings panel and any state-changing endpoint that should not be public
use these guards. ``require_admin_configured`` is fail-closed (settings stay
locked until ``ADMIN_API_KEY`` is set), while ``verify_admin_if_configured``
keeps local single-user installs working and only enforces the key once one
has been configured.
"""
import os
from typing import Optional

from fastapi import Header, HTTPException


def configured_admin_key() -> str:
    """Returns the configured administrator key (supports legacy aliases)."""
    return (
        os.environ.get("ADMIN_API_KEY")
        or os.environ.get("ECLIPSE_API_KEY")
        or os.environ.get("CHEAT_CLIP_API_KEY")
        or ""
    ).strip()


def extract_provided_admin_key(
    x_admin_key: Optional[str],
    authorization: Optional[str] = None,
) -> str:
    """Reads the admin key from the ``X-Admin-Key`` header or a Bearer token."""
    provided = (x_admin_key or "").strip()
    if not provided and authorization and authorization.startswith("Bearer "):
        provided = authorization[7:].strip()
    return provided


def require_admin_configured(
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    authorization: Optional[str] = Header(None),
) -> bool:
    """Fail-closed admin guard for the settings management API.

    Locked until an admin key is configured on the server so that a public
    deployment can never be reconfigured by anonymous visitors.
    """
    admin_key = configured_admin_key()
    if not admin_key:
        raise HTTPException(
            status_code=403,
            detail="Admin key is not configured on the server. Set the ADMIN_API_KEY environment variable first.",
        )
    if extract_provided_admin_key(x_admin_key, authorization) != admin_key:
        raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing admin key")
    return True


def verify_admin_if_configured(
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    authorization: Optional[str] = Header(None),
) -> bool:
    """Fail-open admin guard for mutating routes (e.g. cookie management).

    Keeps local installs frictionless while protecting network-exposed
    deployments as soon as an admin key is configured.
    """
    admin_key = configured_admin_key()
    if not admin_key:
        return True
    if extract_provided_admin_key(x_admin_key, authorization) != admin_key:
        raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing admin key")
    return True
