"""Administrator routes."""
import shutil
import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend import auth, db, gemini, media, storage
from backend.config import SETTINGS, subscription_defaults
from backend.core.errors import error_envelope
from backend.secrets import decrypt_secret, encrypt_secret
from backend.schemas import GeminiKeyCreate, GeminiKeyUpdate
from backend.utils.egress import get_egress_ip
from backend.utils.proxy import (
    add_entry as add_proxy_entry,
    delete_entry as delete_proxy_entry,
    get_endpoint_url,
    list_entries as list_proxy_entries,
    proxy_origin,
    report_result as report_proxy_result,
    update_entry as update_proxy_entry,
    validate_proxy_url,
)

router = APIRouter(prefix="/api")


def _valid_local_window(starts_at: str, ends_at: str) -> bool:
    try:
        start = datetime.fromisoformat(starts_at) if starts_at else None
        end = datetime.fromisoformat(ends_at) if ends_at else None
    except ValueError:
        return False
    return not (start and end and start >= end)


class ProxySettingsBody(BaseModel):
    enabled: bool
    proxy_url: str | None = Field(default=None, alias="proxyUrl", max_length=2048)

    model_config = {"populate_by_name": True}


class ProxyCreateBody(BaseModel):
    alias: str = Field(min_length=1, max_length=100)
    proxy_url: str = Field(alias="proxyUrl", min_length=8, max_length=2048)
    model_config = {"populate_by_name": True}


class ProxyUpdateBody(BaseModel):
    enabled: bool | None = None
    priority: int | None = Field(default=None, ge=0, le=10000)


class SubscriptionSettingsBody(BaseModel):
    freeDailyAnalyze: int = Field(ge=0, le=10000)
    freeDailyRender: int = Field(ge=0, le=10000)
    freeRenderTrialDays: int = Field(ge=1, le=365)
    liteDailyRender: int = Field(ge=0, le=10000)
    liteMonthlyPriceIdr: int = Field(ge=0, le=1000000000)
    liteTermMonths: int = Field(ge=1, le=24)
    liteDiscountPercent: int = Field(default=0, ge=0, le=90)
    liteDiscountStart: str = Field(default="", max_length=16)
    liteDiscountEnd: str = Field(default="", max_length=16)
    proDailyRender: int = Field(ge=0, le=10000)
    proMonthlyPriceIdr: int = Field(ge=0, le=1000000000)
    proTermMonths: int = Field(ge=1, le=24)
    proDiscountPercent: int = Field(default=0, ge=0, le=90)
    proDiscountStart: str = Field(default="", max_length=16)
    proDiscountEnd: str = Field(default="", max_length=16)


class SubscriptionPromoBody(BaseModel):
    code: str = Field(min_length=3, max_length=32)
    appliesTo: str = Field(default="all")
    discountType: str = Field(default="percent")
    discountValue: int = Field(ge=1, le=1000000000)
    startsAt: str = Field(default="", max_length=16)
    endsAt: str = Field(default="", max_length=16)
    maxUses: int = Field(default=0, ge=0, le=1000000)

    model_config = {"populate_by_name": True}


class SubscriptionPromoActiveBody(BaseModel):
    active: bool

# ---------- admin (B1, RBAC server-side) ----------

@router.get("/admin/subscription-settings")
def admin_get_subscription_settings(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return {"settings": db.get_subscription_settings(conn, subscription_defaults())}
    finally:
        conn.close()


@router.put("/admin/subscription-settings")
def admin_save_subscription_settings(body: SubscriptionSettingsBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    values = body.model_dump()
    for plan in ("lite", "pro"):
        percent = values[f"{plan}DiscountPercent"]
        start, end = values[f"{plan}DiscountStart"], values[f"{plan}DiscountEnd"]
        if percent and (not start or not end):
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", f"Jadwal diskon {plan.upper()} harus memiliki tanggal mulai dan akhir."))
        if not _valid_local_window(start, end):
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", f"Jadwal diskon {plan.upper()} tidak valid."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.save_subscription_settings(conn, values)
        db.log_audit(conn, user["email"], "ubah-pengaturan-subscription", str(values))
        return {"settings": values}
    finally:
        conn.close()


@router.get("/admin/subscription-promos")
def admin_list_subscription_promos(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return {"promos": db.list_subscription_promos(conn)}
    finally:
        conn.close()


@router.post("/admin/subscription-promos")
def admin_create_subscription_promo(body: SubscriptionPromoBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    code = body.code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{2,31}", code):
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Kode promo hanya boleh berisi huruf, angka, tanda minus, atau garis bawah."))
    if body.appliesTo not in {"all", "lite", "pro"} or body.discountType not in {"percent", "fixed"}:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Jenis promo tidak valid."))
    if body.discountType == "percent" and body.discountValue > 100:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Diskon persentase maksimal 100%."))
    if not _valid_local_window(body.startsAt, body.endsAt):
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Jadwal promo tidak valid."))
    values = body.model_dump()
    values["code"] = code
    conn = db.get_conn(SETTINGS.db_path)
    try:
        try:
            promo = db.create_subscription_promo(conn, values, user["email"])
        except Exception as exc:
            if "UNIQUE constraint failed" in str(exc):
                return JSONResponse(status_code=409, content=error_envelope("invalid_range", "Kode promo sudah digunakan."))
            raise
        db.log_audit(conn, user["email"], "buat-kode-promo-subscription", f"{code} {body.appliesTo} {body.discountType}={body.discountValue}")
        return {"promo": promo}
    finally:
        conn.close()


@router.patch("/admin/subscription-promos/{promo_id}")
def admin_set_subscription_promo_active(promo_id: str, body: SubscriptionPromoActiveBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        if not db.update_subscription_promo_active(conn, promo_id, body.active):
            return JSONResponse(status_code=404, content=error_envelope("unknown", "Kode promo tidak ditemukan."))
        db.log_audit(conn, user["email"], "ubah-status-kode-promo", f"{promo_id} active={body.active}")
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/admin/subscription-promos/{promo_id}")
def admin_delete_subscription_promo(promo_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        if not db.delete_subscription_promo(conn, promo_id):
            return JSONResponse(status_code=404, content=error_envelope("unknown", "Kode promo tidak ditemukan."))
        db.log_audit(conn, user["email"], "hapus-kode-promo-subscription", promo_id)
        return {"ok": True}
    finally:
        conn.close()

@router.get("/admin/users")
def admin_list_users(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return {"users": db.list_accounts(conn)}
    finally:
        conn.close()


@router.get("/admin/audit")
def admin_list_audit(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return {"audit": db.list_audit(conn)}
    finally:
        conn.close()


@router.get("/admin/gemini-usage")
def admin_gemini_usage(days: int = Query(default=30, ge=1, le=365), user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    summary = db.summarize_gemini_usage(SETTINGS.db_path, days)
    return summary


@router.delete("/admin/audit")
def admin_clear_audit(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("DELETE FROM audit")
        conn.commit()
        db.log_audit(conn, user["email"], "bersihkan-audit", "")
        return {"ok": True}
    finally:
        conn.close()


@router.get("/admin/gemini-keys")
def admin_list_gemini_keys(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    return {"keys": gemini.list_entries()}


@router.get("/admin/proxies")
def admin_list_proxies(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    env_url = os.environ.get("ECLIPSE_EGRESS_PROXY", "").strip()
    proxies = list_proxy_entries()
    return {
        "proxies": proxies,
        "environmentFallback": proxy_origin(env_url) if env_url else None,
        "environmentFallbackActive": not proxies and bool(env_url),
    }


@router.post("/admin/proxies")
def admin_add_proxy(body: ProxyCreateBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    try:
        entry = add_proxy_entry(body.alias, body.proxy_url)
    except ValueError as exc:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", str(exc)))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "proxy-endpoint-add", entry["alias"])
    finally:
        conn.close()
    return {"proxy": entry}


@router.patch("/admin/proxies/{endpoint_id}")
def admin_update_proxy(endpoint_id: str, body: ProxyUpdateBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    if body.enabled is None and body.priority is None:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Tidak ada perubahan proxy."))
    if not update_proxy_entry(endpoint_id, body.enabled, body.priority):
        return JSONResponse(status_code=404, content=error_envelope("unknown", "Proxy tidak ditemukan."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "proxy-endpoint-update", f"id={endpoint_id}; enabled={body.enabled}")
    finally:
        conn.close()
    return {"proxies": list_proxy_entries()}


@router.delete("/admin/proxies/{endpoint_id}")
def admin_delete_proxy(endpoint_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    if not delete_proxy_entry(endpoint_id):
        return JSONResponse(status_code=404, content=error_envelope("unknown", "Proxy tidak ditemukan."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "proxy-endpoint-delete", f"id={endpoint_id}")
    finally:
        conn.close()
    return {"ok": True, "proxies": list_proxy_entries()}


@router.post("/admin/proxies/{endpoint_id}/test")
def admin_test_proxy_endpoint(endpoint_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    try:
        url = get_endpoint_url(endpoint_id)
    except ValueError as exc:
        return JSONResponse(status_code=404, content=error_envelope("unknown", str(exc)))
    ip = get_egress_ip(url, timeout=8.0, force=True)
    report_proxy_result(endpoint_id, bool(ip))
    if not ip:
        return JSONResponse(status_code=422, content={"ok": False, "message": "Pemeriksaan egress gagal. Periksa URL, kredensial, dan koneksi proxy."})
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "proxy-endpoint-test", f"id={endpoint_id}; ip={ip}")
    finally:
        conn.close()
    return {"ok": True, "egressIp": ip, "endpoint": proxy_origin(url), "proxies": list_proxy_entries()}


def _proxy_settings_payload() -> dict:
    proxies = list_proxy_entries()
    enabled = [entry for entry in proxies if entry["enabled"]]
    env_url = os.environ.get("ECLIPSE_EGRESS_PROXY", "").strip()
    url = enabled[0]["endpoint"] if len(enabled) == 1 else (proxy_origin(env_url) if not proxies and env_url else None)
    source = "admin" if proxies else ("environment" if env_url else "none")
    return {
        "configured": bool(proxies or env_url),
        "enabled": bool(enabled) if proxies else bool(env_url),
        "source": source,
        "endpoint": proxy_origin(url),
        "poolCount": len(proxies),
        "note": "Gunakan panel pool untuk mengelola atau menguji endpoint satu per satu." if len(enabled) > 1 else None,
    }


@router.get("/admin/proxy")
def admin_get_proxy(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    return _proxy_settings_payload()


@router.put("/admin/proxy")
def admin_save_proxy(body: ProxySettingsBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        current = conn.execute("SELECT ciphertext FROM proxy_endpoints WHERE id = 'legacy-proxy'").fetchone()
        if body.proxy_url is not None and body.proxy_url.strip():
            try:
                proxy_url = validate_proxy_url(body.proxy_url)
            except ValueError as exc:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", str(exc)))
        elif current:
            proxy_url = decrypt_secret(current["ciphertext"])
        else:
            env_url = os.environ.get("ECLIPSE_EGRESS_PROXY", "").strip()
            if body.enabled and not env_url:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Masukkan URL proxy sebelum mengaktifkannya."))
            try:
                proxy_url = validate_proxy_url(env_url) if env_url else ""
            except ValueError as exc:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", str(exc)))

        if body.enabled and not proxy_url:
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Masukkan URL proxy sebelum mengaktifkannya."))
        if proxy_url:
            duplicate = conn.execute("SELECT ciphertext FROM proxy_endpoints WHERE id != 'legacy-proxy'").fetchall()
            if any(decrypt_secret(row["ciphertext"]) == proxy_url for row in duplicate):
                return JSONResponse(status_code=409, content=error_envelope("invalid_range", "Proxy tersebut sudah ada di pool. Kelola endpoint dari panel pool."))
            conn.execute(
                "INSERT INTO proxy_endpoints (id, alias, ciphertext, enabled, priority, status, created_at) "
                "VALUES ('legacy-proxy', 'Proxy sebelumnya', ?, ?, 0, 'untested', ?) "
                "ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext, enabled=excluded.enabled, status='untested', cooldown_until=0",
                (encrypt_secret(proxy_url), int(body.enabled), db.now_iso()),
            )
        else:
            conn.execute("DELETE FROM proxy_endpoints WHERE id = 'legacy-proxy'")
        conn.execute("DELETE FROM proxy_settings WHERE id = 1")
        db.log_audit(conn, user["email"], "proxy-settings-update", f"enabled={str(body.enabled).lower()}")
        conn.commit()
    finally:
        conn.close()
    return _proxy_settings_payload()


@router.delete("/admin/proxy")
def admin_clear_proxy_override(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("DELETE FROM proxy_settings WHERE id = 1")
        conn.execute("DELETE FROM proxy_endpoints WHERE id = 'legacy-proxy'")
        conn.execute("DELETE FROM proxy_affinity WHERE proxy_id = 'legacy-proxy'")
        db.log_audit(conn, user["email"], "proxy-settings-clear", "override admin dihapus")
        conn.commit()
    finally:
        conn.close()
    return _proxy_settings_payload()


@router.post("/admin/proxy/test")
def admin_test_proxy(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    proxies = [entry for entry in list_proxy_entries() if entry["enabled"]]
    if len(proxies) > 1:
        return JSONResponse(status_code=409, content=error_envelope("invalid_range", "Pilih Uji egress pada proxy tertentu dari panel pool."))
    endpoint_id = proxies[0]["id"] if proxies else None
    try:
        url = get_endpoint_url(endpoint_id) if endpoint_id else (os.environ.get("ECLIPSE_EGRESS_PROXY", "").strip() or None)
        ip = get_egress_ip(url, force=True, timeout=8.0)
    except Exception:
        ip = None
        url = None
    if not ip:
        if endpoint_id:
            report_proxy_result(endpoint_id, False)
        return JSONResponse(
            status_code=422,
            content={"ok": False, "message": "Pemeriksaan egress gagal. Periksa URL, kredensial, dan koneksi proxy."},
        )
    if endpoint_id:
        report_proxy_result(endpoint_id, True)
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "proxy-egress-test", f"mode={'proxy' if url else 'direct'}; ip={ip}")
    finally:
        conn.close()
    return {"ok": True, "mode": "proxy" if url else "direct", "egressIp": ip, "endpoint": proxy_origin(url)}


@router.post("/admin/gemini-keys")
def admin_add_gemini_key(body: GeminiKeyCreate, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    try:
        entry = gemini.add_entry(body.alias, body.project, body.apiKey)
    except ValueError as exc:
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", str(exc)))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "gemini-key-add", f"{entry['alias']}:{entry['project']}")
    finally:
        conn.close()
    return {"key": entry}


@router.patch("/admin/gemini-keys/{key_id}")
def admin_update_gemini_key(key_id: str, body: GeminiKeyUpdate, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    if not gemini.update_entry(key_id, body.enabled, body.priority):
        return JSONResponse(status_code=404, content=error_envelope("unknown", "API key tidak ditemukan."))
    return {"keys": gemini.list_entries()}


@router.delete("/admin/gemini-keys/{key_id}")
def admin_delete_gemini_key(key_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    if not gemini.delete_entry(key_id):
        return JSONResponse(status_code=404, content=error_envelope("unknown", "API key tidak ditemukan."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "gemini-key-delete", key_id)
    finally:
        conn.close()
    return {"ok": True}


@router.post("/admin/gemini-keys/{key_id}/test")
def admin_test_gemini_key(key_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    try:
        ok, message = gemini.test_entry(key_id)
        return JSONResponse(status_code=200 if ok else 422, content={"ok": ok, "message": message})
    except ValueError as exc:
        return JSONResponse(status_code=404, content=error_envelope("unknown", str(exc)))


@router.patch("/admin/users/{account_id}")
def admin_update_user(account_id: str, body: auth.RoleBody, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        target = db.find_account_by_id(conn, account_id)
        if not target:
            return JSONResponse(status_code=404, content=error_envelope("unknown", "Pengguna tidak ditemukan."))
        changes = sum(value is not None for value in (body.role, body.active, body.plan))
        if changes != 1 or (body.renew and (body.plan is None or body.role is not None or body.active is not None)):
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Pilih satu perubahan paket yang valid."))
        if body.active is not None:
            if account_id == user["id"] and not body.active:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Admin tidak dapat menonaktifkan akunnya sendiri."))
            if not body.active and target["role"] == "admin" and target.get("active", 1) and db.count_admins(conn) <= 1:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Tidak bisa menonaktifkan admin aktif terakhir."))
            if bool(target.get("active", 1)) == body.active:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Status akun sudah sesuai."))
            db.set_account_active(conn, account_id, body.active)
            db.log_audit(conn, user["email"], "ubah-status-akun", f"{target['email']} active={str(body.active).lower()}")
            updated = db.find_account_by_id(conn, account_id)
            return {"user": db.public_account(updated) if updated else None}
        if body.plan is not None:
            if target["plan"] == body.plan and not body.renew:
                return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Paket akun sudah sesuai."))
            plan_settings = db.get_subscription_settings(conn, subscription_defaults())
            term_months = plan_settings["liteTermMonths"] if body.plan == "lite" else plan_settings["proTermMonths"]
            db.update_role_plan(conn, account_id, None, body.plan, renew=body.renew, term_months=term_months)
            action = "perpanjang-paket" if body.renew else "ubah-paket"
            updated = db.find_account_by_id(conn, account_id)
            db.create_notification(
                conn, account_id, "plan_assigned",
                {"plan": body.plan, "expiresAt": (updated or {}).get("plan_expires_at", "")},
                f"manual-plan:{account_id}:{db.now_iso()}:{body.plan}",
            )
            db.log_audit(conn, user["email"], action, f"{target['email']} plan={body.plan}")
            return {"user": db.public_account(updated) if updated else None}
        if body.role is not None and target["role"] == "admin" and body.role != "admin":
            if db.count_admins(conn) <= 1:
                return JSONResponse(
                    status_code=400,
                    content=error_envelope("invalid_range", "Tidak bisa menurunkan admin terakhir."),
                )
        if body.role is None:
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Tidak ada perubahan."))
        db.update_role_plan(conn, account_id, body.role, None)
        db.log_audit(conn, user["email"], "ubah-role", f"{target['email']} role={body.role}")
        updated = db.find_account_by_id(conn, account_id)
        return {"user": db.public_account(updated) if updated else None}
    finally:
        conn.close()


@router.delete("/admin/users/{account_id}")
def admin_delete_user(account_id: str, user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        target = db.find_account_by_id(conn, account_id)
        if not target:
            return JSONResponse(status_code=404, content=error_envelope("unknown", "Pengguna tidak ditemukan."))
        if account_id == user["id"]:
            return JSONResponse(
                status_code=400, content=error_envelope("invalid_range", "Tidak bisa menghapus akun sendiri.")
            )
        if target["role"] == "admin" and target.get("active", 1) and db.count_admins(conn) <= 1:
            return JSONResponse(
                status_code=400, content=error_envelope("invalid_range", "Tidak bisa menghapus admin terakhir.")
            )
        job_ids = [row["id"] for row in conn.execute("SELECT id FROM jobs WHERE account_id = ?", (account_id,)).fetchall()]
        try:
            for job_id in job_ids:
                storage.delete_job_objects(job_id)
        except Exception:
            conn.rollback()
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", "Berkas R2 gagal dihapus; akun tetap disimpan."))
        job_ids = db.delete_account(conn, account_id)
        for job_id in job_ids:
            shutil.rmtree(media.job_dir(SETTINGS.data_dir, job_id), ignore_errors=True)
        db.log_audit(conn, user["email"], "hapus-pengguna", target["email"])
        return {"ok": True}
    finally:
        conn.close()
