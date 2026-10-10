"""Ingest media B2: upload lokal, YouTube (yt-dlp), Drive (unduhan langsung).

Aturan B0: server-side; tautan privat/tidak dapat diunduh ditolak dengan
error + arahan jelas; batas 2 GB / 180 menit ditegakkan; tidak ada
pengelakan izin sumber.
"""
import json
import logging
import os
import re
import shutil
import subprocess
import time
import uuid
from itertools import chain

from backend.core import limits
from backend.youtube_cookies import temporary_cookie_file
from backend.utils.proxy import ProxyTransportError, is_proxy_transport_error, redact_proxy_secret

CHUNK = 1024 * 1024
logger = logging.getLogger(__name__)

# yt-dlp only enables Deno by default. ECLIPSE's local/server runtime uses
# Node.js, so explicitly enable it for YouTube's supported JS challenge solver.
YOUTUBE_JS_RUNTIME = {"node": {}}


def job_dir(data_dir: str, job_id: str) -> str:
    path = os.path.join(data_dir, "jobs", job_id)
    os.makedirs(path, exist_ok=True)
    return path


def new_job_id(prefix: str = "job") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def ffprobe_metadata(path: str) -> dict:
    """Durasi/dimensi via ffprobe. Raise RuntimeError bila bukan media valid."""
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error", "-print_format", "json",
                "-show_format", "-show_streams", path,
            ],
            capture_output=True, text=True, timeout=120,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffprobe tidak tersedia di server.") from exc
    if proc.returncode != 0:
        raise RuntimeError(f"File bukan video valid: {(proc.stderr or '').strip()[:200]}")
    try:
        info = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError("ffprobe gagal membaca metadata.") from exc
    duration = float(info.get("format", {}).get("duration") or 0)
    width = height = 0
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video" and not width:
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
    if duration <= 0:
        raise RuntimeError("Durasi video tidak terbaca.")
    return {"duration": duration, "width": width, "height": height}


def check_duration(duration: float) -> None:
    if duration > limits.MAX_DURATION_SEC:
        raise ValueError(
            f"Durasi {duration / 60:.1f} menit melebihi batas MVP {limits.MAX_DURATION_SEC // 60} menit."
        )


def save_upload(data_dir: str, job_id: str, filename: str, stream, max_bytes: int) -> tuple[str, int]:
    """Simpan stream upload dengan batas ukuran. Kembalikan (path, bytes)."""
    from backend.schemas import is_accepted_file

    if not is_accepted_file(filename):
        raise ValueError("Format file belum didukung MVP. Gunakan MP4, MOV, MKV, WEBM, AVI, atau M4V.")
    ext = os.path.splitext(filename.lower())[1] or ".mp4"
    dest = os.path.join(job_dir(data_dir, job_id), f"source{ext}")
    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = stream.read(CHUNK)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                out.close()
                os.remove(dest)
                raise ValueError(f"File melebihi batas MVP {limits.MAX_SOURCE_LABEL}.")
            out.write(chunk)
    return dest, size


YOUTUBE_RE = re.compile(
    r"^(https?://)?(www\.|m\.)?(youtube\.com/(watch|shorts|embed|live)|youtu\.be/)", re.IGNORECASE
)


def youtube_info(url: str, cookiefile: str | None = None, proxy_url: str | None = None) -> dict:
    """Metadata tanpa unduh. Raise ValueError bila tak dapat diakses."""
    import yt_dlp

    try:
        options = {
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "noplaylist": True,
            "js_runtimes": YOUTUBE_JS_RUNTIME,
            # Metadata and captions are useful even when YouTube withholds
            # direct stream formats from this client.
            "ignore_no_formats_error": True,
            "extractor_args": {
                # web requires a GVS PO Token for direct formats; web_embedded
                # avoids that requirement for videos that allow embedding.
                "youtube": {"player_client": ["web_embedded"]}
            },
        }
        if proxy_url:
            options["proxy"] = proxy_url
        if cookiefile:
            options["cookiefile"] = cookiefile
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        safe_error = redact_proxy_secret(str(exc), proxy_url)
        logger.warning("YouTube metadata lookup failed (%s): %s", type(exc).__name__, safe_error)
        if proxy_url and is_proxy_transport_error(exc):
            raise ProxyTransportError(f"Koneksi proxy gagal: {safe_error}") from None
        raise ValueError("URL YouTube tidak dapat diakses dengan metode yang diizinkan.") from None
    if not info:
        raise ValueError("URL YouTube tidak dapat diakses dengan metode yang diizinkan.")
    return info


def youtube_embed_url(video_id: str, start: int = 0) -> str:
    """Return a privacy-enhanced YouTube player URL for previewing a source."""
    return f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0"


def download_youtube(
    data_dir: str, job_id: str, url: str, max_bytes: int, cookie_content: str | None = None,
    progress_callback=None, proxy_url: str | None = None,
) -> tuple[str, dict]:
    import yt_dlp

    with temporary_cookie_file(data_dir, cookie_content) as cookiefile:
        download_cookiefile = cookiefile
        try:
            meta = youtube_info(url, cookiefile, proxy_url)
        except ProxyTransportError:
            raise
        except ValueError:
            if not cookiefile:
                raise
            # Public videos often work without account cookies even when
            # YouTube rejects the logged-in player response. Keep cookies
            # saved, but retry this one video anonymously and use that same
            # mode for the download if metadata succeeds.
            try:
                meta = youtube_info(url, proxy_url=proxy_url)
                download_cookiefile = None
            except ProxyTransportError:
                raise
            except ValueError as public_error:
                raise ValueError(
                    "Video YouTube tidak dapat diakses, baik dengan cookie maupun tanpa cookie. "
                    "Pastikan video tersedia untuk server dan cookie masih aktif."
                ) from public_error
        duration = float(meta.get("duration") or 0)
        if duration:
            check_duration(duration)
        dest = os.path.join(job_dir(data_dir, job_id), "source.%(ext)s")
        params = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "js_runtimes": YOUTUBE_JS_RUNTIME,
            "extractor_args": {
                # Prefer Safari's pre-merged HLS streams (which can work
                # without a GVS PO Token), then keep embedded playback as a
                # fallback for videos that expose formats only there.
                "youtube": {"player_client": ["web_safari", "web_embedded"]}
            },
            # Keep source downloads compact and predictable; 720p is sufficient
            # for the vertical social exports ECLIPSE produces.
            "format": "bv*[height<=720]+ba/b[height<=720]/b",
            "max_filesize": max_bytes,
            "outtmpl": dest,
            "nooverwrites": False,
        }
        if proxy_url:
            params["proxy"] = proxy_url
        if progress_callback:
            def report_progress(status):
                if status.get("status") == "downloading":
                    total = status.get("total_bytes") or status.get("total_bytes_estimate") or 0
                    downloaded = status.get("downloaded_bytes") or 0
                    progress_callback(min(99.0, downloaded / total * 100) if total else 1.0)
                elif status.get("status") == "finished":
                    progress_callback(99.0)
            params["progress_hooks"] = [report_progress]
        if download_cookiefile:
            params["cookiefile"] = download_cookiefile
        try:
            with yt_dlp.YoutubeDL(params) as ydl:
                ydl.download([url])
        except Exception as exc:
            message = redact_proxy_secret(str(exc), proxy_url)
            if proxy_url and is_proxy_transport_error(exc):
                raise ProxyTransportError(f"Koneksi proxy gagal: {message}") from None
            if "Requested format is not available" in message or "No video formats found" in message:
                raise ValueError(
                    "YouTube tidak menyediakan stream video yang dapat diunduh server untuk tautan ini. "
                    "Cookie tersimpan tidak cukup untuk membuka stream tersebut. Coba unggah file video lokal."
                ) from None
            raise ValueError(f"Unduhan YouTube gagal: {message}") from None
        directory = job_dir(data_dir, job_id)
        files = [f for f in os.listdir(directory) if f.startswith("source.")]
        if not files:
            raise ValueError("Unduhan YouTube tidak menghasilkan file.")
        path = os.path.join(directory, files[0])
        if os.path.getsize(path) > max_bytes:
            os.remove(path)
            raise ValueError(f"Media YouTube melebihi batas MVP {limits.MAX_SOURCE_LABEL}.")
        return path, {"title": meta.get("title") or "Video YouTube", "duration": duration}


def download_youtube_subtitles(
    data_dir: str, job_id: str, url: str, cookie_content: str | None = None, proxy_url: str | None = None
) -> str:
    """Download a YouTube caption track as VTT/SRT text without fetching video."""
    import yt_dlp
    import logging

    logger = logging.getLogger("eclipse")

    with temporary_cookie_file(data_dir, cookie_content) as cookiefile:
        options = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "js_runtimes": YOUTUBE_JS_RUNTIME,
            "ignore_no_formats_error": True,
            "extractor_args": {"youtube": {"player_client": ["web_embedded"]}},
        }
        if proxy_url:
            options["proxy"] = proxy_url
        if cookiefile:
            options["cookiefile"] = cookiefile
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as exc:
            if proxy_url and is_proxy_transport_error(exc):
                raise ProxyTransportError(f"Koneksi proxy gagal: {redact_proxy_secret(str(exc), proxy_url)}") from None
            logger.warning("Gagal membaca metadata subtitle YouTube: %s", redact_proxy_secret(str(exc), proxy_url))
            raise ValueError("Subtitle YouTube tidak dapat diakses. Coba unggah subtitle manual.") from exc
        if not info:
            raise ValueError("Subtitle YouTube tidak dapat diakses. Coba unggah subtitle manual.")

        subtitle_tracks = info.get("subtitles") or {}
        automatic_tracks = info.get("automatic_captions") or {}
        preferences = ("id", "id-orig", "en", "en-orig")

        def is_caption_track(language: str, formats: list[dict]) -> bool:
            # yt-dlp exposes live chat replay under `subtitles` for some videos.
            # It is JSON chat data, not timed speech captions.
            if "live_chat" in language.lower():
                return False
            return any(
                str(track.get("ext") or "").lower() in
                {"vtt", "srt", "ttml", "srv1", "srv2", "srv3", "json3", "ass", "lrc"}
                for track in formats
            )

        candidates: list[tuple[str, str]] = []
        available: set[str] = set()
        for group_name, tracks in (("subtitles", subtitle_tracks), ("automatic_captions", automatic_tracks)):
            languages = [
                language for language, formats in tracks.items()
                if is_caption_track(language, formats if isinstance(formats, list) else [])
            ]
            available.update(languages)
            ordered = [language for language in preferences if language in languages]
            ordered.extend(language for language in languages if language not in ordered)
            candidates.extend((group_name, language) for language in ordered)

        if not candidates:
            logger.warning(
                "YouTube %s tidak menyediakan track subtitle yang dapat dipakai (track tersedia: %s)",
                info.get("id") or "unknown", ", ".join(sorted(available)) or "tidak ada",
            )
            raise ValueError("Video YouTube tidak menyediakan subtitle. Unggah berkas .srt atau .txt secara manual.")

        job_path = job_dir(data_dir, job_id)
        path = None
        for group_name, language in candidates:
            prefix = f"youtube_subtitle-{group_name}-{language}"
            for filename in os.listdir(job_path):
                if filename.startswith(prefix):
                    try:
                        os.remove(os.path.join(job_path, filename))
                    except OSError:
                        pass
            params = {
                **options,
                "skip_download": True,
                "writesubtitles": group_name == "subtitles",
                "writeautomaticsub": group_name == "automatic_captions",
                "subtitleslangs": [language],
                "subtitlesformat": "vtt/best",
                "convertsubtitles": "srt",
                "outtmpl": os.path.join(job_path, f"{prefix}.%(ext)s"),
            }
            try:
                with yt_dlp.YoutubeDL(params) as ydl:
                    ydl.download([url])
            except Exception as exc:
                if proxy_url and is_proxy_transport_error(exc):
                    raise ProxyTransportError(f"Koneksi proxy gagal: {redact_proxy_secret(str(exc), proxy_url)}") from None
                logger.warning("Track subtitle YouTube gagal (%s, %s): %s", group_name, language, redact_proxy_secret(str(exc), proxy_url))
                continue

            files = sorted(
                os.path.join(job_path, name)
                for name in os.listdir(job_path)
                if name.startswith(prefix) and name.lower().endswith((".vtt", ".srt", ".txt"))
            )
            if files:
                path = files[0]
                break

        if path is None:
            raise ValueError("Subtitle YouTube tidak berhasil diambil. Coba unggah berkas .srt atau .txt secara manual.")

    if os.path.getsize(path) > 1_000_000:
        raise ValueError("Berkas subtitle YouTube terlalu besar untuk diproses.")
    with open(path, encoding="utf-8", errors="replace") as subtitle_file:
        return subtitle_file.read()


DRIVE_ID_RES = [
    re.compile(r"drive\.google\.com/file/d/([A-Za-z0-9_-]+)"),
    re.compile(r"drive\.google\.com/open\?id=([A-Za-z0-9_-]+)"),
    re.compile(r"[?&]id=([A-Za-z0-9_-]{10,})"),
]


def drive_file_id(url: str) -> str:
    for rx in DRIVE_ID_RES:
        match = rx.search(url)
        if match:
            return match.group(1)
    raise ValueError(
        "Tautan Google Drive tidak valid. Gunakan tautan berbagi "
        "(drive.google.com) yang dapat diakses “Siapa saja yang memiliki link”."
    )


def download_drive(
    data_dir: str, job_id: str, url: str, max_bytes: int, proxy_url: str | None = None
) -> tuple[str, dict]:
    """Unduhan langsung file publik Drive (tanpa OAuth)."""
    import httpx

    file_id = drive_file_id(url)
    dest = os.path.join(job_dir(data_dir, job_id), "source.mp4")
    session = httpx.Client(timeout=httpx.Timeout(60, read=180), follow_redirects=True, proxy=proxy_url)
    try:
        query = {"export": "download", "id": file_id}
        for attempt in range(2):
            with session.stream("GET", "https://drive.google.com/uc", params=query) as resp:
                if resp.status_code != 200:
                    raise ValueError("Tautan Drive privat/tidak dapat diunduh. Ubah akses ke Viewer bagi siapa saja yang memiliki link.")
                declared = int(resp.headers.get("content-length") or 0)
                if declared > max_bytes:
                    raise ValueError(f"Media Drive melebihi batas MVP {limits.MAX_SOURCE_LABEL}.")
                chunks = iter(resp.iter_bytes(CHUNK))
                prefix_parts: list[bytes] = []
                prefix_size = 0
                while prefix_size < 64 * 1024:
                    try:
                        part = next(chunks)
                    except StopIteration:
                        break
                    prefix_parts.append(part)
                    prefix_size += len(part)
                prefix = b"".join(prefix_parts)
                ctype = resp.headers.get("content-type", "").lower()
                looks_html = "text/html" in ctype or prefix.lstrip().lower().startswith((b"<!doctype html", b"<html"))
                if looks_html:
                    match = re.search(rb"confirm=([A-Za-z0-9_-]+)", prefix)
                    if attempt == 0 and match:
                        query = {"export": "download", "id": file_id, "confirm": match.group(1).decode("ascii")}
                        continue
                    raise ValueError("Tautan Drive privat/tidak dapat diunduh. Ubah akses ke Viewer bagi siapa saja yang memiliki link.")
                size = 0
                try:
                    with open(dest, "wb") as out:
                        for chunk in chain(prefix_parts, chunks):
                            size += len(chunk)
                            if size > max_bytes:
                                raise ValueError(f"Media Drive melebihi batas MVP {limits.MAX_SOURCE_LABEL}.")
                            out.write(chunk)
                except Exception:
                    if os.path.exists(dest):
                        os.remove(dest)
                    raise
                break
    except ValueError:
        if os.path.exists(dest):
            os.remove(dest)
        raise
    except Exception as exc:
        if os.path.exists(dest):
            os.remove(dest)
        message = redact_proxy_secret(str(exc), proxy_url)
        if proxy_url and is_proxy_transport_error(exc):
            raise ProxyTransportError(f"Koneksi proxy gagal: {message}") from None
        raise ValueError(f"Unduhan Drive gagal: {message}") from None
    finally:
        session.close()
    if size == 0:
        raise ValueError("Unduhan Drive kosong atau tidak dapat diakses.")
    return dest, {"title": "File Drive", "duration": 0}


def cleanup_old_jobs(data_dir: str, ttl_hours: int) -> int:
    """Hapus direktori job lebih tua dari TTL. Kembalikan jumlah dihapus."""
    base = os.path.join(data_dir, "jobs")
    if not os.path.isdir(base):
        return 0
    cutoff = time.time() - ttl_hours * 3600
    removed = 0
    for name in os.listdir(base):
        path = os.path.join(base, name)
        try:
            if os.path.isdir(path) and os.path.getmtime(path) < cutoff:
                shutil.rmtree(path, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    return removed
