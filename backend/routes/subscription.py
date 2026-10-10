"""Manual QRIS subscription orders and administrator payment review."""
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from backend import auth, db
from backend.config import SETTINGS, subscription_defaults
from backend.core.errors import error_envelope

router = APIRouter(prefix="/api")
MAX_PROOF_BYTES = 8 * 1024 * 1024
MAX_QR_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
ALLOWED_IMAGES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_QR_PATH = Path(__file__).resolve().parents[2] / "public" / "payment-qris.png"


class CreatePaymentBody(BaseModel):
    plan: Literal["lite", "pro"]


class ApplyPromoBody(BaseModel):
    code: str = Field(min_length=3, max_length=32)


class PaymentDecisionBody(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=500)


def _bad_request(message: str, status: int = 400):
    return JSONResponse(status_code=status, content=error_envelope("invalid_range", message))


async def _read_image(file: UploadFile, max_bytes: int) -> tuple[bytes, str] | JSONResponse:
    if file.content_type not in ALLOWED_IMAGES:
        return _bad_request("File harus berupa JPG, PNG, atau WebP.")
    data = await file.read(max_bytes + 1)
    if not data or len(data) > max_bytes:
        return _bad_request(f"Ukuran file maksimal {max_bytes // (1024 * 1024)} MB.")
    try:
        image = Image.open(BytesIO(data))
        width, height = image.size
        if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
            return _bad_request("Resolusi gambar terlalu besar.")
        image.verify()
        mime = Image.MIME.get(image.format or "")
        if mime not in ALLOWED_IMAGES:
            return _bad_request("Format gambar tidak didukung.")
        return data, mime
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        return _bad_request("File bukan gambar yang valid.")


@router.post("/subscription/payments")
def create_payment(body: CreatePaymentBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    if user.get("role") == "admin":
        return _bad_request("Akun Hub Admin tidak perlu berlangganan.", 403)
    conn = db.get_conn(SETTINGS.db_path)
    try:
        settings = db.get_subscription_settings(conn, subscription_defaults())
        price_key = "liteMonthlyPriceIdr" if body.plan == "lite" else "proMonthlyPriceIdr"
        price = settings[price_key]
        if price <= 0:
            return _bad_request("Paket ini belum memiliki harga pembayaran yang valid.")
        discount = db.campaign_discount(settings, body.plan, price)
        try:
            payment = db.create_subscription_payment(conn, user["id"], body.plan, price, discount)
        except ValueError as exc:
            if str(exc) == "payment_exists":
                return _bad_request("Masih ada pembayaran yang belum selesai. Selesaikan atau batalkan pesanan sebelumnya terlebih dahulu.", 409)
            if str(exc) == "payment_codes_full":
                return _bad_request("Kode pembayaran sedang penuh. Coba lagi beberapa saat.", 503)
            raise
        db.log_audit(conn, user["email"], "buat-pesanan-subscription", f"{payment['id']} {body.plan} discount={payment['discount_amount']} total={payment['total_amount']}")
        return {"payment": payment}
    finally:
        conn.close()


@router.post("/subscription/payments/{payment_id}/promo")
def apply_payment_promo(payment_id: str, body: ApplyPromoBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.expire_unpaid_subscription_payments(conn)
        try:
            payment = db.apply_subscription_promo(conn, payment_id, user["id"], body.code)
        except ValueError as exc:
            messages = {
                "payment_unavailable": ("Pesanan tidak lagi menunggu pembayaran.", 409),
                "promo_invalid": ("Kode promo tidak valid atau sedang dinonaktifkan.", 400),
                "promo_plan_mismatch": ("Kode promo tidak berlaku untuk paket ini.", 400),
                "promo_inactive": ("Kode promo belum aktif atau sudah kedaluwarsa.", 400),
                "promo_limit_reached": ("Kuota penggunaan kode promo sudah habis.", 400),
                "promo_already_used": ("Kode promo ini sudah pernah digunakan di akun Anda.", 400),
            }
            message, status = messages.get(str(exc), ("Kode promo tidak dapat diterapkan.", 400))
            return _bad_request(message, status)
        return {"payment": payment}
    finally:
        conn.close()


@router.delete("/subscription/payments/{payment_id}/promo")
def remove_payment_promo(payment_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        try:
            payment = db.clear_subscription_promo(conn, payment_id, user["id"])
        except ValueError:
            return _bad_request("Pesanan tidak lagi menunggu pembayaran.", 409)
        return {"payment": payment}
    finally:
        conn.close()


@router.get("/subscription/payments")
def my_subscription_payments(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return {"payments": db.list_subscription_payments(conn, user["id"], limit=20)}
    finally:
        conn.close()


@router.post("/subscription/payments/{payment_id}/proof")
async def submit_payment_proof(payment_id: str, file: UploadFile = File(...), user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    uploaded = await _read_image(file, MAX_PROOF_BYTES)
    if isinstance(uploaded, JSONResponse):
        return uploaded
    data, mime = uploaded
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.expire_unpaid_subscription_payments(conn)
        payment = db.get_subscription_payment(conn, payment_id)
        if not payment or payment["account_id"] != user["id"]:
            return _bad_request("Pesanan pembayaran tidak ditemukan.", 404)
        if payment["status"] != "awaiting_payment":
            return _bad_request("Bukti hanya dapat dikirim untuk pesanan yang menunggu pembayaran.", 409)
        db.save_payment_proof(conn, payment_id, data, mime, file.filename or "bukti-pembayaran")
        db.log_audit(conn, user["email"], "kirim-bukti-subscription", payment_id)
        updated = db.get_subscription_payment(conn, payment_id)
        summary = db.payment_summary(conn.execute("SELECT * FROM subscription_payments WHERE id = ?", (payment_id,)).fetchone()) if updated else None
        return {"payment": summary}
    finally:
        conn.close()


@router.post("/subscription/payments/{payment_id}/cancel")
def cancel_payment(payment_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.expire_unpaid_subscription_payments(conn)
        payment = db.get_subscription_payment(conn, payment_id)
        if not payment or payment["account_id"] != user["id"]:
            return _bad_request("Pesanan pembayaran tidak ditemukan.", 404)
        if payment["status"] != "awaiting_payment":
            return _bad_request("Pesanan yang sudah dikirim untuk ditinjau tidak dapat dibatalkan dari sini.", 409)
        db.cancel_subscription_payment(conn, payment_id)
        db.log_audit(conn, user["email"], "batalkan-pesanan-subscription", payment_id)
        return {"ok": True}
    finally:
        conn.close()


@router.get("/subscription/payment-qr")
def get_payment_qr():
    conn = db.get_conn(SETTINGS.db_path)
    try:
        qr = db.get_subscription_payment_qr(conn)
    finally:
        conn.close()
    if qr:
        return Response(content=qr["data"], media_type=qr["mime"], headers={"Cache-Control": "no-store"})
    if DEFAULT_QR_PATH.is_file():
        return FileResponse(DEFAULT_QR_PATH, media_type="image/png", headers={"Cache-Control": "no-store"})
    return JSONResponse(status_code=404, content=error_envelope("unknown", "QRIS pembayaran belum diatur oleh Hub Admin."))


@router.get("/admin/subscription-payments")
def admin_list_subscription_payments(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return {"payments": db.list_subscription_payments(conn, limit=200)}
    finally:
        conn.close()


@router.get("/admin/subscription-payments/{payment_id}/proof")
def admin_subscription_payment_proof(payment_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        payment = db.get_subscription_payment(conn, payment_id)
        if not payment or not payment.get("proof"):
            return _bad_request("Bukti pembayaran tidak ditemukan.", 404)
        return Response(
            content=payment["proof"], media_type=payment["proof_mime"],
            headers={"Cache-Control": "no-store", "Content-Disposition": "inline"},
        )
    finally:
        conn.close()


@router.post("/admin/subscription-payments/{payment_id}/decision")
def admin_decide_subscription_payment(payment_id: str, body: PaymentDecisionBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        settings = db.get_subscription_settings(conn, subscription_defaults())
        payment = db.decide_subscription_payment(
            conn, payment_id, body.decision, user["email"], body.note,
            term_months=settings["liteTermMonths"] if (db.get_subscription_payment(conn, payment_id) or {}).get("plan") == "lite" else settings["proTermMonths"],
        )
        if payment is None:
            return _bad_request("Pembayaran tidak ada atau sudah diputuskan sebelumnya.", 409)
        return {"payment": payment}
    finally:
        conn.close()


@router.post("/admin/subscription-payment-qr")
async def admin_upload_subscription_qr(file: UploadFile = File(...), user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    uploaded = await _read_image(file, MAX_QR_BYTES)
    if isinstance(uploaded, JSONResponse):
        return uploaded
    data, mime = uploaded
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.save_subscription_payment_qr(conn, data, mime, file.filename or "qris")
        db.log_audit(conn, user["email"], "ubah-qr-pembayaran-subscription", file.filename or "qris")
        return {"ok": True, "updatedAt": db.now_iso()}
    finally:
        conn.close()
