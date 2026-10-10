"""Backend configuration (B1): validated env + shared logger.

Memenuhi import ``from backend.config import logger`` pada
``backend/utils/egress.py`` yang sudah ada di checkout.
"""
import logging
import os
from dataclasses import dataclass
from dotenv import load_dotenv


# Keep runtime secrets in backend/.env for local use; deployment environment
# variables take precedence and must never be overwritten by the file.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=False)


logger = logging.getLogger("eclipse")


def _get_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise ValueError(f"Env {name} harus bilangan bulat: {exc}") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"Env {name} harus {minimum}–{maximum}, dapat {value}")
    return value


def _get_float(name: str, default: float, minimum: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise ValueError(f"Env {name} harus angka: {exc}") from exc
    if value < minimum:
        raise ValueError(f"Env {name} minimal {minimum}, dapat {value}")
    return value


@dataclass(frozen=True)
class Settings:
    data_dir: str
    db_path: str
    storage_backend: str
    r2_account_id: str
    r2_bucket_name: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_prefix: str
    r2_presigned_url_ttl_seconds: int
    port: int
    version: str
    allowed_origins: tuple[str, ...]
    log_level: str
    cookie_secure: bool
    allow_registration: bool
    reset_code_logging: bool
    reset_smtp_host: str
    reset_smtp_port: int
    reset_smtp_username: str
    reset_smtp_password: str
    reset_smtp_from: str
    reset_smtp_starttls: bool
    # Keputusan B0 (8 Okt 2026)
    free_daily_analyze: int
    free_daily_render: int
    free_render_trial_days: int
    lite_daily_render: int
    lite_monthly_price_idr: int
    pro_daily_render: int
    pro_monthly_price_idr: int
    max_batch_clips: int
    metadata_retention_days: int
    temp_file_ttl_hours: int


def load_settings() -> Settings:
    data_dir = os.environ.get("ECLIPSE_DATA_DIR", "./data")
    db_path = os.environ.get("ECLIPSE_DB_PATH", "") or os.path.join(data_dir, "eclipse.db")
    storage_backend = os.environ.get("ECLIPSE_STORAGE_BACKEND", "local").strip().lower()
    if storage_backend not in {"local", "r2"}:
        raise ValueError("ECLIPSE_STORAGE_BACKEND harus 'local' atau 'r2'.")
    r2_account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    r2_bucket_name = os.environ.get("R2_BUCKET_NAME", "").strip()
    r2_access_key_id = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    r2_secret_access_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    r2_prefix = os.environ.get("R2_PREFIX", "eclipse").strip().strip("/")
    if storage_backend == "r2":
        missing = [name for name, value in (
            ("R2_ACCOUNT_ID", r2_account_id),
            ("R2_BUCKET_NAME", r2_bucket_name),
            ("R2_ACCESS_KEY_ID", r2_access_key_id),
            ("R2_SECRET_ACCESS_KEY", r2_secret_access_key),
        ) if not value]
        if missing:
            raise ValueError(f"Storage R2 aktif, tetapi konfigurasi belum lengkap: {', '.join(missing)}.")
        if not r2_prefix or any(part in {".", ".."} for part in r2_prefix.split("/")):
            raise ValueError("R2_PREFIX harus berupa prefix object yang valid.")
    origins = tuple(o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip())
    production = os.environ.get("ECLIPSE_ENV", "development").strip().lower() in {"production", "prod"}
    cookie_secure_default = "true" if production else "false"
    registration_default = "false" if production else "true"
    return Settings(
        data_dir=data_dir,
        db_path=db_path,
        storage_backend=storage_backend,
        r2_account_id=r2_account_id,
        r2_bucket_name=r2_bucket_name,
        r2_access_key_id=r2_access_key_id,
        r2_secret_access_key=r2_secret_access_key,
        r2_prefix=r2_prefix,
        r2_presigned_url_ttl_seconds=_get_int("R2_PRESIGNED_URL_TTL_SECONDS", 300, 1, 604800),
        port=_get_int("ECLIPSE_PORT", 8000, 1, 65535),
        version=os.environ.get("ECLIPSE_VERSION", "0.1.0-mvp1"),
        allowed_origins=origins,
        log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        cookie_secure=os.environ.get("ECLIPSE_COOKIE_SECURE", cookie_secure_default).strip().lower() in {"1", "true", "yes"},
        allow_registration=os.environ.get("ECLIPSE_ALLOW_REGISTRATION", registration_default).strip().lower() in {"1", "true", "yes"},
        reset_code_logging=os.environ.get("ECLIPSE_RESET_CODE_LOGGING", "false").strip().lower() in {"1", "true", "yes"},
        reset_smtp_host=os.environ.get("ECLIPSE_RESET_SMTP_HOST", "").strip(),
        reset_smtp_port=_get_int("ECLIPSE_RESET_SMTP_PORT", 587, 1, 65535),
        reset_smtp_username=os.environ.get("ECLIPSE_RESET_SMTP_USERNAME", ""),
        reset_smtp_password=os.environ.get("ECLIPSE_RESET_SMTP_PASSWORD", ""),
        reset_smtp_from=os.environ.get("ECLIPSE_RESET_SMTP_FROM", "").strip(),
        reset_smtp_starttls=os.environ.get("ECLIPSE_RESET_SMTP_STARTTLS", "true").strip().lower() in {"1", "true", "yes"},
        free_daily_analyze=_get_int("FREE_DAILY_ANALYZE", 3, 0, 10000),
        free_daily_render=_get_int("FREE_DAILY_RENDER", 1, 0, 10000),
        free_render_trial_days=_get_int("FREE_RENDER_TRIAL_DAYS", 3, 1, 365),
        lite_daily_render=_get_int("LITE_DAILY_RENDER", 15, 0, 10000),
        lite_monthly_price_idr=_get_int("LITE_MONTHLY_PRICE_IDR", 150000, 0, 1000000000),
        pro_daily_render=_get_int("PRO_DAILY_RENDER", 25, 0, 10000),
        pro_monthly_price_idr=_get_int("PRO_MONTHLY_PRICE_IDR", 300000, 0, 1000000000),
        max_batch_clips=_get_int("MAX_BATCH_CLIPS", 5, 1, 50),
        metadata_retention_days=_get_int("METADATA_RETENTION_DAYS", 90, 1, 3650),
        temp_file_ttl_hours=_get_int("TEMP_FILE_TTL_HOURS", 24, 1, 720),
    )


SETTINGS = load_settings()


def subscription_defaults() -> dict[str, int | str]:
    """Environment-backed defaults for editable subscription plan settings."""
    return {
        "freeDailyAnalyze": SETTINGS.free_daily_analyze,
        "freeDailyRender": SETTINGS.free_daily_render,
        "freeRenderTrialDays": SETTINGS.free_render_trial_days,
        "liteDailyRender": SETTINGS.lite_daily_render,
        "liteMonthlyPriceIdr": SETTINGS.lite_monthly_price_idr,
        "liteTermMonths": 1,
        "liteDiscountPercent": 0,
        "liteDiscountStart": "",
        "liteDiscountEnd": "",
        "proDailyRender": SETTINGS.pro_daily_render,
        "proMonthlyPriceIdr": SETTINGS.pro_monthly_price_idr,
        "proTermMonths": 1,
        "proDiscountPercent": 0,
        "proDiscountStart": "",
        "proDiscountEnd": "",
    }


def configure_logging(level: str | None = None) -> None:
    logging.basicConfig(
        level=getattr(logging, (level or SETTINGS.log_level), logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
