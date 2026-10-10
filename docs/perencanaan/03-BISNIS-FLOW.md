# 03 — Model Produk dan Bisnis ECLIPSE V.2

Status implementasi diperbarui 9 Oktober 2026. Dokumen ini mencatat keputusan produk, batas layanan lokal, dan keputusan bisnis yang belum aktif.

## Hipotesis produk

- Persona awal: kreator solo yang mencari momen kuat; editor yang perlu trim presisi; tim media sosial yang membutuhkan format konsisten.
- Nilai produk: URL/upload → kandidat momen → review/trim → tata klip → ekspor. Alur ini telah tersambung ke backend lokal.
- Status saat ini: publikasi sosial, kolaborasi, dan pembayaran belum tersedia. Ketiganya belum diputuskan untuk target produk akhir; label “di luar MVP” tidak berarti fitur tersebut dibatalkan. Koneksi AI produksi memerlukan key Gemini aktif yang dimasukkan admin.
- Distribusi MVP 1: aplikasi web multi-pengguna. Login, sesi server, role, dan kepemilikan job ditegakkan backend; deployment produksi belum disiapkan.
- Input sumber yang diputuskan: URL YouTube, tautan berbagi publik Google Drive, dan file lokal. Google Drive tidak memakai OAuth pada MVP; tautan tetap harus dapat diakses metode ingest yang didukung.
- Analisis memakai pool kunci API Google/Gemini yang dikelola admin. Operator mengendalikan kredensial dan biaya provider; pengguna tidak memasukkan API key.
- Render MVP memakai satu worker global, satu job aktif, dan antrean FIFO. Maksimum 5 klip per batch (keputusan B0).
- Skor klip adalah sinyal bantu editorial; tidak menjamin performa atau viralitas.

## Target produk setelah MVP

MVP 1 adalah tahap pengiriman awal. Sasaran pengembangan adalah menyelesaikan produk full-feature secara bertahap. Fitur yang belum ada tetap dicatat pada backlog sampai pemilik produk memutuskan statusnya sebagai confirmed, discovery, deferred, atau tidak direncanakan. Jangan mengubah “belum di MVP” menjadi “bukan bagian dari produk” tanpa keputusan eksplisit.

Gunakan [checklist Dokumen vs Implementasi dan rekomendasi](../laporan/CHECKLIST-DOKUMEN-VS-IMPLEMENTASI-ECLIPSE-2026-10-09.md) sebagai baseline fitur yang sudah tersedia, parsial, belum ada, dan area yang memerlukan definisi produk.

## Model biaya yang perlu diputuskan

Dalam implementasi target, biaya potensial mencakup panggilan AI/transkripsi, bandwidth untuk video, CPU/GPU render, penyimpanan sementara, dan proxy pengambilan media. Arah yang diputuskan adalah operator memakai pool kunci API Google/Gemini yang dikelola admin; BYOK bukan alur MVP. Pengguna akhir tidak memasukkan API key (field tersebut sudah dihapus dari UI; kredensial hanya dikelola admin).

## Opsi bisnis (belum tersedia sebagai penawaran aktif)

1. **Web multi-pengguna dengan pool provider milik operator — MVP lokal berfungsi.** Auth, isolasi pengguna, kuota harian, dan worker lokal tersedia. Cap biaya, email reset, observability, dan deployment produksi masih perlu dikerjakan.
2. Lisensi self-host: opsi distribusi lanjutan; perlu paket instalasi, dokumentasi, dan pipeline lokal yang benar-benar berjalan.
3. Managed single-tenant: opsi deployment terkelola; perlu backend persisten dan isolasi konfigurasi/secret tiap instance.
4. Jasa produksi paket klip: dapat menjadi layanan operator setelah render nyata tersedia.
5. BYOK: opsi masa depan bila ada kebutuhan; bukan alur MVP 1.

## Keputusan B0 yang dikunci (8 Oktober 2026)

Keputusan berikut menutup gerbang B0 dan mengikat implementasi backend. Pemilik: pengguna (operator).

1. **Metode ingest: server-side.** YouTube dan Google Drive diambil backend memakai yt-dlp untuk YouTube dan unduhan langsung untuk tautan berbagi publik Drive (tanpa OAuth). Tautan privat/tidak dapat diunduh ditolak dengan error `drive_not_accessible` + arahan berbagi yang jelas. Tidak ada pengelakan izin sumber.
2. **Kuota akun:** Free 1 batch generate per hari; Lite 15 batch per bulan seharga Rp150.000/bulan; Pro 25 batch per bulan seharga Rp300.000/bulan; Hub Admin Unlimited. Satu permintaan Studio dihitung sebagai satu penggunaan, termasuk jika merender beberapa klip sekaligus. Kuota Lite/Pro di-reset tiap awal bulan. Admin dapat mengatur status paket; pembayaran online dan penagihan otomatis belum tersedia. Kuota analisis tetap 3 per hari.
3. **Cap biaya operator: $50/bulan** untuk pool Google/Gemini dengan alert pada 80%. Penerapan cap belum tersedia; jangan menganggap pengeluaran berhenti otomatis saat $50 tercapai.
4. **Maksimum klip per batch render: 5.** Render tetap satu worker global, satu job aktif, antrean FIFO.
5. **Retensi metadata: 90 hari** untuk akun/job/transkrip/audit. File sumber/hasil sementara tetap dihapus otomatis setelah 24 jam.
6. **Persetujuan dan lokasi pemrosesan:** pengguna menyetujui pengiriman video/transkrip ke provider eksternal melalui checkbox eksplisit sebelum analisis pertama; pemrosesan berjalan di server operator (region ditetapkan saat deployment).

## Keputusan produk yang masih terbuka

1. Model harga dan paket Pro (langganan vs per penggunaan) — diputuskan pasca-MVP setelah baseline biaya; MVP Free-only.
2. Ambang metrik keberhasilan (waktu ke klip pertama, tingkat analisis valid, render berhasil) — ditetapkan setelah baseline lokal terkumpul, lihat dokumen 06.

## Status implementasi dan keputusan lanjutan

Ingest YouTube/Drive publik/file lokal, batas input, transkrip, analisis Gemini, render sekuensial, kuota Free, TTL file 24 jam, dan retensi metadata 90 hari tersedia di backend lokal. Beberapa alur perlu diverifikasi dengan key Gemini serta URL sumber nyata. Cap operator $50/bulan + alert 80% masih keputusan yang belum ditegakkan oleh kode. Harga Pro dan ambang metrik tetap terbuka.

## Proxy dan pengambilan video

Admin mengelola pool proxy egress HTTP/HTTPS dari menu Proxy/Egress. URL dan kredensial dienkripsi di database server dan tidak dikirim kembali ke browser. Akun baru dibagi ke endpoint sehat dengan least-recently-used; afinitas akun/job menjaga egress YouTube stabil untuk cookie. Gangguan tunnel memasukkan endpoint ke cooldown dan job mencoba hingga dua endpoint sehat lain. Pool admin kosong memakai `ECLIPSE_EGRESS_PROXY` sebagai fallback tunggal; pool yang terisi tetapi seluruh endpoint-nya dinonaktifkan gagal secara eksplisit. Admin dapat menguji IP egress tiap endpoint. Proxy hanya mengubah jalur koneksi; sumber privat atau tidak dapat diunduh tetap ditolak dan tidak ada pengelakan akses sumber.

Pool Gemini admin menerima banyak API key, tetapi rotasi kuota dilakukan di antara Google project yang berbeda karena batas rate Gemini berlaku per project, bukan per key. Key dalam project yang sama menjadi fallback kredensial untuk project tersebut, bukan tambahan bucket kuota. 401 menandai key invalid; 403/429 dan 5xx membuat project cooldown sementara. Ledger mencatat pemakaian per akun/job/project. Cap biaya USD dan alert pengeluaran tetap belum tersedia.
