"""SQLite-backed sliding-window limiter for sensitive authentication endpoints."""
import hashlib
import sqlite3
import time

from backend.config import SETTINGS
from backend.db import get_conn


class SlidingWindowLimiter:
    def allow(self, key: str, limit: int, window_seconds: int, now: float | None = None) -> tuple[bool, int]:
        # Store a digest instead of raw client IPs, and keep counters in SQLite
        # so workers sharing the application database enforce one common limit.
        current = time.time() if now is None else now
        bucket = hashlib.sha256(key.encode("utf-8")).hexdigest()
        cutoff = current - window_seconds
        conn = get_conn(SETTINGS.db_path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM auth_rate_limit_events WHERE occurred_at <= ?",
                (current - 3600,),
            )
            row = conn.execute(
                "SELECT COUNT(*) AS hits, MIN(occurred_at) AS oldest "
                "FROM auth_rate_limit_events WHERE bucket = ? AND occurred_at > ?",
                (bucket, cutoff),
            ).fetchone()
            if int(row["hits"]) >= limit:
                conn.commit()
                retry_after = max(1, int(row["oldest"] + window_seconds - current + 0.999))
                return False, retry_after
            conn.execute(
                "INSERT INTO auth_rate_limit_events (bucket, occurred_at) VALUES (?, ?)",
                (bucket, current),
            )
            conn.commit()
            return True, 0
        except sqlite3.Error:
            conn.rollback()
            raise
        finally:
            conn.close()


AUTH_LIMITS: dict[str, tuple[int, int]] = {
    "/api/auth/login": (10, 60),
    "/api/auth/register": (5, 3600),
    "/api/auth/reset-request": (5, 3600),
    "/api/auth/reset-confirm": (10, 3600),
}

limiter = SlidingWindowLimiter()
