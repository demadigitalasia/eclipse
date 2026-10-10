# Persiapan Cloudflare R2 untuk ECLIPSE

Status dokumen: fondasi integrasi tersedia; backend masih memakai mode lokal sampai kredensial R2 dikonfigurasi.

## Ringkasan

ECLIPSE saat ini memakai disk lokal untuk seluruh file media. Proses analisis dan render menggunakan path file lokal, sehingga R2 sebaiknya menjadi penyimpanan persisten, sementara disk lokal tetap dipakai sebagai ruang kerja sementara FFmpeg.

Database SQLite tetap menyimpan akun, job, metadata, dan hasil analisis. Database tidak dipindahkan ke R2.

## Kondisi implementasi saat ini

- `ECLIPSE_DATA_DIR` default `./data`; SQLite default berada di `./data/eclipse.db`.
- Mode default masih `local`. Dalam mode `r2`, sumber video, aset Studio, dan hasil MP4 disimpan di bucket; workspace lokal tetap dipakai untuk FFmpeg dan cache preview.
- Object key sumber disimpan pada `result_json` job. Key aset dan render dibuat deterministik dari ID job serta nama file.
- Download sumber/render menggunakan URL GET presigned setelah backend memeriksa kepemilikan job. Preview mengambil sumber ke workspace lokal agar browser dapat meminta rentang byte.
- Pembersihan direktori lokal tetap mengikuti TTL default 24 jam. R2 mengikuti retensi metadata default 90 hari; cleanup R2 berjalan sebelum metadata job dihapus.
- Migrasi lokal tersedia melalui `python -m backend.cli migrate-media-to-r2`. File lokal tidak dihapus oleh perintah migrasi.

## Arsitektur yang disarankan

1. Bucket R2 dibuat private dan hanya backend yang memegang kredensial S3.
2. File sumber, aset Studio, dan MP4 hasil render yang perlu dipertahankan disimpan di R2.
3. FFmpeg tetap membaca dan menulis file lokal. Backend mengunduh objek ke workspace job sementara sebelum analisis/render dan mengunggah hasil final ke R2 setelah render sukses.
4. SQLite menyimpan object key sumber di metadata job; key aset dan hasil render dapat dibentuk kembali dari ID job dan nama file. Jangan simpan kredensial atau URL presigned sebagai data permanen.
5. Untuk akses file, backend memeriksa kepemilikan job terlebih dahulu. Setelah itu backend dapat mem-proxy file atau membuat presigned GET URL berumur pendek. Pilih satu pola saat implementasi dan pastikan media preview juga mengikutinya.
6. Penghapusan job menghapus objek R2 terkait dan file workspace lokal. Operasi penghapusan dibuat aman untuk diulang, termasuk saat sebagian objek sudah tidak ada.

Contoh pola key object yang tidak memuat email atau nama pengguna:

```text
jobs/{job_id}/source/{filename}
jobs/{job_id}/studio/{asset_name}
jobs/{job_id}/renders/{filename}
```

`job_id` saat ini dibuat acak, tetapi otorisasi tetap wajib melalui kepemilikan job di database; key yang sulit ditebak bukan pengganti kontrol akses.

## Data dan rahasia yang perlu disiapkan

Buat bucket private, lalu buat token R2 dengan izin **Object Read & Write** yang dibatasi hanya pada bucket ECLIPSE. Siapkan nilai berikut di environment server atau secret manager:

```dotenv
ECLIPSE_STORAGE_BACKEND=r2
R2_ACCOUNT_ID=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PREFIX=eclipse
R2_PRESIGNED_URL_TTL_SECONDS=300
```

Endpoint S3 menggunakan format `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; region untuk API S3 R2 adalah `auto`. Kredensial hanya berada di backend. Jangan memasukkan nilainya ke source code, frontend, issue, atau chat. `.env` sudah diabaikan Git oleh `.gitignore`; untuk server produksi gunakan secret manager atau environment secrets.

Jangan mengaktifkan domain publik untuk bucket sebagai jalan pintas. Akses privat terotorisasi atau URL presigned berumur pendek menjaga file pengguna tetap terlindungi. Bila kelak memakai custom domain/CDN, desain authorization dan cache perlu ditinjau terpisah.

## Tahapan implementasi

### Tahap 1 — Kontrak dan konfigurasi (sudah diimplementasikan)

- Konfigurasi tervalidasi `local` dan `r2`, adapter upload/download/penghapusan, dan presigned GET sudah tersedia.
- Jika backend `r2` dipilih tanpa variabel wajib, startup berhenti dengan daftar konfigurasi yang kurang; tidak ada fallback diam-diam ke disk lokal.
- Mode lokal tetap menjadi default.

### Tahap 2 — Metadata dan alur file (sudah diimplementasikan)

- Object key sumber disimpan di metadata job JSON sehingga database lama tidak memerlukan migrasi skema.
- Sumber upload/YouTube/Drive, aset Studio, dan hasil render disimpan ke R2 saat mode R2 aktif.
- Endpoint analisis/render mengambil kembali sumber ke workspace lokal ketika cache file tidak tersedia.
- Endpoint media tetap memeriksa kepemilikan job; klip unduhan memakai presigned GET berumur pendek.
- Render batch baru ditandai selesai setelah objek render terunggah.
- Migrasi file lokal lama tersedia melalui `python -m backend.cli migrate-media-to-r2`.

### Tahap 3 — Retensi, migrasi, dan operasi (kode tersedia; operasi perlu dikonfigurasi)

- Buat penghapusan objek R2 idempoten untuk aksi hapus job dan pembersihan admin.
- Penghapusan job oleh pengguna, penghapusan akun oleh admin, dan pembersihan metadata otomatis menghapus prefix R2 job.
- Retensi R2 saat ini mengikuti retensi metadata job bersama-sama, yaitu default 90 hari. Jika sumber, aset, dan hasil membutuhkan masa simpan berbeda, kebijakan terpisah perlu dirancang sebelum deployment.
- Tentukan aturan lifecycle R2 hanya setelah masa simpan produk disepakati; jangan memasang aturan hapus massal yang berpotensi menghapus output pengguna.
- Sediakan migrasi job lokal lama ke R2 yang dapat dilanjutkan ulang dan diverifikasi sebelum file lokal dibuang.
- CLI migrasi dapat dijalankan ulang; file lokal tidak dihapus oleh migrasi.
- Tambahkan log tanpa kredensial, metrik ukuran/operasi, dan prosedur pemulihan jika R2 sementara tidak tersedia.

## Kriteria siap mengaktifkan R2

- Akun Cloudflare, Account ID, nama bucket, access key, dan secret key tersedia di secret store server.
- Token dibatasi ke bucket yang benar dan diuji tanpa mengaktifkan akses publik.
- Keputusan masa simpan output dan sumber disetujui.
- Alur upload, preview, analisis, render, unduh, hapus job, serta cleanup diuji pada bucket uji.
- Database dan berkas lokal lama memiliki rencana backup/migrasi sebelum backend produksi dialihkan.

## Referensi resmi

- [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/) — endpoint S3 dan region `auto`.
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — akses sementara tanpa mengekspos kredensial API.
- [Cloudflare R2 get started with S3](https://developers.cloudflare.com/r2/get-started/s3/) — bucket dan token API.
