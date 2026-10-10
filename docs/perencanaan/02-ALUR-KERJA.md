# 02 — Modul dan Alur Kerja ECLIPSE V.2

Status implementasi diperbarui 9 Oktober 2026. Dokumen ini mencatat perilaku kode yang tersedia di checkout lokal, termasuk batas yang masih memerlukan kredensial atau layanan eksternal.

## Modul aplikasi

| Modul | Route | Perilaku saat ini |
|---|---|---|
| Website publik | `/` | Landing, fitur, paket Free/Pro sebagai informasi, FAQ, dan tautan akun. Pembayaran belum tersedia; paket berbayar diberi label belum tersedia. |
| Akun | `/login`, `/register`, `/forgot` | Registrasi publik selalu membuat role user; admin dibuat melalui bootstrap CLI atau dipromosikan admin yang sudah ada. Login/logout dan sesi cookie ditangani backend. Lupa sandi belum dapat mengirim email. |
| Dashboard | `/app` | Mengambil hitungan video/klip dari riwayat akun server. |
| ECLIPSE Studio | `/app/studio` | Mengunggah/menarik video, mentranskrip dan menganalisisnya dengan backend, memuat riwayat, memutar media, meninjau klip, dan memanggil render FFmpeg. Analisis Gemini memerlukan key aktif dari admin. |
| Pengaturan | `/app/settings` | Mengubah nama akun di server dan bahasa tampilan di browser. |
| Admin | `/app/admin/overview` | Mengambil jumlah akun dan event audit dari server. Metrik job/biaya belum disediakan. |
| Pengguna & Role | `/app/admin/users` | Daftar akun server, filter/paginasi UI, status aktif, ubah role, dan hapus akun dengan penghapusan job/media/usage akun; paket Pro belum dapat dikelola. |
| Gemini API | `/app/admin/gemini` | Menambah, mengaktifkan, mengurutkan, menghapus, dan mengetes kunci Gemini; rahasia terenkripsi dan tidak dikembalikan ke browser. Request diseimbangkan bergilir lintas Google project; beberapa key di project yang sama berbagi kuota project. 401 menandai key tidak valid, sedangkan 403/429 dan 5xx mendinginkan project sementara. |
| Proxy / Egress | `/app/admin/proxy` | Mengelola banyak endpoint proxy HTTP/HTTPS terenkripsi, memeriksa IP egress per endpoint, membagi akun baru berdasarkan least-recently-used, dan mempertahankan afinitas akun/job. Tunnel gagal menyebabkan cooldown dan retry hingga dua endpoint sehat lain. |
| Aktivitas | `/app/admin/activity` | Melihat, mengekspor, dan menghapus event audit server. |
| Pengaturan Sistem | `/app/admin/settings` | Menampilkan batas MVP yang diterapkan backend; halaman ini bukan editor konfigurasi. |

## Alur Studio

1. **Sumber.** Pengguna memilih file lokal, URL YouTube, atau tautan berbagi Google Drive publik. Backend menyimpan sumber sementara, memvalidasi format/durasi/ukuran, dan memberikan error jika sumber tidak dapat diakses.
2. **Analisis.** Jalur bergantung pada sumber dan pilihan subtitle. Untuk YouTube, backend mengambil metadata dan subtitle otomatis jika tersedia, atau memakai subtitle manual; analisis Gemini menggunakan transkrip bertimestamp dan tidak mengunduh video penuh hanya untuk analisis. Untuk upload/Drive, backend memakai subtitle manual bila diberikan atau menjalankan faster-whisper, lalu menganalisis video beserta konteks transkrip dengan Gemini. Tanpa key aktif atau transkrip yang dapat digunakan, request gagal dengan pesan yang sesuai; tidak ada hasil contoh sebagai fallback. Progres analisis menampilkan milestone tahap, bukan persentase kerja kontinu.
3. **Tinjau.** Player mengambil media dari backend. Pengguna mencari, memfilter, menandai, memutar timestamp, memangkas batas klip, menyalin timestamp, dan mengekspor kandidat JSON.
4. **Render.** Maksimal lima klip pilihan diproses berurutan oleh worker FFmpeg sebagai MP4 H.264/AAC. Mode yang tersedia: 9:16 (1080×1920), 1:1 (1080×1080), 4:3 (1440×1080), 16:9 letterbox di kanvas vertikal (1080×1920), dan 16:9 lanskap (1920×1080). Subtitle dibakar bila filter FFmpeg tersedia; selain itu subtitle disimpan sebagai track MP4. Judul, pengaturan framing, audio dan watermark teks diterapkan renderer. Setiap klip yang berhasil memiliki tautan unduh sendiri. Progres batch adalah estimasi tahap/klip, bukan progres encoding FFmpeg kontinu.
5. **Riwayat.** Hasil tersimpan di database per akun. File media dibersihkan otomatis setelah 24 jam; metadata job/transkrip dan audit dibersihkan setelah 90 hari.

## Batas yang belum menjadi fitur aktif

- Ledger mencatat token dan percobaan Gemini yang dilaporkan provider, dengan ringkasan admin per project/model, pengguna, dan job. Pemantauan penggunaan dollar, rekonsiliasi billing, peringatan 80%, dan penegakan cap operator $50/bulan belum dibuat. Jangan menganggap ledger token sebagai cap yang melindungi akun billing.
- Reset sandi melalui email belum tersedia; layar lupa sandi memberi tahu pengguna bahwa alur ini belum aktif. Endpoint reset internal bukan pengganti alur email pengguna.
- Pembayaran/paket Pro, ekspor ZIP, rentang analisis kustom, cap biaya, dan metrik admin job umum belum tersedia. Metrik token Gemini dasar sudah dicatat; angka USD belum tersedia.
- Upload subtitle manual `.srt`/`.txt` tersedia; dokumen lama yang menyebutnya belum ada perlu diperbarui.
- Koneksi Gemini produksi dan URL YouTube/Drive tertentu memerlukan uji dengan kredensial serta sumber yang sah. Lingkungan lokal saat audit belum berisi akun maupun key Gemini.
- Progres analisis menunjukkan milestone server. Progres render memperkirakan kemajuan tahap dan jumlah klip; keduanya belum mengukur setiap unit kerja secara kontinu. Jangan menyebutnya progres encoding real-time.
- Rotasi Gemini menambah kapasitas hanya ketika memakai Google project berbeda; banyak key dalam satu project tidak memisahkan kuota project. Belum ada penagihan per tenant atau penegakan cap USD.
- Proxy egress lokal telah memiliki pool, cooldown, serta failover terbatas. Cookie YouTube terikat pada IP; failover dapat mengganti IP akun sehingga operator perlu memastikan cookie valid dari jalur egress yang sesuai.

## Keputusan MVP yang tetap berlaku

MVP mencakup YouTube, Google Drive publik, dan file lokal; batas 2 GB dan 180 menit; satu worker render; maksimal lima klip per batch; kuota Free tiga analisis dan satu render per hari; TTL file 24 jam; retensi metadata 90 hari; dan persetujuan eksplisit untuk pemrosesan provider eksternal. Skor kandidat adalah bantuan editorial, bukan jaminan performa.
