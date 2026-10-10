"""Authentication and account routes."""
from io import BytesIO
from typing import Optional
import warnings

from fastapi import APIRouter, Cookie, Depends, File, Header, Response, UploadFile
from fastapi.responses import JSONResponse, Response as RawResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from backend import auth, db
from backend.config import SETTINGS, subscription_defaults
from backend.core import limits
from backend.core.errors import error_envelope, http_status_for

router = APIRouter(prefix="/api")

# ---------- auth server (B1) ----------

@router.get("/auth/registration-status")
def api_registration_status():
    """Expose only whether public account registration is enabled."""
    return {"enabled": SETTINGS.allow_registration}


@router.get("/auth/reset-status")
def api_reset_status():
    """Expose whether the password-reset delivery channel is configured."""
    return {"enabled": bool(SETTINGS.reset_smtp_host and SETTINGS.reset_smtp_from)}


@router.post("/auth/register")
def api_register(body: auth.RegisterBody, response: Response):
    if not SETTINGS.allow_registration:
        return JSONResponse(status_code=403, content=error_envelope(
            "invalid_range", "Pendaftaran akun baru sedang dinonaktifkan.",
        ))
    payload, err = auth.register_account(body.name, body.email, body.password)
    if err:
        return JSONResponse(status_code=http_status_for(err["error"]["code"]), content=err)
    token = payload.pop("token")
    response.set_cookie("eclipse_session", token, max_age=7 * 24 * 3600,
                        httponly=True, secure=SETTINGS.cookie_secure, samesite="lax", path="/api")
    return payload


@router.post("/auth/login")
def api_login(body: auth.LoginBody, response: Response):
    payload, err = auth.login_account(body.email, body.password)
    if err:
        return JSONResponse(status_code=http_status_for(err["error"]["code"]), content=err)
    token = payload.pop("token")
    response.set_cookie("eclipse_session", token, max_age=7 * 24 * 3600,
                        httponly=True, secure=SETTINGS.cookie_secure, samesite="lax", path="/api")
    return payload


@router.post("/auth/logout")
def api_logout(response: Response, authorization: Optional[str] = Header(default=None),
               eclipse_session: Optional[str] = Cookie(default=None)):
    auth.logout_token(authorization or (f"Bearer {eclipse_session}" if eclipse_session else None))
    response.delete_cookie("eclipse_session", path="/api", httponly=True,
                           secure=SETTINGS.cookie_secure, samesite="lax")
    return {"ok": True}


@router.get("/auth/me")
def api_me(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    unlimited = user.get("role") == "admin"
    plan = user.get("plan", "free")
    paid_plan = plan in {"lite", "pro"} and not unlimited
    conn = db.get_conn(SETTINGS.db_path)
    try:
        plan_settings = db.get_subscription_settings(conn, subscription_defaults())
        render_limit = plan_settings["freeDailyRender"]
        if plan == "lite":
            render_limit = plan_settings["liteDailyRender"]
        elif plan == "pro":
            render_limit = plan_settings["proDailyRender"]
        expires_at = user.get("plan_expires_at") if paid_plan else (
            db.free_trial_expires_at(user["created_at"], plan_settings["freeRenderTrialDays"])
            if plan == "free" and not unlimited else None
        )
        trial_active = bool(db.is_before_expiry(expires_at)) if expires_at else False
        allowed_a, used_a = db.check_quota(conn, user["id"], "analyze", plan_settings["freeDailyAnalyze"])
        allowed_r, used_r = db.check_quota(conn, user["id"], "render", render_limit)
    finally:
        conn.close()
    render_active = unlimited or (trial_active if plan == "free" else db.is_before_expiry(expires_at) if paid_plan else False)
    monthly_price = plan_settings["liteMonthlyPriceIdr"] if plan == "lite" else plan_settings["proMonthlyPriceIdr"]
    return {
        "user": db.public_account(user),
        "quota": {
            "analyze": {"used": used_a, "limit": plan_settings["freeDailyAnalyze"], "allowed": allowed_a or unlimited, "unlimited": unlimited, "period": "day"},
            "render": {
                "used": used_r,
                "limit": render_limit,
                "allowed": (allowed_r and render_active) or unlimited,
                "unlimited": unlimited,
                "period": "day",
                "price_idr_monthly": monthly_price if paid_plan else None,
                "expires_at": expires_at,
                "upgrade_required": not render_active and not unlimited,
            },
        },
    }


@router.get("/auth/me/avatar")
def api_get_profile_photo(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        photo = db.get_profile_photo(conn, user["id"])
    finally:
        conn.close()
    if not photo:
        return JSONResponse(status_code=404, content=error_envelope("unknown", "Foto profil belum diunggah."))
    return RawResponse(
        content=photo["data"],
        media_type=photo["mime"],
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/auth/me/avatar")
async def api_upload_profile_photo(file: UploadFile = File(...), user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    max_bytes = 8 * 1024 * 1024
    raw = await file.read(max_bytes + 1)
    await file.close()
    if not raw or len(raw) > max_bytes:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Ukuran foto harus di bawah 8 MB."))
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("Format tidak didukung.")
                if source.width < 64 or source.height < 64 or source.width * source.height > 16_000_000:
                    raise ValueError("Dimensi foto tidak valid atau terlalu besar.")
                source.load()
                image = ImageOps.exif_transpose(source)
                mode = "RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB"
                image = ImageOps.fit(image.convert(mode), (512, 512), method=Image.Resampling.LANCZOS)
                output = BytesIO()
                image.save(output, format="WEBP", quality=88, method=6)
                photo_bytes = output.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning, OSError, ValueError) as exc:
        detail = str(exc) if isinstance(exc, ValueError) else "File bukan gambar yang valid."
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", detail))

    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.set_profile_photo(conn, user["id"], photo_bytes, "image/webp")
        updated = db.find_account_by_id(conn, user["id"])
        db.log_audit(conn, user["email"], "ubah-foto-profil", "format=webp; ukuran=%d" % len(photo_bytes))
        return {"user": db.public_account(updated) if updated else None}
    finally:
        conn.close()


@router.patch("/auth/me")
def api_update_me(body: dict, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    name = str(body.get("name", "")).strip()
    if not name or len(name) > 120:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Nama wajib diisi (maks 120 karakter)."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("UPDATE accounts SET name = ? WHERE id = ?", (name, user["id"]))
        conn.commit()
        db.log_audit(conn, user["email"], "ubah-profil", "nama")
        return {"user": db.public_account(db.find_account_by_id(conn, user["id"]))}
    finally:
        conn.close()


@router.post("/auth/reset-request")
def api_reset_request(body: auth.ResetRequestBody):
    auth.request_reset(body.email)
    return {"ok": True}


@router.post("/auth/reset-confirm")
def api_reset_confirm(body: auth.ResetConfirmBody):
    err = auth.confirm_reset(body.email, body.code, body.password)
    if err:
        return JSONResponse(status_code=http_status_for(err["error"]["code"]), content=err)
    return {"ok": True}
