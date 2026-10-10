"""Encrypted, account-affine egress proxy pool."""
import os
import time
import uuid
from urllib.parse import urlsplit
from typing import Optional

from backend import db
from backend.config import SETTINGS
from backend.secrets import decrypt_secret, encrypt_secret


class ProxyPoolUnavailable(ValueError):
    """A configured pool has no endpoint that can safely accept the job."""


class ProxyTransportError(ValueError):
    """A media request failed while establishing its configured proxy tunnel."""


def validate_proxy_url(value: str) -> str:
    """Validate proxy URL formats supported by requests/httpx and yt-dlp."""
    url = value.strip()
    if not url or len(url) > 2048:
        raise ValueError("Masukkan URL proxy HTTP/HTTPS yang valid.")
    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("Proxy harus memakai protokol http:// atau https:// dan memiliki host.")
    if parts.path not in {"", "/"} or parts.query or parts.fragment:
        raise ValueError("URL proxy hanya boleh berisi host, port, dan kredensial; path/query tidak didukung.")
    try:
        _ = parts.port
    except ValueError as exc:
        raise ValueError("Port proxy tidak valid.") from exc
    return url


def proxy_origin(url: Optional[str]) -> Optional[str]:
    """A safe display value that excludes proxy credentials and path data."""
    if not url:
        return None
    parts = urlsplit(url)
    host = parts.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    try:
        port = parts.port
    except ValueError:
        port = None
    return f"{parts.scheme}://{host}{f':{port}' if port else ''}"


def redact_proxy_secret(message: str, proxy_url: Optional[str] = None) -> str:
    """Avoid returning configured credentials in downloader/provider errors."""
    configured = proxy_url or get_proxy_url()
    if not configured:
        return message
    redacted = message.replace(configured, proxy_origin(configured) or "proxy")
    parts = urlsplit(configured)
    if parts.username:
        redacted = redacted.replace(parts.username, "[user]")
    if parts.password:
        redacted = redacted.replace(parts.password, "[secret]")
    return redacted


def _rows(include_disabled: bool = True) -> list[dict]:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        where = "" if include_disabled else "WHERE enabled = 1"
        rows = conn.execute(f"SELECT * FROM proxy_endpoints {where} ORDER BY priority, created_at").fetchall()
        return [db.row_to_dict(row) for row in rows]
    finally:
        conn.close()


def _safe_entry(row: dict) -> dict:
    url = decrypt_secret(row["ciphertext"])
    return {
        "id": row["id"], "alias": row["alias"], "endpoint": proxy_origin(url),
        "enabled": bool(row["enabled"]), "priority": int(row["priority"]),
        "status": row["status"], "failureCount": int(row["failure_count"]),
        "cooldownUntil": float(row["cooldown_until"]), "lastCheck": row["last_check"],
        "lastUsedAt": float(row["last_used_at"]),
    }


def list_entries() -> list[dict]:
    return [_safe_entry(row) for row in _rows()]


def add_entry(alias: str, proxy_url: str) -> dict:
    alias = alias.strip()
    proxy_url = validate_proxy_url(proxy_url)
    if not alias or len(alias) > 100:
        raise ValueError("Nama proxy wajib diisi dan maksimal 100 karakter.")
    conn = db.get_conn(SETTINGS.db_path)
    try:
        entries = conn.execute("SELECT ciphertext FROM proxy_endpoints").fetchall()
        if any(decrypt_secret(row["ciphertext"]) == proxy_url for row in entries):
            raise ValueError("URL proxy tersebut sudah terdaftar.")
        priority = conn.execute("SELECT COALESCE(MAX(priority), -1) + 1 FROM proxy_endpoints").fetchone()[0]
        endpoint_id = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO proxy_endpoints (id, alias, ciphertext, enabled, priority, status, created_at) "
            "VALUES (?, ?, ?, 1, ?, 'untested', ?)",
            (endpoint_id, alias, encrypt_secret(proxy_url), int(priority), db.now_iso()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM proxy_endpoints WHERE id = ?", (endpoint_id,)).fetchone()
        assert row is not None
        return _safe_entry(db.row_to_dict(row))
    finally:
        conn.close()


def update_entry(endpoint_id: str, enabled: bool | None = None, priority: int | None = None) -> bool:
    fields, values = [], []
    if enabled is not None:
        fields.append("enabled = ?")
        values.append(int(enabled))
    if priority is not None:
        fields.append("priority = ?")
        values.append(max(0, min(priority, 10000)))
    if not fields:
        return False
    conn = db.get_conn(SETTINGS.db_path)
    try:
        cur = conn.execute(f"UPDATE proxy_endpoints SET {', '.join(fields)} WHERE id = ?", (*values, endpoint_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_entry(endpoint_id: str) -> bool:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        cur = conn.execute("DELETE FROM proxy_endpoints WHERE id = ?", (endpoint_id,))
        if cur.rowcount:
            conn.execute("DELETE FROM proxy_affinity WHERE proxy_id = ?", (endpoint_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _record_use(conn, endpoint_id: str) -> None:
    conn.execute("UPDATE proxy_endpoints SET last_used_at = ? WHERE id = ?", (time.time(), endpoint_id))


def _effective_env_proxy() -> Optional[str]:
    value = os.environ.get("ECLIPSE_EGRESS_PROXY", "").strip()
    return validate_proxy_url(value) if value else None


def assign_proxy(account_id: str, job_id: str = "") -> tuple[Optional[str], Optional[str]]:
    """Return (endpoint id, URL), keeping one healthy proxy sticky per account.

    New account affinities are assigned to the least recently used healthy proxy.
    An existing affinity is retained unless that endpoint was disabled or cooled.
    """
    now = time.time()
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        all_rows = conn.execute("SELECT * FROM proxy_endpoints WHERE enabled = 1 ORDER BY priority, created_at").fetchall()
        if not all_rows:
            any_pool = conn.execute("SELECT 1 FROM proxy_endpoints LIMIT 1").fetchone()
            if any_pool:
                raise ProxyPoolUnavailable("Semua proxy dinonaktifkan. Aktifkan endpoint pool atau hapus pool admin untuk memakai fallback environment.")
            return None, _effective_env_proxy()

        affinity = conn.execute("SELECT proxy_id FROM proxy_affinity WHERE account_id = ?", (account_id,)).fetchone()
        job_assignment = conn.execute("SELECT egress_proxy_id FROM jobs WHERE id = ?", (job_id,)).fetchone() if job_id else None
        by_id = {row["id"]: row for row in all_rows}
        candidates = [row for row in all_rows if float(row["cooldown_until"] or 0) <= now]
        if not candidates:
            raise ProxyPoolUnavailable("Semua proxy sedang cooldown setelah kegagalan. Coba lagi setelah pemeriksaan kesehatan.")
        job_proxy_id = job_assignment["egress_proxy_id"] if job_assignment else ""
        selected = by_id.get(job_proxy_id) if job_proxy_id else (by_id.get(affinity["proxy_id"]) if affinity else None)
        if selected not in candidates:
            selected = min(candidates, key=lambda row: (float(row["last_used_at"] or 0), int(row["priority"]), row["created_at"]))
        # A job-pinned endpoint may exist before the account affinity row was
        # created (for example after a restored database). Keep both records in
        # sync so later jobs for that account inherit the same healthy egress.
        if not affinity or affinity["proxy_id"] != selected["id"]:
            conn.execute(
                "INSERT INTO proxy_affinity (account_id, proxy_id, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(account_id) DO UPDATE SET proxy_id=excluded.proxy_id, updated_at=excluded.updated_at",
                (account_id, selected["id"], db.now_iso()),
            )
        _record_use(conn, selected["id"])
        if job_id:
            conn.execute("UPDATE jobs SET egress_proxy_id = ? WHERE id = ?", (selected["id"], job_id))
        conn.commit()
        return selected["id"], decrypt_secret(selected["ciphertext"])
    finally:
        conn.close()


def get_proxy_url(proxy_id: Optional[str] = None) -> Optional[str]:
    """Get an exact enabled endpoint, or the configured env fallback/direct mode."""
    if proxy_id:
        conn = db.get_conn(SETTINGS.db_path)
        try:
            row = conn.execute("SELECT ciphertext, enabled FROM proxy_endpoints WHERE id = ?", (proxy_id,)).fetchone()
            if not row or not row["enabled"]:
                raise ProxyPoolUnavailable("Proxy yang ditetapkan untuk job tidak lagi aktif.")
            return decrypt_secret(row["ciphertext"])
        finally:
            conn.close()
    rows = _rows(include_disabled=False)
    if rows:
        if len(rows) == 1:
            return decrypt_secret(rows[0]["ciphertext"])
        raise ProxyPoolUnavailable("Job harus memilih proxy secara eksplisit berdasarkan afinitas akun.")
    return _effective_env_proxy()


def is_proxy_transport_error(error: Exception | str) -> bool:
    message = str(error).lower()
    if "proxy" in message and any(token in message for token in ("connect", "auth", "407", "tunnel", "refused", "timeout", "handshake")):
        return True
    try:
        import httpx
        return isinstance(error, httpx.ProxyError)
    except Exception:
        return False


def report_result(endpoint_id: str, success: bool) -> None:
    now = time.time()
    conn = db.get_conn(SETTINGS.db_path)
    try:
        row = conn.execute("SELECT failure_count FROM proxy_endpoints WHERE id = ?", (endpoint_id,)).fetchone()
        if not row:
            return
        if success:
            conn.execute(
                "UPDATE proxy_endpoints SET status='healthy', failure_count=0, cooldown_until=0, last_check=? WHERE id=?",
                (db.now_iso(), endpoint_id),
            )
        else:
            failures = int(row["failure_count"]) + 1
            cooldown = min(600, 15 * (2 ** min(failures - 1, 6)))
            conn.execute(
                "UPDATE proxy_endpoints SET status='error', failure_count=?, cooldown_until=?, last_check=? WHERE id=?",
                (failures, now + cooldown, db.now_iso(), endpoint_id),
            )
        conn.commit()
    finally:
        conn.close()


def get_endpoint_url(endpoint_id: str) -> str:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        row = conn.execute("SELECT ciphertext FROM proxy_endpoints WHERE id = ?", (endpoint_id,)).fetchone()
        if not row:
            raise ValueError("Proxy tidak ditemukan.")
        return decrypt_secret(row["ciphertext"])
    finally:
        conn.close()
