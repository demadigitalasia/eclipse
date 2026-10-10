# 04 — Roadmap dan Keputusan ECLIPSE V.2

Status di bawah diperbarui 9 Oktober 2026. Laporan audit A-01–A-04 tetap menjadi catatan keadaan kode saat laporan tersebut dibuat; dokumen ini adalah status operasional terbaru.

## Status implementasi

- **Berjalan lokal:** akun dan sesi server, role admin/user, pengelolaan Gemini API, input file lokal/YouTube/Drive publik, transkripsi faster-whisper, analisis Gemini, riwayat server, trim kandidat, render MP4 FFmpeg, unduhan, kuota Free, dan cleanup berkala.
- **Memerlukan konfigurasi/validasi eksternal:** analisis nyata memerlukan admin menambah dan menguji API key Gemini. Keberhasilan YouTube dan Drive bergantung pada URL yang dapat diakses dan perlu diuji per sumber.
- **Tersedia, perlu validasi penuh:** subtitle manual `.srt`/`.txt`, milestone tahap analisis, estimasi progres batch render, dan lima mode aspek Studio. Progres encoding FFmpeg aktual belum tersedia.
- **Tersedia, perlu rekonsiliasi:** ledger counter token Gemini serta ringkasan admin 30 hari per project/model, pengguna, dan job. Usage hanya dicatat bila disertakan provider; angka USD dan tagihan otoritatif tidak tersedia.
- **Belum tersedia:** reset sandi melalui email, rekonsiliasi biaya USD, penegakan cap biaya $50/bulan dan alert 80%, metrik admin job umum, billing/paket Pro aktif, ekspor ZIP, rentang analisis kustom, dan deployment produksi.
- **Tidak ada fallback demo:** jika provider atau pipeline gagal, aplikasi menampilkan error; hasil sintetis tidak ditampilkan.

## Catatan keputusan

| Tanggal | Keputusan | Status implementasi |
|---|---|---|
| 2026-10-07 | Tema dark-only, korona amber, token CSS, Space Grotesk + DM Sans | Diterapkan |
| 2026-10-08 | Tipografi global Archivo untuk display + IBM Plex Sans untuk body/UI; menggantikan Space Grotesk + DM Sans | Diterapkan |
| 2026-10-07 | Studio Input → Discover → Studio | Diterapkan; semua langkah memakai API/backend |
| 2026-10-08 | MVP untuk web multi-pengguna; sesi, role, kepemilikan data server | Diterapkan lokal |
| 2026-10-08 | Sumber file lokal, URL YouTube, Drive publik; maksimal 2 GB dan 60 menit | Endpoint tersedia; uji sumber nyata diperlukan |
| 2026-10-08 | Batas durasi sumber dinaikkan menjadi 180 menit; ukuran maks tetap 2 GB | Diterapkan pada frontend dan backend lokal |
| 2026-10-08 | Pool API Gemini dikelola admin; failover lintas project | UI dan layanan tersedia; perlu key aktif untuk validasi provider |
| 2026-10-09 | Subtitle manual `.srt`/`.txt` | Input dan pipeline backend tersedia; QA format masih diperlukan |
| 2026-10-09 | Progres job | Milestone analisis dan estimasi batch render tersedia; progres encoding FFmpeg belum ada |
| 2026-10-09 | Rasio Studio | 9:16, 1:1, 4:3, 16:9 letterbox vertikal, dan 16:9 lanskap tersedia di UI/renderer |
| 2026-10-08 | Kuota Free tiga analisis + satu render per hari; render berurutan, maks lima klip | Ditegakkan backend |
| 2026-10-08 | File sementara 24 jam; metadata job/audit 90 hari | Cleanup terjadwal pada backend lokal |
| 2026-10-08 | Cap operator $50/bulan dan alert pada 80% | Keputusan; belum diimplementasikan. Ledger token tidak sama dengan meter tagihan USD. |
| 2026-10-09 | Ledger usage Gemini per project/model, pengguna, dan job | Counter token yang dilaporkan response dicatat; USD dan billing reconciliation belum tersedia |
| 2026-10-08 | Email reset sandi | Belum tersedia; reset meminta bantuan admin |
| — | Harga/paket Pro dan metrik keberhasilan | Terbuka setelah baseline biaya dan penggunaan |
| — | JEV, PySceneDetect, Gemini video tambahan, pyannote | Referensi evaluasi; bukan bagian aktif saat ini |

## Pekerjaan berikutnya

### Sasaran produk full-feature

MVP 1 tetap menjadi baseline rilis awal, bukan batas akhir produk. Fitur yang belum tersedia dicatat sebagai backlog menuju target full-feature. Keputusan yang belum dibuat—misalnya billing Pro, workspace tim, dan publikasi sosial—berstatus **perlu keputusan produk**, bukan dianggap sudah dikeluarkan dari sasaran. Gunakan [checklist Dokumen vs Implementasi dan rekomendasi](../laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md) sebagai matriks tindak lanjut sampai backlog master dibentuk.

### P0 — Keamanan operasi dan pemakaian provider

- Lanjutkan ledger token ke rekonsiliasi biaya USD dengan sumber billing yang otoritatif, lalu terapkan cap bulanan fail-closed dan alert 80%; jangan mengandalkan rotasi key sebagai kontrol biaya.
- Tambahkan rate limit login/register/reset dan penanganan CSRF yang sesuai dengan model cookie sebelum membuka server ke jaringan.
- Uji key, failover, timeout, kegagalan kuota, dan cleanup pada Google project terpisah yang sah.
- Tambahkan konfigurasi email reset atau alur admin yang terautentikasi dan terdokumentasi.

### P1 — Observabilitas dan pengalaman operasional

- Perluas endpoint metrik admin job umum dan biaya setelah sumber billing tersedia; metrik token Gemini dasar per project/model, pengguna, dan job sudah tersedia. Tampilkan hanya angka yang berasal dari backend.
- Simpan state job yang dapat dipulihkan setelah restart; tampilkan status antrean dan persentase hanya jika server mengukur progres tersebut.
- Tambahkan retry job yang idempoten dan batas penyimpanan/ruang disk.
- Jalankan audit keyboard, screen reader, dan viewport serta perbaiki masalah lintas layar.

### P2 — Produk pasca-MVP

- Putuskan harga Pro setelah data biaya aktual terkumpul; sampai itu terjadi, aplikasi beroperasi sebagai Free-only.
- Evaluasi JEV/faster-whisper/scene detection pada sampel berbahasa Indonesia terhadap baseline sebelum menambah jalur AI.
- Siapkan deployment dengan HTTPS, database/storage backup, secret management, log redaction, dan prosedur rotasi key sebelum menerima pengguna umum.

## Kriteria MVP lokal

Alur dinilai berfungsi bila akun dapat masuk, sumber sah berhasil masuk, Gemini menghasilkan kandidat nyata, pengguna dapat meninjau/mengubah waktu kandidat, FFmpeg membuat klip yang bisa diputar dan diunduh, dan error provider/sumber tampil apa adanya. E2E sintetis membuktikan upload → render → unduh tanpa membuktikan provider Gemini atau akses YouTube/Drive eksternal.
