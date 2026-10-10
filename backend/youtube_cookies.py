"""Validation and short-lived use of per-account YouTube cookies."""
import json
import os
import tempfile
from contextlib import contextmanager
from typing import Iterator, Optional

MAX_COOKIE_CHARS = 512_000
ALLOWED_COOKIE_DOMAINS = (
    "youtube.com",
    "youtube-nocookie.com",
    "google.com",
    "googleusercontent.com",
)


def _allowed_domain(value: str) -> bool:
    domain = value.strip().lower().removeprefix("#httponly_").lstrip(".")
    return any(domain == root or domain.endswith("." + root) for root in ALLOWED_COOKIE_DOMAINS)


def normalize_cookies(raw: str) -> tuple[str, int]:
    """Accept Netscape cookie text or Cookie-Editor JSON, retaining Google/YouTube cookies only."""
    text = raw.replace("\ufeff", "").replace("\ufffe", "").replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(text) > MAX_COOKIE_CHARS:
        raise ValueError("File cookie terlalu besar (maksimal 500 KB).")
    if not text:
        raise ValueError("File cookie kosong.")

    if text.startswith("[") or text.startswith("{"):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError("Format JSON cookie tidak valid.") from exc
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            raise ValueError("Format cookie harus berupa daftar JSON atau Netscape .txt.")
        lines = ["# Netscape HTTP Cookie File"]
        count = 0
        for item in parsed:
            if not isinstance(item, dict):
                continue
            domain = str(item.get("domain") or item.get("host") or "").strip()
            name = str(item.get("name") or "").strip()
            value = str(item.get("value") or "").strip()
            if not _allowed_domain(domain) or not name or not value or any("\t" in part or "\n" in part for part in (domain, name, value)):
                continue
            path = str(item.get("path") or "/").strip() or "/"
            secure = "TRUE" if item.get("secure") else "FALSE"
            try:
                expiry = int(float(item.get("expirationDate") or item.get("expires") or item.get("expiry") or 0))
            except (TypeError, ValueError):
                expiry = 0
            include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
            lines.append(f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expiry}\t{name}\t{value}")
            count += 1
        if not count:
            raise ValueError("Tidak ditemukan cookie YouTube atau Google yang valid.")
        return "\n".join(lines) + "\n", count

    kept = ["# Netscape HTTP Cookie File"]
    count = 0
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") and not stripped.lower().startswith("#httponly_"):
            continue
        fields = stripped.split("\t")
        if len(fields) != 7 or not _allowed_domain(fields[0]) or not fields[5] or not fields[6]:
            continue
        kept.append(stripped)
        count += 1
    if not count:
        raise ValueError("Tidak ditemukan cookie YouTube atau Google yang valid.")
    return "\n".join(kept) + "\n", count


@contextmanager
def temporary_cookie_file(data_dir: str, content: Optional[str]) -> Iterator[Optional[str]]:
    """Write decrypted cookies only for the duration of yt-dlp calls, then remove the file."""
    if not content:
        yield None
        return
    os.makedirs(data_dir, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix=".youtube-cookies-", suffix=".txt", dir=data_dir)
    try:
        try:
            os.fchmod(fd, 0o600)
        except OSError:
            pass
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        yield path
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
