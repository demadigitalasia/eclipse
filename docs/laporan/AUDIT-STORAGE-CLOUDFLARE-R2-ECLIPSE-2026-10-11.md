# Audit Alur Storage Cloudflare R2 ECLIPSE

**Tanggal:** 11 Oktober 2026
**Ruang lingkup:** konfigurasi, adapter S3, upload sumber/aset/hasil, pemulihan ke workspace, unduhan presigned, penghapusan, retensi, dan migrasi lokal.
**Kesimpulan:** fondasi R2 sudah terhubung pada kode aplikasi, tetapi belum siap diaktifkan untuk pemakaian nyata sebelum satu cacat konkuren diperbaiki dan bucket uji berhasil melewati uji end-to-end.

## Ringkasan hasil

Kode menggunakan endpoint S3 Cloudflare R2, region `auto`, dan kredensial yang hanya dibaca backend. Alur upload dan download berada di adapter bersama. Sumber video, aset Studio, dan klip render memiliki key di bawah prefix job; sumber dipulihkan ke disk lokal saat preview atau FFmpeg memerlukannya. R2 tetap privat dan API membuat URL GET berumur pendek sesudah pemeriksaan pemilik job.

Validasi lokal adapter dengan client tiruan lulus **10 dari 10** pemeriksaan: pemilihan mode, validasi konfigurasi, pembentukan key, upload beserta content type, pemulihan file, TTL URL, pemeriksaan listing, penghapusan lebih dari 1.000 object, serta penolakan ID traversal. Pengujian tersebut tidak menghubungi Cloudflare.

Di lingkungan ini `ECLIPSE_STORAGE_BACKEND=local`, kredensial R2 tidak dikonfigurasi, dan `boto3` belum ada di virtualenv aktif. Karena itu kompatibilitas kredensial, bucket, unggah multipart, unduhan byte-range, dan hak hapus belum teruji langsung.

Suite backend yang tersedia menjalankan 19 pemeriksaan: 17 lulus dan 2 gagal pada kuota. Kegagalan pertama mengharapkan jatah render Lite tetap habis setelah tanggal kuota diganti ke hari berikutnya, padahal implementasi memakai kuota harian dan memulai hitungan baru setiap hari. Test itu berhenti sebelum mereset akun bersama; akibatnya test berikutnya membaca paket `lite` dan turut gagal pada limit akun Free. Ini masalah konsistensi test kuota, bukan storage R2. Suite tersebut tidak berisi pengujian integrasi R2.

## Peta alur dan status

- **Konfigurasi:** tervalidasi; mode tetap `local` secara default; mode `r2` menolak konfigurasi wajib yang kosong.
- **Sumber upload/Drive:** upload R2 dilakukan sebelum metadata job disimpan; key tersimpan di `result_json`.
- **YouTube:** job metadata tidak mengunduh video. Sumber baru diunduh dan disimpan ke R2 ketika analisis atau unduh sumber dimulai.
- **Aset Studio:** upload disimpan ke R2; akses/render memulihkan aset ke direktori job lokal.
- **Hasil render:** MP4 batch dan tunggal diunggah ke R2 setelah encoding. Metadata menyimpan nama file, dan endpoint mengarahkan unduhan ke GET presigned.
- **Preview sumber:** backend memulihkan object ke disk lalu melayani file lokal. Starlette aktif mendukung HTTP Range untuk `FileResponse`.
- **Hapus job/akun:** aplikasi menghapus prefix R2 sebelum menghapus metadata dan direktori lokal. Operasi remote multi-langkah tidak atomik.
- **Retensi:** direktori lokal dibersihkan setelah TTL 24 jam; prefix job R2 dibersihkan sebelum metadata 90 hari dihapus.
- **Migrasi lama:** CLI mengunggah sumber yang masih ada, aset Studio, dan MP4. File lokal dibiarkan utuh; sumber yang sudah hilang dilewati.

## Temuan berprioritas

### P1 — Pemulihan objek bersamaan dapat gagal sesekali

`storage.materialize()` menggunakan nama sementara tetap, `destination + ".partial"`. Saya menjalankan dua pemulihan paralel dengan client tiruan yang menuntaskan unduhan bersamaan: satu berhasil dan satu menghasilkan `StorageError` karena berkas `.partial` sudah dipindahkan oleh permintaan lain. Sumber yang sama dapat dipulihkan serentak oleh preview, analisis, atau render.

**Dampak:** permintaan preview/render yang bersamaan dapat gagal sementara meskipun object di R2 tersedia. Ulangi permintaan biasanya berhasil.
**Rekomendasi:** gunakan nama sementara unik per operasi (misalnya `tempfile` pada direktori tujuan), lalu lakukan `os.replace` atomik; bersihkan hanya file sementara milik operasi tersebut. Tambahkan uji konkuren yang memastikan kedua pemanggil berhasil dan isi tujuan tetap benar.

### P2 — Pemeriksaan koneksi hanya membuktikan hak listing

`check-r2` menjalankan `ListObjectsV2` dengan prefix aplikasi. Ini membuktikan kredensial dapat membaca daftar object, tetapi tidak membuktikan kredensial dapat mengunggah, membaca isi, atau menghapus object. Token read-only juga dapat lolos pemeriksaan tersebut, sementara operasi utama aplikasi akan gagal.

Dokumentasi Cloudflare menyebut izin **Object Read & Write** mencakup baca, tulis, dan listing object pada bucket yang dipilih. [Dokumentasi token R2](https://developers.cloudflare.com/r2/api/tokens/)
**Rekomendasi:** ubah pemeriksaan menjadi put/get/delete round-trip dengan key acak di prefix health-check dan penghapusan dalam `finally`, atau beri nama serta pesan yang jelas bahwa perintah saat ini hanya memeriksa akses listing.

### P2 — Perilaku tombol unduh setelah redirect lintas origin belum dijamin

Frontend memasang tautan unduhan pada endpoint aplikasi, tetapi endpoint R2 mengalihkan browser ke domain R2. Object MP4 hanya disimpan dengan `Content-Type: video/mp4`; tidak ada `Content-Disposition: attachment` maupun override pada URL presigned. Atribut HTML `download` pada link lintas origin perlu didukung header `Content-Disposition: attachment` agar perilaku unduh konsisten. [HTML Standard](https://html.spec.whatwg.org/multipage/links.html), [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
**Dampak:** browser dapat menavigasi atau memutar MP4 alih-alih menyimpannya, bergantung pada cara browser menangani redirect dan respons final.
**Rekomendasi:** simpan metadata `Content-Disposition: attachment` untuk hasil render saat mengunggah object, atau proxy respons dengan header tersebut; lalu uji tombol unduh di browser yang didukung. Pastikan nama file tetap aman dan sesuai harapan pengguna.

### P2 — Pemeriksaan R2 nyata belum dilakukan

Saat audit, storage masih `local`, `boto3` belum terpasang di virtualenv yang dipakai, dan kredensial belum disediakan. Uji tiruan memvalidasi pemetaan adapter, bukan SigV4, kebijakan bucket, konfigurasi token, CORS/browser, atau kompatibilitas transfer Cloudflare.

**Rekomendasi:** setelah dependency dipasang dan secret tersedia di `backend/.env`, gunakan bucket privat uji dan jalankan urutan upload → get → range preview → render → download → hapus. Verifikasi prefix dan hasil objek di dashboard R2 sebelum beralih dari data lokal.

### P3 — Upload berhasil sebelum transaksi database dapat meninggalkan object yatim

Pada registrasi sumber maupun render, object diunggah sebelum metadata database selesai disimpan. Jika langkah database gagal setelah upload sukses, object tidak dikompensasi saat itu. Object tersebut tidak selalu terlihat pada riwayat, lalu bertahan sampai prefix job dihapus atau retensi berlaku.

**Rekomendasi:** hapus object/prefix yang baru diunggah saat penyimpanan metadata gagal. Untuk batch yang gagal di tengah jalan, catat key parsial agar operasi retry/pembersihan dapat ditelusuri. Tambahkan rekonsiliasi object yatim sebelum pemakaian produksi.

### P3 — Migrasi lama perlu laporan verifikasi per object

Migrasi menggunakan key deterministik dan dapat dijalankan ulang, tetapi angka `diunggah` bukan bukti bahwa setiap object dapat dibaca kembali atau cocok ukurannya/hash-nya. Sumber lokal yang hilang dilewati tanpa migrasi; karena itu file tersebut tidak akan terlindungi oleh R2 sesudah direktori lokal hilang.

**Rekomendasi:** simpan manifest migrasi berisi job, kategori, key, ukuran, hash lokal, status unggah, dan status verifikasi remote. Pertahankan salinan lokal/backup sampai manifest menyatakan object terverifikasi.

## Rekomendasi urutan kerja

1. Perbaiki nama file sementara konkuren di `materialize()` dan verifikasi dengan uji dua pemulihan serentak.
2. Tingkatkan `check-r2` agar membuktikan setidaknya hak tulis, baca, dan hapus dengan object sementara.
3. Pastikan unduhan MP4 memaksa disposition attachment, lalu verifikasi alur tombol di browser.
4. Tambahkan kompensasi kegagalan metadata setelah upload dan verifikasi migrasi berbasis manifest.
5. Pasang `backend/requirements.txt`, isi secret di file lokal yang diabaikan Git, jalankan pemeriksaan koneksi, kemudian lakukan E2E di bucket privat uji.
6. Aktifkan bucket produksi setelah backup lokal dan hasil E2E berhasil; migrasikan file lama dan periksa object sebelum mengandalkan R2 sebagai satu-satunya salinan.

## Batas bukti

Audit ini meninjau source saat ini, menjalankan suite backend yang tersedia, menjalankan sepuluh pemeriksaan adapter dengan client tiruan, dan mereproduksi race `materialize()` secara lokal. Tidak ada kredensial yang dibaca atau dicetak dan tidak ada permintaan ke bucket R2. Kegagalan suite kuota yang disebut di atas bukan bukti kegagalan storage.
