"""Encrypted Gemini key pool and real multimodal candidate analysis."""
import json
import logging
import mimetypes
import os
import re
import time
import uuid
from typing import Any

import httpx

from backend import db
from backend.config import SETTINGS
from backend.secrets import decrypt_secret, encrypt_secret

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
UPLOAD_ROOT = "https://generativelanguage.googleapis.com/upload/v1beta/files"
FLASH_FALLBACK_MODELS = (
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
)
FLASH_MODEL_ID = re.compile(r"^gemini-\d+(?:\.\d+)?-flash(?:-lite)?(?:-preview)?$")


class GeminiError(RuntimeError):
    pass


class GeminiProviderError(GeminiError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code


def _safe_entry(row: dict[str, Any]) -> dict[str, Any]:
    secret = decrypt_secret(row["ciphertext"])
    return {
        "id": row["id"], "alias": row["alias"], "project": row["project"],
        "maskedKey": "•" * 12 + secret[-4:], "enabled": bool(row["enabled"]),
        "priority": row["priority"], "status": row["status"], "lastCheck": row["last_check"],
    }


def list_entries() -> list[dict[str, Any]]:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        rows = conn.execute("SELECT * FROM gemini_keys ORDER BY priority, created_at").fetchall()
        health_rows = conn.execute("SELECT * FROM gemini_project_health").fetchall()
        health = {row["project"]: db.row_to_dict(row) for row in health_rows}
        entries = []
        for row in rows:
            entry = db.row_to_dict(row)
            safe = _safe_entry(entry)
            project_health = health.get(entry["project"], {})
            safe["projectCooldownUntil"] = float(project_health.get("cooldown_until") or 0)
            safe["projectFailures"] = int(project_health.get("consecutive_failures") or 0)
            entries.append(safe)
        return entries
    finally:
        conn.close()


def add_entry(alias: str, project: str, api_key: str) -> dict[str, Any]:
    alias, project, api_key = alias.strip(), project.strip(), api_key.strip()
    if not alias or not project or not api_key:
        raise ValueError("Nama, Google project, dan API key wajib diisi.")
    if len(api_key) > 500 or len(project) > 200:
        raise ValueError("Nilai kredensial terlalu panjang.")
    conn = db.get_conn(SETTINGS.db_path)
    try:
        existing = conn.execute("SELECT ciphertext FROM gemini_keys").fetchall()
        if any(decrypt_secret(row["ciphertext"]) == api_key for row in existing):
            raise ValueError("API key tersebut sudah terdaftar.")
        row = conn.execute("SELECT COALESCE(MAX(priority), -1) + 1 AS next FROM gemini_keys").fetchone()
        key_id = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO gemini_keys (id, alias, project, ciphertext, enabled, priority, status, last_check, created_at)"
            " VALUES (?, ?, ?, ?, 1, ?, 'untested', '', ?)",
            (key_id, alias, project, encrypt_secret(api_key), int(row["next"]), db.now_iso()),
        )
        conn.commit()
        saved = conn.execute("SELECT * FROM gemini_keys WHERE id = ?", (key_id,)).fetchone()
        assert saved is not None
        return _safe_entry(db.row_to_dict(saved))
    finally:
        conn.close()


def update_entry(key_id: str, enabled: bool | None = None, priority: int | None = None) -> bool:
    fields, values = [], []
    if enabled is not None:
        fields.append("enabled = ?")
        values.append(int(enabled))
    if priority is not None:
        fields.append("priority = ?")
        values.append(max(0, min(priority, 1000)))
    if not fields:
        return False
    conn = db.get_conn(SETTINGS.db_path)
    try:
        cur = conn.execute(f"UPDATE gemini_keys SET {', '.join(fields)} WHERE id = ?", (*values, key_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_entry(key_id: str) -> bool:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        cur = conn.execute("DELETE FROM gemini_keys WHERE id = ?", (key_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _enabled_keys() -> list[dict[str, Any]]:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            "SELECT * FROM gemini_keys WHERE enabled = 1 AND status != 'invalid' ORDER BY priority, created_at"
        ).fetchall()
        health_rows = conn.execute("SELECT * FROM gemini_project_health").fetchall()
        health = {row["project"]: db.row_to_dict(row) for row in health_rows}
        groups: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            entry = db.row_to_dict(row)
            groups.setdefault(entry["project"], []).append(entry)
        now = time.time()
        projects = list(groups)
        available = [project for project in projects if float(health.get(project, {}).get("cooldown_until") or 0) <= now]
        if not available and projects:
            available = [min(projects, key=lambda project: float(health.get(project, {}).get("cooldown_until") or 0))]
        available.sort(key=lambda project: (
            float(health.get(project, {}).get("last_used_at") or 0),
            min(entry["priority"] for entry in groups[project]),
            project,
        ))
        # Advance the project rotation atomically so concurrent analyses are spread
        # across independent quota buckets rather than all choosing the first key.
        if available:
            selected = available[0]
            conn.execute(
                "INSERT INTO gemini_project_health (project, last_used_at, last_check) VALUES (?, ?, ?) "
                "ON CONFLICT(project) DO UPDATE SET last_used_at=excluded.last_used_at",
                (selected, now, db.now_iso()),
            )
        keys = [entry for project in available for entry in groups[project]]
        conn.commit()
    finally:
        conn.close()
    usable = []
    for row in keys:
        row["api_key"] = decrypt_secret(row["ciphertext"])
        usable.append(row)
    return usable


def has_enabled_keys() -> bool:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        return conn.execute("SELECT 1 FROM gemini_keys WHERE enabled = 1 LIMIT 1").fetchone() is not None
    finally:
        conn.close()


def _update_check(key_id: str, status: str) -> None:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("UPDATE gemini_keys SET status = ?, last_check = ? WHERE id = ?", (status, db.now_iso(), key_id))
        if status == "healthy":
            project = conn.execute("SELECT project FROM gemini_keys WHERE id = ?", (key_id,)).fetchone()
            if project:
                conn.execute(
                    "UPDATE gemini_project_health SET cooldown_until = 0, consecutive_failures = 0, last_check = ? WHERE project = ?",
                    (db.now_iso(), project["project"]),
                )
        conn.commit()
    finally:
        conn.close()


def _cooldown_project(project: str, seconds: int) -> None:
    now = time.time()
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute(
            "INSERT INTO gemini_project_health (project, cooldown_until, consecutive_failures, last_check) "
            "VALUES (?, ?, 1, ?) ON CONFLICT(project) DO UPDATE SET "
            "cooldown_until=excluded.cooldown_until, consecutive_failures=gemini_project_health.consecutive_failures + 1, "
            "last_check=excluded.last_check",
            (project, now + seconds, db.now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _report_provider_failure(entry: dict[str, Any], error: Exception) -> None:
    if isinstance(error, GeminiProviderError):
        if error.status_code == 401:
            _update_check(entry["id"], "invalid")
        elif error.status_code == 403:
            _cooldown_project(str(entry.get("project") or ""), 60)
        elif error.status_code == 429:
            _cooldown_project(str(entry.get("project") or ""), 60)
        elif error.status_code >= 500:
            _cooldown_project(str(entry.get("project") or ""), 20)
    elif isinstance(error, httpx.HTTPError):
        _cooldown_project(str(entry.get("project") or ""), 15)


def _clear_project_cooldown(project: str) -> None:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute(
            "INSERT INTO gemini_project_health (project, cooldown_until, consecutive_failures, last_check) "
            "VALUES (?, 0, 0, ?) ON CONFLICT(project) DO UPDATE SET cooldown_until=0, consecutive_failures=0, last_check=excluded.last_check",
            (project, db.now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def test_entry(key_id: str) -> tuple[bool, str]:
    conn = db.get_conn(SETTINGS.db_path)
    try:
        row = conn.execute("SELECT * FROM gemini_keys WHERE id = ?", (key_id,)).fetchone()
        if not row:
            raise ValueError("API key tidak ditemukan.")
        entry = db.row_to_dict(row)
    finally:
        conn.close()
    api_key = decrypt_secret(entry["ciphertext"])
    try:
        response = httpx.get(f"{API_ROOT}/models", headers={"x-goog-api-key": api_key}, timeout=20)
        if response.is_success:
            _update_check(key_id, "healthy")
            return True, "Koneksi Gemini berhasil."
        detail = response.json().get("error", {}).get("message", "Provider menolak key.")
        _update_check(key_id, "invalid" if response.status_code == 401 else "error")
        return False, f"Gemini menolak key (HTTP {response.status_code}): {detail[:180]}"
    except httpx.HTTPError as exc:
        _update_check(key_id, "error")
        return False, f"Koneksi Gemini gagal: {str(exc)[:180]}"


def _available_flash_models(api_key: str, preferred: str) -> list[str]:
    """Return Flash models exposed to one specific API key, with preferred first."""
    try:
        response = httpx.get(f"{API_ROOT}/models", headers={"x-goog-api-key": api_key}, timeout=20)
        response.raise_for_status()
        models = response.json().get("models", [])
    except (httpx.HTTPError, ValueError) as exc:
        logging.getLogger("eclipse").warning("Tidak dapat memuat daftar model Gemini untuk fallback: %s", exc)
        return [preferred]

    available: set[str] = set()
    for item in models if isinstance(models, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").removeprefix("models/")
        methods = item.get("supportedGenerationMethods")
        if FLASH_MODEL_ID.fullmatch(name) and (not methods or "generateContent" in methods):
            available.add(name)
    ordered = [name for name in FLASH_FALLBACK_MODELS if name in available]
    ordered.extend(sorted(available - set(ordered)))
    return [preferred, *(name for name in ordered if name != preferred)]


def _extract_output(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    texts: list[str] = []
    output = payload.get("output", payload.get("outputs", []))
    for item in output if isinstance(output, list) else []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text" and isinstance(item.get("text"), str):
            texts.append(item["text"])
        for part in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if part.get("type") == "text" and isinstance(part.get("text"), str):
                texts.append(part["text"])
    for step in payload.get("steps", []) if isinstance(payload.get("steps"), list) else []:
        if not isinstance(step, dict):
            continue
        for part in step.get("content", []) if isinstance(step.get("content"), list) else []:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text" and isinstance(part.get("text"), str):
                texts.append(part["text"])
    return "\n".join(texts)


def _record_interaction_usage(
    entry: dict[str, Any], model: str, operation: str, account_id: str, job_id: str,
    status: str, http_status: int | None = None, payload: dict[str, Any] | None = None,
) -> None:
    """Persist provider counters without allowing ledger failures to fail analysis."""
    usage = payload.get("usage") if isinstance(payload, dict) else None
    try:
        db.record_gemini_usage(
            SETTINGS.db_path,
            account_id=account_id,
            job_id=job_id,
            key_id=str(entry.get("id") or ""),
            key_alias=str(entry.get("alias") or ""),
            project=str(entry.get("project") or ""),
            model=model,
            operation=operation,
            status=status,
            http_status=http_status,
            usage=usage if isinstance(usage, dict) else None,
        )
    except Exception:
        logging.getLogger("eclipse").exception("Gagal mencatat usage Gemini untuk job %s", job_id or "-")


def _raise_provider_error(response: httpx.Response) -> None:
    """Keep the provider's actionable error while never including request headers."""
    try:
        body = response.json()
    except ValueError:
        body = {}
    error = body.get("error", {}) if isinstance(body, dict) else {}
    if not isinstance(error, dict):
        error = {}
    status = str(error.get("status") or "").strip()
    message = str(error.get("message") or "").strip()
    detail = " — ".join(part for part in (status, message) if part)
    if not detail:
        detail = "Provider tidak memberikan detail error."
    raise GeminiProviderError(response.status_code, f"Gemini menolak request (HTTP {response.status_code}): {detail[:240]}")


def _json_text(raw: str) -> dict[str, Any]:
    value = raw.strip()
    value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.IGNORECASE)
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        start, end = value.find("{"), value.rfind("}")
        if start < 0 or end <= start:
            raise GeminiError("Gemini tidak menghasilkan JSON kandidat yang valid.") from exc
        try:
            parsed = json.loads(value[start:end + 1])
        except json.JSONDecodeError as nested:
            raise GeminiError("Gemini mengembalikan struktur kandidat yang tidak valid.") from nested
    if not isinstance(parsed, dict):
        raise GeminiError("Format hasil Gemini tidak sesuai.")
    return parsed


def _upload_video(client: httpx.Client, path: str, api_key: str) -> tuple[str, str]:
    size = os.path.getsize(path)
    mime = mimetypes.guess_type(path)[0] or "video/mp4"
    start = client.post(
        UPLOAD_ROOT,
        headers={
            "x-goog-api-key": api_key,
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(size),
            "X-Goog-Upload-Header-Content-Type": mime,
            "Content-Type": "application/json",
        },
        json={"file": {"display_name": os.path.basename(path)}},
        timeout=60,
    )
    start.raise_for_status()
    upload_url = start.headers.get("x-goog-upload-url")
    if not upload_url:
        raise GeminiError("Gemini tidak memberikan URL upload.")
    with open(path, "rb") as handle:
        uploaded = client.post(
            upload_url,
            headers={
                "Content-Length": str(size),
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
            },
            content=handle,
            timeout=httpx.Timeout(1800, connect=30),
        )
    uploaded.raise_for_status()
    body = uploaded.json().get("file", uploaded.json())
    file_name, uri = body.get("name"), body.get("uri")
    if not file_name or not uri:
        raise GeminiError("Gemini mengembalikan metadata file yang tidak lengkap.")
    return file_name, uri


def analyze_video(
    path: str,
    transcript: list[dict[str, Any]],
    model: str,
    prompt: str,
    count: int,
    duration_seconds: int,
    account_id: str = "",
    job_id: str = "",
) -> dict[str, Any]:
    keys = _enabled_keys()
    if not keys:
        message = "Semua key Gemini ditandai tidak valid. Periksa key di panel admin." if has_enabled_keys() else "Pool API Gemini belum dikonfigurasi. Administrator perlu menambahkan API key aktif."
        raise GeminiError(message)
    transcript_text = "\n".join(
        f"{s['start']:.2f}-{s['end']:.2f}s: {s['text']}" for s in transcript
    )
    instruction = (
        "Pilih momen video yang benar-benar menarik untuk dijadikan klip pendek. "
        "Gunakan isi video dan transkrip bertimestamp berikut; jangan mengarang dialog atau waktu. "
        f"Pilih paling banyak {count} klip, durasi tiap klip sekitar {duration_seconds} detik, "
        f"rentang video {max((s['end'] for s in transcript), default=0):.2f} detik. "
        f"Permintaan pengguna: {prompt or 'pilih momen paling kuat secara editorial'}. "
        "Balas HANYA JSON: {\"summary\": string, \"clips\": [{\"title\": string, \"start_time\": number, "
        "\"end_time\": number, \"hook_time\": number, \"virality_score\": number (0-100), "
        "\"caption\": string}]}. Waktu adalah detik relatif terhadap awal video."
        "\nTRANSKRIP BERTIMESTAMP:\n" + transcript_text[:85000]
    )
    last_error: Exception | None = None
    failed_projects: set[str] = set()
    for entry in keys:
        if entry.get("project") in failed_projects:
            continue
        file_name = None
        try:
            models = _available_flash_models(entry["api_key"], model)
            with httpx.Client(timeout=httpx.Timeout(1800, connect=30)) as client:
                file_name, file_uri = _upload_video(client, path, entry["api_key"])
                deadline = time.monotonic() + 600
                while True:
                    status = client.get(f"{API_ROOT}/{file_name}", headers={"x-goog-api-key": entry["api_key"]})
                    status.raise_for_status()
                    file_info = status.json()
                    state = file_info.get("state", "ACTIVE")
                    if state == "ACTIVE":
                        file_uri = file_info.get("uri", file_uri)
                        break
                    if state == "FAILED" or time.monotonic() >= deadline:
                        raise GeminiError("Gemini gagal memproses file video.")
                    time.sleep(3)
                model_error: Exception | None = None
                for model_name in models:
                    try:
                        try:
                            interaction = client.post(
                                f"{API_ROOT}/interactions",
                                headers={"x-goog-api-key": entry["api_key"], "Content-Type": "application/json"},
                                json={
                                    "model": model_name,
                                    "input": [
                                        {"type": "video", "uri": file_uri, "mime_type": file_info.get("mimeType", "video/mp4")},
                                        {"type": "text", "text": instruction},
                                    ],
                                },
                            )
                        except httpx.HTTPError:
                            _record_interaction_usage(entry, model_name, "video", account_id, job_id, "failed")
                            raise
                        if not interaction.is_success:
                            try:
                                error_payload = interaction.json()
                            except ValueError:
                                error_payload = None
                            _record_interaction_usage(
                                entry, model_name, "video", account_id, job_id, "failed",
                                interaction.status_code, error_payload,
                            )
                            _raise_provider_error(interaction)
                        try:
                            response_payload = interaction.json()
                        except ValueError as exc:
                            # A successful HTTP response may still be billable even when its
                            # body cannot be parsed, so preserve the attempt with unknown usage.
                            _record_interaction_usage(
                                entry, model_name, "video", account_id, job_id, "succeeded",
                                interaction.status_code,
                            )
                            raise GeminiError("Gemini mengembalikan respons yang tidak valid.") from exc
                        _record_interaction_usage(
                            entry, model_name, "video", account_id, job_id, "succeeded",
                            interaction.status_code, response_payload,
                        )
                        result = _json_text(_extract_output(response_payload))
                        result["_model"] = model_name
                        _update_check(entry["id"], "healthy")
                        return result
                    except GeminiProviderError as exc:
                        model_error = exc
                        logging.getLogger("eclipse").warning(
                            "Analisis video gagal pada project Gemini %s dengan %s: %s",
                            entry.get("project", "unknown"), model_name, exc,
                        )
                        if exc.status_code == 401:
                            break
                        if exc.status_code in {403, 429} or exc.status_code >= 500:
                            break
                    except (GeminiError, ValueError) as exc:
                        model_error = exc
                        logging.getLogger("eclipse").warning(
                            "Analisis video gagal pada project Gemini %s dengan %s: %s",
                            entry.get("project", "unknown"), model_name, exc,
                        )
                if model_error:
                    raise model_error
        except (httpx.HTTPError, GeminiError, ValueError) as exc:
            last_error = exc
            logging.getLogger("eclipse").warning(
                "Analisis video gagal pada project Gemini %s: %s", entry.get("project", "unknown"), exc
            )
            _report_provider_failure(entry, exc)
            if isinstance(exc, GeminiProviderError) and 400 <= exc.status_code < 500 and exc.status_code not in {401, 403, 404, 429}:
                raise
            if isinstance(exc, httpx.HTTPError) or isinstance(exc, GeminiProviderError) and (exc.status_code in {403, 429} or exc.status_code >= 500):
                failed_projects.add(str(entry.get("project") or ""))
            continue
        finally:
            if file_name:
                try:
                    httpx.delete(
                        f"{API_ROOT}/{file_name}",
                        headers={"x-goog-api-key": entry["api_key"]},
                        timeout=20,
                    )
                except httpx.HTTPError:
                    pass
    raise GeminiError(f"Semua project Gemini aktif gagal: {str(last_error or 'unknown error')[:220]}")


def analyze_transcript(
    transcript: list[dict[str, Any]],
    model: str,
    prompt: str,
    count: int,
    duration_seconds: int,
    account_id: str = "",
    job_id: str = "",
) -> dict[str, Any]:
    """Analyze timestamped captions without uploading or downloading the source video."""
    keys = _enabled_keys()
    if not keys:
        message = "Semua key Gemini ditandai tidak valid. Periksa key di panel admin." if has_enabled_keys() else "Pool API Gemini belum dikonfigurasi. Administrator perlu menambahkan API key aktif."
        raise GeminiError(message)
    transcript_text = "\n".join(
        f"{s['start']:.2f}-{s['end']:.2f}s: {s['text']}" for s in transcript
    )
    instruction = (
        "Pilih momen paling menarik untuk klip pendek hanya berdasarkan transkrip bertimestamp. "
        "Jangan mengarang dialog atau waktu. "
        f"Pilih paling banyak {count} klip berdurasi sekitar {duration_seconds} detik; "
        f"durasi transkrip {max((s['end'] for s in transcript), default=0):.2f} detik. "
        f"Permintaan pengguna: {prompt or 'pilih momen paling kuat secara editorial'}. "
        "Balas HANYA JSON: {\"summary\": string, \"clips\": [{\"title\": string, \"start_time\": number, "
        "\"end_time\": number, \"hook_time\": number, \"virality_score\": number (0-100), \"caption\": string}]}. "
        "Waktu adalah detik relatif terhadap awal video.\nTRANSKRIP BERTIMESTAMP:\n" + transcript_text[:85000]
    )
    last_error: Exception | None = None
    failed_projects: set[str] = set()
    for entry in keys:
        if entry.get("project") in failed_projects:
            continue
        models = _available_flash_models(entry["api_key"], model)
        for model_name in models:
            try:
                with httpx.Client(timeout=httpx.Timeout(300, connect=30)) as client:
                    try:
                        interaction = client.post(
                            f"{API_ROOT}/interactions",
                            headers={"x-goog-api-key": entry["api_key"], "Content-Type": "application/json"},
                            json={"model": model_name, "input": [{"type": "text", "text": instruction}]},
                        )
                    except httpx.HTTPError:
                        _record_interaction_usage(entry, model_name, "transcript", account_id, job_id, "failed")
                        raise
                    if not interaction.is_success:
                        try:
                            error_payload = interaction.json()
                        except ValueError:
                            error_payload = None
                        _record_interaction_usage(
                            entry, model_name, "transcript", account_id, job_id, "failed",
                            interaction.status_code, error_payload,
                        )
                        _raise_provider_error(interaction)
                    try:
                        response_payload = interaction.json()
                    except ValueError as exc:
                        _record_interaction_usage(
                            entry, model_name, "transcript", account_id, job_id, "succeeded",
                            interaction.status_code,
                        )
                        raise GeminiError("Gemini mengembalikan respons yang tidak valid.") from exc
                    _record_interaction_usage(
                        entry, model_name, "transcript", account_id, job_id, "succeeded",
                        interaction.status_code, response_payload,
                    )
                    result = _json_text(_extract_output(response_payload))
                    result["_model"] = model_name
                    _update_check(entry["id"], "healthy")
                    return result
            except GeminiProviderError as exc:
                last_error = exc
                logging.getLogger("eclipse").warning(
                    "Analisis transkrip gagal pada project Gemini %s dengan %s: %s",
                    entry.get("project", "unknown"), model_name, exc,
                )
                _report_provider_failure(entry, exc)
                if 400 <= exc.status_code < 500 and exc.status_code not in {401, 403, 404, 429}:
                    raise
                if exc.status_code in {401, 403}:
                    break
                if exc.status_code == 503:
                    # Capacity errors can affect one model temporarily; try the
                    # next Flash model advertised to this key before giving up.
                    continue
                if exc.status_code in {403, 429} or exc.status_code >= 500:
                    failed_projects.add(str(entry.get("project") or ""))
                    break
                continue
            except (httpx.HTTPError, GeminiError, ValueError) as exc:
                last_error = exc
                logging.getLogger("eclipse").warning(
                    "Analisis transkrip gagal pada project Gemini %s dengan %s: %s",
                    entry.get("project", "unknown"), model_name, exc,
                )
                _report_provider_failure(entry, exc)
                if isinstance(exc, (httpx.HTTPError, ValueError)):
                    if isinstance(exc, httpx.HTTPError):
                        failed_projects.add(str(entry.get("project") or ""))
                    break
                continue
    raise GeminiError(f"Semua project Gemini aktif gagal: {str(last_error or 'unknown error')[:220]}")
