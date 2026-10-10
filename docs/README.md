# Dokumentasi ECLIPSE V.2

Mulai dari indeks perencanaan untuk melihat peta dokumen dan status setiap topik.

- [Audit E2E — perilaku demo dan kesiapan lokal](laporan/AUDIT-E2E-NON-DEMO-ECLIPSE-2026-10-08.md) — implementasi nyata, bukti uji, dan batas live.
- [Audit kesehatan coding](laporan/AUDIT-KESEHATAN-CODE-ECLIPSE-2026-10-08.md) — skor kualitas kode, temuan risiko, bukti pemeriksaan, dan rekomendasi.
- [Checklist Dokumen vs Implementasi dan rekomendasi](laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md) — status silang per dokumen/fitur, gap full-feature, serta urutan tindak lanjut.
- [Analisis Panduan Pengguna](laporan/ANALISIS-PANDUAN-PENGGUNA-ECLIPSE-2026-10-10.md) — audit naskah panduan di aplikasi, ketidakcocokan dengan fitur, dan rencana perbaikan/pengembangan.
- [Audit Dual Bahasa](laporan/ANALISIS-DUAL-BAHASA-ECLIPSE-2026-10-10.md) — audit katalog ID/EN, teks inline, error API, konsistensi locale, dan rekomendasi migrasi.
- [Audit Storage Cloudflare R2](laporan/AUDIT-STORAGE-CLOUDFLARE-R2-ECLIPSE-2026-10-11.md) — audit alur file, validasi offline adapter, temuan race restore, dan prasyarat uji bucket nyata.

## Dokumen utama

1. [Indeks perencanaan](perencanaan/00-INDEKS.md) — peta dokumen, status, dan aturan sumber kebenaran.
2. [Teknologi](perencanaan/01-TEKNOLOGI.md) — stack aktif, batas operasional, dan referensi AI.
3. [Modul dan alur kerja](perencanaan/02-ALUR-KERJA.md) — modul dan perilaku backend aktual beserta batas yang belum tersedia.
4. [Model produk dan bisnis](perencanaan/03-BISNIS-FLOW.md) — arah produk, biaya, dan keputusan yang masih terbuka.
5. [Roadmap dan keputusan](perencanaan/04-ROADMAP-KEPUTUSAN.md) — decision log serta backlog.
6. [Sistem desain](perencanaan/05-DESAIN.md) — warna, tipografi, komponen, dan pola navigasi.
7. [Rencana implementasi MVP 1](perencanaan/06-RENCANA-IMPLEMENTASI-MVP-1.md) — status implementasi lokal dan pekerjaan menuju kesiapan publik.
8. [Paket handoff Gate A](perencanaan/07-PAKET-HANDOFF-GATE-A.md) — snapshot kontrak sebelum backend aktif; arsip historis, bukan kontrak terkini.
9. [Persiapan Cloudflare R2](perencanaan/08-PERSIAPAN-CLOUDFLARE-R2.md) — arsitektur, kebutuhan konfigurasi, pengamanan, dan tahapan integrasi object storage.

## Laporan

### Rujukan aktif

- [A-10 — Audit desain mendalam](laporan/AUDIT-DESAIN-MENDALAM-ECLIPSE-2026-10-08.md) — skor desain keseluruhan, bukti visual/source, dan rencana rekomendasi bertahap.
- [A-09 — Audit kesehatan coding](laporan/AUDIT-KESEHATAN-CODE-ECLIPSE-2026-10-08.md) — skor source code, keamanan, keandalan, cakupan tes, dan rekomendasi.
- [A-08 — Audit E2E dan penghapusan perilaku demo](laporan/AUDIT-E2E-NON-DEMO-ECLIPSE-2026-10-08.md) — status implementasi real, bukti uji, dan prasyarat live.
- [A-05 — Audit lengkap dokumen dan tindak lanjut](laporan/AUDIT-LENGKAP-DOKUMEN-ECLIPSE-2026-10-08.md) — sumber skor dokumen terbaru dan rekomendasi lintas dokumen.
- [A-06 — Audit Rencana Implementasi MVP 1](laporan/AUDIT-RENCANA-MVP-1-ECLIPSE-2026-10-08.md) — skor rencana, status Gate A, dan keputusan yang perlu dikunci pada B0.
- [A-07 — Audit kerapihan, font, warna & poles](laporan/AUDIT-RAPIH-FONT-WARNA-POLES-ECLIPSE-2026-10-08.md) — skor visual, temuan aturan 05, dan rekomendasi poles.

### Snapshot dan laporan historis

- [A-04 — Audit navigasi dashboard](laporan/AUDIT-NAVIGASI-DASHBOARD-ECLIPSE-2026-10-08.md) — temuan awal sidebar dan tindak lanjut implementasi.
- [A-03 — Audit dokumen 8 Oktober](laporan/AUDIT-DOKUMEN-ECLIPSE-2026-10-08.md) — snapshot sembilan dokumen sebelum audit terbaru.
- [A-02 — Audit warna dan tipografi](laporan/AUDIT-WARNA-TIPOGRAFI-ECLIPSE-2026-10-07.md) — snapshot visual 7 Oktober.
- [A-01 — Audit produk dan modul](laporan/LAPORAN-AUDIT-ECLIPSE-2026-10-07.md) — baseline kesiapan modul 7 Oktober.

Audit A-01 sampai A-04 tetap disimpan untuk jejak perubahan. Gunakan A-05 untuk skor kualitas dokumen terbaru dan dokumen 01–06 untuk spesifikasi yang berlaku.
