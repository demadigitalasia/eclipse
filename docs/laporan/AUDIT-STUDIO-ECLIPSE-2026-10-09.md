# Audit ECLIPSE Studio — 9 Oktober 2026

## Ringkasan

Audit mencakup alur dari layar sumber sampai ekspor batch: pemilihan klip, preview, rasio/crop, judul, subtitle, audio, watermark, nama file, encoder, progres, dan unduhan. Pemeriksaan awal dilakukan melalui source frontend/backend, dokumentasi, serta tampilan Studio lokal yang sedang terbuka. Tindak lanjut P1 pada rasio preview dan validasi subtitle telah diterapkan setelah audit; QA runtime dan tes belum dijalankan.

**Kesimpulan:** fondasi alur render sudah nyata dan terhubung ke FFmpeg backend. Namun preview belum selalu mewakili frame hasil ekspor; beberapa pilihan hanya dapat dipastikan saat render. Temuan utama berprioritas P1 ialah rasio preview yang terdistorsi oleh batas tinggi, preview fokus otomatis yang mula-mula tetap manual, dan validasi waktu subtitle yang belum melindungi rentang klip. Ada pula risiko caption duplikat/bertumpuk dari segmen transkrip yang saling tumpang tindih.

Prioritas **P1** berarti berpengaruh langsung pada kebenaran hasil dan sebaiknya ditangani sebelum Studio dianggap andal; **P2** berarti peningkatan kejelasan, pemulihan, atau kenyamanan penggunaan.

Ekspor langsung belum dapat diverifikasi pada sesi ini: halaman Studio lokal memuat data YouTube, tetapi UI melaporkan bahwa server tidak dapat mengakses video tersebut dengan atau tanpa cookie. Maka status render di bawah didasarkan pada kontrak dan implementasi kode, bukan keberhasilan ekspor live.

## Rencana audit bertahap

| Tahap | Cakupan | Status |
|---|---|---|
| 0. Peta dan kesiapan | Peta layar, pintu masuk Studio, data/fitur yang tersedia, dokumentasi dan batas MVP | Selesai melalui source dan halaman lokal |
| 1. Sumber sampai hasil analisis | Input YouTube/Drive/upload, subtitle, persetujuan, progres, hasil, riwayat dan pilihan klip | Source ditinjau; validasi tiap variasi sumber masih perlu skenario runtime |
| 2. Preview dan framing | Pemutar, perpindahan antar klip, rasio keluaran, crop manual/otomatis, safe area | Audit source/screenshot selesai; rasio preview diperbaiki, perlu QA runtime semua aspek dan ukuran layar |
| 3. Konten dan audio | Judul, font, gaya subtitle, editor waktu/teks, musik, SFX, volume, watermark dan nama file | Source ditinjau; validasi rentang subtitle diterapkan, hasil audio/video final perlu dibandingkan dengan ekspor |
| 4. Ekspor dan pemulihan | Validasi batch, encoder, antrean, progres, hasil parsial, unduhan dan error | Source ditinjau; render live terhalang sumber YouTube yang tidak dapat diakses |
| 5. Tampilan lintas ukuran dan aksesibilitas | Desktop/tablet/mobile, fokus keyboard, label, kepadatan panel dan scroll | Desktop ditinjau; belum ada pemeriksaan visual runtime pada tablet/mobile atau screen reader |

Tahap yang belum tervalidasi memerlukan sumber upload/Drive yang dapat dirender dan pemeriksaan pada beberapa ukuran viewport. Laporan ini merupakan audit awal menyeluruh berbasis implementasi, bukan klaim bahwa seluruh kombinasi sudah diuji end-to-end.

## Temuan

### P1 — Preview tidak mempertahankan rasio ketika tinggi dibatasi — diperbaiki, perlu QA

`.studio-preview` menetapkan `aspect-ratio`, lebar hingga 420 px, dan `max-height` 72vh; breakpoint lain menetapkan batas tinggi 62vh/60vh. Ketika tinggi dibatasi, lebar tidak ikut dihitung ulang sehingga preview dapat menjadi lebih lebar daripada rasio yang dipilih. Di screenshot rasio 9:16, ukuran visual sekitar 420×644 px (rasio ~0,65), sementara seharusnya 0,5625; keluaran backend 9:16 memang 1080×1920. Hal ini berpotensi menggeser crop dan posisi judul/subtitle relatif terhadap hasil ekspor.

**Tindak lanjut:** batas tinggi dihapus agar ukuran tinggi mengikuti lebar dan `aspect-ratio` pilihan. Perlu pemeriksaan visual pada seluruh rasio dan breakpoint untuk memastikan canvas tetap muat serta crop terlihat benar.

### P1 — Fokus otomatis saat ekspor berbeda dari preview awal

Nilai auto focus aktif secara default. Tetapi `previewFocalX/Y` hanya memakai hasil deteksi setelah pengguna menekan **Cocokkan crop preview**; sebelum itu preview memakai koordinat manual. Saat ekspor backend menghitung fokus lagi untuk setiap klip. Dengan demikian framing yang terlihat sebelum menekan tombol bisa berbeda dari ekspor. Sesi saat ini menunjukkan auto focus gerakan tersedia, tetapi deteksi wajah tidak tersedia pada server.

**Rekomendasi:** saat auto focus aktif, hitung/ambil fokus untuk klip preview terpilih otomatis lalu tampilkan status per klip (wajah, gerakan, manual, atau tidak tersedia). Jika pemrosesan otomatis mahal, ubah label dan status awal agar jelas preview sedang memakai manual. Beri aksi “terapkan framing ini ke ekspor” atau pastikan hasil preview yang sudah dihitung digunakan kembali oleh ekspor agar frame tidak berubah.

### P1 — Waktu subtitle tidak divalidasi terhadap klip — validasi diterapkan, perlu QA

Editor memberi atribut HTML `min`/`max`, tetapi payload hanya divalidasi backend bahwa `end > start` dan waktunya non-negatif. Nilai di luar rentang klip dapat terkirim; fungsi SRT kemudian memotong atau membuang segmen secara diam-diam. Ini membuat perubahan waktu bisa tampak tersimpan tetapi tidak muncul utuh pada hasil.

**Tindak lanjut:** timestamp transkrip yang bersinggungan dengan tepi klip dipotong saat dimuat/reset. UI memblokir ekspor dan memberi pesan inline untuk waktu tidak valid/teks kosong; skema backend kini memvalidasi rentang klip dan isi segmen. Penanganan overlap/duplikasi serta skenario ekspor masih perlu diaudit.

### P1 — Segmen transkrip berulang dan tumpang tindih berisiko menghasilkan caption ganda

Pada data yang tampak di Studio, beberapa potongan kalimat muncul sebagai baris berulang/bertumpuk dan ada interval sangat pendek. Preview hanya menampilkan baris pertama yang cocok pada waktu aktif, sedangkan renderer menulis semua segmen yang beririsan ke SRT. Akibatnya, teks preview dapat berbeda dari ekspor dan dua subtitle bisa tampil bertumpuk.

**Rekomendasi:** rapikan/deduplikasi hasil transkrip untuk tampilan editor, deteksi overlap, dan tentukan kebijakan saat ekspor (gabung, pilih teks terbaik, atau minta pengguna memperbaiki). Sediakan indikator baris bermasalah dan sinkronkan algoritme pemilihan subtitle preview dengan hasil SRT.

### P1 — Editor tidak mempratinjau keseluruhan hasil render

Preview memperlihatkan video, judul, subtitle aktif, safe area, dan watermark, tetapi tidak mempratinjau mix BGM/SFX. Ada pula perbedaan implementasi render yang wajar berpotensi terlihat: subtitle ekspor memakai font/outline FFmpeg dan judul dibuat melalui font di server, sementara preview menggunakan font CSS browser. Tampilan “langsung” karena itu belum menjamin hasil piksel/audio yang sama.

**Rekomendasi:** beri label eksplisit untuk pengaturan yang hanya berlaku saat ekspor; tampilkan status aset/audio dan ringkasan hasil. Prioritaskan penyamaan geometri, font, warna, ukuran, posisi, dan line wrap. Sediakan render sampel singkat sebelum batch penuh untuk memeriksa audio dan overlay aktual.

### P2 — Persentase batch bukan progres encoding aktual

Backend memperbarui progres saat sumber disiapkan dan sebelum/sesudah setiap klip. FFmpeg tidak melaporkan progres encoding ke job pada implementasi ini. Untuk batch, persentase karenanya melompat antarklip dan dapat tampak diam saat satu klip panjang sedang diproses.

**Rekomendasi:** kirim `-progress` FFmpeg dan agregasikan progres berdasarkan durasi/kemajuan tiap klip. Jika itu belum dikerjakan, tampilkan status tahap dan klip aktif tanpa presisi persen yang seolah-olah kontinu. Tambahkan cancel/retry per klip sebagai peningkatan berikutnya.

### P2 — Panel pengaturan panjang, scroll bersarang, dan padat

Studio menggabungkan banyak kelompok kontrol dalam satu panel panjang. Editor subtitle juga mempunyai scroll internal, selain scroll dialog dan halaman. Pada screenshot dan CSS desktop/tablet terlihat potensi beban navigasi dan kehilangan konteks antara preview dengan kontrol yang sedang diedit.

**Rekomendasi:** kelompokkan jadi panel/tab yang jelas (Bingkai, Judul & subtitle, Audio & branding, Ekspor), pertahankan preview dan nama klip aktif tetap terlihat, serta hindari scroll bersarang jika dapat diganti dengan daftar subtitle berhalaman/area yang terukur. Audit ulang di lebar 320, 768, 1024, dan 1440 px.

### P2 — Label UI dan panduan belum sepenuhnya menerangkan fallback

Pilihan encoder mengacu pada FFmpeg server, bukan GPU browser, dan deteksi wajah/fokus bergantung pada dependensi di server. Penjelasan sudah ada, tetapi status kemampuan, kondisi fallback, dan keterbatasan preview perlu lebih dekat dengan kontrol yang terpengaruh. Beberapa label Studio juga masih hard-coded Indonesia walau toggle bahasa tersedia.

**Rekomendasi:** tampilkan kemampuan yang terdeteksi beserta dampaknya sebelum pengguna mengekspor, termasuk codec yang dipakai, fallback fokus, dan subtitle soft/burned. Pastikan seluruh label, error, status batch, serta panduan masuk ke sistem terjemahan ID/EN.

### P2 — Dokumentasi perlu mengikuti target full-feature, bukan berhenti pada MVP

Dokumen saat ini menjelaskan batas MVP, sedangkan target produk yang dikonfirmasi pengguna adalah menyelesaikan seluruh fitur Studio. Ini bukan alasan untuk membuang kontrol yang sudah ada atau membatasi cakupan. Namun status aktual (misalnya subtitle manual sudah tersedia dan progres render masih kasar) perlu dipisahkan dari target fitur penuh agar backlog, audit, dan keputusan produk menunjukkan apa yang sudah selesai, sedang dikerjakan, dan belum tersedia.

**Rekomendasi:** pertahankan keputusan membangun produk penuh; ubah roadmap/dokumen menjadi daftar penyelesaian fitur menuju target tersebut. Nyatakan secara akurat kemampuan yang ada dan ukur progres kasar per tahap berbeda dari progres encoding aktual.

## Rekomendasi urutan tindak lanjut

1. **P1 — Samakan kanvas preview dengan keluaran.** Pertahankan rasio di semua breakpoint dan semua pilihan aspek.
2. **P1 — Konsistenkan fokus.** Selaraskan crop preview dan ekspor, tampilkan status fallback per klip.
3. **P1 — Amankan editor subtitle.** Validasi waktu, deteksi overlap/duplikasi, dan samakan aturan preview dengan FFmpeg.
4. **P1 — Buat batas preview yang jujur.** Bedakan bagian yang benar-benar live dengan bagian yang hanya berlaku saat ekspor; pertimbangkan render sampel.
5. **P2 — Tingkatkan status render.** Progres encoding aktual, kegagalan parsial yang dapat dipulihkan, cancel/retry.
6. **P2 — Rapikan informasi dan layout.** Kelompokkan kontrol, kurangi scroll bersarang, lengkapkan lokalisasi dan aksesibilitas.
7. **P2 — Selaraskan dokumentasi dan kontrak produk.** Perbarui batas fitur serta keterangan kemampuan server.

## Bukti dan batas audit

- Rasio preview dan breakpoint: `src/styles.css` sekitar baris 593–601, 852–901.
- Pemetaan aspek dan preview/crop: `src/components/StudioOverlay.tsx` sekitar baris 240–345.
- Editor subtitle dan pengaturan render: `src/components/StudioOverlay.tsx` sekitar baris 390–455.
- Polling/progres ekspor: `src/components/StudioOverlay.tsx` sekitar baris 140–212 dan 458–485; `backend/main.py` sekitar baris 953–1078.
- Crop, subtitle, audio, watermark, dan encoder hasil: `backend/render.py` sekitar baris 235–430.
- Validasi kontrak batch/subtitle: `backend/schemas.py` sekitar baris 57–120.
- Batas fitur: `backend/README.md` dan `docs/perencanaan/02-ALUR-KERJA.md`.

Audit dan tindak lanjut ini tidak menjalankan build, tes, atau render. Pemeriksaan visual dibatasi pada tampilan lokal desktop yang tersedia dan screenshot yang diberikan; variasi perangkat, keberhasilan sumber live, kualitas hasil akhir, serta screen reader perlu diperiksa pada tahap runtime berikutnya.
