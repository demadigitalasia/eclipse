> **Snapshot historis 8 Oktober 2026:** dokumen handoff ini ditulis sebelum integrasi nyata. Endpoint/payload/mock di dalamnya tidak mendefinisikan API saat ini. Gunakan backend aktual serta dokumen 02 dan 04 untuk status implementasi.

# 07 — Paket Handoff Gate A (Frontend → Backend)

Tanggal handoff: 8 Oktober 2026 | Status: menunggu review pengguna (R1) sebelum Gate A dinyatakan lulus | Pemilik: belum ditetapkan

Dokumen ini adalah paket handoff yang disyaratkan Gate A pada dokumen 06: kontrak API, daftar operasi, contoh payload, skema error, konfigurasi render, dan daftar mock yang harus diganti backend. Selama backend belum ada, `src/api.ts:221 analyzeWithMock()` adalah satu-satunya adapter yang dipakai komponen.

## 1. Batas operasional yang dikunci frontend

Sumber: `src/types.ts:59 MVP_LIMITS`.

- Media sumber efektif maks **2 GB** per video (lokal maupun remote).
- Durasi maks **60 menit**; file sementara dihapus setelah **24 jam** (retensi metadata terpisah, diputuskan di B0).
- Rasio Studio MVP: **9:16**; format ekspor: **MP4 (H.264)**; subtitle + judul dasar.
- Ekstensi diterima: `.mp4 .mov .mkv .webm .avi .m4v`.
- Demo analisis dibatasi **12 klip** per request (`maxClipsPerAnalyze`).

## 2. Kontrak request/response

Sumber: `src/types.ts:95 AnalyzeRequest`, `src/types.ts:112 AnalyzeResponse`, `src/types.ts:22 AnalyzeResult`.

### `AnalyzeRequest` (tanpa secret; pool key milik admin)

| Field | Tipe | Catatan |
|---|---|---|
| `source` | `'youtube' \| 'drive' \| 'upload'` | Drive = tautan berbagi publik, tanpa OAuth |
| `url` | `string` | URL YouTube / tautan Drive; untuk upload diisi nama file |
| `fileName` | `string` | Nama file lokal |
| `fileSizeBytes` | `number \| null` | Ukuran file bila diketahui browser |
| `model` | `string` | Contoh: `gemini-2.5-flash` (pilihan UI, backend boleh memetakan ulang) |
| `duration` | `'15s' \| '30s' \| '60s' \| 'auto'` | Durasi target klip |
| `prompt` | `string` | Opsional, pencarian momen spesifik |
| `countMode` / `count` | `'auto' \| 'custom'` / `number` | `custom` dibatasi 1–12 pada demo |
| `subs` | `'auto' \| 'manual'` | Sumber subtitle |
| `range` / `rangeStart` / `rangeEnd` | `'all' \| 'custom'` / `string` | Kustom memakai format `MM:SS` / `HH:MM:SS` |
| `consent` | `boolean` | Wajib `true`; persetujuan eksplisit B0, ditegakkan 403 bila absen |

### Contoh payload request

```json
{
  "source": "youtube",
  "url": "https://www.youtube.com/watch?v=CONTOH",
  "fileName": "",
  "fileSizeBytes": null,
  "model": "gemini-2.5-flash",
  "duration": "30s",
  "prompt": "cari momen lucu",
  "countMode": "custom",
  "count": 6,
  "subs": "auto",
  "range": "all",
  "rangeStart": "",
  "rangeEnd": "",
  "consent": true
}
```

### `AnalyzeResponse`

```json
{
  "data": {
    "video_id": "demo_l7890",
    "title": "Video Demo — ECLIPSE",
    "duration": 872,
    "source": "youtube",
    "video_url": "https://www.youtube.com/watch?v=CONTOH",
    "heatmap": [{ "time": 0, "value": 0.42 }],
    "transcript": [{ "start": 0, "end": 5.2, "text": "…" }],
    "clips": [
      {
        "title": "Quote emas yang wajib dipotong",
        "start_time": 582,
        "end_time": 612,
        "hook_time": 584,
        "virality_score": 91,
        "transcript": "…",
        "caption": "Tonton sampai habis!"
      }
    ],
    "summary": "…",
    "model": "demo-lokal",
    "analyzed_at": "2026-10-08T00:00:00.000Z"
  },
  "isDemo": true,
  "warnings": ["demo"]
}
```

Backend wajib mengembalikan struktur yang sama; `isDemo: false` dan `model` berisi nama model nyata. Skor adalah bantuan editorial, bukan jaminan performa.

## 3. Skema error

Sumber: `src/types.ts:76 ErrorCode`, validasi di `src/api.ts:158 validateAnalyzeRequest()`.

| `code` | Arti | `hint` untuk pengguna |
|---|---|---|
| `invalid_url` | URL YouTube/Drive kosong atau tidak valid; jumlah klip di luar 1–12 | Contoh tautan yang benar |
| `drive_not_accessible` | (Disiapkan untuk B2) tautan privat/tidak dapat diunduh | Langkah berbagi "Siapa saja yang memiliki link" |
| `file_required` | Upload tanpa file | Format yang diterima + maks 2 GB |
| `file_too_large` | File > 2 GB | Kompres/potong di bawah 2 GB |
| `file_type_unsupported` | Ekstensi di luar daftar MVP | Daftar ekstensi MVP |
| `invalid_range` | Rentang kustom salah format atau akhir ≤ awal | Format `MM:SS`, contoh 02:00 – 08:30 |
| `consent_required` | Persetujuan B0 belum dicentang (403) | Centang persetujuan sebelum analisis |
| `quota_exceeded` | Free: 1 batch/hari. Lite: 15 batch/bulan. Pro: 25 batch/bulan. Hub Admin: Unlimited. | Tunggu reset kuota harian/bulanan atau hubungi admin |
| `empty_result` | (Disiapkan untuk B3) tidak ada kandidat | Saran rentang/prompt lain |
| `backend_offline` | (Disiapkan untuk B5) backend tidak terjangkau | Coba lagi / periksa server |
| `unknown` | Fallback | Coba lagi |

Frontend menampilkan `message` + `hint` dalam `.error-box` (`role="alert"`). Backend harus memakai kode yang sama agar pesan konsisten.

## 4. Konfigurasi render MVP

Sumber: `src/types.ts:120 RenderPreset`, `src/components/StudioOverlay.tsx`.

- `aspect: '9:16'` (satu-satunya opsi aktif; `1:1/4:3/16:9` dinonaktifkan sebagai non-MVP).
- `caption: 'viral_pop' | 'clean_minimal' | 'off'`; `title_text: string`.
- `format: 'mp4'`, `codec: 'h264'`.
- Antrean: satu worker global, satu job aktif, FIFO (aturan pembatalan/retry/pemulihan dirinci di B4).
- Status batch: `idle | queued | running | done | error` (`src/types.ts:130 BatchJobItem`).

## 5. Daftar operasi backend (target, belum terverifikasi)

Nama endpoint adalah target dari dokumen 01 — jangan dianggap aktif sebelum router diaudit:

1. `GET /api/health` — health check.
2. `POST /api/analyze` — request §2 → response §2 / error §3.
3. `POST /api/upload-video` — upload file lokal (batas 2 GB, validasi format, nama aman).
4. `GET /api/media/:jobId/...` — akses media scoped per job.
5. `POST /api/render-batch` — antre FIFO, progres, pembatalan aman.
6. `GET /api/download/:jobId` — unduh MP4 (ZIP setelah satu klip stabil).

Keputusan B0 yang memengaruhi endpoint: metode ingest YT/Drive, consent + lokasi pemrosesan, kuota/cap biaya, retensi metadata, maks klip per batch.

## 6. Daftar mock yang harus diganti (tanpa mengubah presentasi)

| Lokasi | Perilaku mock saat ini | Pengganti backend |
|---|---|---|
| `src/api.ts:51 mockAnalyze()` | Transkrip, heatmap, skor, klip sintetis | Pipeline B2/B3 |
| `src/api.ts:221 analyzeWithMock()` | Validasi + jeda 900 ms + mock | Adapter HTTP `EclipseApiAdapter` (`src/types.ts:138`) |
| `src/pages/StudioPage.tsx:65 runAnalyze()` | Memanggil adapter mock | Memanggil adapter HTTP; state loading/error tidak berubah |
| `src/components/StudioOverlay.tsx` timer progres | Progres + error acak simulasi | Status job nyata (posisi/progress/retry) |
| `src/components/GeminiApiPanel.tsx` | Entri pool di memori halaman | CRUD pool server-side + secret store |
| `src/auth.tsx` | Akun/kredensial/sesi di memori | Auth server + DB persisten (B1) |
| `src/proxy.ts:68 checkEndpoint()` | Health-check acak | Pemeriksaan egress nyata (bila konektor butuh) |
| `src/api.ts` riwayat localStorage | Cache browser 50 entri | Cache/history server scoped per user |
| `src/components/InputPanel.tsx` blob URL | Pratinjau `<video>` lokal via `URL.createObjectURL` | URL media server scoped per job |

## 7. Kriteria penerimaan Gate A yang tersisa

1. Review pengguna atas seluruh alur A0–A5 (R1): viewport 1440/768/390 + keyboard-only pass, dicatat dengan tanggal.
2. Keputusan B0 dikunci dengan owner sebelum B1 dimulai.
3. Setelah (1) lulus, status Gate A diubah menjadi lulus dan backend dimulai dari B0/B1.
