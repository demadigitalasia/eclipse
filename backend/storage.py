"""Persistent media storage for local disk or Cloudflare R2.

FFmpeg continues to consume local paths. R2 objects are materialized into the
per-job workspace only when a processing/preview route needs them.
"""
from __future__ import annotations

from functools import lru_cache
import mimetypes
import os
import re

from backend.config import SETTINGS


class StorageError(RuntimeError):
    """A storage operation failed without exposing credentials to API callers."""


def is_r2_enabled() -> bool:
    return SETTINGS.storage_backend == "r2"


def object_key(job_id: str, category: str, filename: str) -> str:
    """Build a stable, non-user-identifying key under this app's prefix."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", job_id):
        raise ValueError("ID job tidak valid untuk object storage.")
    if category not in {"source", "studio", "renders"}:
        raise ValueError("Kategori object storage tidak valid.")
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name in {".", ".."} or "\\" in safe_name:
        raise ValueError("Nama file tidak valid untuk object storage.")
    return "/".join(part for part in (SETTINGS.r2_prefix, "jobs", job_id, category, safe_name) if part)


@lru_cache(maxsize=1)
def _client():
    if not is_r2_enabled():
        raise RuntimeError("Client R2 diminta ketika storage backend bukan R2.")
    try:
        import boto3
        from botocore.config import Config
    except ImportError as exc:
        raise StorageError("Storage R2 memerlukan dependency boto3. Pasang backend/requirements.txt.") from exc
    try:
        return boto3.client(
            "s3",
            endpoint_url=f"https://{SETTINGS.r2_account_id}.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id=SETTINGS.r2_access_key_id,
            aws_secret_access_key=SETTINGS.r2_secret_access_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
    except Exception as exc:
        raise StorageError("Tidak dapat membuat koneksi client Cloudflare R2.") from exc


def store_file(path: str, key: str, content_type: str | None = None) -> str | None:
    """Upload a local file to R2; return its key, or None in local mode."""
    if not is_r2_enabled():
        return None
    extra_args = {"ContentType": content_type or mimetypes.guess_type(path)[0] or "application/octet-stream"}
    try:
        _client().upload_file(path, SETTINGS.r2_bucket_name, key, ExtraArgs=extra_args)
    except Exception as exc:
        raise StorageError("Gagal mengunggah object ke Cloudflare R2.") from exc
    return key


def materialize(key: str, destination: str) -> str:
    """Download an R2 object to a local workspace path and return that path."""
    if not is_r2_enabled():
        raise RuntimeError("Tidak dapat mengunduh object saat storage backend bukan R2.")
    os.makedirs(os.path.dirname(os.path.abspath(destination)), exist_ok=True)
    temp_path = f"{destination}.partial"
    try:
        _client().download_file(SETTINGS.r2_bucket_name, key, temp_path)
        os.replace(temp_path, destination)
    except Exception as exc:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        if isinstance(exc, StorageError):
            raise
        raise StorageError("Gagal mengunduh object dari Cloudflare R2.") from exc
    return destination


def presigned_get_url(key: str) -> str:
    if not is_r2_enabled():
        raise RuntimeError("Presigned URL hanya tersedia untuk storage R2.")
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": SETTINGS.r2_bucket_name, "Key": key},
            ExpiresIn=SETTINGS.r2_presigned_url_ttl_seconds,
        )
    except Exception as exc:
        raise StorageError("Gagal membuat URL unduhan sementara dari Cloudflare R2.") from exc


def check_connection() -> None:
    """Validate that configured credentials can read the selected bucket prefix."""
    if not is_r2_enabled():
        raise StorageError("ECLIPSE_STORAGE_BACKEND harus 'r2' untuk memeriksa koneksi.")
    try:
        _client().list_objects_v2(
            Bucket=SETTINGS.r2_bucket_name,
            Prefix=f"{SETTINGS.r2_prefix}/jobs/",
            MaxKeys=1,
        )
    except Exception as exc:
        raise StorageError("Koneksi R2 gagal. Periksa Account ID, bucket, dan token Object Read & Write.") from exc


def delete_job_objects(job_id: str) -> int:
    """Delete all persisted objects for one job; safe to call more than once."""
    if not is_r2_enabled():
        return 0
    prefix = object_key(job_id, "source", "_").rsplit("/", 2)[0] + "/"
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    removed = 0
    try:
        for page in paginator.paginate(Bucket=SETTINGS.r2_bucket_name, Prefix=prefix):
            contents = page.get("Contents", [])
            for start in range(0, len(contents), 1000):
                batch = contents[start:start + 1000]
                if not batch:
                    continue
                response = client.delete_objects(
                    Bucket=SETTINGS.r2_bucket_name,
                    Delete={"Objects": [{"Key": item["Key"]} for item in batch], "Quiet": True},
                )
                errors = response.get("Errors", [])
                if errors:
                    raise StorageError(f"R2 gagal menghapus {len(errors)} object untuk job {job_id}.")
                removed += len(batch)
    except StorageError:
        raise
    except Exception as exc:
        raise StorageError(f"Gagal menghapus object R2 untuk job {job_id}.") from exc
    return removed
