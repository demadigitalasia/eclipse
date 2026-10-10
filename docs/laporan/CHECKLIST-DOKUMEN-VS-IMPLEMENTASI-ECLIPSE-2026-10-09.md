# Checklist Dokumen vs Implementasi ECLIPSE

**Tanggal audit:** 9 Oktober 2026  
**Ruang lingkup:** dokumen perencanaan aktif 00–06, README backend, referensi Studio lama, dan source frontend/backend pada checkout ini.  
**Tujuan:** memberi status silang yang bisa ditindaklanjuti untuk target ECLIPSE full-feature.

## Ringkasan

Dokumen aktif masih beberapa kali menyebut batas MVP sebagai batas produk. Itu tidak sesuai dengan keputusan pemilik produk bahwa ECLIPSE akan dibangun sampai cakupan full-feature selesai. Batas MVP tetap berguna untuk menjelaskan urutan/rilis awal, tetapi fitur di luar MVP harus dicatat sebagai backlog menuju target penuh—bukan dianggap tidak diperlukan.

Temuan sinkronisasi utama:

- **Sudah ada di kode, tetapi dokumen aktif menyebut belum ada:** unggah subtitle manual; progres analisis berbasis tahap dan persentase kasar; beberapa rasio Studio selain 9:16.
- **Sudah ada dan tertulis, tetapi belum selengkap ekspektasi full-feature:** Studio menyediakan deteksi fokus otomatis yang terbatas, bukan tracking semantik/frame-per-frame; preview mendekati hasil tetapi belum identik pada semua aspek/audio.
- **Sebagian diimplementasi sejak audit awal:** ledger Gemini mencatat usage token yang dilaporkan provider per project/model, pengguna, dan job. Pengukuran USD, rekonsiliasi billing, alert/cap biaya, serta metrik job admin umum tetap belum tersedia.
- **Belum ada di implementasi dan memang dicatat dokumen:** ZIP, billing Pro, reset sandi via email, rentang analisis kustom, deployment produksi, publikasi sosial dan kolaborasi.
- **Ada di dokumen desain/referensi tetapi belum pulih di implementasi:** facecam/gameplay/PiP multi-sumber, watermark gambar, dan tema subtitle animasi per kata.
- **Dokumen historis perlu tetap dipisahkan:** paket handoff Gate A dan audit lama bukan spesifikasi implementasi terkini.

Status di bawah adalah **audit source dan dokumen**, bukan hasil uji live setiap layanan eksternal. “Ada di kode” tidak otomatis berarti sudah lolos QA di semua browser, file, provider, atau kondisi jaringan.

## Legenda

- [x] **Terverifikasi di source** — implementasi terlihat pada kode saat audit.
- [~] **Parsial** — ada implementasi, tetapi cakupan, konsistensi, ketahanan, atau validasi live belum lengkap.
- [ ] **Belum ada** — tidak ditemukan implementasi aktif pada source yang ditinjau.
- [!] **Dokumen perlu koreksi** — status, angka, atau deskripsi di dokumen aktif bertentangan dengan source.
- [H] **Historis/referensi** — berguna untuk riwayat atau arah produk, bukan kontrak aktif.

“Terverifikasi di source” bukan pengganti validasi fungsional. Fitur yang memerlukan API key, akses YouTube/Drive, email, GPU, atau deployment perlu dites pada kondisi tersebut sebelum status live ditingkatkan.

## Matriks checklist per dokumen

Tabel ini memeriksa setiap dokumen aktif secara terpisah. “Selaras sebagian” berarti inti dokumen masih berguna, tetapi ada status atau klaim yang perlu diperbarui. Dokumen historis dinilai berdasarkan apakah penanda historisnya jelas, bukan apakah isinya sama dengan kode sekarang.

| Checklist | Dokumen | Status silang | Temuan spesifik | Pekerjaan pembaruan |
|---|---|---|---|---|
| [~] | `docs/perencanaan/00-INDEKS.md` | Selaras sebagian | Menetapkan source sebagai sumber status dan membedakan 01–06 aktif dari 07 historis. Ringkasan bertanggal 8 Okt dan belum menyebut beberapa konflik yang terdeteksi di 01/02/04/06. | [ ] Perbarui tanggal; [ ] tautkan checklist ini; [ ] tegaskan target full-feature; [ ] tambahkan status “source ada tetapi belum QA live”. |
| [~] | `docs/perencanaan/01-TEKNOLOGI.md` | Selaras sebagian; ada klaim usang | Stack dan batas operasional sebagian besar cocok. Bagian “sudah terverifikasi” masih menyebut 9:16 saja serta menandai subtitle manual/progres persen belum aktif; bagian batas teknis juga menyebut tidak ada subtitle manual. Pada dokumen yang sama, beberapa pekerjaan biaya/cap diberi target seolah perlu dibuat. | [ ] Tambahkan matriks output rasio; [ ] koreksi subtitle manual; [ ] definisikan progress milestone vs encode progress; [ ] pisahkan kondisi kode dengan target operasional/penuh. |
| [~] | `docs/perencanaan/02-ALUR-KERJA.md` | Selaras sebagian; kontrak Studio tertinggal | Gambaran route/admin dan alur utama masih relevan. Alur analisis menyamaratakan video + transkrip ke Gemini, padahal YouTube memakai transkrip saja sementara upload/Drive mengunggah video beserta konteks transkrip. Render hanya menyebut vertikal 9:16; manual subtitle disebut belum ada; progress disebut menunggu/selesai. | [ ] Bedakan alur tiap sumber; [ ] masukkan manual subtitle; [ ] daftarkan opsi Studio dan output; [ ] dokumentasikan progress kasar dan keterbatasan; [ ] selaraskan admin reset. |
| [~] | `docs/perencanaan/03-BISNIS-FLOW.md` | Selaras sebagai keputusan MVP; belum menjadi roadmap full-feature | Kuota Free, worker, target biaya, dan model operator tercatat. Paket Pro, kolaborasi, publikasi sosial dan distribusi masih menjadi opsi/di luar MVP, bukan acceptance criteria produk akhir. | [ ] Pertahankan keputusan MVP; [ ] tandai setiap kemampuan non-MVP sebagai “target belum dikunci”, “backlog target”, atau “tidak direncanakan” setelah keputusan eksplisit. |
| [~] | `docs/perencanaan/04-ROADMAP-KEPUTUSAN.md` | Perlu koreksi status dan kategori backlog | Daftar “Belum tersedia” mencampur progress, subtitle manual, dan rentang analisis (tidak semua akurat). Item lain seperti biaya, email reset, Pro, ZIP dan deployment masih akurat belum tersedia. | [ ] Betulkan status subtitle/progress; [ ] tambahkan rasio Studio; [ ] berikan kolom owner/dependency/acceptance; [ ] pisahkan backlog fitur full-feature dari kesiapan produksi. |
| [~] | `docs/perencanaan/05-DESAIN.md` | Pedoman aktif, status penerapan perlu dicatat | Token visual, tipografi, aksesibilitas modal, pola admin, dan sidebar berfungsi sebagai pedoman. Banyak aturan (responsive/mobile, aksesibilitas, kontras seluruh state) tidak dibuktikan sudah lulus audit menyeluruh hanya dari source. | [ ] Tambahkan kolom/status verifikasi untuk tiap kelompok aturan; [ ] catat pengecualian aktual; [ ] tambahkan bukti QA viewport/keyboard/screen reader ketika diuji. |
| [~] | `docs/perencanaan/06-RENCANA-IMPLEMENTASI-MVP-1.md` | Akurat untuk baseline MVP lama, tidak cukup sebagai target produk akhir | Status studio “selesai lokal” menyempit ke 9:16 dan menyatakan progress persen/preview subtitle tidak tersedia. Itu tidak cocok dengan kode kini: multi-rasio, preview overlay, dan milestone progres ada. Tabel validasi yang lulus adalah laporan waktu lampau, bukan hasil audit ini. | [ ] Simpan snapshot MVP historis; [ ] tambahkan kolom “status source terbaru” dan “status QA live”; [ ] buat roadmap full-feature yang terpisah; [ ] jangan daur ulang klaim tes lama sebagai verifikasi baru. |
| [H] | `docs/perencanaan/07-PAKET-HANDOFF-GATE-A.md` | Benar sebagai arsip | Dokumen sendiri menyebut paket kontrak sebelum backend aktif; isinya mengandung mock dan endpoint lama. | [x] Pertahankan historis; [ ] pastikan setiap tautan/README memperingatkan bahwa itu bukan kontrak terbaru. |
| [~] | `backend/README.md` | Operasional lokal berguna; daftar fitur tertinggal | Cara menjalankan dan kebutuhan FFmpeg/faster-whisper/key masih bermanfaat. Daftar batas menyebut subtitle manual/progress persen belum ada; keduanya perlu dipisah antara feature support dan ketepatan persentase. | [ ] Koreksi fitur manual subtitle; [ ] jelaskan milestone progres; [ ] tambahkan rasio/opsi Studio atau tautkan matriks; [ ] pertahankan batas reset email, cost cap, ZIP, range, billing, deployment dan rate limiter bersama. |
| [H] | `docs/referensi/studio-lama/ANALISIS-FITUR.md` | Rujukan pemulihan fitur; bukan semuanya implementasi aktif | Dengan benar membedakan fitur yang sudah dipulihkan (multi-rasio, judul/subtitle, audio, watermark teks, encoder) dari yang belum (PiP multi-sumber, watermark gambar, subtitle per kata). Sebagian tampilan lama menampilkan kemampuan “facecam/objek” lebih luas daripada deteksi aktual. | [ ] Tambahkan label per baris “ada sekarang / parsial / belum”; [ ] tautkan dari spesifikasi Studio aktif; [ ] jangan menyamakan teks screenshot dengan dukungan objek semantik. |

## Checklist rinci per area produk

Daftar ini cocok digunakan saat pengerjaan berikutnya: setiap baris memiliki kolom implementasi, dokumentasi, kondisi validasi dan tindak lanjut terpisah. Tandai `[x]` hanya untuk bukti source yang terlihat, bukan asumsi bahwa sudah lolos uji produksi.

| Checklist | Fitur/perilaku | Implementasi saat audit | Dokumentasi saat audit | Validasi yang masih dibutuhkan / tindakan |
|---|---|---|---|---|
| [x] | Login, logout, sesi cookie | Ada | Ada | [ ] Uji sesi kedaluwarsa, multi-tab, cookie Secure di production. |
| [x] | Registrasi publik dan role awal user | Ada, dapat dinonaktifkan via konfigurasi | Ada | [ ] Uji konfigurasi pendaftaran pada deployment target. |
| [x] | Bootstrap admin, pengubahan role, status aktif/nonaktif, hapus akun | Ada; nonaktif mencabut sesi, hard delete menghapus job/media/usage akun, audit administratif mengikuti retensi | Ada; perlu sinkronisasi rincian status/penghapusan | [ ] QA admin terakhir/self-protection, pencabutan sesi aktif dan pembersihan direktori media pada server target. |
| [x] | Profil nama akun dan preferensi bahasa UI | Nama di server; bahasa lokal browser | Ada | [ ] Pastikan preferensi bertahan sesuai perilaku yang diharapkan lintas browser/perangkat. |
| [~] | Lupa/reset kata sandi | Endpoint reset internal; tidak ada email dan UI menunjukkan belum tersedia | Dokumen mengatakan belum tersedia | [ ] Putuskan provider email atau alur reset admin aman; selesaikan UX dan abuse controls. |
| [x] | Admin mengelola kredensial Gemini dan menguji koneksi | Ada; key rahasia server-side | Ada | [ ] Uji kunci aktif, tidak valid, disable, pergantian dan rotasi lintas project dengan kredensial sah. |
| [~] | Failover provider/model | Ada percobaan berurutan/fallback pada jalur analisis | Sebagian besar ditulis sebagai tersedia | [ ] Uji 401/403/429/5xx, model tidak didukung, timeout dan perilaku retry; dokumentasikan kapan tidak failover. |
| [~] | Meter token/biaya per provider, project, pengguna dan job | Ledger Gemini mencatat percobaan serta counter token yang dilaporkan; ringkasan admin tersedia per project/model, pengguna, dan job. USD/billing belum tersedia. | Target/batas biaya tercatat; detail ledger belum didokumentasikan pada audit awal | [ ] Rekonsiliasi token dengan tagihan Google Cloud dan tambahkan provider/billing USD setelah sumber otoritatif tersedia. |
| [ ] | Hard cap bulanan operator + alert 80% | Belum ditegakkan; ledger token saja tidak cukup untuk membuktikan USD spend | Keputusan $50/80% sudah ditulis | [ ] Setelah rekonsiliasi billing, tetapkan periode billing/timezone, perilaku saat usage tidak tersedia, fail-closed dan batas overshoot. |
| [x] | Upload file lokal dengan validasi ukuran/durasi | Ada | Ada | [ ] Uji batas ukuran, durasi, MIME/codec dan ruang disk penuh. |
| [~] | Ingest YouTube | Ada via yt-dlp; akses dapat gagal bergantung sumber/cookie/jaringan | Ada | [ ] Uji beragam URL sah dan error; catat versi yt-dlp serta batas cookie/akses yang didukung. |
| [~] | Ingest Google Drive publik | Ada untuk tipe link yang didukung | Ada | [ ] Uji file publik/privat/ukuran besar serta link yang memerlukan konfirmasi download. |
| [x] | Subtitle otomatis YouTube | Jalur source subtitle ada | Ada | [ ] Uji video dengan caption manual, auto-caption, tanpa caption, berbagai bahasa dan rate limit. |
| [!] [x] | Upload subtitle manual `.srt` / `.txt` | UI, frontend request dan parser backend ada | Keliru ditandai belum ada pada beberapa dokumen aktif | [ ] QA encoding UTF-8, timestamp tak valid, format tidak didukung, ukuran maksimum dan kecocokan durasi sumber. |
| [x] | Whisper untuk sumber upload/Drive tanpa subtitle manual | Ada | Ada | [ ] Uji bahasa, audio senyap/noisy, model download, resource CPU dan timeout. |
| [~] | Heatmap | Nilai dasar berasal dari sinyal transcript/audio sesuai jalur | Ada secara umum | [ ] Tetapkan definisi matematis dan sumber sinyal per sumber; bandingkan output dengan data klip; hindari menyebut retention/virality measurement jika bukan data penonton. |
| [x] | Analisis kandidat Gemini | YouTube: transkrip; upload/Drive: video + konteks transkrip | Dokumentasi alur terlalu menyamaratakan | [ ] Perbarui diagram per sumber; uji JSON invalid, nol kandidat, timestamp di luar batas dan kuota provider. |
| [~] | Persentase progres analisis | Ada milestone; bukan pengukuran operasi internal secara kontinu | Disebut tidak tersedia di beberapa dokumen | [ ] Tampilkan tahap + persentase kasar secara eksplisit; berikutnya kirim progress transkripsi/upload/model yang benar. |
| [x] | Riwayat analisis dan file sementara | Ada | Ada | [ ] QA cleanup setelah TTL, akses silang akun dan penghapusan riwayat saat sumber aktif. |
| [x] | Pemutar sumber, daftar kandidat, trim timestamp dan export JSON | Ada | Ada | [ ] QA sinkronisasi waktu, seek, pemutar browser dan kandidat ujung video. |
| [x] | Mode 9:16 | Ada (1080×1920) | Ada | [ ] QA preview/output dan positioning teks. |
| [x] | Mode 1:1 | Ada (1080×1080) | Hanya referensi Studio; dokumen alur aktif tidak mencatatnya | [ ] Tambahkan ke spesifikasi aktif; QA crop/title/caption. |
| [x] | Mode 4:3 | Ada (1440×1080) | Hanya referensi Studio; dokumen alur aktif tidak mencatatnya | [ ] Tambahkan ke spesifikasi aktif; QA crop/title/caption. |
| [x] | Mode 16:9 letterbox vertikal | Ada pada kanvas/output 1080×1920 | Hanya referensi Studio | [ ] Jelaskan bahwa rasio konten 16:9 dipasang dalam kanvas vertikal, bukan output lanskap. |
| [x] | Mode 16:9 lanskap | Ada (1920×1080) | Hanya referensi Studio | [ ] Tambahkan ke spesifikasi aktif; QA output lanskap dan overlay. |
| [~] | Fokus framing manual | Ada preset dan posisi manual | Ada di referensi | [ ] Uji sumber aspect beragam dan posisi ekstrim pada semua mode. |
| [~] | Fokus otomatis wajah/gerakan | Ada deteksi terbatas multi-sampel; fallback gerakan | Referensi mengatakan pulih, namun deskripsi bisa disalahartikan sebagai tracking | [ ] Tampilkan metode per job/klip, hasil ditemukan/tidak ditemukan dan fallback. |
| [~] | Preview crop vs ekspor crop | Preview awal dapat manual; ada aksi menghitung preview; ekspor menghitung ulang | Tercatat dalam audit Studio | [ ] Samakan hasil/reuse deteksi; ukur crop preview dan output aktual per rasio. |
| [x] | Judul hook per klip, prefix/suffix, font, ukuran, case, posisi | Kontrol dan renderer tersedia | Rinciannya dominan di referensi lama | [ ] QA line wrapping, font fallback, batas karakter, judul panjang dan preview/output. |
| [~] | Durasi judul | Ada pengaturan durasi | Referensi lama menyebut | [ ] QA semua opsi dan awal/akhir klip; pastikan batas render sesuai UI. |
| [x] | Preset subtitle, font, ukuran, case, posisi | Ada opsi preset/style dan renderer subtitle | Ada di referensi, tidak dirinci di alur aktif | [ ] Catat daftar style aktual; QA filter/libass dan fallback soft-subtitle. |
| [ ] | Subtitle animasi per kata/karaoke | Tidak ditemukan sebagai jalur render aktif | Referensi lama menyatakan belum dipulihkan | [ ] Tentukan apakah masuk target full-feature dan acceptance/biaya render. |
| [x] | Editor subtitle teks/waktu per klip, tambah/reset baris | UI dan validasi lintas rentang klip tersedia | Ada di referensi lama | [ ] Uji overlap, duplikasi, editor baris banyak, sinkronisasi preview dan SRT ekspor. |
| [x] | Musik latar, SFX hook, kontrol volume audio sumber | Upload aset dan pipeline audio ada | Hanya dirinci di referensi lama | [ ] QA codec, level mix/clipping, durasi audio pendek/panjang, cleanup aset dan preview audio. |
| [x] | Watermark teks | Ada di UI dan renderer | Hanya sebagian dirinci di referensi lama | [ ] QA escaping teks, posisi, font, mode rasio dan panjang karakter. |
| [ ] | Watermark gambar | Tidak ada di jalur Studio aktif | Referensi lama menandai belum pulih | [ ] Tentukan kebutuhan format/alpha/posisi/ukuran sebelum implementasi. |
| [x] | Encoder auto/NVENC/AMF/QSV/CPU sesuai kemampuan FFmpeg server | Opsi capability dan renderer ada | Disebut umum di referensi lama | [ ] Validasi capability nyata tiap OS/GPU; uji fallback, codec, kualitas dan error. |
| [x] | Nama file dengan awalan/akhiran | Ada di editor/renderer | Referensi lama | [ ] Uji nama Unicode, karakter berbahaya, bentrok dan nama hasil panjang. |
| [ ] | Facecam + gameplay/PiP multi-sumber | Tidak ditemukan pipeline komposisi dua video aktif | Referensi lama menyebut belum dipulihkan | [ ] Definisikan input kedua, sinkronisasi, layout, crop dan encoding sebelum mulai. |
| [~] | Batch hingga 5 dan hasil per klip | Ada; status/output disimpan | Ada | [ ] Uji klip sukses/gagal campuran, batas batch, unduhan dan pengulangan aman. |
| [~] | Progres render | Ada persen total berdasarkan tahap/sumber/indeks klip | Dokumen menyebut tidak ada progres persen | [ ] Tambahkan progress FFmpeg aktual, perkiraan waktu dan status klip aktif. |
| [ ] | Cancel render, retry klip gagal dan recovery setelah restart | Belum ditemukan alur pemulihan lengkap | Disebut pekerjaan roadmap | [ ] Tentukan state machine job, idempotensi, cleanup serta cara resume tanpa duplikasi. |
| [ ] | ZIP unduhan batch | Tidak ditemukan endpoint/UI ZIP | Dokumen mencatat belum tersedia | [ ] Tetapkan streaming/ukuran maksimum, masa berlaku, partial result dan validasi keamanan arsip. |
| [x] | Batas Free harian dan pengecualian admin | Backend menegakkan quota; admin unlimited | Ada | [ ] QA rollover tanggal, kegagalan sebelum job, concurrent request dan audit pemakaian. |
| [x] | TTL file 24 jam dan retensi metadata 90 hari | Cleanup job tersedia | Ada | [ ] Simulasikan waktu, restart service dan file terkunci; pastikan job metadata tak bocor. |
| [ ] | Metrik pekerjaan/biaya/kesehatan provider di admin | UI/API belum menyediakan metrik nyata | Dokumen menyebut belum tersedia | [ ] Definisikan metrik, agregasi, akses role, retensi dan tampilan no-data. |
| [ ] | Rentang analisis kustom | Tidak ditemukan pada form/request aktif yang ditinjau | Dokumen menyebut belum tersedia | [ ] Tentukan maksudnya: rentang video input, jendela kandidat, atau waktu transkrip; dokumentasikan batasnya. |
| [ ] | Billing Pro/entitlement | Tidak ditemukan sistem pembayaran aktif | Dokumen menyebut belum aktif | [ ] Putuskan provider, paket, entitlement, pajak/region dan flow upgrade setelah kebutuhan bisnis disepakati. |
| [ ] | Kolaborasi/editor tim | Tidak ditemukan model workspace atau izin tim | Diletakkan di luar MVP | [ ] Putuskan kebutuhan user/role tim, kepemilikan aset, komentar dan audit sebelum arsitektur. |
| [ ] | Publikasi langsung ke platform sosial | Tidak ditemukan integrasi publikasi | Diletakkan di luar MVP | [ ] Putuskan platform, OAuth, token, persetujuan dan kebijakan sebelum implementasi. |
| [~] | Produksi dan pengamanan deployment | Konfigurasi lokal tersedia; hardening multi-worker/CSRF/backup/observability belum lengkap | Kekurangan tercatat di beberapa dokumen | [ ] Buat release gate dan runbook; jangan tandai production-ready sebelum semua kontrol diuji. |
| [~] | Responsif, keyboard, screen reader dan terjemahan lengkap | Ada sebagian aturan dan lokalisasi; audit semua route belum dilakukan | Sistem desain mendeskripsikan target | [ ] Jalankan audit viewport, keyboard, screen reader, error state, bahasa ID/EN dan catat bukti per route. |

## A. Fitur yang didokumentasikan dan sudah tersedia

| Checklist | Area | Status source | Catatan / rujukan |
|---|---|---|---|
| [x] | Akun, sesi, profil, role admin/user | Implementasi server nyata | Auth memakai cookie sesi HttpOnly, role dan perubahan nama profil tersambung ke backend. `backend/routes/auth.py`, `src/pages/AccountPages.tsx`. |
| [x] | Administrasi pengguna dan audit aktivitas | Implementasi tersedia | Admin dapat mengelola user/role dan melihat/mengelola audit. Metrik job/biaya tidak termasuk di bagian yang sudah ada. `src/pages/AccountPages.tsx`; `docs/perencanaan/02-ALUR-KERJA.md`. |
| [x] | Pengelolaan pool Gemini | Implementasi tersedia | Pengelolaan key, status, tes dan failover tersedia; secret disimpan di server. Keberhasilan panggilan provider tetap memerlukan key aktif dan validasi live. `docs/perencanaan/02-ALUR-KERJA.md`; `backend/gemini.py`. |
| [x] | Sumber file lokal, YouTube dan Drive publik | Alur backend tersedia | Validasi sumber dan penanganan sumber yang tidak dapat diakses tersedia. Keberhasilan tiap URL/provider perlu uji live. `backend/main.py`; `docs/perencanaan/02-ALUR-KERJA.md`. |
| [x] | Analisis video/transkrip dan kandidat klip dengan Gemini | Jalur produksi di source | Untuk YouTube analisis memakai transkrip; untuk file/Drive video diunggah ke Gemini beserta konteks transkrip. Membutuhkan key/provider aktif. `backend/main.py`, `backend/gemini.py`. |
| [x] | Review kandidat, ubah timestamp, tandai/filter, ekspor JSON | UI dan API tersedia | Didokumentasikan dalam alur kerja dan rencana implementasi. Keakuratan hasil bergantung pada sumber dan analisis. |
| [x] | Riwayat, kepemilikan akun, kuota, retensi dan cleanup | Implementasi backend tersedia | Kuota Free ditegakkan; admin memiliki pengecualian. File sementara dibersihkan 24 jam dan metadata 90 hari sesuai konfigurasi/dokumen. `backend/main.py`; `docs/perencanaan/03-BISNIS-FLOW.md`. |
| [x] | Batch render FFmpeg hingga lima klip dan unduh per klip | Implementasi tersedia | Render sekuensial dengan output per klip. Keberhasilan ekspor live untuk sumber YouTube yang gagal diakses belum dibuktikan dalam audit ini. `backend/main.py`, `backend/render.py`. |
| [x] | Judul per klip, teks subtitle, audio tambahan, watermark teks, nama file | Kontrol dan jalur renderer ada | Termasuk BGM/SFX, volume sumber, awalan/akhiran nama file, encoder menurut kemampuan server. `src/components/StudioOverlay.tsx`, `backend/render.py`; beberapa rincian ini hanya ada pada referensi Studio lama. |

## B. Terdokumentasi sebagai belum ada, tetapi sebenarnya sudah ada/parsial

| Checklist | Fitur | Yang dikatakan dokumen aktif | Yang ditemukan di source | Koreksi yang disarankan |
|---|---|---|---|---|
| [!] [x] | Subtitle manual | Dokumen 01, 02, 04, 06 dan `backend/README.md` menyatakan belum tersedia. | UI menerima `.srt`/`.txt`, frontend membaca teks dan mengirimkannya; backend memakai subtitle manual pada pipeline analisis. `src/components/InputPanel.tsx`, `src/api.ts`, `backend/schemas.py`, `backend/main.py`. | Ubah status menjadi **tersedia**. Tambahkan batas format/ukuran, perilaku timestamp, dan skenario kegagalan. Pastikan perbedaan sumber YouTube vs file/Drive jelas. |
| [!] [~] | Progres analisis | Dokumen 01/02/04/06 dan README menyebut progress persen belum ada atau hanya menunggu/selesai. | Backend menyimpan milestone 10/20/55/65/90/100 dan frontend menampilkannya sebagai tahap/progres. `backend/main.py`; `src/components/InputPanel.tsx`. | Tandai **progres tahap kasar tersedia**, bukan progres kerja presisi. Jangan menyebut kemajuan AI/transkripsi real-time jika persentasenya hanya milestone. |
| [!] [~] | Progres render | Dokumen menyamaratakan bahwa persentase render tidak tersedia. | Status job dan angka persen ada; progres terutama bergerak saat persiapan sumber dan sebelum/sesudah klip, bukan dari event encoding FFmpeg. `backend/main.py`; `src/components/StudioOverlay.tsx`. | Catat **persentase batch kasar tersedia; progres encoding per klip belum tersedia**. Peningkatan full-feature: FFmpeg `-progress`, estimasi berbobot durasi, cancel dan resume. |
| [!] [x] | Rasio keluaran Studio | Dokumen alur kerja/rencana implementasi masih menyebut render vertikal 9:16 saja. | Source Studio/renderer mendukung 9:16, 1:1, 4:3, 16:9 letterbox, dan 16:9 lanskap dengan dimensi output yang berbeda. `src/components/StudioOverlay.tsx`, `backend/render.py`. | Perbarui kontrak output dan tabel rasio/dimensi di dokumen 01/02/06. Bedakan mode letterbox vertikal dari file lanskap 16:9. |
| [!] [~] | Reset sandi | Sebagian dokumen berkata tombol/reset tidak tersedia. | Endpoint `reset-request`/`reset-confirm` ada, tetapi pengiriman email tidak tersedia dan UI menerangkan keterbatasannya; kode reset hanya dapat dicatat saat debugging lokal diaktifkan. `backend/routes/auth.py`, `backend/config.py`, `src/pages/AuthPages.tsx` (perlu validasi operasional terpisah). | Dokumentasikan sebagai **endpoint/reset internal parsial; belum ada alur email pengguna yang siap digunakan**. Jangan menyebut reset berfungsi end-to-end. |
| [!] [~] | Deteksi fokus otomatis | Dokumen referensi Studio menyebut otomatis, sebagian dokumen aktif hanya menyebut renderer/crop. | Deteksi mengambil sampel beberapa frame, mencari wajah dengan Haar jika tersedia, lalu fallback gerakan. Preview perlu aksi pencocokan crop; ekspor menghitung ulang. Bukan object tracking atau face tracking kontinu. `backend/render.py`, `backend/main.py`, `src/components/StudioOverlay.tsx`. | Tambahkan keterangan metode, status fallback, perbedaan preview/ekspor dan batas deteksi pada dokumen 02/05/06. |

## C. Sudah disebut dokumen tetapi belum tersedia di source

| Checklist | Fitur/target | Status dan bukti |
|---|---|---|
| [ ] | Pengukuran pemakaian dan biaya Gemini, cap operator $50/bulan, alert 80% | Keputusan produk ada di dokumen 01/03/04/06, tetapi `backend/README.md` dan UI admin menyatakan meter/cap belum ada. Pool/failover key **bukan** kontrol biaya. Ini pekerjaan P0 sebelum pemakaian terbuka. |
| [ ] | Metrik job, render dan biaya pada dashboard admin | Dokumen 02/04/05 dan UI menyatakan data belum diekspos API. `src/pages/AccountPages.tsx` menampilkan keterangan metrik job/biaya belum tersedia. |
| [ ] | Ekspor ZIP batch | Disebut belum tersedia oleh dokumen aktif; jalur yang terlihat menyediakan tautan output per klip. |
| [ ] | Reset sandi melalui email | Email/provider email dan pengalaman reset pengguna belum siap; endpoint saja tidak menyelesaikan alur. |
| [ ] | Rentang analisis kustom | Disebut belum tersedia di dokumen aktif; belum ditemukan kontrol/request range aktif pada alur analisis yang ditinjau. |
| [ ] | Billing pelanggan/paket Pro aktif | Situs dapat menjelaskan paket, tetapi billing/entitlement pembayaran tidak tersedia. Free quota bukan sistem billing. |
| [ ] | Deployment produksi | Belum tersedia sebagai deployment yang sudah disiapkan. Butuh HTTPS, konfigurasi keamanan cookie/CSRF, limiter bersama, backup, observability, secret management dan runbook. |
| [ ] | Facecam + gameplay / picture-in-picture multi-sumber | Direkam sebagai fitur yang belum dipulihkan pada `docs/referensi/studio-lama/ANALISIS-FITUR.md`; tidak ditemukan pipeline komposisi sumber kedua di Studio aktif. |
| [ ] | Watermark gambar | Studio saat ini mengatur watermark teks; referensi lama menandai watermark gambar belum tersedia. |
| [ ] | Tema subtitle animasi per kata | Preset visual subtitle tersedia, tetapi animasi karaoke/word-by-word tidak dinyatakan sebagai implementasi aktif; referensi lama mencatatnya belum dipulihkan. |
| [ ] | Pengenalan objek semantik dan pelacakan wajah frame-per-frame | Tidak setara dengan deteksi fokus terbatas yang ada. Butuh desain, model/dependensi dan evaluasi kualitas tersendiri. |

## D. Implementasi ada tetapi belum tercakup atau tergambar jelas di dokumen aktif

| Checklist | Area | Status dokumentasi | Tindak lanjut |
|---|---|---|---|
| [!] [x] | Kontrol Studio lanjutan: banyak rasio, editor subtitle per klip, upload BGM/SFX, volume sumber, watermark teks, nama file dan pilihan encoder | Sebagian besar dirinci hanya dalam `docs/referensi/studio-lama/ANALISIS-FITUR.md`; dokumen alur aktif meringkas Studio menjadi render vertikal 9:16. | Pindahkan tabel kemampuan Studio ke dokumen 02 sebagai spesifikasi aktif; tautkan referensi sebagai riwayat asal, bukan satu-satunya dokumentasi. |
| [!] [x] | Pengambilan media YouTube mentah tertunda | Belum menjadi bagian jelas dari alur aktif. Source menganalisis YouTube dari transkrip; sumber media baru dibutuhkan untuk preview/focus/render atau aksi unduh. | Dokumentasikan secara eksplisit kapan video YouTube diambil agar UI, persetujuan dan biaya sumber konsisten. Bedakan Drive/file yang memiliki alur media berbeda. |
| [!] [~] | Editor/admin memiliki fitur lebih luas dari ringkasan MVP | Dokumen 02/05 menyebut sejumlah permukaan admin, tetapi tidak menjadi checklist perilaku/UI yang bisa diverifikasi menyeluruh. | Buat matriks per route/aksi untuk ringkasan admin, role, Gemini key, activity dan pengaturan sistem. Metrik biaya/job tetap status belum ada. |

## E. Target full-feature yang belum tertulis sebagai target/acceptance criteria yang tuntas

Daftar ini membedakan target jangka panjang dari fitur yang saat ini memang belum ada. Item berikut tidak otomatis berarti harus dibangun dengan pendekatan tertentu; semuanya perlu acceptance criteria, prioritas dan dependency.

| Checklist | Target yang perlu dikunci | Mengapa perlu dimasukkan |
|---|---|---|
| [ ] | Selesaikan backlog fitur full-feature lintas akun, Studio, admin, operasional dan distribusi | Dokumen 03/06 masih mengikat banyak keputusan pada “pasca-MVP”; belum ada target menyeluruh dan kriteria selesai. |
| [ ] | Kriteria kualitas output Studio: preview sama dengan output, rasio, crop, teks, subtitle, audio, encoder dan konsistensi lintas browser | Fitur kontrol ada, tetapi kontrak “hasil sama seperti preview” dan ambang kualitas belum tertulis sebagai definisi selesai. Lihat audit Studio. |
| [ ] | Ketahanan job: antrean, restart/recovery, retry idempoten, cancel, hasil parsial, disk pressure | Roadmap menyebut sebagian sebagai rekomendasi, bukan checklist implementasi/acceptance. |
| [ ] | Observability operasional: penggunaan provider, biaya, kapasitas, latensi, error, antrean dan kesehatan layanan | Cost cap dan admin metrics belum ada; full-feature operasi memerlukan pengukuran backend yang dapat dipercaya. |
| [ ] | Keamanan dan kesiapan multi-user produksi | Dokumen mengenali CSRF, rate limit lintas proses, HTTPS dan backup sebagai pekerjaan, tetapi belum ada gate rilis produksi yang tertutup. |
| [ ] | Aksesibilitas dan viewport Studio | Dokumen desain punya aturan, namun audit source ini tidak memverifikasi semua viewport, keyboard dan screen reader. Tambahkan checklist QA per breakpoint/komponen. |
| [ ] | Publikasi sosial, kolaborasi/editor tim dan produk Pro | Saat ini diletakkan di luar MVP/opsi bisnis. Karena sasaran sekarang full-feature, tandai sebagai target **belum dikunci atau belum dibangun**, bukan “dihapus dari roadmap”. Tentukan kebutuhan sebelum implementasi. |

## F. Dokumen historis, keputusan, dan konflik yang perlu dibereskan

| Checklist | Temuan | Tindakan |
|---|---|---|
| [H] | `docs/perencanaan/07-PAKET-HANDOFF-GATE-A.md` ditandai snapshot sebelum backend aktif; isinya memuat kontrak, mock, dan batas lama. | Pertahankan sebagai arsip. Tambahkan banner “jangan dipakai sebagai kontrak aktif” di halaman awal bila belum cukup jelas; jangan menyelaraskan isinya dengan kode baru. |
| [H] | Laporan A-01–A-04 merupakan snapshot tanggal sebelumnya; indeks sudah membedakannya dari rujukan aktif. | Pertahankan sebagai jejak sejarah dan tautkan ke audit terbaru, bukan mengedit fakta historis. |
| [!] | Dokumen 00 menyebut sumber kode sebagai sumber status, tetapi 01/02/04/06 dan README backend masih berbeda pada manual subtitle, progres dan rasio keluaran. | Satu pembaruan terkoordinasi dibutuhkan supaya indeks tidak menunjuk ke status saling bertentangan. |
| [!] | Judul/pernyataan “MVP” membuat fitur non-MVP terdengar sebagai tidak termasuk produk, padahal sasaran pemilik adalah menyelesaikan full-feature. | Pertahankan sejarah MVP; tambahkan “Target Produk Full-Feature” dan “Backlog menuju target” terpisah. Jangan menghapus item full-feature hanya karena belum MVP. |
| [~] | Tanggal status beberapa dokumen 8 Oktober sedangkan audit ini 9 Oktober; source dan dokumentasi terus berubah. | Cantumkan tanggal verifikasi per bagian dan pemilik pembaruan. Status yang bergantung provider harus menyertakan tanggal serta lingkungan tes. |

## G. Checklist prioritas tindak lanjut

### P0 — Akurasi sumber kebenaran

- [ ] Perbarui status manual subtitle menjadi tersedia.
- [ ] Bedakan progres analisis tahap kasar, progres render batch kasar, dan progres encoding FFmpeg aktual.
- [ ] Perbarui rasio/dimensi output Studio; jangan sebut semua ekspor hanya 9:16.
- [ ] Perjelas reset sandi: endpoint internal ada, email/alur pengguna belum tersedia.
- [ ] Tambahkan pernyataan bahwa target produk adalah full-feature; MVP adalah urutan rilis, bukan batas final.

### P1 — Definisi selesai untuk fitur nyata

- [ ] Tuliskan acceptance criteria Studio untuk preview-output, fokus otomatis, subtitle dan audio.
- [ ] Jalankan validasi live Gemini dan sumber YouTube/Drive yang dapat diakses; simpan lingkungan dan hasilnya.
- [ ] Tetapkan requirement recover/retry/cancel dan hasil parsial job render.
- [ ] Audit admin berdasarkan aksi UI dan endpoint, termasuk role guard serta data yang belum diekspos.

### P2 — Lengkapi target full-feature

- [ ] Pilih urutan dan definisi penerimaan untuk ZIP, rentang analisis kustom, billing/Pro, publikasi sosial dan kolaborasi.
- [ ] Rancang biaya/metering/cap, metrik operasional dan gate deployment produksi.
- [ ] Buat keputusan eksplisit untuk fitur Studio lama yang belum pulih: multi-sumber/PiP, watermark gambar, animasi subtitle per kata, tracking semantik.
- [ ] Lengkapi matriks responsive/accessibility dan QA visual untuk semua halaman.

## Rekomendasi terperinci

Rekomendasi ini memakai sasaran **full-feature** yang sudah Anda tetapkan. MVP diperlakukan sebagai urutan pembangunan/rilis, bukan batas produk akhir. Prioritas menilai risiko dan urutan dependensi; P0 berarti fondasi atau risiko biaya/kebenaran yang perlu dibereskan lebih dulu, bukan berarti fitur lain dibuang.

| Urutan | Prioritas | Paket kerja | Rekomendasi dan alasan | Kriteria selesai yang disarankan | Ketergantungan |
|---|---|---|---|---|---|
| 1 | P0 | Tetapkan satu sumber status | Buat matriks fitur master dengan satu baris per kemampuan: status kode, status QA, dokumen pemilik, owner, prioritas, dependency, dan acceptance criteria. Koreksi klaim manual subtitle, progres, rasio serta reset. Pisahkan “fitur tidak ada” dari “fitur ada tetapi belum divalidasi live”. Ini mencegah pengguna dan developer mengambil keputusan berdasarkan deskripsi lama. | [ ] Tidak ada dokumen aktif yang menyatakan subtitle manual atau rasio Studio belum ada; [ ] progress dibedakan kasar vs encoding aktual; [ ] semua batas memiliki tanggal verifikasi; [ ] dokumen 00 menunjuk ke matriks ini. | Audit source dan keputusan produk full-feature yang sudah diberikan. |
| 2 | P0 | Definisikan target full-feature | Ubah roadmap dari daftar “di luar MVP” menjadi daftar area produk akhir: pipeline, Studio, admin/biaya, reliability, akun, distribusi dan production. Untuk fitur bisnis yang belum diputuskan (Pro/billing, tim/kolaborasi, publikasi sosial), tandai “perlu keputusan produk”, jangan diasumsikan sudah dibatalkan atau otomatis harus dibuat. | [ ] Setiap target masuk salah satu status: confirmed, discovery, deferred, atau rejected by product owner; [ ] fitur confirmed memiliki acceptance criteria dan dependency; [ ] keputusan diberi tanggal dan alasan. | Kesepakatan target full-feature; pemilik keputusan bisnis untuk monetisasi/distribusi. |
| 3 | P0 | Lindungi biaya AI | Implementasikan pencatatan penggunaan dan biaya berdasarkan project/key/model/job/user jika provider menyediakan usage. Terapkan budget operator $50/bulan dan alert 80% sebagai kontrol backend; saat data biaya terlambat/tidak tersedia, gunakan guard konservatif dan jangan memberi kesan angka presisi. Rotasi key hanya lintas project yang memang berizin dan tidak menjadi cara menghindari batas. | [ ] Pemakaian dapat ditelusuri dari job hingga project; [ ] alert ambang terkirim/terlihat; [ ] permintaan baru ditolak atau ditahan saat cap tercapai; [ ] kondisi usage hilang/terlambat diuji; [ ] admin bisa melihat penggunaan dan alasan blokir. | Skema usage provider yang tersedia, definisi periode tagihan dan timezone, keputusan fail-closed. |
| 4 | P0 | Benahi jalur analisis dan transkrip | Gambarkan dan implementasikan kontrak terpisah per sumber. YouTube menganalisis transkrip dan tidak perlu mengunduh video penuh saat analisis; file/Drive menyiapkan media dan dapat memakai Whisper/Gemini video sesuai jalurnya. Pastikan subtitle manual menang, timestamp dipetakan benar, dan heatmap diberi nama sesuai sinyal yang benar-benar dihitung. | [ ] Untuk YouTube tersedia transkrip otomatis/manual dan error tanpa caption yang jelas; [ ] upload/Drive dengan subtitle manual tidak menjalankan transkripsi yang tidak perlu; [ ] bahasa, timestamp, empty transcript dan durasi diuji; [ ] label heatmap menjelaskan bahwa itu sinyal transcript/audio, bukan data retensi penonton kecuali memang ada analytics penonton. | Kesepakatan perilaku per source, parser subtitle, telemetry tahap pipeline. |
| 5 | P1 | Jadikan progres jujur dan berguna | Pertahankan progress tahap yang ada, tetapi kirim status bernama seperti `mengambil_sumber`, `transkripsi`, `analisis_ai`, `render_klip_n`, `finalisasi`. Untuk render, integrasikan progress FFmpeg yang dapat dibaca dan hitung progres batch berbobot durasi; jika fase belum bisa diukur, tampilkan indeterminate dan pesan aktivitas alih-alih persentase palsu. | [ ] Status tidak diam membingungkan saat job aktif; [ ] persen monoton dan terkait kerja terukur; [ ] tahap dan klip aktif tampak; [ ] error menyebut tahap serta tindakan pemulihan; [ ] reload halaman mempertahankan status job. | Job progress schema dan pemisahan lifecycle analisis/render. |
| 6 | P1 | Selaraskan preview dengan hasil ekspor | Jadikan geometri dan aturan render satu kontrak: rasio, crop, posisi safe area, title, font/ukuran/line-wrap, subtitle, watermark, volume. Saat auto-focus aktif, hitung crop klip preview secara otomatis atau beri status tegas bahwa preview masih manual. Reuse hasil crop yang sama untuk ekspor bila masih valid. Tambahkan render sampel pendek untuk memeriksa hasil nyata sebelum batch panjang. | [ ] Semua rasio menunjukkan aspek benar pada preview dan file; [ ] koordinat overlay sama di preview/FFmpeg; [ ] auto-focus status per klip jelas (face/motion/manual/unavailable); [ ] sampel output cocok secara visual dan audio dengan kontrol yang dipilih. | Pemetaan aspek output, sinkronisasi preview/API, lingkungan render FFmpeg. |
| 7 | P1 | Stabilkan subtitle | Normalisasi timestamp saat masuk, tolak waktu di luar klip, deteksi overlap dan duplikasi, dan tetapkan kebijakan merge/split/editor warning. Renderer dan preview harus memilih baris dengan aturan yang sama. Sediakan preview font fallback, wrapping, posisi, dan hasil subtitle burned/soft yang jelas. | [ ] Tidak ada baris hilang diam-diam; [ ] overlap terlihat di editor; [ ] teks/timestamp yang sama tampil konsisten di preview dan file hasil; [ ] SRT valid untuk caption kosong/panjang/multibahasa; [ ] pilihan subtitle soft vs burn dinyatakan sebelum ekspor. | Format subtitle input, aturan overlap produk, dukungan libass/font FFmpeg. |
| 8 | P1 | Buat job render dapat dipulihkan | Persist state, output parsial, dan identitas tiap klip. Tambahkan cancel yang aman, retry klip gagal secara idempoten, recovery setelah restart, serta pembersihan aset/output orphan. Sediakan unduhan per klip lebih dulu; ZIP dapat dibangun di atas manifest output yang stabil. | [ ] Restart tidak membuat job hantu atau kehilangan hasil yang sudah selesai; [ ] retry tidak menggandakan file/kuota/aktivitas; [ ] cancel membersihkan proses dan memberi status; [ ] kegagalan satu klip tidak menghilangkan klip sukses; [ ] ruang disk rendah memberi error terarah. | State machine job, queue worker, quota idempotency, strategi storage/TTL. |
| 9 | P1 | Lengkapi observability admin | Bangun metrik job, durasi tiap tahap, tingkat sukses/gagal, ukuran storage, antrean, status model/project dan biaya. Beri drill-down audit tanpa memaparkan API key atau data sensitif. Mulai dengan agregat yang benar-benar ada; jangan tampilkan grafik dekoratif atau data tiruan. | [ ] Admin dapat menjawab job apa yang macet/gagal dan di tahap mana; [ ] biaya terhubung ke data provider; [ ] filter tanggal/status tersedia; [ ] setiap metrik menampilkan periode/sumber; [ ] akses role dan redaksi data diuji. | Job events, cost meter, retensi metrik, izin admin. |
| 10 | P1 | Siapkan alur reset akun dan keamanan web | Selesaikan reset sandi sebagai alur pengguna yang aman: email berisi token sekali pakai dan kedaluwarsa atau alternatif admin yang dapat dilakukan melalui UI serta tercatat audit. Sebelum deployment, selesaikan CSRF untuk cookie auth, rate limit lintas worker, HTTPS, backup/restore, secret rotation dan kebijakan log. | [ ] Reset dapat selesai tanpa akses terminal; [ ] token tidak tercatat plaintext pada log produksi; [ ] rate limit berjalan lintas instance; [ ] backup diuji restore; [ ] checklist security/deployment memiliki bukti lulus. | Pilihan layanan email, domain/origin produksi, storage bersama dan deployment target. |
| 11 | P2 | Lengkapi Studio full-feature bertahap | Prioritaskan kontrol satu-sumber yang sudah dikenal: seluruh rasio, crop, judul, caption editor, audio, branding, encoder dan ZIP. Fitur multi-sumber/PiP, watermark gambar, subtitle animasi kata dan tracking semantik masuk discovery/implementasi hanya setelah tiap fitur memiliki input, UX, batas perangkat dan hasil render yang didefinisikan. | [ ] Matriks Studio aktif vs backlog tersedia; [ ] setiap kontrol aktif memengaruhi render; [ ] setiap fitur baru punya contoh input/output dan acceptance criteria; [ ] klaim “auto” menerangkan keterbatasannya. | Preview-render parity, arsitektur aset, performa FFmpeg/GPU dan keputusan produk untuk fitur lanjutan. |
| 12 | P2 | Tambahkan kemampuan distribusi dan monetisasi | ZIP batch memberi nilai langsung pada workflow ekspor. Billing Pro, kolaborasi tim, dan publikasi sosial memerlukan keputusan target pasar, izin/entitlement, OAuth, audit dan kebijakan platform; lakukan discovery terpisah dan urutkan sesudah perlindungan biaya serta stabilitas job. | [ ] Keputusan untuk ZIP/Pro/teams/social eksplisit; [ ] fitur yang disetujui punya alur gagal dan rollback; [ ] akses/izin dan biaya diuji; [ ] no-op/fitur belum aktif tidak ditampilkan seolah siap. | Cost meter, job recovery, produk/komersial, platform OAuth/kebijakan masing-masing. |
| 13 | P1 | Validasi layar dan aksesibilitas | Jalankan matriks QA pada viewport kecil, tablet, desktop; seluruh tab dan panel scroll; keyboard-only; fokus modal; screen reader; kontras dan bahasa ID/EN. Catat screenshot/hasil per route, bukan hanya “responsive” secara umum. | [ ] Tidak ada overflow horizontal yang memotong kontrol; [ ] tab/slider/upload/checkbox bisa dioperasikan keyboard; [ ] fokus terlihat dan urutannya masuk akal; [ ] label/status terbaca screen reader; [ ] string dan error penting tersedia dalam kedua bahasa. | Stabilitas layout Studio dan sistem lokalisasi. |
| 14 | P0 sebelum rilis publik | Buat gerbang release produksi | Jangan menyamakan “jalan lokal” dengan “siap dipakai publik”. Tetapkan checklist deployment: build reproducible, secret/data persistence, DB/media backup, HTTPS/cookie, CSRF, limiter bersama, kapasitas disk, worker concurrency, monitoring, cleanup, rate/provider budget, runbook incident. | [ ] Setiap item ada owner dan bukti; [ ] restore dan incident runbook dicoba; [ ] batas kapasitas diuji; [ ] integrasi live sah tervalidasi; [ ] release gate disetujui pemilik produk. | Penyedia hosting, domain, layanan email/monitoring/storage, estimasi beban. |

### Urutan eksekusi yang saya rekomendasikan

1. **Minggu kerja pertama — status dan definisi:** bereskan matriks sumber kebenaran, koreksi dokumen aktif, dan pecah target full-feature menjadi backlog dengan acceptance criteria. Tidak mengubah perilaku produk sebelum klaim dan targetnya jelas.
2. **Fondasi biaya dan pipeline:** bangun metering/cap AI dan pastikan alur subtitle/transkrip/progres akurat. Ini mengurangi risiko biaya tak terkendali dan mencegah analisis gagal dengan informasi yang menyesatkan.
3. **Kualitas Studio:** tutup perbedaan preview-ekspor, subtitle overlap, dan progress render. Hasil yang dilihat editor harus mendekati berkas akhir.
4. **Keandalan dan admin:** persistensi/recovery/cancel/retry, metrik operasional, reset akun, dan persiapan keamanan multi-user.
5. **Ekspansi full-feature:** ZIP, kemudian fitur Studio lama yang belum pulih dan fitur bisnis/distribusi yang telah dikunci pemilik produk.
6. **Release gate:** validasi runtime tiap sumber dan format, viewport/accessibility, biaya/provider, backup/restore dan deployment sebelum pengguna umum.

Urutan ini memberi manfaat produk lebih awal sambil membangun fondasi. Item P2 tetap berada di roadmap; prioritas P0/P1 hanya mengatur urutan agar fitur penuh dibangun di atas pipeline yang dapat dipercaya.

### Keputusan yang sebaiknya tidak ditunda

| Checklist | Keputusan | Rekomendasi saya |
|---|---|---|
| [ ] | Apakah sasaran penggunaan tetap local-only atau menjadi layanan publik? | Tetapkan deployment target lebih awal; kebutuhan keamanan, biaya, storage dan multi-worker bergantung padanya. |
| [ ] | $50/bulan adalah hard cap atau alarm saja? | Perlakukan sebagai hard cap server-side dan alert 80%, dengan keadaan aman ketika usage provider terlambat/tidak tersedia. |
| [ ] | Pro, billing, tim, social publishing termasuk target produk? | Tandai tiap item sebagai confirmed/discovery/deferred setelah keputusan eksplisit. Untuk full-feature, jangan biarkan label “di luar MVP” menjadi keputusan permanen tanpa persetujuan. |
| [ ] | Subtitle diekspor sebagai burned-in, soft track, atau pilihan pengguna? | Pertahankan kedua jalur jika format mendukung dan tunjukkan konsekuensi kompatibilitas sebelum render. |
| [ ] | Apa definisi “deteksi otomatis” yang dijanjikan? | Gunakan istilah “fokus wajah/gerakan berbasis sampel” untuk kemampuan sekarang; gunakan “object tracking” hanya setelah semantik dan tracking kontinu benar-benar diimplementasikan serta dievaluasi. |

## H. Urutan pembaruan dokumen yang direkomendasikan

1. **Dokumen 00:** ubah sumber status/tanggal audit dan tautkan checklist ini.
2. **Dokumen 01–02:** koreksi fakta teknis dan alur yang bertentangan dengan source.
3. **Dokumen 04:** pisahkan pekerjaan belum implementasi dari fitur pasca-MVP yang tetap berada pada target full-feature.
4. **Dokumen 03 dan 06:** pertahankan sejarah MVP, tambahkan roadmap/acceptance criteria full-feature dan prioritas.
5. **README backend:** betulkan daftar fitur yang belum tersedia serta deskripsi progres.
6. **Dokumen 05 dan referensi Studio:** tandai tiap aturan sebagai sudah diterapkan, belum diverifikasi visual, atau target fitur berikutnya.

## Batas pemeriksaan

Audit ini membandingkan teks dokumen dengan pembacaan source frontend/backend. Tidak menjalankan build, tes otomatis, analisis dengan API Gemini live, render video, email, pembayaran, atau deployment. Karena itu fitur yang memerlukan layanan eksternal diberi catatan validasi, sekalipun alur kodenya tersedia. Beberapa status aksesibilitas dan visual juga menunggu pemeriksaan runtime lintas viewport.

### Sumber utama

- [00 — Indeks dokumen perencanaan](../perencanaan/00-INDEKS.md)
- [01 — Teknologi](../perencanaan/01-TEKNOLOGI.md)
- [02 — Modul dan alur kerja](../perencanaan/02-ALUR-KERJA.md)
- [03 — Model produk dan bisnis](../perencanaan/03-BISNIS-FLOW.md)
- [04 — Roadmap dan keputusan](../perencanaan/04-ROADMAP-KEPUTUSAN.md)
- [05 — Sistem desain](../perencanaan/05-DESAIN.md)
- [06 — Rencana implementasi MVP 1](../perencanaan/06-RENCANA-IMPLEMENTASI-MVP-1.md)
- [07 — Paket handoff Gate A, historis](../perencanaan/07-PAKET-HANDOFF-GATE-A.md)
- [README backend](../../backend/README.md)
- [Referensi fitur Studio lama](../referensi/studio-lama/ANALISIS-FITUR.md)
- [Audit mendalam ECLIPSE Studio](AUDIT-STUDIO-ECLIPSE-2026-10-09.md)
