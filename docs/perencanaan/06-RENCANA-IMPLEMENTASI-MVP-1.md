# 06 — Rencana Implementasi MVP 1 ECLIPSE

**Diperbarui:** 9 Oktober 2026. Dokumen ini mempertahankan sasaran MVP 1 dan mencatat implementasi lokal serta pekerjaan yang masih dibutuhkan sebelum layanan dibuka ke pengguna umum. MVP adalah tahap rilis, bukan batas akhir target full-feature.

## Sasaran MVP

Pengguna masuk, memasukkan file lokal/URL YouTube/tautan Drive publik, menerima transkrip dan kandidat klip dari pipeline nyata, meninjau serta memangkas kandidat, merender maksimal lima klip vertikal per batch, lalu mengunduh MP4. Data pengguna diisolasi per akun. Kegagalan sumber/provider/render ditampilkan tanpa mengganti hasil dengan data contoh.

## Status implementasi

| Area | Status | Implementasi/batas |
|---|---|---|
| Frontend dan navigasi | Selesai lokal | Landing, login/register, dashboard, Studio Input → Tinjau → Ekspor, settings, submenu admin. |
| Auth dan RBAC | Selesai lokal; penguatan jaringan publik tersedia | SQLite, password hash, cookie HttpOnly tanpa token pada response, konfigurasi cookie Secure, limiter endpoint auth, bootstrap admin via CLI, registrasi dapat dinonaktifkan. Email reset belum ada. |
| Admin Gemini | Selesai lokal | Kelola key terenkripsi, enable/disable, urutan, tes, failover lintas project. Belum ada meter pemakaian/biaya atau cap operator. |
| Ingest | Implementasi tersedia | Upload lokal, YouTube via yt-dlp, Drive publik via direct download; validasi 2 GB/180 menit. URL eksternal perlu uji live. |
| Transkrip dan AI | Implementasi tersedia; validasi live perlu dilakukan | YouTube memakai transkrip bertimestamp pada Gemini; upload/Drive mengirim video dan konteks transkrip. faster-whisper dipakai bila diperlukan. Subtitle manual `.srt`/`.txt` tersedia. Live Gemini perlu API key aktif. |
| Review dan trim | Selesai lokal | Player backend, transkrip, ringkasan, filter/sort/tandai, edit timestamp kandidat, export JSON. |
| Studio/render | Fitur inti tersedia; parity dan reliabilitas perlu ditingkatkan | FFmpeg MP4 H.264/AAC, rasio 9:16, 1:1, 4:3, 16:9 letterbox vertikal, 16:9 lanskap; judul, subtitle/editor, crop/fokus, audio, watermark teks, nama file, dan encoder. Maksimum lima klip. Progres batch kasar ada, progres encoding aktual dan ZIP belum ada. |
| Riwayat/retensi | Implementasi tersedia | Riwayat server per akun; file 24 jam; metadata job/transkrip dan audit 90 hari. |
| Validasi | Lulus lokal | Build frontend dan 11 pemeriksaan kontrak/auth backend lulus; E2E media sintetis sebelumnya membuktikan render/download. |

## Pekerjaan untuk mencapai layanan siap digunakan umum

1. **Validasi provider live:** tambahkan key Gemini sah dari dashboard admin, tes koneksi, dan analisis video berucapan end-to-end.
2. **Validasi sumber live:** uji tautan YouTube publik dan Drive shareable; pastikan ukuran/durasi/gagal akses memberi hasil yang benar.
3. **Biaya provider:** implementasikan pengukuran biaya dari data provider, alert 80%, dan penolakan job sebelum cap operator $50/bulan. Keputusan cap belum aktif dalam kode.
4. **Keamanan web:** tambahkan HTTPS, perlindungan CSRF yang sesuai cookie session, rate limit login/register/reset, backup, dan secret management operasional.
5. **Pemulihan job:** sediakan status job terukur dan recovery setelah restart sebelum menampilkan persentase atau retry otomatis.
6. **Akun:** sambungkan layanan email reset atau pilih alur admin yang benar-benar dapat dilakukan di UI.
7. **Dokumentasi operasi:** runbook deployment, backup/restore, rotasi key, pemantauan biaya/disk, dan eskalasi error.

## Keputusan produk yang tetap berlaku

- Web multi-pengguna; YouTube, Drive publik, dan file lokal.
- Maksimum sumber 2 GB dan 180 menit; file sementara 24 jam; metadata 90 hari.
- Kuota Free: tiga analisis dan satu render per hari; maksimum lima klip per batch; satu worker render.
- Admin mengelola beberapa project/kunci Gemini. Rotasi key dalam project yang sama tidak menambah kuota project.
- Harga Pro, pembayaran, publikasi sosial, kolaborasi, dan penggunaan JEV tetap di luar cakupan MVP 1.
- Skor AI adalah estimasi untuk membantu editor, bukan jaminan viralitas.

## Target full-feature setelah MVP 1

Butir di luar cakupan MVP tidak otomatis dikeluarkan dari target produk. Status dan prioritas lintas fitur, termasuk billing/Pro, tim, publikasi sosial, ZIP, pemulihan job, pengukuran biaya, serta fitur Studio lanjutan, dikelola pada [checklist Dokumen vs Implementasi dan rekomendasi](../laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md). Keputusan bisnis yang belum dikunci harus tetap berstatus discovery/perlu keputusan, bukan ditandai batal.

## Bukti dan batas validasi

Audit rinci, perintah pemeriksaan, skenario E2E sintetis, dan prasyarat validasi live dicatat dalam [Audit E2E non-demo](../laporan/AUDIT-E2E-NON-DEMO-ECLIPSE-2026-10-08.md). Tanpa API key provider, pengujian belum dapat membuktikan koneksi Gemini, biaya akun Google, atau failover live.
