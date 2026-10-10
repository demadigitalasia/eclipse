"""Error envelope backend — kode sama dengan `ErrorCode` frontend.

Frontend menampilkan `message` + `hint` dalam `.error-box` (role=alert).
Stdlib-only agar dapat diimpor tanpa FastAPI.
"""
from typing import Any, Optional

ERROR_CODES = (
    "invalid_url",
    "drive_not_accessible",
    "file_required",
    "file_too_large",
    "file_type_unsupported",
    "invalid_range",
    "consent_required",
    "quota_exceeded",
    "empty_result",
    "backend_offline",
    "unknown",
)

_STATUS_BY_CODE = {
    "invalid_url": 400,
    "drive_not_accessible": 422,
    "file_required": 400,
    "file_too_large": 413,
    "file_type_unsupported": 415,
    "invalid_range": 400,
    "consent_required": 403,
    "quota_exceeded": 429,
    "empty_result": 422,
    "backend_offline": 503,
    "unknown": 500,
}


def error_envelope(code: str, message: str, hint: Optional[str] = None) -> dict[str, Any]:
    if code not in ERROR_CODES:
        code = "unknown"
    body: dict[str, Any] = {"code": code, "message": message}
    if hint:
        body["hint"] = hint
    return {"error": body}


def http_status_for(code: str) -> int:
    return _STATUS_BY_CODE.get(code, 500)
