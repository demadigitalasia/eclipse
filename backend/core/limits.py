"""Batas operasional MVP — cermin `MVP_LIMITS` frontend (`src/types.ts`).

Satu sumber angka di backend; frontend memvalidasi awal, backend menegakkan.
   Keputusan B0 8 Okt 2026: ingest server-side, kuota Free 3+3/hari,
cap $50/bln, retensi metadata 90 hari, maks 5 klip/batch.
"""

MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
MAX_SOURCE_LABEL = "2 GB"
MAX_DURATION_SEC = 180 * 60
TEMP_FILE_TTL_HOURS = 24
METADATA_RETENTION_DAYS = 90
MVP_ASPECT = "9:16"
EXPORT_FORMAT = "mp4"
EXPORT_CODEC = "h264"
ACCEPTED_EXTENSIONS = (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v")
MAX_CLIPS_PER_ANALYZE = 12
MAX_BATCH_CLIPS = 5
FREE_DAILY_ANALYZE = 3
FREE_DAILY_RENDER = 3
