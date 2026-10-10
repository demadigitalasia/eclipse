# 00 — Indeks Dokumen Perencanaan ECLIPSE V.2

Status implementasi diperbarui: 9 Oktober 2026 | Pemilik: Dema Digital Asia | Status: aktif

Dokumen ini merangkum aplikasi lokal ECLIPSE yang kini terhubung ke backend nyata. Laporan A-01 sampai A-04 adalah snapshot historis dan tidak menggambarkan status kode saat ini. Gunakan label berikut:

- **Terverifikasi** — terlihat di source code workspace saat audit.
- **Simulasi** — UI ada, tetapi perilaku atau datanya dibuat lokal/contoh.
- **Rancangan** — target yang ditulis untuk implementasi berikutnya; belum dikonfirmasi oleh source code.
- **Referensi** — rekomendasi untuk dievaluasi sebelum dipilih.

## Dokumen perencanaan aktif

| # | Dokumen | Cakupan | Status |
|---|---------|---------|--------|
| 00 | [INDEKS](00-INDEKS.md) | Peta dokumen, status, dan sumber kebenaran | aktif |
| 01 | [TEKNOLOGI](01-TEKNOLOGI.md) | Stack aktif, batas operasional, dan referensi AI | aktif |
| 02 | [ALUR-KERJA](02-ALUR-KERJA.md) | Modul aktif, alur server, dan batas fitur | aktif |
| 03 | [BISNIS-FLOW](03-BISNIS-FLOW.md) | Arah produk, asumsi biaya, opsi bisnis, dan keputusan terbuka | aktif; B0 dikunci 8 Okt, tersisa harga Pro + metrik |
| 04 | [ROADMAP-KEPUTUSAN](04-ROADMAP-KEPUTUSAN.md) | Decision log dan backlog | aktif |
| 05 | [DESAIN](05-DESAIN.md) | Sistem visual dan pola interaksi | aktif; sebagian aturan merupakan target |
| 06 | [RENCANA-IMPLEMENTASI-MVP-1](06-RENCANA-IMPLEMENTASI-MVP-1.md) | Status implementasi lokal dan pekerjaan menuju kesiapan publik | rencana aktif |
| 07 | [PAKET-HANDOFF-GATE-A](07-PAKET-HANDOFF-GATE-A.md) | Paket kontrak API awal — snapshot sebelum backend aktif | historis |

## Laporan audit

- [Checklist Dokumen vs Implementasi ECLIPSE (9 Okt 2026)](../laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md) — matriks status fitur, konflik dokumen/source, rekomendasi rinci, dan backlog menuju full-feature.

### Rujukan aktif

| ID | Dokumen | Cakupan |
|---|---|---|
| A-09 | [AUDIT-KESEHATAN-CODE-ECLIPSE-2026-10-08](../laporan/AUDIT-KESEHATAN-CODE-ECLIPSE-2026-10-08.md) | Kesehatan source code, bukti pemeriksaan, dan rekomendasi |
| A-08 | [AUDIT-E2E-NON-DEMO-ECLIPSE-2026-10-08](../laporan/AUDIT-E2E-NON-DEMO-ECLIPSE-2026-10-08.md) | Audit implementasi real, bukti uji, dan prasyarat live |
| A-05 | [AUDIT-LENGKAP-DOKUMEN-ECLIPSE-2026-10-08](../laporan/AUDIT-LENGKAP-DOKUMEN-ECLIPSE-2026-10-08.md) | Skor kualitas terbaru, tindak lanjut, dan rekomendasi |
| A-06 | [AUDIT-RENCANA-MVP-1-ECLIPSE-2026-10-08](../laporan/AUDIT-RENCANA-MVP-1-ECLIPSE-2026-10-08.md) | Audit khusus rencana MVP 1 dan rekomendasi untuk Gate A/B0 |
| A-07 | [AUDIT-RAPIH-FONT-WARNA-POLES-ECLIPSE-2026-10-08](../laporan/AUDIT-RAPIH-FONT-WARNA-POLES-ECLIPSE-2026-10-08.md) | Audit kerapihan, font, warna, dan poles + rekomendasi |

### Snapshot historis

| ID | Dokumen | Cakupan/status |
|---|---|---|
| A-04 | [AUDIT-NAVIGASI-DASHBOARD-ECLIPSE-2026-10-08](../laporan/AUDIT-NAVIGASI-DASHBOARD-ECLIPSE-2026-10-08.md) | Temuan awal navigasi dan tindak lanjut implementasi |
| A-03 | [AUDIT-DOKUMEN-ECLIPSE-2026-10-08](../laporan/AUDIT-DOKUMEN-ECLIPSE-2026-10-08.md) | Snapshot sembilan dokumen saat audit dibuat; digantikan A-05 |
| A-02 | [AUDIT-WARNA-TIPOGRAFI-ECLIPSE-2026-10-07](../laporan/AUDIT-WARNA-TIPOGRAFI-ECLIPSE-2026-10-07.md) | Snapshot audit warna/tipografi 7 Oktober |
| A-01 | [LAPORAN-AUDIT-ECLIPSE-2026-10-07](../laporan/LAPORAN-AUDIT-ECLIPSE-2026-10-07.md) | Baseline kesiapan modul 7 Oktober |

## Sumber kebenaran dan konsistensi

1. Source code dan manifest menjadi sumber status implementasi.
2. Dokumen 01 menyimpan stack dan status backend; 02 menyimpan modul/alur; 03 menyimpan asumsi produk; 04 menyimpan progres dan keputusan; 05 menyimpan pedoman desain; 07 menyimpan paket handoff frontend→backend.
3. Endpoint, env, kapasitas unggah, provider AI, dan deployment hanya disebut aktif jika ditemukan serta dapat diverifikasi di implementasi.
4. Rekomendasi JEV, faster-whisper, PySceneDetect, Gemini video, dan pyannote.audio di dokumen 01 berstatus referensi. Belum ada yang menjadi dependensi wajib.
5. Jika status kode berubah, perbarui dokumen 01 dan 02 lebih dulu, lalu selaraskan 03–07 bila terdampak. Gunakan [checklist Dokumen vs Implementasi dan rekomendasi](../laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md) untuk sinkronisasi saat ini.

## Status audit workspace (8 Oktober 2026)

- Frontend React/TypeScript tersambung ke backend FastAPI lokal untuk akun, sumber video, analisis, riwayat, dan render. Tidak ada mode hasil demo dalam alur Studio.
- Akun, sesi, riwayat, konfigurasi Gemini, dan audit dikelola backend/SQLite. Bahasa dan persetujuan disimpan lokal; secret Gemini dienkripsi di server. Email reset sandi belum dikonfigurasi.
- Backend menjalankan ingest upload/YouTube/Drive publik, transkripsi faster-whisper, analisis Gemini, API key pool per project, render FFmpeg, unduhan, kuota harian, RBAC, cleanup terjadwal, dan ledger counter token Gemini per project/model, pengguna, serta job. Integrasi provider hidup membutuhkan key Gemini aktif; angka USD, rekonsiliasi billing, alert 80%, dan cap biaya operator belum tersedia.
- Keputusan 8 Oktober: target MVP web multi-pengguna dengan login/daftar; sumber lokal + tautan publik YouTube/Drive; provider Gemini memakai pool key admin; render satu per satu. Rincian dan batas teknis di dokumen 01–06.
- MVP adalah tahap rilis, bukan batas akhir target produk. Fitur full-feature yang belum selesai tetap menjadi backlog kecuali pemilik produk memutuskan lain.
