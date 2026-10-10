# 01 — Teknologi ECLIPSE V.2

Status implementasi diperbarui 9 Oktober 2026. **Status: frontend dan backend lokal terhubung; analisis provider nyata memerlukan key Gemini admin. Batas yang belum aktif tercatat di dokumen 02 dan 04.**

## Implementasi yang terverifikasi di workspace

- Frontend: React 19, TypeScript 6, Vite 8, React Router. Desain dark-only memakai token CSS, Archivo untuk display dan IBM Plex Sans untuk body/UI di seluruh halaman.
- Backend: FastAPI + Uvicorn, Pydantic 2, SQLite, cookie session, role admin/user, kepemilikan job, audit, dan kuota Free.
- Ingest: upload multipart, YouTube via yt-dlp, tautan Drive publik via unduhan langsung; ffprobe memeriksa media. Batas 2 GB dan 180 menit.
- Transkrip: faster-whisper small di CPU int8. Kandidat dasar dan heatmap dibangun dari transkrip sebagai sinyal editorial.
- Analisis AI: jalur berbeda menurut sumber. YouTube mengirim transkrip bertimestamp ke Gemini tanpa mengunggah video penuh pada tahap analisis. Upload/Drive mengirim video dan konteks transkrip ke Gemini. Kunci dikelola admin di server; key aktif diperlukan untuk memvalidasi provider.
- Render: satu worker FFmpeg menghasilkan MP4 H.264/AAC. Studio menyediakan 9:16 (1080×1920), 1:1 (1080×1080), 4:3 (1440×1080), 16:9 letterbox di kanvas vertikal (1080×1920), dan 16:9 lanskap (1920×1080). Subtitle dibakar bila filter tersedia atau menjadi track MP4 bila tidak; judul dibuat via FFmpeg atau overlay Pillow.
- Penyimpanan: SQLite tetap di `ECLIPSE_DATA_DIR`; media dapat memakai disk lokal atau Cloudflare R2 (`ECLIPSE_STORAGE_BACKEND`). Workspace media lokal tetap dibutuhkan untuk FFmpeg. File workspace lokal dibersihkan setelah 24 jam; metadata job/transkrip serta audit setelah 90 hari.
- Admin: akun/role, event audit, dan Gemini API memakai backend nyata. Ledger token Gemini mencatat percobaan serta usage yang dilaporkan provider, dengan ringkasan admin per project/model, pengguna, dan job; angka USD dan rekonsiliasi billing belum tersedia. Harga/billing Pro, email reset, export ZIP, rentang analisis custom, alert 80%, cap biaya, dan metrik admin job umum belum aktif. Upload subtitle manual (`.srt`/`.txt`) sudah tersedia. Progres analisis menampilkan milestone tahap; progres render berupa estimasi kasar per tahap/klip, belum progres encoding FFmpeg aktual.
- API key Gemini aktif belum disetel pada database lokal saat audit; fitur provider eksternal belum dapat divalidasi dengan kredensial live. E2E sintetis membuktikan upload sampai render dan unduh.

## Keputusan produk yang dikunci pada 8 Oktober 2026

- Target MVP 1 adalah aplikasi web multi-pengguna. Login/daftar tetap ditampilkan; sesi, role, dan kepemilikan data harus ditegakkan backend.
- Input video MVP tetap mencakup file lokal. YouTube memakai URL dan Google Drive memakai tautan berbagi publik; MVP tidak meminta OAuth Google Drive. Tautan Drive harus dapat diakses oleh metode ingest yang dipilih. Tautan privat/tidak dapat diunduh menghasilkan error yang menjelaskan langkah berbagi yang diperlukan.
- Kunci Gemini/API Google dikelola admin dari dashboard. Admin dapat menambahkan beberapa entri (lima adalah contoh, bukan batas tetap), mengaktifkan/menonaktifkan dan mengganti kunci. Kunci mentah hanya disimpan di server/secret store; UI menampilkan alias tersamar dan status.
- Backend memilih kredensial/project yang sehat dan masih memiliki kapasitas sesuai kebijakan. Kegagalan sementara memakai retry terbatas dengan exponential backoff; kegagalan kredensial atau kapasitas dapat beralih ke project lain yang diotorisasi. Jika semua project habis kapasitasnya, job menunggu atau gagal dengan pesan yang jelas.
- Rotasi beberapa API key yang terhubung ke **project Google yang sama tidak menambah rate limit**; Gemini API menerapkan rate limit per project. Penggunaan lintas project juga harus mematuhi batas pengeluaran billing account. Karena itu pool harus melacak project/billing account, anggaran, dan pemakaian; rotasi tidak boleh dipakai untuk mengakali kuota. Per dokumentasi Google yang ditinjau 8 Oktober 2026, migrasi dari standard key ke authorization key jatuh pada September 2026; implementasi baru harus memakai authorization key yang didukung, bukan mengandalkan standard key lama.
- Render MVP 1 memakai satu worker global, satu job aktif, dan antrean FIFO. Maksimum 5 klip per batch (diputuskan 8 Oktober 2026); pembatalan dan pemulihan job dirinci pada B4.

Referensi resmi: [rate limit Gemini API](https://ai.google.dev/gemini-api/docs/rate-limits), [kunci Gemini API](https://ai.google.dev/gemini-api/docs/api-key), dan [download file Google Drive](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

## Batas yang masih dirancang atau perlu dilengkapi

Poin berikut belum seluruhnya tersedia pada layanan lokal saat ini.

- Implementasi memakai FastAPI + Uvicorn + Pydantic 2 dan `python-multipart`.
- Ingest aktif berjalan di server: YouTube via yt-dlp dan Drive melalui unduhan tautan publik. Sumber privat/tidak dapat diunduh ditolak.
- Gemini Interactions API dipanggil dari backend melalui HTTP; kunci admin dienkripsi di server.
- Transkrip aktif memakai faster-whisper lokal untuk sumber yang perlu ditranskripsi. Upload subtitle manual `.srt`/`.txt` tersedia; YouTube juga dapat memakai jalur subtitle otomatis bila dipilih dan tersedia. Belum ada provider transkrip alternatif.
- Render aktif memakai FFmpeg dan Pillow. Encoder hardware, OpenCV/PySceneDetect, JEV, dan diarization belum menjadi dependensi aktif.
- Progres analisis disimpan sebagai milestone tahap, bukan pengukuran kontinu tiap operasi AI/transkripsi. Progres batch render mencakup persiapan sumber dan perpindahan klip; FFmpeg belum melaporkan progress encoding aktual ke job.
- Storage: filesystem pada `ECLIPSE_DATA_DIR` untuk workspace media sementara; database persisten **SQLite** untuk akun, role, kepemilikan job, status kredensial (tanpa secret mentah), kuota harian, dan audit admin — cukup untuk satu worker global MVP. Cloudflare R2 kini tersedia sebagai penyimpanan media persisten yang opsional. Retensi metadata 90 hari; workspace lokal 24 jam.
- Auth server dan isolasi data per pengguna termasuk kebutuhan MVP karena target web multi-pengguna. Billing pelanggan belum diputuskan; biaya provider AI pada arah saat ini dibayar operator melalui pool kunci admin, dengan batas biaya internal yang harus ditetapkan.

### Endpoint aktif

Daftar endpoint aktif dapat dilihat langsung pada OpenAPI lokal `/docs` atau di `backend/README.md`. Endpoint generik `/api/analyze` dan `/api/render-batch` yang dahulu berupa stub sudah dihapus; alur aktif memakai endpoint job dengan ID. Jangan gunakan paket handoff historis sebagai kontrak API terbaru.

### Konfigurasi target

Sebelum deployment, siapkan HTTPS, backup database/media, secret encryption key yang persisten, domain/origin allowlist, log redaction, batas disk, pemantauan biaya provider, serta prosedur bootstrap admin/rotasi key. Jangan menggunakan `ADMIN_API_KEY` sebagai pengganti autentikasi per pengguna.

### Pool kunci Gemini yang dikelola admin

- Implementasi admin mengelola entri alias, project Google, status aktif, waktu pemeriksaan, serta penggunaan yang diketahui. Key ditampilkan tersamar setelah disimpan dan tidak dikirim kembali ke browser. Pemilihan project memakai least-recently-used; key di project yang sama dicoba dalam project yang sama. Kuota Gemini dihitung pada level project, bukan per key.
- Pada runtime, `401` menandai key invalid. `403`/`429`, `5xx`, dan gangguan jaringan mendinginkan project sementara, kemudian request berpindah ke project lain. Error input/model yang tidak didukung tidak menjadi alasan rotasi project. Belum ada pemeriksaan budget per project.
- Counter token dan kegagalan dari respons provider dicatat per pengguna/job/project jika tersedia. Pengukuran kuota yang tidak diberikan provider ditampilkan sebagai tidak diketahui; tidak dibuat angka sisa kuota palsu. Nilai USD dan rekonsiliasi billing belum tersedia.
- Kuota Free tiga analisis + satu render per hari diterapkan per akun. Cap operator $50/bulan dengan alert 80%, penghentian otomatis berdasarkan biaya, dan cap SaaS per-tenant belum tersedia; pool/rotasi bukan kontrol biaya. Terapkan kontrol biaya sebelum membuka akses umum.

## Rekomendasi teknologi AI tambahan (referensi, belum diimplementasikan)

Tujuan rekomendasi ini adalah meningkatkan pemilihan momen sambil menjaga opsi lokal dan cloud. Teknologi berikut belum menjadi dependensi wajib; uji pada sampel video ECLIPSE sebelum memilihnya.

1. **JEV / TypeSafe System One — uji untuk penilaian kandidat klip.** Kirim transkrip kandidat beserta metadata (timestamp, durasi, pergantian pembicara, dan konteks sekitar) sebagai `state`; minta Choice/Score/Noul terpisah untuk hook, kelengkapan konteks, relevansi topik, atau risiko klip terpotong. Gunakan confidence untuk mengurutkan dan menandai kandidat yang perlu ditinjau manusia. Panggil dari backend saja dan simpan API key di server. JEV mengembalikan keputusan terstruktur. Status akses dan klaim latency/biaya perlu diverifikasi dalam pilot karena produk masih early access. Referensi: [TypeSafe Introduction](https://docs.typesafe.ai/introduction), [Quick start/API](https://docs.typesafe.ai/introduction/quickstart), [artikel pengumuman](https://typesafe.ai/blog/introducing-system-one-models-and-jev).
2. **faster-whisper — opsi transkripsi lokal yang diprioritaskan untuk dievaluasi.** Berjalan dengan CTranslate2, menyediakan timestamp kata, dan opsi VAD. Cocok sebagai jalur lokal/fallback bagi pengguna yang mengutamakan privasi atau tidak ingin memakai API transkrip. Uji kualitas Bahasa Indonesia, kebutuhan RAM/VRAM, serta kecepatan CPU/GPU. Referensi: [repositori faster-whisper](https://github.com/SYSTRAN/faster-whisper).
3. **PySceneDetect — pelengkap untuk batas pergantian adegan.** Gunakan scene cuts sebagai petunjuk batas kandidat atau thumbnail, lalu gabungkan dengan timestamp ucapan. Adopsi hanya jika hasil uji lebih baik daripada deteksi OpenCV/FFmpeg yang sudah direncanakan. Dokumentasi API menyarankan pin versi di bawah 0.8 selama API masih berkembang. Referensi: [dokumentasi PySceneDetect](https://www.scenedetect.com/docs/latest/).
4. **Gemini video understanding — eksperimen untuk konteks visual kandidat.** Evaluasi pada potongan pendek atau frame terpilih. File API memiliki batas ukuran dan retensi; file ECLIPSE yang direncanakan dapat mencapai 4 GB, sehingga perlu dipotong/dipecah sebelum dikirim dan penggunaan cloud harus jelas bagi pengguna. Referensi: [panduan video Gemini](https://ai.google.dev/gemini-api/docs/video-understanding), [metode input file](https://ai.google.dev/gemini-api/docs/file-input-methods).
5. **pyannote.audio — opsi lanjutan untuk diarization.** Pertimbangkan bila label pergantian pembicara dibutuhkan untuk klip multi-pembicara. Verifikasi kebutuhan komputasi dan lisensi model sebelum adopsi. Referensi: [repositori pyannote.audio](https://github.com/pyannote/pyannote-audio).

**Urutan evaluasi yang disarankan:** faster-whisper pada sampel Bahasa Indonesia → PySceneDetect sebagai sinyal batas adegan → JEV untuk menilai kandidat berbasis transkrip → Gemini video bila butuh konteks visual. Catat kualitas timestamp, relevansi kandidat, waktu proses, biaya per video, dan jumlah koreksi manual. Pertahankan baseline sampai hasil dibandingkan.

## Deployment target

- Lokal: satu perintah untuk frontend dan backend setelah entry point backend tersedia.
- Staging: frontend statis dan backend container persisten merupakan opsi rancangan.
- Serverless tidak direkomendasikan untuk job media panjang/besar sebelum pola storage dan job durable diputuskan.
