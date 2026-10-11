"""Autentikasi server MVP (B1): sesi token, RBAC, reset sekali pakai.

- Password: PBKDF2-SHA256 (`db.hash_password`), tidak pernah teks biasa.
- Sesi: token acak 256-bit, yang disimpan hanya hash SHA-256 + expiry 7 hari.
- Pendaftaran publik selalu membuat akun user; admin dibuat lewat bootstrap CLI.
- Reset: kode 6 digit, hash saja yang disimpan, TTL 15 menit, sekali pakai.
  Kode mentah HANYA di log server — tidak pernah di response produksi.
"""
from typing import Optional
from email.message import EmailMessage
import smtplib
import ssl

from fastapi import Cookie, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend import db
from backend.config import SETTINGS, logger
from backend.core.errors import error_envelope


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=6, max_length=200)


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class ResetRequestBody(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ResetConfirmBody(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=6, max_length=200)


class RoleBody(BaseModel):
    role: Optional[str] = Field(default=None, pattern="^(admin|user)$")
    active: Optional[bool] = None
    plan: Optional[str] = Field(default=None, pattern="^(free|lite|pro)$")
    renew: bool = False


class GoogleLoginBody(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)


# Accounts created through Google Sign-In carry no usable password. A sentinel
# without the ``$`` separator makes ``db.verify_password`` always reject it, so
# password login stays impossible until the user performs a reset.
GOOGLE_PASSWORD_SENTINEL = "!google-oauth"


def _unauthorized() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content=error_envelope("invalid_url", "Sesi tidak valid atau kedaluwarsa.", hint="Masuk kembali."),
    )


def _forbidden() -> JSONResponse:
    return JSONResponse(
        status_code=403,
        content=error_envelope("invalid_url", "Butuh peran admin.", hint="Hubungi administrator."),
    )


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    eclipse_session: Optional[str] = Cookie(default=None),
):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    else:
        token = eclipse_session or ""
    if not token:
        return None
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return db.get_session_account(conn, token)
    finally:
        conn.close()


def _bearer_token(authorization: Optional[str]) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return ""


def issue_session(account_id: str) -> tuple[str, int]:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return db.create_session(conn, account_id)
    finally:
        conn.close()


def session_payload(account: dict, token: str, expires_at: int) -> dict:
    return {"user": db.public_account(account), "token": token, "expires_at": expires_at}


def register_account(name: str, email: str, password: str):
    conn = db.get_conn(SETTINGS.db_path)
    try:
        # Serialize account creation to keep duplicate-email checks atomic.
        conn.execute("BEGIN IMMEDIATE")
        if db.find_account_by_email(conn, email):
            conn.rollback()
            return None, error_envelope("invalid_url", "Email sudah terdaftar.", hint="Masuk atau reset sandi.")
        # Public registration must never grant administrator privileges.
        account = db.create_account(conn, name, email, db.hash_password(password), "user")
        db.log_audit(conn, account["email"], "daftar", "role=user")
        token, exp = db.create_session(conn, account["id"])
        return session_payload(account, token, exp), None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def login_account(email: str, password: str):
    conn = db.get_conn(SETTINGS.db_path)
    try:
        account = db.find_account_by_email(conn, email)
        if not account or not db.verify_password(password, account["password_hash"]):
            return None, error_envelope("invalid_url", "Email atau sandi salah.")
        if not account.get("active", 1):
            return None, error_envelope("invalid_url", "Akun dinonaktifkan. Hubungi administrator.")
        token, exp = db.create_session(conn, account["id"])
        db.log_audit(conn, account["email"], "masuk", "")
        return session_payload(account, token, exp), None
    finally:
        conn.close()


def login_with_google(credential: str):
    """Verify a Google ID token and start a session, linking or creating an account."""
    if not SETTINGS.google_client_id:
        return None, error_envelope("invalid_range", "Login Google belum dikonfigurasi.")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        claims = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), SETTINGS.google_client_id,
        )
    except Exception:
        logger.warning("Verifikasi token Google gagal", exc_info=True)
        return None, error_envelope("invalid_url", "Token Google tidak valid atau kedaluwarsa.", hint="Coba masuk lagi.")
    if not claims.get("email_verified"):
        return None, error_envelope("invalid_url", "Email Google belum terverifikasi.")
    email = str(claims.get("email") or "").strip().lower()
    google_sub = str(claims.get("sub") or "").strip()
    if not email or not google_sub:
        return None, error_envelope("invalid_url", "Data akun Google tidak lengkap.")
    name = str(claims.get("name") or "").strip() or email.split("@", 1)[0]
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        account = db.find_account_by_google_sub(conn, google_sub)
        created = False
        if not account:
            account = db.find_account_by_email(conn, email)
            if account:
                linked_sub = str(account.get("google_sub") or "").strip()
                if linked_sub and linked_sub != google_sub:
                    # Never overwrite an existing Google identity for this email.
                    conn.rollback()
                    return None, error_envelope(
                        "invalid_url", "Email ini sudah tertaut ke akun Google lain.",
                        hint="Gunakan akun Google yang sesuai atau masuk dengan sandi.",
                    )
                # Google has verified this email, so attach the identity to the existing account.
                if linked_sub != google_sub:
                    db.set_google_sub(conn, account["id"], google_sub)
                account = db.find_account_by_id(conn, account["id"])
            else:
                account = db.create_account(conn, name, email, GOOGLE_PASSWORD_SENTINEL, "user", google_sub=google_sub)
                created = True
        if not account or not account.get("active", 1):
            conn.rollback()
            return None, error_envelope("invalid_url", "Akun dinonaktifkan. Hubungi administrator.")
        token, exp = db.create_session(conn, account["id"])
        db.log_audit(conn, account["email"], "daftar-google" if created else "masuk-google", "google")
        return session_payload(account, token, exp), None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def logout_token(authorization: Optional[str]) -> None:
    token = _bearer_token(authorization)
    if not token:
        return
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.revoke_session(conn, token)
    finally:
        conn.close()


def request_reset(email: str) -> None:
    """Deliver a reset code without disclosing whether the account exists."""
    conn = db.get_conn(SETTINGS.db_path)
    try:
        account = db.find_account_by_email(conn, email)
        if not account:
            return
        _, code = db.create_reset_code(conn, account["id"])
        db.log_audit(conn, account["email"], "minta-reset", "")
    finally:
        conn.close()
    if SETTINGS.reset_smtp_host and SETTINGS.reset_smtp_from:
        message = EmailMessage()
        message["Subject"] = "Kode reset sandi ECLIPSE"
        message["From"] = SETTINGS.reset_smtp_from
        message["To"] = account["email"]
        message.set_content(
            f"Kode reset sandi ECLIPSE Anda: {code}\n\n"
            "Kode berlaku selama 15 menit dan hanya dapat digunakan sekali. "
            "Jika Anda tidak meminta reset, abaikan email ini."
        )
        try:
            with smtplib.SMTP(SETTINGS.reset_smtp_host, SETTINGS.reset_smtp_port, timeout=10) as smtp:
                if SETTINGS.reset_smtp_starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if SETTINGS.reset_smtp_username:
                    smtp.login(SETTINGS.reset_smtp_username, SETTINGS.reset_smtp_password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException):
            logger.exception("Pengiriman email reset sandi gagal")
    elif SETTINGS.reset_code_logging:
        logger.warning("DEV ONLY reset code for %s: %s (15 minute TTL)", account["email"], code)
    else:
        logger.warning("Password reset requested, but SMTP delivery is not configured")


def confirm_reset(email: str, code: str, password: str):
    conn = db.get_conn(SETTINGS.db_path)
    try:
        account = db.find_account_by_email(conn, email)
        if not account:
            return error_envelope("invalid_url", "Email tidak terdaftar.")
        reason = db.consume_reset_code(conn, account["id"], code)
        if reason:
            return error_envelope("invalid_url", reason, hint="Minta kode baru bila kedaluwarsa.")
        db.set_password(conn, account["id"], db.hash_password(password))
        db.log_audit(conn, account["email"], "reset-sandi", "")
        return None
    finally:
        conn.close()


def depends_user(
    authorization: Optional[str] = Header(default=None),
    eclipse_session: Optional[str] = Cookie(default=None),
):
    user = get_current_user(authorization, eclipse_session)
    if not user:
        return _unauthorized()
    return user


def depends_admin(user=Depends(depends_user)):
    from fastapi.responses import JSONResponse as _JR

    if isinstance(user, _JR):
        return user
    if user.get("role") != "admin":
        return _forbidden()
    return user
