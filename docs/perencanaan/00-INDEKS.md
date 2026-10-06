# 00 — Indeks Dokumen Perencanaan ECLIPSE V.2

Tanggal: 7 Oktober 2026 | Pemilik: Dema Digital Asia | Status: aktif

## Daftar dokumen

| # | Dokumen | Sumber | Status |
|---|---------|--------|--------|
| 00 | INDEKS (file ini) | — | aktif |
| 01 | TEKNOLOGI — stack, versi, arsitektur, API, storage | audit kode lama Okt 2026 | aktif |
| 02 | ALUR-KERJA — workflow pengguna + pipeline teknis terbaru (IDE 3-pane) | overhaul UI Okt 2026 | aktif |
| 03 | BISNIS-FLOW — canvas, cost, monetisasi, keputusan Q1–Q8 | Baru (dari LAPORAN-02 + audit) | aktif, 8 keputusan terbuka |
| 04 | ROADMAP-KEPUTUSAN — tahapan, decision log, backlog audit | LAPORAN-04 | aktif |
| — | PRD/audit lama (hanya di arsip git) | dihapus dari worktree 7 Okt 2026 | digantikan 01–04; jangan dirujuk untuk rebuild |
| — | docs/laporan/LAPORAN-01..04 | arsip kerja | arsip, bukan spesifikasi |

## Koreksi yang sudah dilipat ke 01/02 (arsip; PRD lama hanya ada di git)

1. Filter skor: medium = 70–89.
2. Thumbnail history upload/Drive: `GET /api/clip-frame?video_id&timestamp&video_url`.
3. Endpoint settings (`GET/PUT /api/settings`, `POST /api/settings/test-proxy`) — didokumentasikan di 01.
4. Mock mode (`api_key=mock`) — didokumentasikan di 01/02.
5. Env `ADMIN_API_KEY`, `ALLOWED_ORIGINS`, alias `ECLIPSE_API_KEY`/`CHEAT_CLIP_API_KEY` — didokumentasikan di 01.
6. Port env `ECLIPSE_API_PORT`/`ECLIPSE_WEB_PORT` (fallback 8000/5173) — didokumentasikan di 01.
