"""ECLIPSE MVP 1 backend: auth, ingest, Gemini analysis, and FFmpeg render.

Run from the repository root with `uvicorn backend.main:app --port 8000`.
"""
import json
import mimetypes
import os
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from backend import analysis, auth, db, gemini, media, render, storage
from backend.config import SETTINGS, configure_logging, logger, subscription_defaults
from backend.core import limits
from backend.core.rate_limit import AUTH_LIMITS, limiter
from backend.routes.admin import router as admin_router
from backend.routes.auth import router as auth_router
from backend.routes.notifications import router as notifications_router
from backend.routes.subscription import router as subscription_router
from backend.routes.youtube_cookies import router as youtube_cookies_router
from backend.secrets import decrypt_secret
from backend.youtube_cookies import temporary_cookie_file
from backend.utils.proxy import (
    ProxyPoolUnavailable,
    ProxyTransportError,
    assign_proxy,
    report_result as report_proxy_result,
)
from backend.core.errors import error_envelope, http_status_for
from backend.schemas import (
    IngestDriveBody,
    IngestYoutubeBody,
    FocusPreviewBody,
    JobAnalyzeBody,
    JobRenderBody,
    JobRenderBatchBody,
    GeminiKeyCreate,
    GeminiKeyUpdate,
)

configure_logging()
_RENDER_WORKER = ThreadPoolExecutor(max_workers=1, thread_name_prefix="eclipse-render")
_SOURCE_WORKER = ThreadPoolExecutor(max_workers=2, thread_name_prefix="eclipse-source")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(SETTINGS.data_dir, exist_ok=True)
    db.init_db(SETTINGS.db_path)
    logger.info("ECLIPSE backend %s siap (db=%s)", SETTINGS.version, SETTINGS.db_path)
    async def cleanup_loop():
        while True:
            try:
                removed = await asyncio.to_thread(media.cleanup_old_jobs, SETTINGS.data_dir, limits.TEMP_FILE_TTL_HOURS)
                metadata = await asyncio.to_thread(
                    _cleanup_expired_metadata, limits.METADATA_RETENTION_DAYS
                )
                if removed or metadata["jobs"] or metadata["audit"]:
                    logger.info(
                        "Cleanup menghapus %s direktori media, %s job metadata, dan %s event audit",
                        removed, metadata["jobs"], metadata["audit"],
                    )
            except Exception:
                logger.exception("Cleanup otomatis gagal")
            await asyncio.sleep(3600)
    cleanup_task = asyncio.create_task(cleanup_loop())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="ECLIPSE MVP 1", version=SETTINGS.version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(SETTINGS.allowed_origins),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def protect_cookie_mutations_and_auth_limits(request: Request, call_next):
    # Cookie-authenticated mutations must originate from an explicitly trusted
    # frontend origin. This blocks cross-origin form submissions, including
    # requests from sibling subdomains that are considered same-site by browsers.
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.cookies.get("eclipse_session"):
        origin = request.headers.get("origin", "")
        if origin not in SETTINGS.allowed_origins:
            return JSONResponse(
                status_code=403,
                content=error_envelope("invalid_url", "Asal permintaan tidak diizinkan."),
            )
    rule = AUTH_LIMITS.get(request.url.path)
    if rule and request.method == "POST":
        client_ip = request.client.host if request.client else "unknown"
        allowed, retry_after = limiter.allow(f"{client_ip}:{request.url.path}", *rule)
        if not allowed:
            response = JSONResponse(
                status_code=429,
                content=error_envelope("quota_exceeded", "Terlalu banyak percobaan. Coba lagi nanti."),
            )
            response.headers["Retry-After"] = str(retry_after)
            return response
    return await call_next(request)


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(notifications_router)
app.include_router(youtube_cookies_router)
app.include_router(subscription_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": SETTINGS.version, "time": int(time.time())}


@app.get("/api/render-capabilities")
def render_capabilities() -> dict:
    """Report video encoders compiled into this server's FFmpeg build."""
    return {
        **render.get_encoder_capabilities(),
        "face_detection": render.face_detection_available(),
        "person_detection": render.person_detection_available(),
        "ai_focus": render.ai_focus_available(),
        "auto_focus": render.auto_focus_available(),
    }


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    loc = first.get("loc", ())
    field = loc[-1] if loc else ""
    location = ".".join(str(part) for part in loc if part != "body") or "request"
    if field == "url":
        code = "invalid_url"
    elif field == "consent":
        code = "consent_required"
    elif field == "count":
        code = "invalid_range"
    elif field == "fileName":
        code = "file_required"
    else:
        code = "invalid_range"
    body = error_envelope(
        code,
        "Request tidak valid.",
        hint=f"{location}: {first.get('msg', 'invalid value')}",
    )
    return JSONResponse(status_code=http_status_for(code), content=body)


@app.get("/api/limits")
def get_limits() -> dict:
    """Batas publik agar UI menampilkan angka yang sama dengan enforcement."""
    conn = db.get_conn(SETTINGS.db_path)
    try:
        subscription = db.get_subscription_settings(conn, subscription_defaults())
    finally:
        conn.close()
    return {
        "maxSourceLabel": limits.MAX_SOURCE_LABEL,
        "maxSourceBytes": limits.MAX_SOURCE_BYTES,
        "maxDurationSec": limits.MAX_DURATION_SEC,
        "tempFileTtlHours": limits.TEMP_FILE_TTL_HOURS,
        "metadataRetentionDays": limits.METADATA_RETENTION_DAYS,
        "mvpAspect": limits.MVP_ASPECT,
        "exportFormat": limits.EXPORT_FORMAT,
        "exportCodec": limits.EXPORT_CODEC,
        "maxBatchClips": SETTINGS.max_batch_clips,
        **subscription,
        "liteDiscountAmountIdr": db.campaign_discount(subscription, "lite", int(subscription["liteMonthlyPriceIdr"])),
        "proDiscountAmountIdr": db.campaign_discount(subscription, "pro", int(subscription["proMonthlyPriceIdr"])),
    }


# ---------- B2 ingest + media ----------

def _job_or_error(conn, job_id: str, user: dict):
    job = db.get_job(conn, job_id)
    if not job:
        return None, JSONResponse(status_code=404, content=error_envelope("unknown", "Job tidak ditemukan."))
    if job["account_id"] != user["id"] and user.get("role") != "admin":
        return None, JSONResponse(status_code=403, content=error_envelope("invalid_url", "Bukan milik Anda."))
    return job, None


def _claim_user_quota(conn, user: dict, kind: str, free_limit: int, day: str | None = None) -> tuple[bool, int]:
    """Claim the account's daily plan quota; administrators bypass caps."""
    subscription = db.get_subscription_settings(conn, subscription_defaults())
    free_limit = subscription["freeDailyAnalyze"] if kind == "analyze" else subscription["freeDailyRender"]
    if user.get("role") == "admin":
        _, used = db.check_quota(conn, user["id"], kind, free_limit, day)
        db.record_usage(conn, user["id"], kind, day)
        return True, used + 1
    if kind == "render":
        plan = user.get("plan", "free")
        if plan in {"lite", "pro"}:
            if not db.is_before_expiry(user.get("plan_expires_at")):
                _, used = db.check_quota(conn, user["id"], kind, free_limit, day)
                return False, used
            daily_limit = subscription["liteDailyRender"] if plan == "lite" else subscription["proDailyRender"]
            return db.claim_quota(conn, user["id"], kind, daily_limit, day)
        trial_expires = db.free_trial_expires_at(user["created_at"], subscription["freeRenderTrialDays"])
        if not db.is_before_expiry(trial_expires):
            _, used = db.check_quota(conn, user["id"], kind, free_limit, day)
            return False, used
    return db.claim_quota(conn, user["id"], kind, free_limit, day)


def _render_quota_error(user: dict, used: int) -> JSONResponse:
    plan = user.get("plan", "free")
    notification_limit = 0
    conn = db.get_conn(SETTINGS.db_path)
    try:
        subscription = db.get_subscription_settings(conn, subscription_defaults())
    finally:
        conn.close()
    notification_limit = subscription["freeDailyRender"]
    if plan in {"lite", "pro"} and user.get("role") != "admin":
        limit = subscription["liteDailyRender"] if plan == "lite" else subscription["proDailyRender"]
        notification_limit = limit
        if not db.is_before_expiry(user.get("plan_expires_at")):
            message = f"Masa paket {plan.capitalize()} telah berakhir."
            hint = "Hubungi Hub Admin untuk memperpanjang paket."
        else:
            message = f"Kuota {plan.capitalize()} hari ini habis ({used}/{limit})."
            hint = "Kuota harian diperbarui besok."
    elif plan == "free" and user.get("role") != "admin" and not db.is_before_expiry(
        db.free_trial_expires_at(user["created_at"], subscription["freeRenderTrialDays"])
    ):
        message = f"Masa Free {subscription['freeRenderTrialDays']} hari telah berakhir."
        hint = "Upgrade ke Lite atau Pro melalui Hub Admin untuk melanjutkan generate."
    else:
        message = f"Kuota render harian habis ({used}/{subscription['freeDailyRender']})."
        hint = "Coba lagi besok."
    if plan in {"lite", "pro"} and user.get("role") != "admin" and not db.is_before_expiry(user.get("plan_expires_at")):
        notification_kind = "plan_expired"
    elif plan == "free" and user.get("role") != "admin" and not db.is_before_expiry(
        db.free_trial_expires_at(user["created_at"], subscription["freeRenderTrialDays"])
    ):
        notification_kind = "free_expired"
    else:
        notification_kind = "render_quota_reached"
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.create_notification(
            conn, user["id"], notification_kind,
            {"plan": plan, "used": used, "limit": notification_limit},
            f"{notification_kind}:{user['id']}:{db.today_key()}",
        )
    finally:
        conn.close()
    return JSONResponse(status_code=429, content=error_envelope("quota_exceeded", message, hint=hint))


def _release_user_quota(user: dict, kind: str, day: str) -> None:
    """Return a reserved quota slot when a render fails before producing a usable result."""
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.release_quota(conn, user["id"], kind, day)
    except Exception:
        logger.exception("Gagal mengembalikan kuota %s untuk akun %s", kind, user.get("id"))
    finally:
        conn.close()


@app.get("/api/jobs/{job_id}/status")
def job_status(job_id: str, user=Depends(auth.depends_user)):
    """Expose safe progress fields so the editor can track a running analysis."""
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        payload = {
            "status": job["status"],
            "progress": float(job.get("progress") or 0),
            "error": job.get("error_message") or "",
        }
        if job.get("kind") == "render" and job.get("result_json"):
            try:
                payload["outputs"] = json.loads(job["result_json"]).get("outputs", [])
            except (TypeError, ValueError):
                payload["outputs"] = []
        return payload
    finally:
        conn.close()


def _register_media_job(user: dict, source: str, input_ref: str, path: str) -> dict:
    meta = media.ffprobe_metadata(path)
    media.check_duration(meta["duration"])
    storage_job_id = os.path.basename(os.path.dirname(path))
    try:
        source_key = storage.store_file(
            path,
            storage.object_key(storage_job_id, "source", os.path.basename(path)),
        )
    except storage.StorageError:
        import shutil
        shutil.rmtree(media.job_dir(SETTINGS.data_dir, storage_job_id), ignore_errors=True)
        raise
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job = db.create_job(conn, user["id"], "media", source, input_ref, job_id=storage_job_id)
        db.update_job(
            conn, job["id"], status="ready",
            result_json=json.dumps({**meta, "path": path, **({"source_object_key": source_key} if source_key else {})}),
        )
        db.log_audit(conn, user["email"], "ingest", f"{source}:{job['id']}")
        job = db.get_job(conn, job["id"])
        assert job is not None
        public = db.public_job(job)
        public.pop("result_json", None)
        return {"job": public, "metadata": meta}
    finally:
        conn.close()


def _youtube_cookie_for(user_id: str) -> str | None:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        row = conn.execute("SELECT ciphertext FROM youtube_cookies WHERE account_id = ?", (user_id,)).fetchone()
        return decrypt_secret(row["ciphertext"]) if row else None
    finally:
        conn.close()


def _source_path(job: dict) -> str:
    try:
        return json.loads(job.get("result_json") or "{}").get("path", "")
    except (TypeError, ValueError):
        return ""


def _source_metadata(job: dict) -> dict:
    try:
        return json.loads(job.get("result_json") or "{}")
    except (TypeError, ValueError):
        return {}


def _ensure_source_local(job_id: str, user: dict, job: dict | None = None, progress_callback=None) -> str:
    """Ensure the authorized job's source video is present in its local workspace."""
    if job is None:
        conn = db.get_conn(SETTINGS.db_path)
        try:
            job, err = _job_or_error(conn, job_id, user)
            if err or not job:
                raise ValueError("Sumber video tidak ditemukan atau akses ditolak.")
        finally:
            conn.close()
    result = _source_metadata(job)
    path = result.get("path", "")
    if path and os.path.isfile(path):
        return path
    key = result.get("source_object_key")
    if key and storage.is_r2_enabled():
        filename = os.path.basename(path) or os.path.basename(key)
        path = os.path.join(media.job_dir(SETTINGS.data_dir, job_id), filename)
        storage.materialize(key, path)
        result["path"] = path
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, result_json=json.dumps(result))
        finally:
            conn.close()
        return path
    if job.get("source") == "youtube":
        return _ensure_youtube_source(job_id, user, progress_callback)
    return ""


def _persist_local_file(job_id: str, category: str, path: str, content_type: str | None = None) -> str | None:
    key = storage.object_key(job_id, category, os.path.basename(path))
    return storage.store_file(path, key, content_type)


def _cleanup_expired_metadata(retention_days: int) -> dict[str, int]:
    """Remove expired R2 objects before their database metadata is purged."""
    if storage.is_r2_enabled():
        import time as _time
        cutoff = _time.strftime(
            "%Y-%m-%dT%H:%M:%S", _time.gmtime(_time.time() - retention_days * 86400)
        ) + "Z"
        conn = db.get_conn(SETTINGS.db_path)
        try:
            expired = conn.execute(
                "SELECT id FROM jobs WHERE kind = 'media' AND created_at < ?", (cutoff,)
            ).fetchall()
        finally:
            conn.close()
        for row in expired:
            storage.delete_job_objects(row["id"])
    return db.cleanup_old_metadata(SETTINGS.db_path, retention_days)


def _ensure_youtube_source(job_id: str, user: dict, progress_callback=None) -> str:
    """Ensure the YouTube source is available locally for analysis and later rendering."""
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err or not job:
            raise ValueError("Sumber video tidak ditemukan atau akses ditolak.")
        result = json.loads(job.get("result_json") or "{}")
        existing = result.get("path", "")
        if existing and os.path.exists(existing):
            return existing
        source_key = result.get("source_object_key")
        if source_key and storage.is_r2_enabled():
            filename = os.path.basename(existing) or os.path.basename(source_key)
            restored = os.path.join(media.job_dir(SETTINGS.data_dir, job_id), filename)
            storage.materialize(source_key, restored)
            result["path"] = restored
            db.update_job(conn, job_id, result_json=json.dumps(result))
            return restored
        if job.get("source") != "youtube":
            raise ValueError("File media tidak ada.")
        url = job.get("input_ref") or ""
    finally:
        conn.close()
    path = ""
    for attempt in range(3):
        proxy_id, proxy_url = assign_proxy(user["id"], job_id)
        try:
            path, _ = media.download_youtube(
                SETTINGS.data_dir, job_id, url, limits.MAX_SOURCE_BYTES,
                _youtube_cookie_for(user["id"]), progress_callback, proxy_url=proxy_url,
            )
            if proxy_id:
                report_proxy_result(proxy_id, True)
            break
        except ProxyTransportError:
            if proxy_id:
                report_proxy_result(proxy_id, False)
            if not proxy_id or attempt >= 2:
                raise
    conn = db.get_conn(SETTINGS.db_path)
    try:
        fresh = db.get_job(conn, job_id)
        result = json.loads((fresh or {}).get("result_json") or "{}")
        result["path"] = path
        source_key = _persist_local_file(job_id, "source", path)
        if source_key:
            result["source_object_key"] = source_key
        db.update_job(conn, job_id, result_json=json.dumps(result))
    finally:
        conn.close()
    return path


@app.post("/api/jobs/{job_id}/focus-preview")
def focus_preview(job_id: str, body: FocusPreviewBody, user=Depends(auth.depends_user)):
    """Calculate the same crop focal point used by batch export for the selected clip."""
    if isinstance(user, JSONResponse):
        return user
    if body.aspect == "16:9":
        return {"found": False, "mode": "not-applicable", "focal_x": 50, "focal_y": 50, "sampled_frames": 0}
    if not render.auto_focus_available():
        return JSONResponse(status_code=409, content=error_envelope("unknown", "Deteksi fokus otomatis tidak tersedia di server ini."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        media_path = _source_path(job)
        source = job.get("source", "")
    finally:
        conn.close()
    try:
        if not media_path or not os.path.exists(media_path):
            media_path = _ensure_source_local(job_id, user, {**job, "source": source})
        if not media_path or not os.path.exists(media_path):
            return JSONResponse(status_code=404, content=error_envelope("unknown", "File media tidak ada."))
        focus = render.detect_auto_focus(media_path, body.clip_start, body.clip_end, body.aspect, body.focus_anchor)
        if focus is None:
            return JSONResponse(status_code=409, content=error_envelope("unknown", "Server tidak dapat membaca frame video untuk mendeteksi fokus."))
        return focus
    except (ValueError, RuntimeError) as exc:
        return JSONResponse(status_code=422, content=error_envelope("drive_not_accessible", str(exc)[:300]))
    except Exception as exc:
        logger.exception("Gagal menghitung fokus preview untuk job %s", job_id)
        return JSONResponse(status_code=500, content=error_envelope("unknown", f"Deteksi fokus gagal: {str(exc)[:240]}"))


def _download_source_worker(parent_id: str, child_id: str, user: dict) -> None:
    try:
        def progress(value: float):
            conn = db.get_conn(SETTINGS.db_path)
            try:
                db.update_job(conn, child_id, progress=round(value, 1))
            finally:
                conn.close()
        path = _ensure_youtube_source(parent_id, user, progress)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, child_id, status="done", progress=100, result_json=json.dumps({"path": path}))
        finally:
            conn.close()
    except Exception as exc:
        logger.exception("Unduh sumber YouTube gagal untuk job %s", parent_id)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, child_id, status="error", error_code="unknown", error_message=str(exc)[:300])
        finally:
            conn.close()


@app.post("/api/upload-video")
def upload_video(file: UploadFile, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    job_id = media.new_job_id("job")
    try:
        path, size = media.save_upload(
            SETTINGS.data_dir, job_id, file.filename or "upload.mp4",
            file.file, limits.MAX_SOURCE_BYTES,
        )
    except ValueError as exc:
        msg = str(exc)
        code = "file_too_large" if "melebihi" in msg else "file_type_unsupported"
        return JSONResponse(status_code=http_status_for(code), content=error_envelope(code, msg))
    try:
        return _register_media_job(user, "upload", file.filename or "", path)
    except storage.StorageError as exc:
        return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
    except (RuntimeError, ValueError) as exc:
        return JSONResponse(status_code=400, content=error_envelope("invalid_url", str(exc)))


@app.post("/api/jobs/{job_id}/studio-assets/{kind}")
def upload_studio_asset(job_id: str, kind: str, file: UploadFile, user=Depends(auth.depends_user)):
    """Store a bounded audio or image asset for this user's upcoming batch render."""
    if isinstance(user, JSONResponse):
        return user
    extensions = {"bgm": {".mp3", ".wav", ".m4a", ".aac", ".ogg"}, "sfx": {".mp3", ".wav", ".m4a", ".aac", ".ogg"}, "watermark": {".png", ".webp", ".jpg", ".jpeg"}}
    if kind not in extensions:
        return JSONResponse(status_code=400, content=error_envelope("file_type_unsupported", "Jenis aset Studio tidak didukung."))
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in extensions[kind]:
        message = "Gunakan PNG, WebP, atau JPG untuk watermark." if kind == "watermark" else "Gunakan MP3, WAV, M4A, AAC, atau OGG."
        return JSONResponse(status_code=400, content=error_envelope("file_type_unsupported", message))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
    finally:
        conn.close()
    path = os.path.join(media.job_dir(SETTINGS.data_dir, job_id), f"studio_{kind}_{media.new_job_id('asset')}{ext}")
    size = 0
    try:
        with open(path, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                limit = 10 * 1024 * 1024 if kind == "watermark" else 50 * 1024 * 1024
                if size > limit:
                    raise ValueError("Logo watermark maksimal 10 MB." if kind == "watermark" else "Aset audio maksimal 50 MB.")
                out.write(chunk)
    except ValueError as exc:
        if os.path.exists(path):
            os.remove(path)
        return JSONResponse(status_code=413, content=error_envelope("file_too_large", str(exc)))
    if kind == "watermark":
        try:
            from PIL import Image
            with Image.open(path) as image:
                if image.format not in {"PNG", "WEBP", "JPEG"} or image.width > 4096 or image.height > 4096:
                    raise ValueError("Ukuran/format gambar watermark tidak didukung.")
                image.verify()
        except Exception:
            os.remove(path)
            return JSONResponse(status_code=400, content=error_envelope("file_type_unsupported", "Berkas watermark bukan gambar yang valid."))
    try:
        _persist_local_file(job_id, "studio", path, mimetypes.guess_type(path)[0])
    except Exception:
        logger.exception("Gagal menyimpan aset Studio ke object storage untuk job %s", job_id)
        try:
            os.remove(path)
        except OSError:
            pass
        return JSONResponse(status_code=503, content=error_envelope("backend_offline", "Storage aset Studio tidak tersedia."))
    return {"asset": os.path.basename(path), "size_bytes": size, "kind": kind}


@app.get("/api/jobs/{job_id}/studio-assets/{kind}/{asset_name}")
def get_studio_asset(job_id: str, kind: str, asset_name: str, user=Depends(auth.depends_user)):
    """Return a previously uploaded Studio asset for the authenticated job owner."""
    if isinstance(user, JSONResponse):
        return user
    safe_name = os.path.basename(asset_name)
    extensions = {"bgm": {".mp3", ".wav", ".m4a", ".aac", ".ogg"}, "sfx": {".mp3", ".wav", ".m4a", ".aac", ".ogg"}, "watermark": {".png", ".webp", ".jpg", ".jpeg"}}
    allowed_extensions = extensions.get(kind)
    if safe_name != asset_name or not allowed_extensions or not safe_name.startswith(f"studio_{kind}_") or os.path.splitext(safe_name)[1].lower() not in allowed_extensions:
        return JSONResponse(status_code=404, content=error_envelope("not_found", "Aset Studio tidak ditemukan."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        _, err = _job_or_error(conn, job_id, user)
        if err:
            return err
    finally:
        conn.close()
    path = os.path.join(media.job_dir(SETTINGS.data_dir, job_id), safe_name)
    if not os.path.isfile(path):
        if not storage.is_r2_enabled():
            return JSONResponse(status_code=404, content=error_envelope("not_found", "Aset Studio tidak ditemukan."))
        try:
            storage.materialize(storage.object_key(job_id, "studio", safe_name), path)
        except storage.StorageError as exc:
            logger.exception("Gagal mengambil aset Studio dari object storage untuk job %s", job_id)
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
        except Exception:
            logger.exception("Gagal mengambil aset Studio dari object storage untuk job %s", job_id)
            return JSONResponse(status_code=404, content=error_envelope("not_found", "Aset Studio tidak ditemukan."))
    return FileResponse(path, media_type=mimetypes.guess_type(path)[0] or "application/octet-stream", headers={"Cache-Control": "private, no-store"})


@app.get("/api/jobs")
def list_user_jobs(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        jobs = db.list_media_jobs(conn, user["id"])
        entries = []
        for job in jobs:
            try:
                result = json.loads(job["result_json"] or "{}")
                data = (result.get("analysis") or {}).get("data", {})
            except (TypeError, ValueError):
                result, data = {}, {}
            youtube_id = str(result.get("youtube_id") or "")
            thumbnail = (
                f"https://i.ytimg.com/vi/{youtube_id}/mqdefault.jpg"
                if job["source"] == "youtube"
                and len(youtube_id) == 11
                and all(char.isalnum() or char in "_-" for char in youtube_id)
                else ""
            )
            entries.append({
                "video_id": job["id"],
                "title": data.get("title") or result.get("title") or job["input_ref"] or job["id"],
                "duration_pref": data.get("duration_pref", "auto"),
                "clip_count": len(data.get("clips", [])),
                "analyzed_at": job["updated_at"],
                "thumbnail": thumbnail,
                "url": data.get("video_url", f"/api/media/{job['id']}/source"),
                "source": job["source"],
            })
        return {"entries": entries}
    finally:
        conn.close()


@app.delete("/api/jobs/{job_id}")
def delete_user_job(job_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        if job["kind"] != "media":
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Hanya sumber video yang dapat dihapus dari riwayat."))
        try:
            storage.delete_job_objects(job_id)
        except Exception:
            logger.exception("Gagal menghapus object storage untuk job %s", job_id)
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", "Berkas R2 gagal dihapus; job tetap disimpan."))
        conn.execute("DELETE FROM jobs WHERE input_ref = ? AND kind = 'render'", (job_id,))
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()
        import shutil
        shutil.rmtree(media.job_dir(SETTINGS.data_dir, job_id), ignore_errors=True)
        db.log_audit(conn, user["email"], "hapus-riwayat", job_id)
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/api/jobs")
def clear_user_jobs(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        jobs = db.list_media_jobs(conn, user["id"], limit=10000)
        ids = [job["id"] for job in jobs]
        try:
            for item in ids:
                storage.delete_job_objects(item)
        except Exception:
            logger.exception("Gagal menghapus object storage untuk akun %s", user.get("id"))
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", "Sebagian berkas R2 gagal dihapus; riwayat tetap disimpan."))
        for job_id in ids:
            conn.execute("DELETE FROM jobs WHERE input_ref = ? AND kind = 'render'", (job_id,))
            conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            import shutil
            shutil.rmtree(media.job_dir(SETTINGS.data_dir, job_id), ignore_errors=True)
        conn.commit()
        db.log_audit(conn, user["email"], "hapus-semua-riwayat", str(len(ids)))
        return {"ok": True, "removed": len(ids)}
    finally:
        conn.close()


@app.post("/api/ingest-youtube")
def ingest_youtube(body: IngestYoutubeBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    if not media.YOUTUBE_RE.match(body.url.strip()):
        return JSONResponse(
            status_code=400,
            content=error_envelope(
                "invalid_url", "URL YouTube tidak valid.",
                hint="Tempel tautan tonton/bagikan YouTube.",
            ),
        )
    job_id = media.new_job_id("job")
    try:
        info = None
        proxy_id = None
        for attempt in range(3):
            proxy_id, proxy_url = assign_proxy(user["id"])
            try:
                with temporary_cookie_file(SETTINGS.data_dir, _youtube_cookie_for(user["id"])) as cookiefile:
                    try:
                        info = media.youtube_info(body.url.strip(), cookiefile, proxy_url)
                    except ProxyTransportError:
                        raise
                    except ValueError:
                        if not cookiefile:
                            raise
                        # Public videos can fail under an authenticated YouTube
                        # player session; retry anonymously before rejecting the URL.
                        info = media.youtube_info(body.url.strip(), proxy_url=proxy_url)
                if proxy_id:
                    report_proxy_result(proxy_id, True)
                break
            except ProxyTransportError:
                if proxy_id:
                    report_proxy_result(proxy_id, False)
                if not proxy_id or attempt >= 2:
                    raise
        assert info is not None
        duration = float(info.get("duration") or 0)
        media.check_duration(duration)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            job = db.create_job(conn, user["id"], "media", "youtube", body.url.strip())
            metadata = {
                "title": info.get("title") or "Video YouTube",
                "duration": duration,
                "youtube_id": info.get("id") or "",
                "webpage_url": info.get("webpage_url") or body.url.strip(),
            }
            db.update_job(conn, job["id"], status="ready", result_json=json.dumps(metadata))
            if proxy_id:
                conn.execute("UPDATE jobs SET egress_proxy_id = ? WHERE id = ?", (proxy_id, job["id"]))
                conn.commit()
            db.log_audit(conn, user["email"], "ingest-metadata", f"youtube:{job['id']}")
            saved = db.get_job(conn, job["id"])
            assert saved is not None
            public = db.public_job(saved)
            public.pop("result_json", None)
            return {"job": public, "metadata": metadata}
        finally:
            conn.close()
    except ValueError as exc:
        msg = str(exc)
        code = "file_too_large" if "melebihi" in msg else "drive_not_accessible"
        hint = "Pastikan video publik/tidak terdaftar dan coba lagi." if code != "file_too_large" else None
        return JSONResponse(status_code=http_status_for(code), content=error_envelope(code, msg, hint))


@app.post("/api/jobs/{job_id}/download-source")
def start_source_download(job_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        parent, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert parent is not None
        if parent.get("source") != "youtube":
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Unduh video mentah tersedia untuk sumber YouTube."))
        existing = _source_path(parent)
        if (existing and os.path.exists(existing)) or _source_metadata(parent).get("source_object_key"):
            return {"status": "done", "download_url": f"/api/jobs/{job_id}/download-source"}
        pending = conn.execute(
            "SELECT * FROM jobs WHERE kind = 'source-download' AND input_ref = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",
            (job_id,),
        ).fetchone()
        if pending:
            child = db.row_to_dict(pending)
            return {"status": "running", "download_job_id": child["id"]}
        child = db.create_job(conn, user["id"], "source-download", "youtube", job_id)
        db.update_job(conn, child["id"], status="running", progress=0)
    finally:
        conn.close()
    _SOURCE_WORKER.submit(_download_source_worker, job_id, child["id"], user)
    return {"status": "running", "download_job_id": child["id"]}


@app.get("/api/jobs/{job_id}/download-source")
def download_source(job_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        source_key = _source_metadata(job).get("source_object_key")
        path = _source_path(job)
        if storage.is_r2_enabled() and source_key:
            try:
                return RedirectResponse(storage.presigned_get_url(source_key), status_code=307)
            except storage.StorageError as exc:
                logger.exception("Gagal membuat URL unduhan sumber R2 untuk job %s", job_id)
                return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
        if not path or not os.path.exists(path):
            return JSONResponse(status_code=404, content=error_envelope("unknown", "Video belum siap diunduh."))
        import mimetypes
        return FileResponse(path, media_type=mimetypes.guess_type(path)[0] or "application/octet-stream",
                            filename=os.path.basename(path), content_disposition_type="attachment")
    finally:
        conn.close()


@app.post("/api/ingest-drive")
def ingest_drive(body: IngestDriveBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    job_id = media.new_job_id("job")
    try:
        path = ""
        proxy_id = None
        for attempt in range(3):
            proxy_id, proxy_url = assign_proxy(user["id"])
            try:
                path, _ = media.download_drive(SETTINGS.data_dir, job_id, body.url.strip(), limits.MAX_SOURCE_BYTES, proxy_url)
                if proxy_id:
                    report_proxy_result(proxy_id, True)
                break
            except ProxyTransportError:
                if proxy_id:
                    report_proxy_result(proxy_id, False)
                if not proxy_id or attempt >= 2:
                    raise
        result = _register_media_job(user, "drive", body.url.strip(), path)
        if proxy_id:
            conn = db.get_conn(SETTINGS.db_path)
            try:
                conn.execute("UPDATE jobs SET egress_proxy_id = ? WHERE id = ?", (proxy_id, result["job"]["id"]))
                conn.commit()
            finally:
                conn.close()
        return result
    except ValueError as exc:
        return JSONResponse(status_code=422, content=error_envelope("drive_not_accessible", str(exc)))
    except storage.StorageError as exc:
        return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))


@app.get("/api/media/{job_id}/source")
def media_source(job_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        source_metadata = _source_metadata(job)
        path = source_metadata.get("path", "")
        if not path or not os.path.exists(path):
            if not source_metadata.get("source_object_key") or not storage.is_r2_enabled():
                return JSONResponse(status_code=404, content=error_envelope("unknown", "File media tidak ada."))
            path = os.path.join(media.job_dir(SETTINGS.data_dir, job_id), os.path.basename(path) or os.path.basename(source_metadata["source_object_key"]))
            try:
                storage.materialize(source_metadata["source_object_key"], path)
            except Exception:
                logger.exception("Gagal mengambil sumber dari object storage untuk preview job %s", job_id)
                return JSONResponse(status_code=503, content=error_envelope("backend_offline", "Video sumber sementara tidak tersedia."))
        import mimetypes
        return FileResponse(path, media_type=mimetypes.guess_type(path)[0] or "application/octet-stream",
                            filename=os.path.basename(path), content_disposition_type="inline")
    finally:
        conn.close()


@app.post("/api/admin/cleanup")
def admin_cleanup(user=Depends(auth.depends_admin)):
    if isinstance(user, JSONResponse):
        return user
    removed = media.cleanup_old_jobs(SETTINGS.data_dir, limits.TEMP_FILE_TTL_HOURS)
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.log_audit(conn, user["email"], "cleanup", f"{removed} job lama")
    finally:
        conn.close()
    return {"removed": removed}


# ---------- B3 transkrip + analisis ----------

_DURATION_SECONDS = {"15s": 15, "30s": 30, "60s": 60}


@app.post("/api/jobs/{job_id}/analyze")
def job_analyze(job_id: str, body: JobAnalyzeBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        if not gemini.has_enabled_keys():
            return JSONResponse(status_code=503, content=error_envelope(
                "backend_offline",
                "Pool API Gemini belum siap.",
                hint="Administrator perlu menambahkan setidaknya satu API key Gemini aktif di menu Admin → Gemini API.",
            ))
        try:
            source_metadata = json.loads(job["result_json"] or "{}")
            media_path = source_metadata.get("path", "")
            source_duration = float(source_metadata.get("duration") or 0)
        except ValueError:
            media_path = ""
            source_duration = 0.0
        is_youtube = job.get("source") == "youtube"
        if not is_youtube and (not media_path or not os.path.exists(media_path)):
            try:
                media_path = _ensure_source_local(job_id, user, job)
            except Exception:
                logger.exception("Gagal mengambil sumber dari storage untuk analisis job %s", job_id)
                return JSONResponse(status_code=503, content=error_envelope("backend_offline", "Video sumber tidak dapat diambil dari storage."))
        if not is_youtube and (not media_path or not os.path.exists(media_path)):
            return JSONResponse(status_code=404, content=error_envelope("unknown", "File media tidak ada."))
        free_analyze_limit = db.get_subscription_settings(conn, subscription_defaults())["freeDailyAnalyze"]
        allowed, used = _claim_user_quota(conn, user, "analyze", free_analyze_limit)
        if not allowed:
            db.create_notification(
                conn, user["id"], "analyze_quota_reached",
                {"used": used, "limit": free_analyze_limit},
                f"analyze_quota_reached:{user['id']}:{db.today_key()}",
            )
            return JSONResponse(
                status_code=429,
                content=error_envelope(
                    "quota_exceeded",
                    f"Kuota analisis harian habis ({used}/{free_analyze_limit}).",
                    hint="Coba lagi besok.",
                ),
            )
        db.update_job(conn, job_id, status="running", progress=0)
    finally:
        conn.close()
    source_download_failed = False
    try:
        job_path = media.job_dir(SETTINGS.data_dir, job_id)
        if is_youtube:
            last_source_progress = 0.0

            def report_source_progress(value: float) -> None:
                nonlocal last_source_progress
                # Reserve the first 10% for fetching the source; transcript starts at 10%.
                bounded = min(99.0, max(0.0, float(value)))
                progress = round(bounded * 0.095, 1)
                if progress - last_source_progress < 0.5 and progress < 9.5:
                    return
                last_source_progress = progress
                source_conn = db.get_conn(SETTINGS.db_path)
                try:
                    db.update_job(source_conn, job_id, progress=progress)
                finally:
                    source_conn.close()

            try:
                _ensure_youtube_source(job_id, user, report_source_progress)
            except Exception:
                source_download_failed = True
                raise
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, progress=10 if is_youtube else 20)
        finally:
            conn.close()
        if body.subtitle_source == "manual":
            if not body.manual_subtitle_text or not body.manual_subtitle_text.strip():
                raise ValueError("Pilih berkas subtitle manual yang tidak kosong.")
            transcript = analysis.parse_subtitle_text(body.manual_subtitle_text, source_duration)
            if not transcript["segments"]:
                raise ValueError("Berkas subtitle tidak berisi teks yang dapat dibaca.")
            analysis.save_transcript(job_path, transcript)
        elif body.subtitle_source == "youtube" and job.get("source") == "youtube":
            cookie_conn = db.get_conn(SETTINGS.db_path)
            try:
                cookie_row = cookie_conn.execute(
                    "SELECT ciphertext FROM youtube_cookies WHERE account_id = ?", (user["id"],)
                ).fetchone()
                cookie_text = decrypt_secret(cookie_row["ciphertext"]) if cookie_row else None
            finally:
                cookie_conn.close()
            subtitle_text = ""
            for attempt in range(3):
                proxy_id, proxy_url = assign_proxy(user["id"], job_id)
                try:
                    subtitle_text = media.download_youtube_subtitles(
                        SETTINGS.data_dir, job_id, job.get("input_ref") or "", cookie_text, proxy_url,
                    )
                    if proxy_id:
                        report_proxy_result(proxy_id, True)
                    break
                except ProxyTransportError:
                    if proxy_id:
                        report_proxy_result(proxy_id, False)
                    if not proxy_id or attempt >= 2:
                        raise
            transcript = analysis.parse_subtitle_text(subtitle_text, source_duration)
            if not transcript["segments"]:
                raise ValueError("Subtitle YouTube tidak berisi teks yang dapat dibaca. Coba unggah .srt atau .txt manual.")
            analysis.save_transcript(job_path, transcript)
        elif is_youtube:
            raise ValueError("Pilih subtitle YouTube otomatis atau unggah subtitle manual.")
        else:
            last_transcription_progress = 0.0

            def report_transcription_progress(value: float) -> None:
                nonlocal last_transcription_progress
                bounded = min(100.0, max(0.0, float(value)))
                if bounded < 100 and bounded - last_transcription_progress < 1.0:
                    return
                last_transcription_progress = bounded
                conn = db.get_conn(SETTINGS.db_path)
                try:
                    # Tahap transkripsi memakai rentang 20–55% dari keseluruhan pipeline.
                    db.update_job(conn, job_id, progress=round(20 + bounded * 0.35, 1))
                finally:
                    conn.close()

            transcript = analysis.transcribe_file(media_path, job_path, report_transcription_progress)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, progress=55)
        finally:
            conn.close()
        count = 6 if body.countMode == "auto" else min(body.count, limits.MAX_CLIPS_PER_ANALYZE)
        built = analysis.build_candidates(
            transcript, body.duration, count, body.prompt,
            _DURATION_SECONDS[body.duration],
        )
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, progress=65)
        finally:
            conn.close()
        if is_youtube:
            ai_result = gemini.analyze_transcript(
                transcript["segments"], body.model, body.prompt, count, _DURATION_SECONDS[body.duration],
                account_id=user["id"], job_id=job_id,
            )
        else:
            ai_result = gemini.analyze_video(
                media_path, transcript["segments"], body.model, body.prompt,
                count, _DURATION_SECONDS[body.duration], account_id=user["id"], job_id=job_id,
            )
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, progress=90)
        finally:
            conn.close()
        total = float(transcript.get("duration", 0))
        clips = []
        for item in ai_result.get("clips", [])[:count]:
            try:
                start = max(0.0, min(total, float(item["start_time"])))
                end = max(start, min(total, float(item["end_time"])))
                if end - start < 4:
                    continue
                relevant = [s for s in transcript["segments"] if s["end"] > start and s["start"] < end]
                text = " ".join(s["text"] for s in relevant)
                if not text.strip():
                    continue
                clips.append({
                    "title": str(item.get("title") or text[:60])[:160],
                    "start_time": round(start, 2),
                    "end_time": round(end, 2),
                    "hook_time": round(max(start, min(end, float(item.get("hook_time", start)))), 2),
                    "virality_score": round(max(0.0, min(100.0, float(item.get("virality_score", 0)))), 1),
                    "transcript": text,
                    "caption": str(item.get("caption") or item.get("title") or "")[:160],
                })
            except (KeyError, TypeError, ValueError):
                continue
        if not clips:
            raise ValueError("Gemini tidak menemukan kandidat klip valid pada video ini.")
        built["clips"] = clips
        built["summary"] = str(ai_result.get("summary") or built["summary"])
        analysis.save_candidates(job_path, built)
    except (RuntimeError, ValueError, gemini.GeminiError) as exc:
        code = (
            "drive_not_accessible" if source_download_failed
            else "backend_offline" if isinstance(exc, gemini.GeminiError)
            else "empty_result" if body.subtitle_source in {"youtube", "manual"}
            else "unknown"
        )
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, status="error", error_code=code, error_message=str(exc)[:300])
        finally:
            conn.close()
        if source_download_failed:
            _release_user_quota(user, "analyze", db.today_key())
        status_code = 503 if code == "backend_offline" else 422 if code in {"empty_result", "drive_not_accessible"} else 500
        return JSONResponse(status_code=status_code,
                             content=error_envelope(code, str(exc)[:300]))
    except Exception:
        logger.exception("Analisis gagal untuk job %s", job_id)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, job_id, status="error", error_code="unknown", error_message="Pipeline analisis gagal.")
        finally:
            conn.close()
        if source_download_failed:
            _release_user_quota(user, "analyze", db.today_key())
            return JSONResponse(status_code=422, content=error_envelope(
                "drive_not_accessible", "Sumber YouTube gagal diunduh ke server. Coba lagi atau unggah file video lokal."
            ))
        return JSONResponse(status_code=500, content=error_envelope("unknown", "Pipeline analisis gagal."))
    clips_out = [
        {
            "title": c["title"], "start_time": c["start_time"], "end_time": c["end_time"],
            "hook_time": c["hook_time"], "virality_score": c["virality_score"],
            "transcript": c["transcript"], "caption": c["caption"],
        }
        for c in built["clips"]
    ]
    try:
        source_metadata = json.loads(job.get("result_json") or "{}")
    except (ValueError, TypeError):
        source_metadata = {}
    preview_url = (
        media.youtube_embed_url(source_metadata.get("youtube_id") or "", 0)
        if job.get("source") == "youtube" and source_metadata.get("youtube_id")
        else f"/api/media/{job_id}/source"
    )
    response = {
        "data": {
            "video_id": job_id,
            "title": source_metadata.get("title") or job.get("input_ref") or job_id,
            "duration": transcript.get("duration", 0),
            "source": job.get("source", "upload"),
            "video_url": preview_url,
            "duration_pref": body.duration,
            "heatmap": built["heatmap"],
            "transcript": [
                {"start": s["start"], "end": s["end"], "text": s["text"]} for s in transcript["segments"]
            ],
            "clips": clips_out,
            "summary": built["summary"],
            "model": ai_result.get("_model", body.model),
            "analyzed_at": db.now_iso(),
        },
        "warnings": [],
    }
    conn = db.get_conn(SETTINGS.db_path)
    try:
        try:
            original = json.loads(job["result_json"] or "{}")
        except (TypeError, ValueError):
            original = {}
        original["analysis"] = response
        db.update_job(conn, job_id, status="done", progress=100, result_json=json.dumps(original))
        db.log_audit(conn, user["email"], "analisis", job_id)
    finally:
        conn.close()
    return response


@app.get("/api/jobs/{job_id}/analysis")
def job_get_analysis(job_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        try:
            analysis_result = json.loads(job["result_json"] or "{}").get("analysis")
        except (TypeError, ValueError):
            analysis_result = None
        if not analysis_result:
            return JSONResponse(status_code=404, content=error_envelope("unknown", "Hasil analisis belum tersedia."))
        return analysis_result
    finally:
        conn.close()


# ---------- B4 render ----------

@app.post("/api/jobs/{job_id}/render")
def job_render(job_id: str, body: JobRenderBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        media_path = _source_path(job)
        if body.clip_end <= body.clip_start or body.clip_end - body.clip_start > 300:
            return JSONResponse(status_code=400, content=error_envelope("invalid_range", "Rentang klip tidak valid."))
        quota_day = db.today_key()
        allowed, used = _claim_user_quota(conn, user, "render", SETTINGS.free_daily_render, quota_day)
        if not allowed:
            return _render_quota_error(user, used)
    finally:
        conn.close()
    if not media_path or not os.path.exists(media_path):
        try:
            media_path = _ensure_source_local(job_id, user, job)
        except storage.StorageError as exc:
            _release_user_quota(user, "render", quota_day)
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
        except (ValueError, RuntimeError) as exc:
            _release_user_quota(user, "render", quota_day)
            return JSONResponse(status_code=422, content=error_envelope("drive_not_accessible", str(exc)[:300]))
        except Exception as exc:
            _release_user_quota(user, "render", quota_day)
            logger.exception("Gagal menyiapkan sumber YouTube untuk render job %s", job_id)
            return JSONResponse(status_code=500, content=error_envelope("unknown", f"Gagal menyiapkan video: {str(exc)[:240]}"))
    if not media_path or not os.path.exists(media_path):
        _release_user_quota(user, "render", quota_day)
        return JSONResponse(status_code=404, content=error_envelope("unknown", "File media tidak ada."))
    job_path = media.job_dir(SETTINGS.data_dir, job_id)
    segments: list = []
    tpath = analysis.transcript_path(job_path)
    if os.path.exists(tpath):
        try:
            with open(tpath) as handle:
                segments = json.load(handle).get("segments", [])
        except (ValueError, OSError):
            segments = []
    try:
        result = render.render_clip(
            media_path, job_path, body.clip_start, body.clip_end,
            body.title_text, body.with_subtitles, segments,
        )
    except (RuntimeError, ValueError) as exc:
        _release_user_quota(user, "render", quota_day)
        return JSONResponse(status_code=400, content=error_envelope("invalid_range", str(exc)[:300]))
    except Exception as exc:
        _release_user_quota(user, "render", quota_day)
        logger.exception("Render gagal untuk job %s", job_id)
        return JSONResponse(status_code=500, content=error_envelope("unknown", f"Render gagal: {str(exc)[:240]}"))
    try:
        _persist_local_file(job_id, "renders", os.path.join(job_path, result["file"]), "video/mp4")
    except Exception as exc:
        _release_user_quota(user, "render", quota_day)
        logger.exception("Gagal menyimpan hasil render ke object storage untuk job %s", job_id)
        return JSONResponse(status_code=503, content=error_envelope("backend_offline", f"Hasil render gagal disimpan ke storage: {str(exc)[:180]}"))
    try:
        conn = db.get_conn(SETTINGS.db_path)
        try:
            render_job = db.create_job(conn, user["id"], "render", job.get("source", ""), job_id)
            db.update_job(
                conn, render_job["id"], status="done", progress=100,
                result_json=json.dumps(result),
            )
            db.log_audit(conn, user["email"], "render", f"{job_id}:{result['file']}")
        finally:
            conn.close()
    except Exception as exc:
        _release_user_quota(user, "render", quota_day)
        logger.exception("Gagal menyimpan hasil render untuk job %s", job_id)
        return JSONResponse(status_code=500, content=error_envelope("unknown", f"Hasil render gagal disimpan: {str(exc)[:240]}"))
    return {"job_id": job_id, "render_job_id": render_job["id"], **result,
            "download_url": f"/api/download/{job_id}/{result['file']}"}


@app.post("/api/jobs/{job_id}/render-batch")
def job_render_batch(job_id: str, body: JobRenderBatchBody, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    quota_day = db.today_key()
    quota_claimed = False
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        assert job is not None
        media_path = _source_path(job)
        allowed, used = _claim_user_quota(conn, user, "render", SETTINGS.free_daily_render, quota_day)
        if not allowed:
            return _render_quota_error(user, used)
        quota_claimed = True
        render_job = db.create_job(
            conn, user["id"], "render", job.get("source", ""), job_id,
            job_id=body.client_job_id,
        )
        db.update_job(conn, render_job["id"], status="running", progress=1)
    except Exception:
        if quota_claimed and quota_day:
            _release_user_quota(user, "render", quota_day)
        raise
    finally:
        conn.close()

    if not media_path or not os.path.exists(media_path):
        try:
            media_path = _ensure_source_local(job_id, user, job)
        except storage.StorageError as exc:
            _release_user_quota(user, "render", quota_day)
            conn = db.get_conn(SETTINGS.db_path)
            try:
                db.update_job(conn, render_job["id"], status="error", error_code="unknown", error_message=str(exc)[:300])
            finally:
                conn.close()
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
        except (ValueError, RuntimeError) as exc:
            _release_user_quota(user, "render", quota_day)
            conn = db.get_conn(SETTINGS.db_path)
            try:
                db.update_job(conn, render_job["id"], status="error", error_code="unknown", error_message=str(exc)[:300])
            finally:
                conn.close()
            return JSONResponse(status_code=422, content=error_envelope("drive_not_accessible", str(exc)[:300]))
        except Exception as exc:
            _release_user_quota(user, "render", quota_day)
            logger.exception("Gagal menyiapkan sumber YouTube untuk batch render job %s", job_id)
            conn = db.get_conn(SETTINGS.db_path)
            try:
                db.update_job(conn, render_job["id"], status="error", error_code="unknown", error_message=str(exc)[:300])
            finally:
                conn.close()
            return JSONResponse(status_code=500, content=error_envelope("unknown", f"Gagal menyiapkan video: {str(exc)[:240]}"))

    if not media_path or not os.path.exists(media_path):
        _release_user_quota(user, "render", quota_day)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, render_job["id"], status="error", error_code="unknown", error_message="File media tidak ada.")
        finally:
            conn.close()
        return JSONResponse(status_code=404, content=error_envelope("unknown", "File media tidak ada."))

    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.update_job(conn, render_job["id"], progress=10)
    finally:
        conn.close()

    job_path = media.job_dir(SETTINGS.data_dir, job_id)
    try:
        def studio_asset(name: str | None, kind: str) -> str | None:
            if not name:
                return None
            if os.path.basename(name) != name or not name.startswith(f"studio_{kind}_"):
                raise ValueError("Referensi aset Studio tidak valid.")
            path = os.path.realpath(os.path.join(job_path, name))
            if os.path.commonpath([os.path.realpath(job_path), path]) != os.path.realpath(job_path):
                raise ValueError("Aset Studio tidak ditemukan. Unggah ulang berkas audio.")
            if not os.path.isfile(path) and storage.is_r2_enabled():
                storage.materialize(storage.object_key(job_id, "studio", name), path)
            if not os.path.isfile(path):
                raise ValueError("Aset Studio tidak ditemukan. Unggah ulang berkas audio.")
            return path
        bgm_path = studio_asset(body.bgm_asset, "bgm")
        sfx_path = studio_asset(body.sfx_asset, "sfx")
        watermark_path = studio_asset(body.watermark_asset, "watermark")
        tpath = analysis.transcript_path(job_path)
        segments = []
        if os.path.exists(tpath):
            with open(tpath) as handle:
                segments = json.load(handle).get("segments", [])
        def work():
            outputs = []
            total = len(body.clips)
            for index, clip in enumerate(body.clips, 1):
                conn2 = db.get_conn(SETTINGS.db_path)
                try:
                    db.update_job(conn2, render_job["id"], progress=round(10 + (index - 1 + 0.15) / total * 90, 1))
                finally:
                    conn2.close()
                automatic_focus = None
                clip_auto_focus = body.auto_focus if clip.auto_focus is None else clip.auto_focus
                manual_focus_x = body.focal_x if clip.focal_x is None else clip.focal_x
                manual_focus_y = body.focal_y if clip.focal_y is None else clip.focal_y
                focus_anchor = body.focus_anchor if clip.focus_anchor is None else clip.focus_anchor
                is_letterbox = body.aspect == "16:9"
                if not is_letterbox and clip_auto_focus and render.auto_focus_available():
                    try:
                        automatic_focus = render.detect_auto_focus(media_path, clip.clip_start, clip.clip_end, body.aspect, focus_anchor)
                    except Exception:
                        logger.exception("Deteksi fokus otomatis gagal untuk klip %s", clip.clip_key)
                        automatic_focus = {"found": False, "mode": "manual-fallback", "reason": "detection-error"}
                focus_x = automatic_focus["focal_x"] if automatic_focus and automatic_focus.get("found") else manual_focus_x
                focus_y = automatic_focus["focal_y"] if automatic_focus and automatic_focus.get("found") else manual_focus_y
                result = render.render_clip(
                    media_path, job_path, clip.clip_start, clip.clip_end,
                    body.title_text or clip.title,
                    body.with_subtitles and body.caption != "off",
                    [segment.model_dump() for segment in clip.segments] if clip.segments is not None else segments,
                    body.caption,
                    body.aspect,
                    body.title_size,
                    body.title_case,
                    body.title_y,
                    body.caption_size,
                    body.caption_y,
                    body.title_font,
                    bgm_path,
                    sfx_path,
                    clip.hook_time,
                    body.source_volume,
                    body.bgm_volume,
                    body.sfx_volume,
                    body.bgm_ducking,
                    body.bgm_fade_in_ms,
                    body.bgm_fade_out_ms,
                    body.watermark_text,
                    body.encoder,
                    body.filename_prefix,
                    body.filename_suffix,
                    focus_x,
                    focus_y,
                    watermark_path,
                    body.watermark_size,
                    body.watermark_opacity,
                    body.watermark_x,
                    body.watermark_y,
                    body.title_x,
                    body.caption_x,
                    body.title_effect,
                    body.title_animation,
                    body.caption_effect,
                    body.caption_animation,
                    body.bgm_start_ms,
                    body.sfx_offset_ms,
                    automatic_focus.get("keyframes") if automatic_focus and automatic_focus.get("found") else None,
                    body.title_color,
                    body.title_effect_color,
                    body.title_animation_duration_ms,
                    body.caption_font,
                    body.caption_color,
                    body.caption_effect_color,
                    body.caption_animation_duration_ms,
                    body.caption_karaoke_color,
                )
                focus_detection = {"found": False, "mode": "not-applicable"} if is_letterbox else automatic_focus or {"found": False, "mode": "unavailable" if clip_auto_focus else "manual"}
                if not is_letterbox and clip_auto_focus and automatic_focus and not automatic_focus.get("found"):
                    focus_detection = {**automatic_focus, "mode": "manual-fallback"}
                result["focus_detection"] = {
                    **focus_detection,
                    "focal_x": focus_x,
                    "focal_y": focus_y,
                }
                _persist_local_file(job_id, "renders", os.path.join(job_path, result["file"]), "video/mp4")
                outputs.append({
                    "key": clip.clip_key,
                    "title": clip.title,
                    **result,
                    "download_url": f"/api/download/{job_id}/{result['file']}",
                })
                conn2 = db.get_conn(SETTINGS.db_path)
                try:
                    db.update_job(
                        conn2, render_job["id"],
                        progress=round(10 + index / total * 90, 1),
                        result_json=json.dumps({"outputs": outputs}),
                    )
                finally:
                    conn2.close()
            return outputs
        outputs = _RENDER_WORKER.submit(work).result(timeout=3600)
    except Exception as exc:
        _release_user_quota(user, "render", quota_day)
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, render_job["id"], status="error", error_code="unknown", error_message=str(exc)[:300])
        finally:
            conn.close()
        if isinstance(exc, storage.StorageError):
            return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
        return JSONResponse(status_code=400, content=error_envelope("unknown", f"Render gagal: {str(exc)[:240]}"))
    try:
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_job(conn, render_job["id"], status="done", progress=100, result_json=json.dumps({"outputs": outputs}))
            db.log_audit(conn, user["email"], "render-batch", f"{job_id}:{len(outputs)} klip")
        finally:
            conn.close()
    except Exception as exc:
        _release_user_quota(user, "render", quota_day)
        logger.exception("Gagal menyimpan hasil batch render untuk job %s", job_id)
        return JSONResponse(status_code=500, content=error_envelope("unknown", f"Hasil render gagal disimpan: {str(exc)[:240]}"))
    return {"render_job_id": render_job["id"], "outputs": outputs}


@app.get("/api/download/{job_id}/{filename}")
def download_clip(job_id: str, filename: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    safe = os.path.basename(filename)
    if safe != filename or not safe.endswith(".mp4"):
        return JSONResponse(status_code=400, content=error_envelope("invalid_url", "Nama file tidak valid."))
    conn = db.get_conn(SETTINGS.db_path)
    try:
        job, err = _job_or_error(conn, job_id, user)
        if err:
            return err
        path = os.path.join(media.job_dir(SETTINGS.data_dir, job_id), safe)
        if storage.is_r2_enabled():
            try:
                return RedirectResponse(
                    storage.presigned_get_url(storage.object_key(job_id, "renders", safe)),
                    status_code=307,
                )
            except storage.StorageError as exc:
                logger.exception("Gagal membuat URL unduhan render R2 untuk job %s", job_id)
                return JSONResponse(status_code=503, content=error_envelope("backend_offline", str(exc)))
        if not os.path.exists(path):
            return JSONResponse(status_code=404, content=error_envelope("unknown", "File tidak ada."))
        return FileResponse(path, media_type="video/mp4", filename=safe)
    finally:
        conn.close()
