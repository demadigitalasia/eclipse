# Audit Kesehatan Kode ECLIPSE

**Tanggal:** 6 Oktober 2026  
**Commit yang diaudit:** `b9ef63a` — `feat: polish clip studio workflow and rendering`  
**Jenis pemeriksaan:** tinjauan statis source, konfigurasi, dan struktur repository. Tidak ada kode aplikasi yang diubah untuk audit ini.

## Ringkasan

ECLIPSE sudah memiliki alur produk yang luas: analisis video, pengelolaan klip, studio penyuntingan, render batch, unduhan, dan konfigurasi sistem. Ada pemisahan dasar antara router, service, schema, dan komponen UI. Namun, repository masih lebih cocok untuk aplikasi lokal satu pengguna daripada layanan yang dibuka ke jaringan. Risiko terbesar adalah backend berjalan pada semua interface jaringan, sementara beberapa operasi sensitif tidak memerlukan autentikasi secara default.

Kualitas pemeliharaan juga tertekan oleh beberapa file yang sangat besar, validasi request yang tipis, dan tidak ditemukannya suite tes aplikasi yang ter-track. Saya merekomendasikan penanganan keamanan/deployment terlebih dahulu, lalu pengujian dan pembatasan resource sebelum refactor besar.

## Temuan prioritas

### P0 — Batasi paparan backend dan lindungi operasi sensitif

- `scripts/start-backend.js` menjalankan Uvicorn dengan `--host 0.0.0.0`; artinya backend menerima koneksi pada semua interface jaringan. Lihat [scripts/start-backend.js](scripts/start-backend.js).
- `verify_admin_access()` di [backend/routers/system.py](backend/routers/system.py) mengizinkan akses jika `ADMIN_API_KEY`, `ECLIPSE_API_KEY`, dan alias lama tidak dikonfigurasi. Fungsi ini melindungi hapus file sementara, update, dan restart, tetapi perlindungannya terbuka saat kunci kosong.
- Endpoint tulis/hapus cookie YouTube di [backend/routers/cookies.py](backend/routers/cookies.py) tidak memakai dependency autentikasi. Endpoint ini dapat mengganti atau menghapus file kredensial cookie.
- CORS yang membatasi origin ke localhost membantu browser, tetapi tidak menggantikan autentikasi dan tidak melindungi layanan dari klien jaringan langsung.

**Dampak:** pada jaringan yang tidak sepenuhnya tepercaya, klien lain berpotensi memicu operasi administratif, mengganti/menghapus cookie, atau mengirim pekerjaan yang memakai CPU, GPU, storage, dan bandwidth. Ini menjadi penghalang sebelum backend dibuka ke LAN bersama atau internet. Risiko lebih kecil saat aplikasi benar-benar hanya berjalan di komputer pengguna.

**Rekomendasi:** bind ke loopback sebagai default. Jika pengguna memilih akses jaringan, wajibkan kunci admin yang kuat, autentikasi semua operasi yang mengubah state, validasi `Origin`/CSRF untuk browser, dan tampilkan peringatan konfigurasi. Lindungi juga endpoint update-check dan informasi storage sesuai model deployment.

### P1 — Batasi ukuran dan jumlah pekerjaan

- Schema render di [backend/schemas/render.py](backend/schemas/render.py) menerima `clips: List[Dict[str, Any]]`; jumlah klip, timestamp, string, dan sebagian besar nilai render tidak memiliki batas schema yang terlihat. Hanya nama font yang divalidasi secara eksplisit.
- [backend/routers/render.py](backend/routers/render.py) menerima batch lalu menjadwalkan pekerjaan background tanpa batas jumlah batch atau jumlah klip yang tampak pada route.
- Upload video mengizinkan berkas hingga 4 GB di [backend/routers/media.py](backend/routers/media.py). Ini berguna untuk aplikasi lokal, tetapi memerlukan kuota dan batas konkurensi jika dipakai oleh beberapa pengguna.

**Dampak:** request besar atau berulang dapat menghabiskan memori, storage, waktu proses, dan kapasitas encoder.

**Rekomendasi:** tetapkan batas produk untuk jumlah klip per batch, panjang prompt/transkrip, durasi sumber, ukuran berkas, dan pekerjaan yang berjalan bersamaan. Validasi `start_time < end_time`, rentang terhadap durasi sumber, serta rentang numerik setiap opsi render di Pydantic sebelum pekerjaan dijalankan.

### P1 — Status pekerjaan hanya hidup di memori proses

Status render dan konfigurasi batch disimpan dalam dictionary global `RENDER_BATCHES` dan `BATCH_REQUESTS` pada [backend/services/render_service.py](backend/services/render_service.py). Endpoint render menjadwalkan fungsi melalui `BackgroundTasks` FastAPI.

**Dampak:** restart server atau penggunaan beberapa worker dapat membuat progres/status tidak tersedia atau berbeda antar-proses, sementara file sementara dan hasil render mungkin masih tertinggal di disk.

**Rekomendasi:** untuk desktop satu proses, tambahkan pemulihan dan pembersihan saat startup yang terdokumentasi. Sebelum multi-worker, pindahkan status job ke penyimpanan bersama/queue dan tetapkan retensi untuk hasil serta file sementara.

### P1 — Tentukan siklus hidup API key di browser

Gemini API key disimpan di `localStorage` oleh [src/App.tsx](src/App.tsx). Ini praktis untuk instalasi lokal, tetapi token bertahan di profil browser dan dapat dibaca oleh JavaScript pada origin aplikasi.

**Rekomendasi:** jelaskan model lokal ini kepada pengguna. Jika aplikasi menjadi layanan bersama, jangan menyimpan kredensial bersama di browser; gunakan secret storage sisi server, isolasi per pengguna, dan pembatasan kuota.

## Temuan kualitas dan pemeliharaan

### P1 — Tambahkan tes otomatis untuk alur utama

Saya tidak menemukan suite tes aplikasi yang ter-track atau script `test` pada `package.json`. Script yang tersedia mencakup `build` dan `lint`; tidak terlihat workflow CI ter-track. Audit ini tidak menjalankan build, lint, atau tes.

**Rekomendasi:** mulai dengan unit test untuk validasi timestamp, sanitasi nama file, dan schema render; lalu smoke/integration test untuk analisis, upload, render sebagian/gagal, retry, serta unduhan ZIP. Jalankan lint, typecheck, dan tes tersebut di CI pada setiap perubahan.

### P1 — Pecah modul yang terlalu besar

Beberapa file memusatkan terlalu banyak tanggung jawab: [src/App.tsx](src/App.tsx) sekitar 4.400 baris, [src/components/ClipStudioSection.tsx](src/components/ClipStudioSection.tsx) sekitar 4.400 baris, [backend/video_engine.py](backend/video_engine.py) sekitar 3.100 baris, dan [backend/routers/analyze.py](backend/routers/analyze.py) sekitar 1.200 baris.

**Rekomendasi:** ekstrak alur kerja ke custom hooks dan komponen UI kecil; pecah engine berdasarkan download, transkripsi/subtitle, tracking, audio, dan rendering. Sertakan tes sebelum memindahkan logika agar refactor dapat diperiksa dengan aman.

### P2 — Perketat TypeScript dan tipe API

[tsconfig.app.json](tsconfig.app.json) belum mengaktifkan `strict`. Beberapa titik memakai `any`, termasuk event SSE/API dan props terjemahan. Schema render Python menerima dictionary bebas, sehingga kontrak frontend/backend mudah menyimpang.

**Rekomendasi:** aktifkan strict secara bertahap, ganti `any` dengan tipe event/API yang eksplisit, dan gunakan model Pydantic khusus untuk klip, transcript, dan nilai enum render. Pertimbangkan menghasilkan tipe frontend dari schema API.

### P2 — Rapikan strategi dependency dan tooling Python

`requirements.txt` di root dan `backend/requirements.txt` saat ini duplikat, berisi versi minimum tanpa lock file Python yang terlihat. `package-lock.json` tersedia untuk frontend. Tidak ditemukan konfigurasi formatter/linter/type checker Python seperti `pyproject.toml`.

**Rekomendasi:** pilih satu sumber dependency Python, tetapkan versi runtime, dan kunci environment deployment. Tambahkan formatter serta linter Python; periksa pembaruan dependency secara terjadwal.

### P2 — Konsolidasikan lapisan CSS

`src/main.tsx` memuat `index.css` lalu `dema-theme.css`; tema kedua menimpa banyak aturan tema pertama. Pola ini membuat hasil styling bergantung pada urutan import dan meningkatkan risiko regresi saat panel baru ditambahkan.

**Rekomendasi:** tetapkan token/komponen visual sebagai sumber utama, pindahkan aturan final ke satu tema, dan hapus override lama secara bertahap dengan pemeriksaan visual per tab studio.

## Hal yang sudah baik

- Dependensi frontend dikunci melalui `package-lock.json`.
- Endpoint media memeriksa bahwa path file berada di direktori yang diizinkan; batas ukuran upload juga sudah diterapkan per jenis file.
- Proses subprocess yang terlihat memakai argumen terpisah dan `shell: false`/default tanpa shell, bukan merangkai command shell dari input pengguna.
- `.env`, cache Python, hasil render, dan file sementara di-ignore Git; tidak terlihat `.env` ter-track.
- Endpoint CORS memiliki daftar origin lokal default, walau ini bukan pengganti autentikasi.

## Urutan tindak lanjut yang disarankan

1. **Sebelum akses jaringan:** ubah bind default ke loopback; pastikan autentikasi tidak fail-open untuk operasi sensitif; lindungi API cookie dan endpoint perubahan state.
2. **Keandalan pekerjaan:** tambahkan validasi/batas request, kuota konkurensi, retensi file, dan strategi pemulihan status job.
3. **Quality gate:** bentuk tes untuk alur utama dan CI untuk lint, typecheck, serta tes.
4. **Pemeliharaan:** perketat tipe, pecah file besar, konsolidasikan CSS, dan sederhanakan dependency Python.

## Batas audit

Audit ini membaca source/config dan status repository pada commit `b9ef63a`. Tidak dilakukan build, lint, tes, uji penetrasi, pemeriksaan CVE dependency, atau validasi deployment. Saya tidak membaca nilai rahasia dalam `.env`. Kesimpulan keamanan harus disesuaikan jika ECLIPSE hanya dijalankan pada komputer lokal dan tidak pernah dibuka ke jaringan.
