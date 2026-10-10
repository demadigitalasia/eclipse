"""Per-account YouTube cookie settings for the Studio source editor."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend import auth, db
from backend.config import SETTINGS
from backend.core.errors import error_envelope
from backend.secrets import encrypt_secret
from backend.youtube_cookies import normalize_cookies

router = APIRouter(prefix="/api/youtube-cookies", tags=["YouTube cookies"])


class SaveCookiesBody(BaseModel):
    content: str = Field(min_length=1, max_length=512_000)


@router.get("")
def get_status(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        row = conn.execute(
            "SELECT size_bytes, updated_at FROM youtube_cookies WHERE account_id = ?",
            (user["id"],),
        ).fetchone()
        return {
            "configured": row is not None,
            "sizeBytes": int(row["size_bytes"]) if row else 0,
            "updatedAt": row["updated_at"] if row else None,
        }
    finally:
        conn.close()


@router.put("")
def save_cookies(body: SaveCookiesBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    try:
        normalized, count = normalize_cookies(body.content)
    except ValueError as exc:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", str(exc)))

    ciphertext = encrypt_secret(normalized)
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute(
            "INSERT INTO youtube_cookies (account_id, ciphertext, size_bytes, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(account_id) DO UPDATE SET ciphertext=excluded.ciphertext, "
            "size_bytes=excluded.size_bytes, updated_at=excluded.updated_at",
            (user["id"], ciphertext, len(normalized.encode("utf-8")), db.now_iso()),
        )
        db.log_audit(conn, user["email"], "youtube-cookie-save", f"{count} cookies")
        return {"ok": True, "configured": True}
    finally:
        conn.close()


@router.delete("")
def delete_cookies(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("DELETE FROM youtube_cookies WHERE account_id = ?", (user["id"],))
        db.log_audit(conn, user["email"], "youtube-cookie-delete")
        return {"ok": True, "configured": False}
    finally:
        conn.close()
