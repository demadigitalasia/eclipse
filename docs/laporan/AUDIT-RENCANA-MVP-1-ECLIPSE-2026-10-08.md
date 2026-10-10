# A-06 — Audit Rencana Implementasi MVP 1 ECLIPSE

Tanggal: 8 Oktober 2026  
Ruang lingkup: `docs/perencanaan/06-RENCANA-IMPLEMENTASI-MVP-1.md`, dokumen terkait 01–05, dan source frontend yang menjadi bukti progres.  
Metode: tinjauan statis; bukan review UX lengkap atau pengujian backend.

## Ringkasan

**Skor audit awal: 86/100. Skor setelah tindak lanjut dokumentasi: 91/100.** Rencana kuat dalam urutan frontend dahulu → Gate A → backend, keputusan ruang lingkup MVP, pemisahan mock dari layanan nyata, serta kriteria per fase. Perubahan yang disetujui telah menutup beberapa ambiguitas utama, sementara Gate A dan keputusan operasional yang belum dipilih tetap terbuka.

**Gate A belum lulus.** Temuan penyimpanan password demo telah ditangani: kredensial, akun, reset code, dan sesi kini hanya berada di memori browser, dan key auth lama dibersihkan saat startup. A5 masih menunggu review lintas viewport dan aksesibilitas. Keputusan ingest, privasi, biaya, kuota, retensi metadata, dan batas batch tetap menunggu B0.

## Pembaruan tindak lanjut — 8 Oktober 2026

Rekomendasi yang disetujui telah diterapkan pada dokumen dan prototipe terkait:

- **Autentikasi demo:** password tidak lagi ditulis ke `localStorage`; akun, kredensial, reset code, dan sesi demo berada di memori browser. Key autentikasi lama dihapus saat aplikasi mulai. Akibatnya, akun demo selain seed kembali ke keadaan awal setelah reload; ini perlu tetap dijelaskan sebagai batas prototipe.
- **B0 dan B1:** B0 kini memuat keputusan produk/policy saja; implementasi autentikasi server, role, pemulihan akun, dan isolasi job berada di B1.
- **Batas media dan retensi:** 2 GB berlaku pada media sumber efektif baik dari file lokal maupun URL/Drive. Retensi 24 jam hanya untuk file sementara; retensi metadata diputuskan terpisah.
- **Render:** model satu worker global, satu job aktif, dan antrean FIFO telah dipilih. Pembatalan, retry, dan pemulihan setelah restart dirinci sebagai pekerjaan B4.

**Skor setelah tindak lanjut: 91/100.** Akurasi dan konsistensi meningkat karena keputusan dan batas operasional tertulis konsisten. Skor belum 100 karena bukti penerimaan A0–A5 belum lengkap, metode ingest dan kebijakan biaya/privasi/retensi metadata masih perlu diputuskan, serta owner dan tanggal target belum ditentukan.

## Penilaian

| Dimensi | Nilai | Alasan |
|---|---:|---|
| Akurasi dan kebaruan | 27/30 | Snapshot progres diperbarui 8 Oktober dan bukti file dirujuk. Status Gate A tepat disebut belum lulus; bukti review dan beberapa keputusan masih terbuka. |
| Konsistensi antar dokumen | 23/25 | Batas sumber 2 GB, retensi sementara 24 jam, dan antrean FIFO kini dinyatakan selaras. |
| Kelengkapan dan kejelasan | 23/25 | Fase, pengecualian MVP, pemisahan metadata/file, dan model antrean lebih jelas; rincian kebijakan serta bukti penerimaan masih perlu dilengkapi. |
| Kemudahan ditindaklanjuti | 18/20 | B0 berisi keputusan, B1/B4 berisi implementasi, dan tiap fase memiliki kriteria selesai. Owner dan tanggal target belum ada. |
| **Total setelah tindak lanjut** | **91/100** | **Rencana baik dan lebih dapat ditindaklanjuti; Gate A belum lulus dan B0 belum tertutup.** |

## Temuan dan rekomendasi

### P0 — Selesaikan konflik autentikasi demo sebelum Gate A — ditangani

Saat audit awal, kriteria A5 melarang password/secret di `localStorage`, tetapi source `src/auth.tsx` masih menyimpan password akun demo di sana.

**Tindak lanjut:** kredensial, akun, reset code, dan sesi hanya berada di memori; key autentikasi versi lama dibersihkan saat startup; UI memberi tahu batas demo. Gate A tetap memerlukan bukti bahwa browser storage tidak menyimpan password/secret dan review lintas viewport/aksesibilitas.

### P1 — Pisahkan keputusan B0 dari pekerjaan implementasi B1 — ditangani

Di bagian B0 “Putuskan ruang lingkup operasional”, sebagian butir berisi implementasi autentikasi server, role, pemulihan akun, dan kepemilikan job. Pekerjaan tersebut sebenarnya berada pada B1 dan membuat kriteria B0 sulit dinilai sebagai gerbang keputusan.

**Tindak lanjut:** B0 kini hanya memuat keputusan produk/operasional. Implementasi autentikasi server, role, pemulihan akun, dan isolasi job tercantum di B1.

### P1 — Definisikan arti render “satu per satu” untuk banyak pengguna — model diputuskan

Web multi-pengguna dan satu render aktif bisa berarti satu antrean global atau satu antrean per akun. Dokumen belum menetapkan urutan antrean, fairness, pembatalan, batas menunggu, atau pemulihan job setelah restart.

**Tindak lanjut:** MVP memakai satu worker global, satu job aktif, dan antrean FIFO. B4 memuat posisi/progress, pembatalan, retry aman, dan pemulihan setelah restart sebagai kebutuhan implementasi. Persistensi antrean perlu dipastikan dalam desain backend B4.

### P1 — Tegaskan cakupan batas file 2 GB dan retensi 24 jam — ditangani

Dokumen menyebut maksimal 2 GB per video, sedangkan B1 menyebut batas unggahan. Belum jelas apakah batas ukuran yang sama berlaku pada file yang diambil dari URL YouTube/Drive. Retensi 24 jam mencakup file sementara, tetapi perlu dibedakan dari transkrip, metadata job, akun, dan audit log.

**Tindak lanjut:** batas media sumber efektif 2 GB berlaku pada file lokal dan remote; penghapusan setelah 24 jam berlaku pada file sumber/hasil sementara, sementara retensi metadata diputuskan terpisah.

### P1 — Buat kriteria penerimaan yang dapat dibuktikan

Kriteria seperti “konsisten”, “jelas”, dan “dapat ditindaklanjuti” membantu arah tetapi belum menyebut cara pembuktiannya. Owner dan tanggal target juga kosong di matriks.

**Rekomendasi:** untuk setiap A0–A5/B0–B5, tautkan bukti berupa route/alur, screenshot review, hasil pemeriksaan, endpoint, atau output MP4. Tetapkan owner dan target saat tim tersedia; catat blocker alih-alih menaikkan status secara implisit.

### P2 — Rinci acceptance per sumber dan kondisi gagal

Semua YouTube, Drive, dan file lokal diwajibkan pada penerimaan MVP, tetapi metode ingest menunggu keputusan B0. Pastikan acceptance menyebut contoh berhasil dan gagal per sumber, seperti link privat, file terlalu besar, durasi di atas batas, format tak didukung, dan sumber yang tidak dapat diakses dengan metode yang diizinkan.

## Status audit progres setelah tindak lanjut

- A0–A4 berstatus **Berjalan**, bukan selesai; UI tersedia tetapi kontrak terpadu, source nyata, dan acceptance menyeluruh belum terbukti.
- A5 berstatus **Berjalan**; konflik penyimpanan password demo telah ditangani, tetapi belum ada bukti review lintas viewport/aksesibilitas.
- Gate A **Belum lulus**; backend seharusnya belum dimulai berdasarkan urutan yang disetujui.
- B0 **Menunggu keputusan** untuk ingest, consent/lokasi pemrosesan, kuota/cap biaya, retensi metadata, dan maksimum klip per batch. B1–B5 **Belum mulai**.

Status ini konsisten dengan matriks progres terkini dalam dokumen 06. Periksa ulang pada milestone berikutnya sebelum status diubah.

## Keputusan yang masih perlu dikunci pada B0

1. Metode ingest YouTube/Drive yang diizinkan dan perilaku bila sumber tidak dapat diakses.
2. Persetujuan pengguna, lokasi pemrosesan, dan data apa yang boleh dikirim ke provider eksternal.
3. Cap biaya operator, kuota tiap akun, dan model harga/paket sebelum membuka layanan umum.
4. Maksimum klip per batch. Model antrean global FIFO sudah dipilih; aturan operasionalnya dikerjakan pada B4.
5. Retensi metadata akun/job/transkrip/audit yang terpisah dari penghapusan file sementara 24 jam.

## Batas audit

Audit silang memakai dokumen perencanaan 01–05 dan source frontend yang tersedia. Audit ini tidak menentukan pilihan hukum ingest, kebijakan privasi final, angka biaya/kuota, atau menguji backend yang belum tersedia. Temuan awal dicatat sebagai snapshot dan pembaruan di atas merekam tindak lanjut yang sudah diterapkan; Gate A tetap menunggu bukti penerimaan frontend.
