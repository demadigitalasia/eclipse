# 01 — Teknologi ECLIPSE V.2

Tanggal: 7 Oktober 2026. Spesifikasi rebuild (kode lama dihapus total).

## Stack (versi dari manifest)

- Frontend: React 19.2 + TypeScript ~6.0, Vite 8, SATU file token CSS (jangan ulangi 3-lapis index/dema/lime).
- Font UI: Space Grotesk (display/skor) + Inter (body). Font render video default: Montserrat (jangan diubah tanpa alasan — memengaruhi output).
- Backend: FastAPI + Uvicorn + Pydantic 2, python-multipart, python-dotenv.
- AI: `google-genai`, default `gemini-2.5-flash` + fallback Flash. **Mock mode:** `api_key=mock` → data dummy tanpa memanggil Gemini (untuk demo).
- Transkrip: API transkrip pihak ketiga → API transkrip platform video → CLI → ekstraktor json3 → direct; lokal via mesin transkripsi lokal.
- Media: FFmpeg + libass eksternal, OpenCV YuNet/Haar, Pillow. Encoder: NVENC → AMF → QSV → libx264.
- State: localStorage (`cheat_clip_*`, `eclipse_admin_key`) + filesystem (`ECLIPSE_DATA_DIR`, default `backend/`: temp_clips/uploads, exports, fonts, cookies.txt, settings.json) + dict memori proses (job render/download — hilang saat restart).
- Tanpa: DB, Redis/queue, object storage, auth akun, payment.

## Endpoint aktual (38, diverifikasi dari routers)

Analyze/health: `POST /api/analyze` (SSE), `GET /api/health`, `/api/usage-transkrip`, `/api/models` (header kunci API).
Settings: `GET /api/settings`, `PUT /api/settings`, `POST /api/settings/test-proxy` (wajib fail-closed — dulu satu-satunya yang benar).
Cookies: `GET/POST/DELETE /api/cookies` (fail-open bila key kosong — lihat 04).
Media: `POST /api/upload-video` (4GB) `/upload-bgm` (100MB) `/upload-sfx` (50MB) `/upload-watermark` (25MB) `/upload-font` (50MB); `GET /api/video/{f}` (Range 206), `/audio`, `/watermark`, `/fonts`, `/font-file`, `/api/clip-frame`, `/api/detect-face`.
Render: `POST /api/render-batch`, `/retry`, `GET /api/render-progress/{id}` (SSE), `/api/download-rendered/{f}`, `/download-batch-zip/{id}`, `/api/hardware-accel`.
Raw: `POST /api/download-raw-video|clip` + status polling.
System: `GET /api/temp-storage-info`, `POST /api/clear-temp|cleanup-expired-temp`, `/system/version|check-update|update|restart` (fail-open — lihat 04).

## Env vars (wajib sejak hari pertama — jangan ulangi template yang kehilangan key)

Sudah harus ada: kunci API generatif, kunci API transkrip, kredensial proxy, bundle sertifikat, path font emoji, path FFmpeg, direktori data.
**Jangan sampai hilang lagi:** `ADMIN_API_KEY`, `ALLOWED_ORIGINS`, dan putuskan nasib alias lama `ECLIPSE_API_KEY`/`CHEAT_CLIP_API_KEY` (depresiasi disarankan).
Port env `ECLIPSE_API_PORT`/`ECLIPSE_WEB_PORT` (fallback 8000/5173) — dibaca konfigurasi Vite sisi-Node, harus diekspor sebelum dev server jalan.

## Deployment yang didukung

Lokal: satu perintah dev (frontend + backend). Staging disarankan: frontend di hosting statis + 1 container backend persisten. Dilarang: deploy backend sebagai fungsi serverless (limit payload kecil, fs read-only, job in-memory).
