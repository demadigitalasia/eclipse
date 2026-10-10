# Audit E2E ECLIPSE — Penghapusan Perilaku Demo

**Tanggal:** 8 Oktober 2026  
**Cakupan:** landing, auth, dashboard/admin, input sumber, analisis, riwayat, review/trim, Studio, render, download, retensi, dan dokumentasi aktif.

## Kesimpulan

Frontend Studio telah memakai API server nyata dan tidak memiliki fallback hasil sintetis. Alur upload lokal → transkrip/analis AI → tinjau → render → download berfungsi ketika layanan dan kredensial yang dibutuhkan siap. Build dan kontrak backend lulus. E2E media sintetis sebelumnya membuktikan upload, streaming player, render FFmpeg, subtitle, overlay judul Pillow, dan unduhan.

Koneksi Gemini live serta URL YouTube/Drive milik pengguna belum dapat diverifikasi: database lokal saat audit tidak memiliki akun maupun API key Gemini. Analisis menolak request tanpa key dengan pesan konfigurasi; ia tidak menyajikan data contoh.

## Temuan dan perubahan

| Area | Status | Catatan |
|---|---|---|
| Analisis dan render | Lulus di kode | Menggunakan endpoint job server; endpoint generik lama yang mengembalikan stub `501` dihapus. |
| Input analisis | Diperbaiki | Pilihan rentang kustom dan subtitle manual dihapus karena request/backend tidak menerapkannya. Pilihan durasi `auto` dihapus karena sebenarnya selalu berarti 30 detik. |
| Studio render | Diperbaiki | Progress angka palsu dihapus. Gaya caption yang tidak konsisten antar mesin diganti menjadi aktif/nonaktif; subtitle track memberi catatan bahwa pemutar menentukan tampilannya. Safe area ditandai sebagai panduan pratinjau. |
| Akun/admin | Lulus lokal | Auth, sesi cookie, role, daftar pengguna, audit, dan Gemini API bersumber dari backend. Pengelolaan paket Pro dihapus karena pembayaran/kuota Pro belum berfungsi. Error pemuatan admin tidak lagi disamarkan sebagai data kosong. |
| Landing/copy | Diperbaiki | Klaim rasio 1:1, waktu satu menit, sumber video generik, gaya subtitle, dan skor berbasis sinyal yang tidak cocok dengan implementasi diperbaiki. |
| Unduhan Drive | Diperbaiki | Respons media sekarang di-stream dengan batas ukuran tanpa membaca seluruh video ke memori. Unduhan YouTube juga meminta batas ukuran ke yt-dlp. |
| Retensi | Diperbaiki | Pembersihan berkala menghapus file sementara setelah 24 jam dan metadata job/transkrip serta audit setelah 90 hari. |
| Dashboard | Diperbaiki | Kegagalan mengambil riwayat terlihat sebagai error, bukan angka nol yang tampak seperti data kosong. |
| Dokumen aktif | Diselaraskan | Dokumen 00–05 menjelaskan backend nyata dan batas saat ini. Rencana 06 dan handoff 07 diberi penanda snapshot historis. |

## Pemeriksaan

- `npm run build`: lulus, termasuk color guard, TypeScript, dan Vite.
- `python -m unittest discover -s backend/tests -v`: 12 pemeriksaan lulus untuk health, kuota, auth, session logout, RBAC, proteksi admin terakhir, reset sekali pakai, dan pembersihan metadata sesuai retensi, dan penghapusan endpoint stub.
- `python -m compileall -q backend`: lulus.
- E2E media sintetis yang dijalankan sebelumnya: upload dengan session, media dapat diputar, FFmpeg menghasilkan MP4, subtitle disimpan sebagai track, judul overlay diterapkan, dan file dapat diunduh.
- UI lokal yang terlihat adalah halaman login server; tidak ada kredensial admin default atau hasil contoh.

## Batas yang masih nyata

1. **Gemini live:** administrator harus mendaftarkan akun pertama, menambahkan key Gemini valid pada **Admin → Gemini API**, lalu mengetesnya. Pengujian provider, pemrosesan model, serta failover antar Google project belum terbukti tanpa key.
2. **Sumber eksternal:** YouTube/Drive perlu diuji dengan tautan yang memang dapat diakses. Drive harus dibagikan kepada “siapa saja yang memiliki link”. Pembatasan platform dapat menolak sumber tertentu.
3. **Cap biaya operator $50/bulan + alert 80%:** belum ditegakkan dan tidak lagi disajikan sebagai perlindungan aktif. Pantau billing Google secara terpisah sebelum membuka akses ke pengguna lain.
4. **Email reset sandi:** belum dikonfigurasi; layar reset menyatakan keterbatasan ini.
5. **Deployment umum:** sebelum dipakai di internet perlu HTTPS, CSRF/rate limit, backup, pemantauan disk/provider, serta validasi konfigurasi secret/operasional.

## Tindakan operator untuk uji live

- Daftarkan akun pertama pada halaman `/register`; akun tersebut memperoleh role admin.
- Tambahkan dan jalankan Tes pada key Gemini yang sah di halaman Admin → Gemini API. Gunakan project berbeda untuk failover.
- Coba satu upload lokal singkat dengan ucapan; lanjutkan dari analisis ke trim dan render, lalu pastikan klip unduhan dapat diputar.
- Uji satu URL YouTube publik dan satu file Drive dengan izin berbagi yang sesuai.

Jangan memakai output sintetis sebagai pengganti hasil tersebut. Jika konfigurasi/provider tidak tersedia, sistem harus tetap menunjukkan error yang sebenarnya.
