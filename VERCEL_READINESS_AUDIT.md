# Audit kesiapan deploy ECLIPSE ke Vercel

**Tanggal:** 6 Oktober 2026
**Cakupan:** pemeriksaan statis repo, konfigurasi build, alur frontend/backend, upload/media, penyimpanan, autentikasi, dan dependensi.
**Kesimpulan:** **NO-GO untuk deploy aplikasi penuh di Vercel saat ini.** Frontend statis dapat dibuild, tetapi layanan utama bergantung pada backend yang belum dikonfigurasi untuk Vercel dan pola runtime yang tidak cocok dengan Functions tanpa perubahan arsitektur.

## Ringkasan keputusan

- **Frontend saja:** build produksi berhasil. Ini belum berarti fitur aplikasi dapat digunakan karena browser tetap memanggil `/api/...` dan repo belum menyediakan backend production atau proxy ke backend eksternal.
- **Frontend dan backend penuh pada Vercel:** belum layak. Pekerjaan render, unduhan, upload video, progres SSE, dan file hasil bergantung pada proses yang hidup, filesystem yang dapat ditulis, serta state lokal.
- **Pola deploy yang disarankan:** Vercel untuk frontend; backend ECLIPSE di layanan/container yang mendukung FFmpeg, CPU yang memadai, proses pekerjaan panjang, penyimpanan file, dan antrean/state bersama. Hubungkan `/api` ke backend tersebut melalui URL API dan rewrite/proxy.

## Temuan prioritas

### P0 — Tidak ada rute backend production untuk `/api`

Frontend memakai path relatif seperti `/api/analyze`, `/api/render-batch`, `/api/upload-video`, dan `/api/cookies`. Satu-satunya proxy yang ditemukan berada di `vite.config.ts` dan meneruskan request ke `127.0.0.1:8000` untuk server development. Repo tidak memiliki `vercel.json`, direktori `api/`, maupun konfigurasi URL backend frontend.

**Dampak:** situs mungkin tampil setelah deploy statis, tetapi aksi aplikasi akan gagal karena route `/api/...` tidak tersedia.

**Perbaikan:** pilih salah satu sebelum deploy:

1. Set base URL API pada frontend dan proxy `/api` ke backend eksternal; atau
2. Tambahkan adapter/backend Functions Vercel dan pastikan semua endpoint terpetakan.

Vercel mendukung FastAPI melalui Python Runtime, tetapi perlu entry point Function yang dikenali dan pengaturan dependensi/runtime yang sesuai. Rewrites Vercel dapat mem-proxy request ke origin eksternal. [Python Runtime](https://vercel.com/docs/functions/runtimes/python) · [Rewrites](https://vercel.com/docs/routing/rewrites)

### P0 — Model pekerjaan dan penyimpanan file tidak cocok dengan Functions

Backend menyimpan progres render dan konfigurasi batch di dictionary global proses (`backend/services/render_service.py:22-23`). Route render menjalankan `BackgroundTasks`, sementara browser meminta progres lewat SSE (`backend/routers/render.py:35-67,117-153`). Pada awal audit, direktori data default berada di tree aplikasi (`backend/video_engine.py:19-42`); tindak lanjut menambahkan `ECLIPSE_DATA_DIR` agar container dapat mengarahkan data ke volume persisten di luar tree kode.

Vercel Functions memiliki filesystem read-only, dengan ruang tulis sementara `/tmp` yang terbatas; instans fungsi juga menangani invocation terpisah. [Filesystem Functions](https://vercel.com/docs/functions/runtimes) · [Lifecycle Functions](https://vercel.com/docs/functions)

**Dampak:** folder di tree aplikasi dapat gagal dibuat/ditulis; `/tmp` tidak menjadi penyimpanan permanen atau bersama. Polling progres dapat mencapai instans berbeda dan tidak menemukan job. File hasil dapat hilang atau tidak bisa diunduh setelah invocation/instans berbeda. Render panjang juga dibatasi durasi Function.

**Perbaikan:** simpan state job di database/Redis dan kirim pekerjaan ke worker; simpan upload/hasil di object storage; gunakan backend worker yang dapat berjalan lama. Jangan mengandalkan dictionary proses atau disk lokal untuk data lintas request.

### P0 — Batas upload aplikasi bertentangan dengan batas payload Function

Backend menerima video sampai **4 GB** (`backend/routers/media.py:27,77-98`). Vercel Functions membatasi payload request/response menjadi **4.5 MB**. [Vercel Function limits](https://vercel.com/docs/functions/limitations)

**Dampak:** upload video langsung melalui Vercel akan ditolak jauh sebelum mencapai validasi ukuran di backend. Batas file audio, watermark, dan font aplikasi juga lebih besar daripada batas platform.

**Perbaikan:** unggah langsung dari browser ke object storage melalui URL bertanda tangan, atau kirim upload melalui backend di host yang memang mendukung ukuran tersebut.

### P1 — FFmpeg dan dependensi komputasi belum disiapkan untuk runtime Vercel

`requirements.txt` memasukkan PyTorch, OpenAI Whisper, OpenCV, dan Pillow (`requirements.txt:16-24`). Render mengharapkan FFmpeg, termasuk filter `subtitles`/libass, tetapi konfigurasi repo hanya menyediakan variabel lokasi executable dan tidak menyediakan binary/runtime image untuk Vercel (`backend/video_engine.py:45-58,152-161,2693-2700`). Startup juga mengimpor engine video dan mencoba membuat direktori kerja.

**Dampak:** import, build bundle, ukuran paket, ketersediaan binary native, atau render dapat gagal pada Functions. Dokumentasi Vercel saat ini menandai Python Runtime sebagai Beta. Ukuran paket aktual belum diukur pada runtime build Vercel; ini risiko yang perlu diukur, bukan klaim bahwa pasti melewati batas.

**Perbaikan:** jalankan backend pada image/container yang mengunci versi Python, FFmpeg+libass, dan dependency native; ukur ukuran image dan lakukan smoke test render di lingkungan target. Jika tetap memakai Python Functions, kurangi dependency/file yang dibundel dan buktikan semua endpoint lolos deployment test. [Python Runtime](https://vercel.com/docs/functions/runtimes/python)

### P1 — Cookies YouTube dibagi secara global dan endpoint-nya tidak terautentikasi

`POST /api/cookies` menulis cookies ke satu file bersama; `DELETE /api/cookies` menghapus file itu. Kedua route tidak memiliki dependency autentikasi (`backend/routers/cookies.py:100-146,178-186`).

**Dampak:** pada backend publik multi-pengguna, satu pengguna dapat menimpa atau menghapus cookies pengguna lain. Cookies adalah kredensial sesi, sehingga penyimpanan global ini tidak aman untuk layanan publik bersama.

**Perbaikan:** jangan menerima cookies bersama pada service multi-tenant. Jika fitur harus ada, isolasikan per pengguna dengan autentikasi dan storage terenkripsi, batasi akses dan retensi, serta jangan pernah mengembalikan isi cookies ke client.

### P1 — Route admin terbuka jika secret tidak dikonfigurasi

`verify_admin_access` mengembalikan akses ketika `ADMIN_API_KEY`, `ECLIPSE_API_KEY`, dan alias lama tidak disetel (`backend/routers/system.py:23-48`). Route clear-temp, update, dan restart memakai pemeriksaan ini. Update/restart mencoba `git pull`, memasang dependensi, dan me-restart proses (`backend/routers/system.py:122-208`).

**Dampak:** tanpa secret, route admin terbuka. Pada Vercel, mekanisme update/restart berbasis checkout Git dan proses lokal juga bukan mekanisme deploy yang valid. Frontend saat ini tidak mengirim header API key pada panggilan update/restart; mengaktifkan secret saja akan membuat UI itu menerima 401.

**Perbaikan:** nonaktifkan route update/restart pada production Vercel; deploy lewat Git/Vercel. Lindungi operasi administrasi dengan autentikasi yang benar dan jangan biarkan kondisi tanpa secret berarti allow-all.

### P1 — Route mahal terbuka tanpa autentikasi atau pembatasan laju

Route analisis, render, unduhan, dan upload dapat dipanggil publik tanpa autentikasi. Kode yang ditinjau tidak menunjukkan rate limiter atau kuota per pengguna. Beberapa route memulai pekerjaan download/render dan dapat menggunakan CPU, bandwidth, penyimpanan, serta API pihak ketiga.

**Dampak:** endpoint dapat disalahgunakan untuk menghabiskan resource/biaya atau memenuhi penyimpanan backend. Batas ukuran file saja tidak membatasi jumlah request atau total penggunaan per pengguna.

**Perbaikan:** tambahkan autentikasi/kuota dan rate limiting per akun/IP, batas jumlah pekerjaan berjalan, batas durasi/biaya, validasi URL/source, serta pembersihan file yang terukur sebelum membuka service ke publik.

### P1 — Gemini API key pernah dikirim dalam query string; perbaikan kode diterapkan

Pada temuan awal, frontend memanggil `/api/models?api_key=...` dan backend menerima key dari parameter query. Tindak lanjut mengganti permintaan menjadi header `X-Gemini-API-Key` di `src/App.tsx` dan `backend/routers/analyze.py`.

**Dampak awal:** query string lebih mudah tersimpan di access log, observability, dan jejak URL daripada header/body.

**Status:** perubahan ada di working tree dan belum dipasang ke production. Pastikan access logging juga tidak merekam nilai header; rotasi key jika sebelumnya terekspos dalam log.

### P2 — CORS production harus dikonfigurasi jika API berada di domain terpisah

Default `ALLOWED_ORIGINS` hanya mengizinkan localhost (`backend/main.py:54-75`). Tidak ditemukan base URL API frontend. Jika backend ditempatkan pada domain terpisah dari Vercel, browser akan mengirim request lintas origin.

**Dampak:** panggilan API akan ditolak browser kecuali CORS mengizinkan origin production yang tepat.

**Perbaikan:** gunakan konfigurasi API base URL dan set `ALLOWED_ORIGINS` ke domain deployment yang benar. Hindari wildcard jika credentials diizinkan.

### P2 — Lint gagal meski build lolos

`npm run build` berhasil: Vite menghasilkan `dist/`, dengan warning chunk utama sekitar **524 kB** setelah minifikasi. `npm run lint` gagal dengan **79 error dan 9 warning**, terutama `any` eksplisit, variabel tak terpakai, dan pola React hooks. Script build saat ini tidak menjalankan lint.

**Dampak:** deploy Vercel yang hanya menjalankan `npm run build` tetap dapat lolos meskipun pemeriksaan kualitas gagal; error lint tidak otomatis berarti runtime rusak, tetapi perlu ditriase sebelum rilis.

**Perbaikan:** triase lint, tetapkan lint sebagai gate CI, dan pertimbangkan code splitting untuk mengecilkan chunk awal. `package.json` juga tidak mendefinisikan script test, jadi belum ada hasil tes otomatis yang bisa dilaporkan.

### P2 — Fitur updater mengasumsikan server memiliki checkout Git yang dapat diubah

Status/update membaca remote, menjalankan `git fetch/pull`, memasang dependency, lalu me-restart backend. Deploy Vercel bersifat deployment-based; perubahan seharusnya dilakukan melalui commit/deploy baru, bukan `git pull` pada Function.

**Dampak:** tombol update/restart tidak akan berfungsi sebagaimana di instalasi desktop dan dapat gagal karena `.git`/checkout atau filesystem tidak tersedia.

**Perbaikan:** sembunyikan/nonaktifkan fitur updater saat runtime production Vercel dan arahkan pembaruan ke pipeline Git deployment.

## Pemeriksaan yang dilakukan

- `npm run build` — **lulus** setelah tindak lanjut; bundle JavaScript utama 523.27 kB setelah minifikasi, dengan warning ukuran chunk.
- `npm run lint` — **gagal**, 79 error dan 9 warning.
- `python3 -m py_compile backend/video_engine.py backend/routers/analyze.py` — **lulus** untuk dua file Python yang diubah.
- Parsing `vercel.json.example` — **valid JSON**.
- Pemeriksaan source/config — tidak ditemukan `vercel.json`, folder `api/`, `VITE_API_URL`/base URL backend, atau adapter backend Vercel.
- `backend/.env` diabaikan oleh Git; audit hanya memeriksa status tracking dan tidak membaca atau menyalin nilai secret.
- Tidak ditemukan script `test` pada `package.json`. Tidak dilakukan pentest, deploy percobaan, atau pengujian runtime Vercel.

## Tindak lanjut setelah audit awal

- Ditambahkan `Dockerfile.backend` dengan Python 3.12, FFmpeg/libass, dan user non-root; ini fondasi staging, belum diuji dengan Docker build.
- Backend kini mendukung `ECLIPSE_DATA_DIR`; dokumentasi contoh menjalankan container dengan volume persisten tunggal. Job render tetap disimpan di memori, sehingga konfigurasi tersebut hanya menargetkan satu instance.
- Ditambahkan `vercel.json.example` sebagai template rewrite. File ini belum aktif dan harus diberi domain backend sebenarnya lalu disalin menjadi `vercel.json`.
- Pemanggilan daftar model memindahkan Gemini API key dari query string ke header.
- Build frontend, pemeriksaan sintaks dua file Python, dan parsing template Vercel lulus setelah perubahan. Lint tetap gagal dengan 79 error dan 9 warning. Docker image belum dibuild. Temuan storage multi-tenant, autentikasi/rate limit, batas upload Function, dan lifecycle serverless tetap menjadi gate sebelum public production.

## Urutan kerja sebelum production

1. Tentukan arsitektur: Vercel untuk frontend dan backend persisten eksternal (disarankan), atau refactor backend menjadi layanan serverless yang stateless.
2. Pastikan semua request `/api` mencapai backend production; tetapkan URL API, rewrite, dan CORS.
3. Pindahkan job/status ke queue + database/Redis dan media ke object storage; jangan simpan pekerjaan/data lintas request di filesystem lokal.
4. Isolasi cookies per pengguna atau nonaktifkan fitur tersebut untuk mode publik; wajibkan auth dan rate limit untuk route mahal/admin.
5. Pindahkan Gemini key dari query string; set secret production di dashboard deployment, bukan di repo.
6. Sediakan dan uji runtime FFmpeg/libass serta dependency Python di host backend; lakukan smoke test upload kecil, analyze, render, progress, dan download di staging.
7. Triase lint, tambahkan automated tests untuk alur kritis, lalu ulangi build dan smoke test dari deployment preview.

## Batas audit

Ini audit statis atas source/config dan pemeriksaan build/lint lokal. Hasilnya tidak mengonfirmasi deployment aktual, perilaku akun/plan Vercel, ukuran bundle Python yang telah dibuild, secrets dashboard, konfigurasi domain, atau pengujian beban/pentest.
