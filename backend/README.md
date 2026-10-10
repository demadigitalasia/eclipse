# Backend ECLIPSE MVP 1

FastAPI melayani API pada `127.0.0.1:8000`; Vite meneruskan request `/api` dari frontend. Studio tidak mempunyai mode hasil sintetis. Analisis memerlukan sekurangnya satu API key Gemini valid yang ditambahkan admin.

## Menjalankan secara lokal

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Di terminal lain:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

FFmpeg dan ffprobe harus terpasang pada host. Dukungan unduh YouTube membutuhkan `yt-dlp[default]` (termasuk `yt-dlp-ejs`) dan Node.js 22+ yang tersedia di `PATH`; ECLIPSE mengaktifkan runtime Node untuk challenge JavaScript YouTube. Jika YouTube mengharuskan token akses tambahan atau menolak stream pada IP server, pengunduhan tetap dapat gagal dan pengguna perlu mengunggah file video yang memang berhak mereka proses. faster-whisper mengunduh model `small` saat analisis pertama. Pendaftaran publik selalu membuat akun user. Buat admin pada database kosong dengan `python -m backend.cli create-admin`, atau promosikan akun melalui panel admin. Tambahkan key Gemini pada **Admin → Gemini API** dan uji koneksi sebelum memulai analisis.

Default data disimpan di `./data`; atur `ECLIPSE_DATA_DIR` dan `ECLIPSE_DB_PATH` sebelum membuka backend jika perlu memisahkan data. Kunci Gemini dienkripsi server-side memakai `ECLIPSE_MASTER_KEY` atau kunci file `data/.eclipse-master-key` berizin 0600. Simpan cadangan kunci yang sama dan jangan mengganti/menghapusnya setelah API key tersimpan.

### Cloudflare R2

Mode default `ECLIPSE_STORAGE_BACKEND=local` tetap menggunakan disk lokal. Untuk memakai R2, pasang dependency backend yang tercantum di `backend/requirements.txt`, salin `backend/.env.example` menjadi `backend/.env`, lalu isi Account ID, nama bucket, access key, dan secret key di file lokal tersebut. Backend memuat `backend/.env` tanpa menimpa environment variables yang sudah disetel. Jangan mengisi rahasia di frontend atau commit file `.env`.

```dotenv
ECLIPSE_STORAGE_BACKEND=r2
R2_ACCOUNT_ID=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PREFIX=eclipse
R2_PRESIGNED_URL_TTL_SECONDS=300
```

Bucket harus private dan token dibatasi ke bucket itu. R2 menyimpan sumber video, aset Studio, dan klip render. Workspace lokal tetap dibutuhkan untuk FFmpeg dan cache preview; SQLite tetap lokal/persisten. Akses download klip memakai URL GET presigned berdurasi pendek. Setelah mengisi file env, restart backend.

Jika database memiliki file media lokal lama, jalankan migrasi setelah konfigurasi R2 aktif:

```bash
./.venv/bin/python -m backend.cli check-r2
./.venv/bin/python -m backend.cli migrate-media-to-r2
```

Perintah ini mengunggah sumber yang masih ada, aset Studio, dan MP4 hasil render. Sumber yang sudah tidak ada di disk akan dilaporkan sebagai dilewati dan perlu diunduh ulang dari sumbernya. Perintah dapat dijalankan ulang; object key stabil sehingga upload ulang menimpa object yang sama. Simpan backup `data/` sebelum mengubah backend aktif. Detail retensi dan tahapan ada di [Persiapan Cloudflare R2](../docs/perencanaan/08-PERSIAPAN-CLOUDFLARE-R2.md).

## Endpoint utama

- `GET /api/health`, `GET /api/limits`
- Auth: `POST /api/auth/register|login|logout`, `GET|PATCH /api/auth/me`
- Sumber: `POST /api/upload-video`, `POST /api/ingest-youtube`, `POST /api/ingest-drive`
- Job/riwayat: `POST /api/jobs/{id}/analyze`, `GET /api/jobs/{id}/analysis`, `GET|DELETE /api/jobs`
- Render/media: `POST /api/jobs/{id}/render-batch`, `GET /api/media/{id}/source`, `GET /api/download/{id}/{filename}`
- Admin: `/api/admin/users`, `/api/admin/audit`, `/api/admin/gemini-keys`, `/api/admin/gemini-usage`, `/api/admin/proxies`

Endpoint `/api/analyze` dan `/api/render-batch` generik lama telah dihapus. Gunakan endpoint berbasis job.

## Batas yang belum tersedia

Ledger token Gemini kini mencatat percobaan analisis, status, dan counter usage yang disertakan respons provider; admin dapat melihat agregat 30 hari per project/model, pengguna, dan job. Counter token opsional pada respons, sehingga event tanpa counter ditandai tidak diketahui. Nilai USD, rekonsiliasi Google Cloud Billing, alert 80%, dan penegakan cap $50/bulan belum tersedia. Ledger tidak menyimpan prompt, transkrip, media, atau API key. Metrik admin job umum, progres encoding FFmpeg aktual, ekspor ZIP, rentang analisis kustom, billing Pro, dan deployment produksi juga belum tersedia. Progres analisis memakai milestone tahap dan progres batch render merupakan estimasi kasar per klip; keduanya bukan progres kerja kontinu. Upload subtitle manual `.srt`/`.txt` tersedia. Pool Gemini dapat mencoba project aktif berikutnya setelah error provider, tetapi failover bukan kontrol biaya.

Studio mendukung rasio 9:16, 1:1, 4:3, 16:9 letterbox pada kanvas vertikal, dan 16:9 lanskap. Lihat [checklist Dokumen vs Implementasi](../docs/laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md) untuk status terperinci serta backlog menuju full-feature.

File sumber/hasil dibersihkan setelah 24 jam; metadata job/transkrip/audit setelah 90 hari. Rate limit endpoint autentikasi saat ini disimpan per proses; deployment multi-worker perlu limiter bersama di proxy atau penyimpanan bersama.

### Pool Gemini dan proxy egress

Admin dapat mendaftarkan banyak API key Gemini dan endpoint proxy dari panel admin. Rahasia dienkripsi sebelum disimpan; daftar API tidak mengirimkan nilai kredensial kembali ke browser. Permintaan Gemini diseimbangkan bergilir di antara Google project yang berbeda, lalu key di project tersebut menjadi jalur percobaan lokal/fallback. Kuota Gemini dihitung pada level project, sehingga menambahkan key lain ke project yang sama tidak membuat kuota terpisah. Respons 401 menandai key tidak valid; 403/429 dan gangguan server membuat project cooldown sementara agar request berikutnya berpindah project. Ledger mencatat pemakaian per project, akun, dan job.

Proxy HTTP/HTTPS dibagi ke akun menggunakan pemilihan least-recently-used saat afinitas pertama dibuat, kemudian dipertahankan untuk akun dan job supaya egress YouTube stabil bagi cookie. Jika proxy gagal membangun koneksi, endpoint masuk cooldown dan job mencoba hingga dua endpoint sehat lain. Status gagal total ditutup dengan pesan eksplisit. Saat pool admin kosong, `ECLIPSE_EGRESS_PROXY` menjadi fallback tunggal; fallback environment tidak dipakai ketika pool admin masih ada tetapi seluruh endpoint dinonaktifkan. Pengujian egress tersedia per endpoint dan hanya menampilkan IP keluar, bukan kredensial.

Konfigurasi proxy singleton lama dimigrasikan ke pool sebagai `Proxy sebelumnya` tanpa membuka ulang secret. Endpoint legacy `/api/admin/proxy` dipertahankan untuk klien lama dan menolak tes ambigu ketika beberapa proxy aktif; pengelolaan pool dilakukan melalui `/api/admin/proxies`.

### Konfigurasi jaringan publik

Untuk deployment, set `ECLIPSE_ENV=production`; ini mengaktifkan cookie `Secure` dan menonaktifkan registrasi secara default. Buat admin pada database kosong dengan `python -m backend.cli create-admin`. Untuk pengembangan lokal, `npm run local` memakai mode development dan pendaftaran akun tersedia dengan role user.

Kode reset sandi dikirim melalui SMTP jika `ECLIPSE_RESET_SMTP_HOST` dan `ECLIPSE_RESET_SMTP_FROM` diatur; kredensial opsional tersedia melalui `ECLIPSE_RESET_SMTP_USERNAME` dan `ECLIPSE_RESET_SMTP_PASSWORD`. STARTTLS aktif secara default (`ECLIPSE_RESET_SMTP_STARTTLS=true`). Jika SMTP belum dikonfigurasi, endpoint tetap menjaga respons anti-enumerasi tetapi kode tidak terkirim. `ECLIPSE_RESET_CODE_LOGGING` hanya untuk debugging lokal; jangan aktifkan pada server yang dipakai pengguna. Mutasi dengan cookie sesi memeriksa header `Origin` terhadap `ALLOWED_ORIGINS`, dan rate limit autentikasi dibagi melalui SQLite untuk worker yang memakai database yang sama. Deployment publik tetap memerlukan HTTPS, backup/restore, monitoring, dan manajemen secret.
