"""SQLite persisten MVP (B1): akun, job, audit, metadata key, kuota harian.

Stdlib `sqlite3` — cukup untuk satu worker global. Tanpa secret mentah:
hanya hash password/token dan metadata key tersamar.
"""
import hashlib
import calendar
import hmac
import json
import os
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'free',
  plan_started_at TEXT NOT NULL DEFAULT '',
  plan_expires_at TEXT NOT NULL DEFAULT '',
  profile_photo BLOB,
  profile_photo_mime TEXT NOT NULL DEFAULT '',
  profile_photo_updated_at TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  input_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  egress_proxy_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscription_payments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  plan TEXT NOT NULL CHECK (plan IN ('lite', 'pro')),
  base_amount INTEGER NOT NULL,
  unique_code INTEGER NOT NULL CHECK (unique_code BETWEEN 1 AND 999),
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  proof BLOB,
  proof_mime TEXT NOT NULL DEFAULT '',
  proof_filename TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  decision_note TEXT NOT NULL DEFAULT '',
  discount_amount INTEGER NOT NULL DEFAULT 0,
  campaign_discount INTEGER NOT NULL DEFAULT 0,
  promo_code TEXT NOT NULL DEFAULT '',
  promo_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_open_code
  ON subscription_payments (unique_code)
  WHERE status IN ('awaiting_payment', 'submitted');
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_open_account
  ON subscription_payments (account_id)
  WHERE status IN ('awaiting_payment', 'submitted');
CREATE TABLE IF NOT EXISTS subscription_payment_qr (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data BLOB NOT NULL,
  mime TEXT NOT NULL,
  filename TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  source_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_notifications_account_created
  ON notifications(account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS subscription_promos (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'lite', 'pro')),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  max_uses INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_subscription_promos_active ON subscription_promos(active, starts_at, ends_at);
CREATE TABLE IF NOT EXISTS key_meta (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  project TEXT NOT NULL,
  billing_account TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_check TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gemini_keys (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  project TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'untested',
  last_check TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS youtube_cookies (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  ciphertext BLOB NOT NULL,
  size_bytes INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proxy_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ciphertext BLOB NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'admin',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proxy_endpoints (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'untested',
  failure_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until REAL NOT NULL DEFAULT 0,
  last_check TEXT NOT NULL DEFAULT '',
  last_used_at REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proxy_affinity (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  proxy_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gemini_project_health (
  project TEXT PRIMARY KEY,
  cooldown_until REAL NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_used_at REAL NOT NULL DEFAULT 0,
  last_check TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS usage_daily (
  account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  analyze_count INTEGER NOT NULL DEFAULT 0,
  render_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
CREATE TABLE IF NOT EXISTS usage_monthly (
  account_id TEXT NOT NULL,
  month TEXT NOT NULL,
  render_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, month)
);
CREATE TABLE IF NOT EXISTS gemini_usage_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT '',
  job_id TEXT NOT NULL DEFAULT '',
  key_id TEXT NOT NULL DEFAULT '',
  key_alias TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  operation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  http_status INTEGER,
  usage_available INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cached_tokens INTEGER,
  thought_tokens INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gemini_usage_created ON gemini_usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_gemini_usage_project_created ON gemini_usage_events(project, created_at);
CREATE INDEX IF NOT EXISTS idx_gemini_usage_account_created ON gemini_usage_events(account_id, created_at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_rate_limit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  occurred_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_bucket_time
  ON auth_rate_limit_events(bucket, occurred_at);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_time
  ON auth_rate_limit_events(occurred_at);
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def get_conn(path: str) -> sqlite3.Connection:
    return connect(path)


def row_to_dict(row: sqlite3.Row) -> dict:
    return {key: row[key] for key in row.keys()}


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def add_calendar_month(value: str) -> str:
    return add_calendar_months(value, 1)


def add_calendar_months(value: str, months: int) -> str:
    current = datetime.fromisoformat(value.replace("Z", "+00:00"))
    index = current.year * 12 + current.month - 1 + months
    year, month_index = divmod(index, 12)
    month = month_index + 1
    day = min(current.day, calendar.monthrange(year, month)[1])
    return current.replace(year=year, month=month, day=day).isoformat(timespec="seconds").replace("+00:00", "Z")


def is_before_expiry(expires_at: str | None, now: datetime | None = None) -> bool:
    if not expires_at:
        return False
    expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    return (now or datetime.now(timezone.utc)) < expiry


def free_trial_expires_at(created_at: str, days: int) -> str:
    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    return (created + timedelta(days=days)).isoformat(timespec="seconds").replace("+00:00", "Z")


# ---------- akun ----------

def count_accounts(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()
    return int(row[0]) if row else 0


def find_account_by_email(conn: sqlite3.Connection, email: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM accounts WHERE email = ?", (email.strip().lower(),)).fetchone()
    return row_to_dict(row) if row else None


def find_account_by_id(conn: sqlite3.Connection, account_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return row_to_dict(row) if row else None


def create_account(conn: sqlite3.Connection, name: str, email: str, password_hash: str, role: str) -> dict:
    import uuid

    account_id = f"u-{uuid.uuid4().hex[:12]}"
    email = email.strip().lower()
    conn.execute(
        "INSERT INTO accounts (id, name, email, password_hash, role, plan, created_at)"
        " VALUES (?, ?, ?, ?, ?, 'free', ?)",
        (account_id, name.strip(), email, password_hash, role, now_iso()),
    )
    conn.commit()
    created = find_account_by_id(conn, account_id)
    assert created is not None
    return created


def public_account(row: dict) -> dict:
    account = {k: row[k] for k in (
        "id", "name", "email", "role", "plan", "created_at", "plan_started_at",
        "plan_expires_at", "profile_photo_updated_at",
    ) if k in row}
    account["active"] = bool(row.get("active", 1))
    return account


def set_profile_photo(conn: sqlite3.Connection, account_id: str, photo: bytes, mime: str) -> None:
    conn.execute(
        "UPDATE accounts SET profile_photo = ?, profile_photo_mime = ?, profile_photo_updated_at = ? WHERE id = ?",
        (sqlite3.Binary(photo), mime, now_iso(), account_id),
    )
    conn.commit()


def get_profile_photo(conn: sqlite3.Connection, account_id: str) -> Optional[dict]:
    row = conn.execute(
        "SELECT profile_photo, profile_photo_mime, profile_photo_updated_at FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if not row or not row["profile_photo"]:
        return None
    return {"data": bytes(row["profile_photo"]), "mime": row["profile_photo_mime"] or "image/webp", "updated_at": row["profile_photo_updated_at"]}


def count_admins(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) FROM accounts WHERE role = 'admin' AND active = 1").fetchone()
    return int(row[0]) if row else 0


def set_account_active(conn: sqlite3.Connection, account_id: str, active: bool) -> None:
    conn.execute("UPDATE accounts SET active = ? WHERE id = ?", (int(active), account_id))
    if not active:
        # Revoke all sessions immediately; depend_user also rejects inactive accounts.
        conn.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))
    conn.commit()


def set_password(conn: sqlite3.Connection, account_id: str, password_hash: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    conn.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (password_hash, account_id))
    conn.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))
    conn.commit()


def update_role_plan(
    conn: sqlite3.Connection, account_id: str, role: Optional[str] = None, plan: Optional[str] = None,
    renew: bool = False, term_months: int = 1, commit: bool = True,
) -> None:
    if role is not None:
        conn.execute("UPDATE accounts SET role = ? WHERE id = ?", (role, account_id))
    if plan is not None:
        current = find_account_by_id(conn, account_id) or {}
        started = now_iso()
        if plan in {"lite", "pro"}:
            old_expiry = current.get("plan_expires_at") or ""
            active_renewal = renew and current.get("plan") == plan and is_before_expiry(old_expiry)
            base = old_expiry if active_renewal else started
            if active_renewal:
                started = current.get("plan_started_at") or started
            expires = add_calendar_months(base, term_months)
        else:
            started, expires = "", ""
        conn.execute("UPDATE accounts SET plan = ?, plan_started_at = ?, plan_expires_at = ? WHERE id = ?", (plan, started, expires, account_id))
    if commit:
        conn.commit()


def get_subscription_settings(conn: sqlite3.Connection, defaults: dict[str, int | str]) -> dict[str, int | str]:
    """Read editable plan settings, falling back to environment defaults."""
    result = dict(defaults)
    rows = conn.execute("SELECT key, value FROM system_settings WHERE key LIKE 'subscription.%'").fetchall()
    for row in rows:
        key = row["key"].removeprefix("subscription.")
        if key in result:
            if isinstance(defaults.get(key), str):
                result[key] = str(row["value"])
            else:
                try:
                    result[key] = int(row["value"])
                except (TypeError, ValueError):
                    continue
    return result


def save_subscription_settings(conn: sqlite3.Connection, values: dict[str, int | str]) -> None:
    """Persist subscription settings in the app database."""
    now = now_iso()
    conn.executemany(
        "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [(f"subscription.{key}", str(value), now) for key, value in values.items()],
    )
    conn.commit()


def payment_summary(row: sqlite3.Row) -> dict:
    result = row_to_dict(row)
    result.pop("proof", None)
    return result


def create_notification(
    conn: sqlite3.Connection, account_id: str, kind: str, payload: dict,
    source_key: str, created_at: str | None = None, commit: bool = True,
) -> None:
    """Add one deduplicated in-app notification for an account."""
    conn.execute(
        "INSERT OR IGNORE INTO notifications (id, account_id, kind, payload_json, source_key, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (f"ntf-{secrets.token_hex(10)}", account_id, kind, json.dumps(payload, ensure_ascii=False), source_key, created_at or now_iso()),
    )
    if commit:
        conn.commit()


def list_notifications(conn: sqlite3.Connection, account_id: str, limit: int = 100) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM notifications WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        (account_id, limit),
    ).fetchall()
    result = []
    for row in rows:
        item = row_to_dict(row)
        try:
            item["payload"] = json.loads(item.pop("payload_json") or "{}")
        except (TypeError, ValueError):
            item["payload"] = {}
            item.pop("payload_json", None)
        result.append(item)
    return result


def unread_notification_count(conn: sqlite3.Connection, account_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE account_id = ? AND read_at = ''", (account_id,)
    ).fetchone()
    return int(row[0]) if row else 0


def mark_notification_read(conn: sqlite3.Connection, account_id: str, notification_id: str | None = None) -> int:
    if notification_id is None:
        cursor = conn.execute(
            "UPDATE notifications SET read_at = ? WHERE account_id = ? AND read_at = ''",
            (now_iso(), account_id),
        )
    else:
        cursor = conn.execute(
            "UPDATE notifications SET read_at = ? WHERE account_id = ? AND id = ? AND read_at = ''",
            (now_iso(), account_id, notification_id),
        )
    conn.commit()
    return cursor.rowcount


def backfill_payment_notifications(conn: sqlite3.Connection) -> None:
    """Backfill inbox items for payment activity that predates the inbox."""
    rows = conn.execute(
        "SELECT id, account_id, plan, status, submitted_at, decided_at, decision_note "
        "FROM subscription_payments WHERE status IN ('submitted', 'approved', 'rejected')"
    ).fetchall()
    for row in rows:
        payload = {"plan": row["plan"], "paymentId": row["id"], "note": row["decision_note"]}
        if row["submitted_at"]:
            create_notification(
                conn, row["account_id"], "payment_submitted", payload,
                f"payment:{row['id']}:submitted", row["submitted_at"], commit=False,
            )
        if row["status"] in {"approved", "rejected"}:
            create_notification(
                conn, row["account_id"], f"payment_{row['status']}", payload,
                f"payment:{row['id']}:{row['status']}", row["decided_at"] or None, commit=False,
            )
    conn.commit()


def create_subscription_payment(
    conn: sqlite3.Connection, account_id: str, plan: str, base_amount: int, discount_amount: int = 0,
) -> dict:
    """Create a pending QRIS order with an amount code unique among open orders."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE subscription_payments SET status = 'expired' "
            "WHERE status = 'awaiting_payment' AND expires_at <> '' AND expires_at <= ?",
            (now_iso(),),
        )
        existing = conn.execute(
            "SELECT * FROM subscription_payments WHERE account_id = ? "
            "AND status IN ('awaiting_payment', 'submitted') ORDER BY created_at DESC LIMIT 1",
            (account_id,),
        ).fetchone()
        if existing:
            raise ValueError("payment_exists")
        occupied = {int(row[0]) for row in conn.execute(
            "SELECT unique_code FROM subscription_payments WHERE status IN ('awaiting_payment', 'submitted')"
        ).fetchall()}
        available = [code for code in range(1, 1000) if code not in occupied]
        if not available:
            raise ValueError("payment_codes_full")
        code = secrets.choice(available)
        payment_id = f"PAY-{time.strftime('%y%m%d')}-{secrets.token_hex(4).upper()}"
        discount_amount = min(max(0, discount_amount), base_amount)
        total = base_amount - discount_amount + code
        created = now_iso()
        expires = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() + 24 * 3600)) + "Z"
        conn.execute(
            "INSERT INTO subscription_payments "
            "(id, account_id, plan, base_amount, unique_code, total_amount, discount_amount, campaign_discount, status, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?)",
            (payment_id, account_id, plan, base_amount, code, total, discount_amount, discount_amount, created, expires),
        )
        row = conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone()
        conn.commit()
        return payment_summary(row)
    except Exception:
        conn.rollback()
        raise


def list_subscription_payments(conn: sqlite3.Connection, account_id: str | None = None, limit: int = 100) -> list[dict]:
    expire_unpaid_subscription_payments(conn)
    if account_id is None:
        rows = conn.execute(
            "SELECT p.*, a.name AS account_name, a.email AS account_email "
            "FROM subscription_payments p JOIN accounts a ON a.id = p.account_id "
            "ORDER BY CASE p.status WHEN 'submitted' THEN 0 WHEN 'awaiting_payment' THEN 1 ELSE 2 END, p.created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM subscription_payments WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
            (account_id, limit),
        ).fetchall()
    return [payment_summary(row) for row in rows]


def get_subscription_payment(conn: sqlite3.Connection, payment_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone()
    return row_to_dict(row) if row else None


def _promo_datetime(value: str, default_tz=ZoneInfo("Asia/Jakarta")) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=default_tz) if parsed.tzinfo is None else parsed


def is_in_promo_window(starts_at: str, ends_at: str, now: datetime | None = None) -> bool:
    current = now or datetime.now(ZoneInfo("Asia/Jakarta"))
    start, end = _promo_datetime(starts_at), _promo_datetime(ends_at)
    return not (start and current < start) and not (end and current > end)


def campaign_discount(settings: dict, plan: str, price: int, now: datetime | None = None) -> int:
    prefix = f"{plan}Discount"
    percent = int(settings.get(f"{prefix}Percent", 0) or 0)
    if percent <= 0 or not is_in_promo_window(
        str(settings.get(f"{prefix}Start", "")), str(settings.get(f"{prefix}End", "")), now
    ):
        return 0
    return min(price, (price * percent) // 100)


def list_subscription_promos(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT p.*, (SELECT COUNT(*) FROM subscription_payments x WHERE x.promo_id = p.id "
        "AND x.status IN ('awaiting_payment', 'submitted', 'approved')) AS use_count "
        "FROM subscription_promos p ORDER BY p.created_at DESC, p.code ASC"
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def create_subscription_promo(conn: sqlite3.Connection, values: dict, created_by: str) -> dict:
    promo_id = f"PR-{secrets.token_hex(6).upper()}"
    conn.execute(
        "INSERT INTO subscription_promos "
        "(id, code, applies_to, discount_type, discount_value, starts_at, ends_at, max_uses, active, created_at, created_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        (promo_id, values["code"], values["appliesTo"], values["discountType"], values["discountValue"],
         values["startsAt"], values["endsAt"], values["maxUses"], now_iso(), created_by),
    )
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM subscription_promos WHERE id = ?", (promo_id,)).fetchone())


def update_subscription_promo_active(conn: sqlite3.Connection, promo_id: str, active: bool) -> bool:
    cursor = conn.execute("UPDATE subscription_promos SET active = ? WHERE id = ?", (int(active), promo_id))
    conn.commit()
    return cursor.rowcount > 0


def delete_subscription_promo(conn: sqlite3.Connection, promo_id: str) -> bool:
    cursor = conn.execute("DELETE FROM subscription_promos WHERE id = ?", (promo_id,))
    conn.commit()
    return cursor.rowcount > 0


def apply_subscription_promo(conn: sqlite3.Connection, payment_id: str, account_id: str, code: str) -> dict:
    """Validate a promo and recalculate an unpaid order under a write lock."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        payment = conn.execute(
            "SELECT * FROM subscription_payments WHERE id = ? AND account_id = ?", (payment_id, account_id)
        ).fetchone()
        if not payment or payment["status"] != "awaiting_payment":
            raise ValueError("payment_unavailable")
        promo = conn.execute(
            "SELECT * FROM subscription_promos WHERE code = ? COLLATE NOCASE", (code.strip().upper(),)
        ).fetchone()
        if not promo or not promo["active"]:
            raise ValueError("promo_invalid")
        if promo["applies_to"] not in {"all", payment["plan"]}:
            raise ValueError("promo_plan_mismatch")
        if not is_in_promo_window(promo["starts_at"], promo["ends_at"]):
            raise ValueError("promo_inactive")
        used = conn.execute(
            "SELECT COUNT(*) FROM subscription_payments WHERE promo_id = ? "
            "AND status IN ('awaiting_payment', 'submitted', 'approved') AND id <> ?",
            (promo["id"], payment_id),
        ).fetchone()[0]
        if promo["max_uses"] > 0 and used >= promo["max_uses"]:
            raise ValueError("promo_limit_reached")
        if conn.execute(
            "SELECT 1 FROM subscription_payments WHERE account_id = ? AND promo_id = ? "
            "AND status IN ('submitted', 'approved') AND id <> ? LIMIT 1",
            (account_id, promo["id"], payment_id),
        ).fetchone():
            raise ValueError("promo_already_used")
        campaign_discount = payment["campaign_discount"] or 0
        subtotal = max(0, payment["base_amount"] - campaign_discount)
        if promo["discount_type"] == "percent":
            promo_discount = (subtotal * promo["discount_value"]) // 100
        else:
            promo_discount = min(subtotal, promo["discount_value"])
        discount = min(payment["base_amount"], campaign_discount + promo_discount)
        total = payment["base_amount"] - discount + payment["unique_code"]
        conn.execute(
            "UPDATE subscription_payments SET discount_amount = ?, promo_code = ?, promo_id = ?, total_amount = ? WHERE id = ?",
            (discount, promo["code"], promo["id"], total, payment_id),
        )
        updated = payment_summary(conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone())
        conn.commit()
        return updated
    except Exception:
        conn.rollback()
        raise


def clear_subscription_promo(conn: sqlite3.Connection, payment_id: str, account_id: str) -> dict:
    conn.execute("BEGIN IMMEDIATE")
    try:
        payment = conn.execute(
            "SELECT * FROM subscription_payments WHERE id = ? AND account_id = ? AND status = 'awaiting_payment'",
            (payment_id, account_id),
        ).fetchone()
        if not payment:
            raise ValueError("payment_unavailable")
        discount = payment["campaign_discount"] or 0
        total = payment["base_amount"] - discount + payment["unique_code"]
        conn.execute(
            "UPDATE subscription_payments SET discount_amount = ?, promo_code = '', promo_id = '', total_amount = ? WHERE id = ?",
            (discount, total, payment_id),
        )
        updated = payment_summary(conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone())
        conn.commit()
        return updated
    except Exception:
        conn.rollback()
        raise


def expire_unpaid_subscription_payments(conn: sqlite3.Connection) -> None:
    expired = conn.execute(
        "SELECT id, account_id, plan, expires_at FROM subscription_payments "
        "WHERE status = 'awaiting_payment' AND expires_at <> '' AND expires_at <= ?",
        (now_iso(),),
    ).fetchall()
    conn.execute(
        "UPDATE subscription_payments SET status = 'expired' "
        "WHERE status = 'awaiting_payment' AND expires_at <> '' AND expires_at <= ?",
        (now_iso(),),
    )
    for payment in expired:
        create_notification(
            conn, payment["account_id"], "payment_expired",
            {"plan": payment["plan"], "paymentId": payment["id"]},
            f"payment:{payment['id']}:expired", payment["expires_at"], commit=False,
        )
    conn.commit()


def save_payment_proof(conn: sqlite3.Connection, payment_id: str, data: bytes, mime: str, filename: str) -> None:
    payment = conn.execute("SELECT account_id, plan, submitted_at FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone()
    submitted_at = now_iso()
    conn.execute(
        "UPDATE subscription_payments SET proof = ?, proof_mime = ?, proof_filename = ?, "
        "status = 'submitted', submitted_at = ?, decision_note = '' WHERE id = ?",
        (data, mime, filename[:255], submitted_at, payment_id),
    )
    if payment:
        create_notification(
            conn, payment["account_id"], "payment_submitted",
            {"plan": payment["plan"], "paymentId": payment_id},
            f"payment:{payment_id}:submitted", submitted_at, commit=False,
        )
    conn.commit()


def cancel_subscription_payment(conn: sqlite3.Connection, payment_id: str) -> None:
    conn.execute("UPDATE subscription_payments SET status = 'cancelled' WHERE id = ?", (payment_id,))
    conn.commit()


def decide_subscription_payment(
    conn: sqlite3.Connection, payment_id: str, decision: str, admin_email: str,
    note: str = "", term_months: int = 1,
) -> dict | None:
    """Approve/reject a submitted payment and activate its plan atomically."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        payment = conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone()
        if not payment or payment["status"] != "submitted":
            conn.rollback()
            return None
        decided = now_iso()
        if decision == "approve":
            update_role_plan(
                conn, payment["account_id"], None, payment["plan"], renew=True,
                term_months=term_months, commit=False,
            )
            status = "approved"
            action = "setujui-pembayaran-subscription"
        else:
            status = "rejected"
            action = "tolak-pembayaran-subscription"
        conn.execute(
            "UPDATE subscription_payments SET status = ?, decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ?",
            (status, decided, admin_email, note[:500], payment_id),
        )
        account = find_account_by_id(conn, payment["account_id"])
        # Keep the audit row in the same transaction as the decision and plan
        # activation. log_audit() commits on its own and would break atomicity.
        conn.execute(
            "INSERT INTO audit (actor, action, detail, created_at) VALUES (?, ?, ?, ?)",
            (admin_email, action, f"{payment_id} {payment['plan']} {account['email'] if account else payment['account_id']}", decided),
        )
        create_notification(
            conn, payment["account_id"], f"payment_{status}",
            {"plan": payment["plan"], "paymentId": payment_id, "note": note[:500]},
            f"payment:{payment_id}:{status}", decided, commit=False,
        )
        result = payment_summary(conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone())
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise


def sync_subscription_notifications(conn: sqlite3.Connection, account: dict, settings: dict[str, int]) -> None:
    """Create once-only lifecycle notices when Free or paid access changes state."""
    if account.get("role") == "admin":
        return
    now = datetime.now(timezone.utc)
    plan = account.get("plan", "free")
    if plan == "free":
        expiry = free_trial_expires_at(account["created_at"], settings["freeRenderTrialDays"])
        if not is_before_expiry(expiry, now):
            create_notification(
                conn, account["id"], "free_expired", {"expiresAt": expiry},
                f"free-expired:{account['id']}:{expiry}", expiry,
            )
        elif datetime.fromisoformat(expiry.replace("Z", "+00:00")) <= now + timedelta(days=1):
            create_notification(
                conn, account["id"], "free_expiring", {"expiresAt": expiry},
                f"free-expiring:{account['id']}:{expiry}", now_iso(),
            )
    elif plan in {"lite", "pro"}:
        expiry = account.get("plan_expires_at") or ""
        if not expiry:
            return
        parsed_expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        if parsed_expiry <= now:
            create_notification(
                conn, account["id"], "plan_expired", {"plan": plan, "expiresAt": expiry},
                f"plan-expired:{account['id']}:{expiry}", expiry,
            )
        elif parsed_expiry <= now + timedelta(days=3):
            create_notification(
                conn, account["id"], "plan_expiring", {"plan": plan, "expiresAt": expiry},
                f"plan-expiring:{account['id']}:{expiry}", now_iso(),
            )


def save_subscription_payment_qr(conn: sqlite3.Connection, data: bytes, mime: str, filename: str) -> None:
    conn.execute(
        "INSERT INTO subscription_payment_qr (id, data, mime, filename, updated_at) VALUES (1, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET data = excluded.data, mime = excluded.mime, "
        "filename = excluded.filename, updated_at = excluded.updated_at",
        (data, mime, filename[:255], now_iso()),
    )
    conn.commit()


def get_subscription_payment_qr(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute("SELECT * FROM subscription_payment_qr WHERE id = 1").fetchone()
    return row_to_dict(row) if row else None


def delete_account(conn: sqlite3.Connection, account_id: str) -> list[str]:
    job_ids = [row["id"] for row in conn.execute("SELECT id FROM jobs WHERE account_id = ?", (account_id,)).fetchall()]
    conn.execute("DELETE FROM gemini_usage_events WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM usage_daily WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM usage_monthly WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM jobs WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM reset_tokens WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
    return job_ids


def list_accounts(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, name, email, role, plan, active, created_at, plan_started_at, plan_expires_at, "
        "profile_photo_updated_at FROM accounts ORDER BY created_at"
    ).fetchall()
    return [public_account(row_to_dict(r)) for r in rows]


# ---------- sesi ----------

SESSION_TTL_SEC = 7 * 24 * 3600


def create_session(conn: sqlite3.Connection, account_id: str) -> tuple[str, int]:
    import hashlib as _hashlib
    import secrets as _secrets

    token = _secrets.token_urlsafe(32)
    token_hash = _hashlib.sha256(token.encode()).hexdigest()
    now = int(time.time())
    conn.execute(
        "INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash, account_id, now, now + SESSION_TTL_SEC),
    )
    conn.commit()
    return token, now + SESSION_TTL_SEC


def get_session_account(conn: sqlite3.Connection, token: str) -> Optional[dict]:
    import hashlib as _hashlib

    token_hash = _hashlib.sha256(token.encode()).hexdigest()
    row = conn.execute("SELECT * FROM sessions WHERE token_hash = ?", (token_hash,)).fetchone()
    if not row:
        return None
    if int(row["expires_at"]) < int(time.time()):
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        conn.commit()
        return None
    account = find_account_by_id(conn, row["account_id"])
    if not account or not account.get("active", 1):
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        conn.commit()
        return None
    return account


def revoke_session(conn: sqlite3.Connection, token: str) -> None:
    import hashlib as _hashlib

    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hashlib.sha256(token.encode()).hexdigest(),))
    conn.commit()


# ---------- reset token sekali pakai ----------

RESET_TTL_SEC = 15 * 60


def create_reset_code(conn: sqlite3.Connection, account_id: str) -> tuple[str, str]:
    """(id, kode 6 digit). Hanya hash yang disimpan; kode mentah cuma di log server."""
    import hashlib as _hashlib
    import secrets as _secrets
    import uuid

    code = f"{_secrets.randbelow(900000) + 100000:06d}"
    reset_id = f"r-{uuid.uuid4().hex[:12]}"
    conn.execute("DELETE FROM reset_tokens WHERE account_id = ?", (account_id,))
    conn.execute(
        "INSERT INTO reset_tokens (id, account_id, token_hash, expires_at, used)"
        " VALUES (?, ?, ?, ?, 0)",
        (reset_id, account_id, _hashlib.sha256(code.encode()).hexdigest(), int(time.time()) + RESET_TTL_SEC),
    )
    conn.commit()
    return reset_id, code


def consume_reset_code(conn: sqlite3.Connection, account_id: str, code: str) -> str:
    """Tukar kode dengan sukses, atau kembalikan alasan gagal."""
    import hashlib as _hashlib

    token_hash = _hashlib.sha256(code.strip().encode()).hexdigest()
    row = conn.execute(
        "SELECT * FROM reset_tokens WHERE account_id = ? AND token_hash = ? ORDER BY expires_at DESC LIMIT 1",
        (account_id, token_hash),
    ).fetchone()
    if not row:
        return "Kode salah."
    if int(row["used"]) != 0:
        return "Kode sudah dipakai. Minta kode baru."
    if int(row["expires_at"]) < int(time.time()):
        return "Kode kedaluwarsa. Minta kode baru."
    conn.execute("UPDATE reset_tokens SET used = 1 WHERE id = ?", (row["id"],))
    conn.commit()
    return ""


# ---------- jobs ----------

def create_job(
    conn: sqlite3.Connection, account_id: str, kind: str, source: str, input_ref: str = "", job_id: str | None = None
) -> dict:
    import uuid

    job_id = job_id or f"job-{uuid.uuid4().hex[:12]}"
    now = now_iso()
    conn.execute(
        "INSERT INTO jobs (id, account_id, kind, source, input_ref, status, progress,"
        " result_json, error_code, error_message, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, 'ready', 0, '', '', '', ?, ?)",
        (job_id, account_id, kind, source, input_ref, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    assert row is not None
    return row_to_dict(row)


def get_job(conn: sqlite3.Connection, job_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return row_to_dict(row) if row else None


def list_media_jobs(conn: sqlite3.Connection, account_id: str, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM jobs WHERE account_id = ? AND kind = 'media' AND status = 'done' "
        "ORDER BY updated_at DESC LIMIT ?",
        (account_id, limit),
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def update_job(conn: sqlite3.Connection, job_id: str, **fields) -> None:
    allowed = {"status", "progress", "result_json", "error_code", "error_message"}
    sets = [f"{k} = ?" for k in fields if k in allowed]
    if not sets:
        return
    values = [fields[k] for k in fields if k in allowed]
    conn.execute(
        f"UPDATE jobs SET {', '.join(sets)}, updated_at = ? WHERE id = ?",
        (*values, now_iso(), job_id),
    )
    conn.commit()


def record_gemini_usage(
    path: str,
    *,
    account_id: str = "",
    job_id: str = "",
    key_id: str = "",
    key_alias: str = "",
    project: str = "",
    model: str = "",
    operation: str = "",
    status: str,
    http_status: int | None = None,
    usage: dict | None = None,
) -> None:
    """Store token counters and provider attempt metadata, never prompts or media."""
    usage = usage if isinstance(usage, dict) else {}

    def token_count(name: str) -> int | None:
        value = usage.get(name)
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None

    has_usage = any(token_count(name) is not None for name in (
        "total_input_tokens", "total_output_tokens", "total_tokens",
        "total_cached_tokens", "total_thought_tokens",
    ))
    conn = get_conn(path)
    try:
        conn.execute(
            "INSERT INTO gemini_usage_events "
            "(id, account_id, job_id, key_id, key_alias, project, model, operation, status, http_status, "
            "usage_available, input_tokens, output_tokens, total_tokens, cached_tokens, thought_tokens, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                secrets.token_hex(16), account_id, job_id, key_id, key_alias, project, model, operation,
                status, http_status, int(has_usage), token_count("total_input_tokens"),
                token_count("total_output_tokens"), token_count("total_tokens"),
                token_count("total_cached_tokens"), token_count("total_thought_tokens"), now_iso(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def summarize_gemini_usage(path: str, days: int = 30) -> dict:
    """Aggregate provider-reported token usage; this is not a USD billing estimate."""
    days = max(1, min(int(days), 365))
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - days * 86400)) + "Z"
    conn = get_conn(path)
    try:
        totals = conn.execute(
            "SELECT COUNT(*) AS calls, "
            "SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded, "
            "SUM(CASE WHEN status != 'succeeded' THEN 1 ELSE 0 END) AS failed, "
            "SUM(usage_available) AS usage_available, "
            "SUM(CASE WHEN usage_available = 0 THEN 1 ELSE 0 END) AS usage_unknown, "
            "SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, "
            "SUM(total_tokens) AS total_tokens, SUM(cached_tokens) AS cached_tokens, "
            "SUM(thought_tokens) AS thought_tokens "
            "FROM gemini_usage_events WHERE created_at >= ?", (cutoff,),
        ).fetchone()
        def grouped(sql: str) -> list[dict]:
            return [row_to_dict(row) for row in conn.execute(sql, (cutoff,)).fetchall()]

        by_project_model = grouped(
            "SELECT project, model, COUNT(*) AS calls, SUM(usage_available) AS usage_available, "
            "SUM(CASE WHEN usage_available = 0 THEN 1 ELSE 0 END) AS usage_unknown, "
            "SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, "
            "SUM(total_tokens) AS total_tokens FROM gemini_usage_events WHERE created_at >= ? "
            "GROUP BY project, model ORDER BY SUM(total_tokens) DESC, calls DESC"
        )
        by_account = grouped(
            "SELECT g.account_id, COALESCE(a.name, 'Akun dihapus') AS account_name, "
            "COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, "
            "SUM(total_tokens) AS total_tokens, SUM(CASE WHEN usage_available = 0 THEN 1 ELSE 0 END) AS usage_unknown "
            "FROM gemini_usage_events g LEFT JOIN accounts a ON a.id = g.account_id "
            "WHERE g.created_at >= ? GROUP BY g.account_id, a.name ORDER BY SUM(g.total_tokens) DESC, calls DESC"
        )
        by_job = grouped(
            "SELECT g.job_id, g.account_id, COALESCE(a.name, 'Akun dihapus') AS account_name, "
            "COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, "
            "SUM(total_tokens) AS total_tokens, SUM(CASE WHEN usage_available = 0 THEN 1 ELSE 0 END) AS usage_unknown "
            "FROM gemini_usage_events g LEFT JOIN accounts a ON a.id = g.account_id "
            "WHERE g.created_at >= ? GROUP BY g.job_id, g.account_id, a.name "
            "ORDER BY SUM(g.total_tokens) DESC, calls DESC"
        )
        daily = grouped(
            "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS calls, "
            "SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, "
            "SUM(total_tokens) AS total_tokens, SUM(CASE WHEN usage_available = 0 THEN 1 ELSE 0 END) AS usage_unknown "
            "FROM gemini_usage_events WHERE created_at >= ? GROUP BY substr(created_at, 1, 10) ORDER BY day"
        )
        return {
            "period_days": days,
            "totals": {key: int(totals[key] or 0) for key in totals.keys()},
            "by_project_model": by_project_model,
            "by_account": by_account,
            "by_job": by_job,
            "daily": daily,
            "cost_usd": None,
            "cost_status": "unavailable",
        }
    finally:
        conn.close()


def public_job(row: dict) -> dict:
    return {k: row[k] for k in (
        "id", "account_id", "kind", "source", "input_ref", "status",
        "progress", "result_json", "error_code", "error_message",
        "created_at", "updated_at",
    ) if k in row}


# ---------- audit ----------
def log_audit(conn: sqlite3.Connection, actor: str, action: str, detail: str = "") -> None:
    conn.execute(
        "INSERT INTO audit (actor, action, detail, created_at) VALUES (?, ?, ?, ?)",
        (actor, action, detail, now_iso()),
    )
    conn.commit()


def list_audit(conn: sqlite3.Connection, limit: int = 200) -> list[dict]:
    rows = conn.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [row_to_dict(r) for r in rows]


def cleanup_old_metadata(path: str, retention_days: int) -> dict[str, int]:
    """Remove job/transcript results and audit entries beyond configured retention."""
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - retention_days * 86400)) + "Z"
    conn = get_conn(path)
    try:
        jobs = conn.execute("DELETE FROM jobs WHERE created_at < ?", (cutoff,)).rowcount
        audit = conn.execute("DELETE FROM audit WHERE created_at < ?", (cutoff,)).rowcount
        conn.execute("DELETE FROM reset_tokens WHERE expires_at < ?", (int(time.time()),))
        conn.commit()
        return {"jobs": jobs, "audit": audit}
    finally:
        conn.close()


def init_db(path: str) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    conn = connect(path)
    try:
        conn.executescript(SCHEMA)
        account_columns = {row["name"] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()}
        if "active" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
        if "plan_started_at" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN plan_started_at TEXT NOT NULL DEFAULT ''")
        if "plan_expires_at" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN plan_expires_at TEXT NOT NULL DEFAULT ''")
        if "profile_photo" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN profile_photo BLOB")
        if "profile_photo_mime" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN profile_photo_mime TEXT NOT NULL DEFAULT ''")
        if "profile_photo_updated_at" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN profile_photo_updated_at TEXT NOT NULL DEFAULT ''")
        payment_columns = {row["name"] for row in conn.execute("PRAGMA table_info(subscription_payments)").fetchall()}
        if payment_columns and "expires_at" not in payment_columns:
            conn.execute("ALTER TABLE subscription_payments ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''")
        if payment_columns and "discount_amount" not in payment_columns:
            conn.execute("ALTER TABLE subscription_payments ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0")
        if payment_columns and "campaign_discount" not in payment_columns:
            conn.execute("ALTER TABLE subscription_payments ADD COLUMN campaign_discount INTEGER NOT NULL DEFAULT 0")
        if payment_columns and "promo_code" not in payment_columns:
            conn.execute("ALTER TABLE subscription_payments ADD COLUMN promo_code TEXT NOT NULL DEFAULT ''")
        if payment_columns and "promo_id" not in payment_columns:
            conn.execute("ALTER TABLE subscription_payments ADD COLUMN promo_id TEXT NOT NULL DEFAULT ''")
        for paid in conn.execute("SELECT id FROM accounts WHERE plan IN ('lite', 'pro') AND plan_expires_at = ''").fetchall():
            started = now_iso()
            conn.execute(
                "UPDATE accounts SET plan_started_at = ?, plan_expires_at = ? WHERE id = ?",
                (started, add_calendar_month(started), paid["id"]),
            )
        job_columns = {row["name"] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "egress_proxy_id" not in job_columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN egress_proxy_id TEXT NOT NULL DEFAULT ''")
        key_columns = {row["name"] for row in conn.execute("PRAGMA table_info(gemini_keys)").fetchall()}
        if "last_used_at" not in key_columns:
            conn.execute("ALTER TABLE gemini_keys ADD COLUMN last_used_at REAL NOT NULL DEFAULT 0")
        # Migrate the earlier single-proxy setting without decrypting or exposing its secret.
        legacy = conn.execute("SELECT ciphertext, enabled FROM proxy_settings WHERE id = 1").fetchone()
        if legacy and conn.execute("SELECT 1 FROM proxy_endpoints LIMIT 1").fetchone() is None:
            conn.execute(
                "INSERT INTO proxy_endpoints (id, alias, ciphertext, enabled, priority, status, created_at) "
                "VALUES ('legacy-proxy', 'Proxy sebelumnya', ?, ?, 0, 'untested', ?)",
                (legacy["ciphertext"], legacy["enabled"], now_iso()),
            )
        backfill_payment_notifications(conn)
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210_000).hex()
    return f"pbkdf2-sha256$210000${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, _, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210_000).hex()
    return hmac.compare_digest(candidate, digest)


def today_key() -> str:
    return time.strftime("%Y-%m-%d")


def month_key() -> str:
    return today_key()[:7]


def check_monthly_render_quota(
    conn: sqlite3.Connection, account_id: str, monthly_limit: int, month: str | None = None
) -> tuple[bool, int]:
    usage_month = month or month_key()
    row = conn.execute(
        "SELECT render_count FROM usage_monthly WHERE account_id = ? AND month = ?",
        (account_id, usage_month),
    ).fetchone()
    used = int(row[0]) if row else 0
    return used < monthly_limit, used


def claim_monthly_render_quota(
    conn: sqlite3.Connection, account_id: str, monthly_limit: int, month: str | None = None
) -> tuple[bool, int]:
    """Atomically claim one Pro render slot for the current calendar month."""
    usage_month = month or month_key()
    conn.execute("BEGIN IMMEDIATE")
    try:
        allowed, used = check_monthly_render_quota(conn, account_id, monthly_limit, usage_month)
        if allowed:
            conn.execute(
                "INSERT INTO usage_monthly (account_id, month, render_count) VALUES (?, ?, 1) "
                "ON CONFLICT(account_id, month) DO UPDATE SET render_count = render_count + 1",
                (account_id, usage_month),
            )
        conn.commit()
        return allowed, used + (1 if allowed else 0)
    except Exception:
        conn.rollback()
        raise


def release_monthly_render_quota(conn: sqlite3.Connection, account_id: str, month: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE usage_monthly SET render_count = MAX(0, render_count - 1) "
            "WHERE account_id = ? AND month = ?",
            (account_id, month),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def check_quota(
    conn: sqlite3.Connection, account_id: str, kind: str, free_limit: int, day: str | None = None
) -> tuple[bool, int]:
    """(diizinkan, pemakaian_hari_ini). kind: 'analyze' | 'render'."""
    column = "analyze_count" if kind == "analyze" else "render_count"
    usage_day = day or today_key()
    row = conn.execute(
        f"SELECT {column} FROM usage_daily WHERE account_id = ? AND day = ?",
        (account_id, usage_day),
    ).fetchone()
    used = int(row[0]) if row else 0
    return used < free_limit, used


def record_usage(conn: sqlite3.Connection, account_id: str, kind: str, day: str | None = None) -> None:
    column = "analyze_count" if kind == "analyze" else "render_count"
    usage_day = day or today_key()
    conn.execute(
        "INSERT INTO usage_daily (account_id, day, analyze_count, render_count)"
        " VALUES (?, ?, 0, 0) ON CONFLICT(account_id, day) DO NOTHING",
        (account_id, usage_day),
    )
    conn.execute(
        f"UPDATE usage_daily SET {column} = {column} + 1 WHERE account_id = ? AND day = ?",
        (account_id, usage_day),
    )
    conn.commit()


def claim_quota(
    conn: sqlite3.Connection, account_id: str, kind: str, free_limit: int, day: str | None = None
) -> tuple[bool, int]:
    """Atomically claim one daily operation slot before expensive work starts."""
    if kind not in {"analyze", "render"}:
        raise ValueError(f"Jenis kuota tidak dikenal: {kind}")
    column = "analyze_count" if kind == "analyze" else "render_count"
    usage_day = day or today_key()
    conn.execute("BEGIN IMMEDIATE")
    try:
        allowed, used = check_quota(conn, account_id, kind, free_limit, usage_day)
        if allowed:
            conn.execute(
                "INSERT INTO usage_daily (account_id, day, analyze_count, render_count)"
                " VALUES (?, ?, 0, 0) ON CONFLICT(account_id, day) DO NOTHING",
                (account_id, usage_day),
            )
            conn.execute(
                f"UPDATE usage_daily SET {column} = {column} + 1 WHERE account_id = ? AND day = ?",
                (account_id, usage_day),
            )
        conn.commit()
        return allowed, used + (1 if allowed else 0)
    except Exception:
        conn.rollback()
        raise


def release_quota(conn: sqlite3.Connection, account_id: str, kind: str, day: str) -> None:
    """Release a previously claimed slot after its operation failed."""
    if kind not in {"analyze", "render"}:
        raise ValueError(f"Jenis kuota tidak dikenal: {kind}")
    column = "analyze_count" if kind == "analyze" else "render_count"
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            f"UPDATE usage_daily SET {column} = MAX(0, {column} - 1) WHERE account_id = ? AND day = ?",
            (account_id, day),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
