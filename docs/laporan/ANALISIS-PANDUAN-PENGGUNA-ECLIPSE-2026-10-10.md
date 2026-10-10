# Analisis dan Rekomendasi Panduan Pengguna ECLIPSE

**Tanggal:** 10 Oktober 2026  
**Ruang lingkup:** Panduan pengguna yang dibuka dari navigasi aplikasi, naskah ID/EN, dan kecocokannya dengan alur Studio pada source lokal.  
**Jenis pemeriksaan:** tinjauan source dan dokumentasi; bukan uji end-to-end.

## Ringkasan

Panduan pengguna saat ini adalah modal ringkas tiga langkah di `src/App.tsx`. Ia cukup sebagai pengingat alur utama, tetapi belum berfungsi sebagai panduan operasional: tidak menjelaskan pilihan sumber/subtitle, batas input, perbedaan analisis menurut sumber, cara meninjau kandidat, pilihan ekspor yang tersedia, riwayat, atau cara pulih dari error.

Ada satu ketidakcocokan isi yang jelas: naskah Indonesia dan Inggris hanya menyebut rasio 9:16, sementara Studio saat ini menawarkan 9:16, 1:1, 4:3, 16:9 letterbox pada kanvas vertikal, dan 16:9 lanskap. Panduan juga menyebut batas 2 GB, tetapi tidak menyebut batas durasi 180 menit atau format file lokal yang diterima.

**Rekomendasi:** perbarui akurasi panduan terlebih dahulu, lalu kembangkan menjadi bantuan kontekstual bertahap. Pertahankan modal ringkas untuk orientasi cepat, dan tambahkan bagian yang bisa dibuka saat pengguna berada pada langkah terkait.

## Kondisi saat ini

- Tombol **Panduan pengguna** berada di navigasi utama dan membuka modal dari halaman aplikasi.
- Modal memiliki judul **Panduan 3 langkah**, tiga paragraf, satu catatan umum tentang skor kandidat, dan tombol tutup.
- Modal dapat ditutup dengan Escape, klik backdrop, atau tombol tutup; fokus dikembalikan ke pemicu.
- Tersedia naskah Indonesia dan Inggris melalui `src/i18n.ts`.
- Naskah yang ada menyebut: masukkan sumber, tinjau kandidat, buka Studio dengan rasio 9:16, lalu unduh MP4.

## Temuan dan prioritas

### P1 — Naskah tidak sepenuhnya sesuai fitur yang tersedia

Naskah menyebut hanya 9:16. Source Studio dan dokumentasi alur kerja menunjukkan pilihan aspek lain juga tersedia. Ini dapat membuat pengguna mengira hasil selain vertikal tidak didukung.

**Tindakan:** ubah kalimat panduan menjadi “pilih rasio keluaran” dan tampilkan opsi yang benar-benar tersedia saat ini. Jangan menyalin daftar fitur yang belum aktif.

### P1 — Panduan melewatkan persiapan sumber dan subtitle

Alur input memiliki YouTube, Google Drive, dan unggah lokal. Batas yang tampak di source adalah 2 GB, durasi maksimum 180 menit, serta ekstensi lokal MP4, MOV, MKV, WEBM, AVI, dan M4V. Untuk YouTube, pengguna dapat mengambil subtitle otomatis atau mengunggah `.srt`/`.txt`; untuk file dan Drive, transkrip dibuat oleh server bila subtitle manual tidak digunakan.

Naskah saat ini tidak menerangkan format, durasi, tautan Drive yang perlu dapat diakses, maupun perbedaan pilihan transkrip. Akibatnya, pengguna baru bisa mengetahui syarat input setelah gagal.

**Tindakan:** tambahkan blok “Sebelum mulai” dengan batas ukuran/durasi/format, persyaratan tautan, dan pilihan subtitle sesuai sumber. Ambil batas dari konfigurasi server agar panduan tidak memiliki angka hard-coded yang mudah kedaluwarsa.

### P1 — Penjelasan skor terlalu umum

Modal memakai keterangan skor umum. Di halaman hasil, UI sendiri membedakan bahwa skor YouTube diperkirakan dari transkrip dan Gemini tidak menonton video secara langsung; untuk video upload/Drive, penilaian menggunakan video dan transkrip. Perbedaan yang penting untuk membentuk ekspektasi ini hilang dari panduan.

**Tindakan:** jelaskan metode menurut sumber dan nyatakan bahwa skor adalah perkiraan untuk membantu memilih klip, bukan jaminan performa.

### P1 — Persetujuan dan pemrosesan AI kurang mendapat konteks

Input memberi tahu bahwa transkrip dikirim ke layanan AI eksternal. Panduan tidak menjelaskan kapan pemrosesan itu terjadi, mengapa persetujuan diminta, atau secara ringkas bahan apa yang digunakan untuk tiap sumber.

**Tindakan:** tambahkan ringkasan satu paragraf sebelum analisis dengan tautan ke penjelasan privasi/pemrosesan. Gunakan wording yang sama dengan persetujuan di UI dan dokumentasi kebijakan.

### P2 — Langkah tinjau dan Studio tidak cukup konkret

“Filter, pilih, dan atur potongan” tidak menjelaskan pencarian judul/transkrip, sortasi kandidat, pratinjau, perubahan batas waktu, penandaan, atau tombol **Buka di Studio**. Panduan Studio juga tidak memberi urutan penggunaan untuk rasio, framing, judul, subtitle, audio, watermark, dan ekspor.

**Tindakan:** uraikan langkah hasil sebagai: cari/sortir → pratinjau → koreksi waktu bila perlu → tandai klip → buka Studio. Dalam Studio, kelompokkan bantuan menurut panel yang sedang dibuka, bukan menjelaskan semua kontrol dalam satu paragraf panjang.

### P2 — Batas ekspor dan hasil tidak disebut

Implementasi menerima maksimal lima klip per batch dan menyediakan unduhan per klip. Panduan hanya menyatakan “ekspor klip, lalu unduh MP4”, tanpa batas batch, format hasil, atau keterangan bahwa tautan unduhan per klip.

**Tindakan:** beri tahu jumlah maksimal yang sedang dikonfigurasi, format hasil, apa yang disertakan, dan lokasi tombol unduh. Bila batas berubah dari server, baca nilainya dari konfigurasi/runtime.

### P1 — Bantuan pemulihan untuk media yang hilang tidak ada

Riwayat menyimpan metadata analisis lebih lama daripada media sumber. Konfigurasi saat ini menetapkan file sementara dibersihkan setelah 24 jam dan metadata setelah 90 hari. Dalam uji pengguna, preview juga sempat menampilkan pesan video lokal tidak dapat dimuat. Panduan tidak menerangkan arti kondisi itu atau langkah pemulihan.

**Tindakan:** bedakan “hasil analisis masih tersimpan” dari “file video sumber masih tersedia”. Tambahkan langkah pemulihan yang benar-benar didukung, termasuk kapan pengguna perlu memuat ulang analisis atau mengunduh ulang sumber. Jangan menjanjikan preview akan tersedia sepanjang metadata riwayat masih ada.

### P2 — Modal tidak mengarahkan pengguna ke tindakan berikutnya

Modal hanya memiliki tombol tutup. Pengguna harus menutupnya lalu mencari kontrol sendiri. Tidak ada tautan menuju input sumber, daftar hasil, atau langkah Studio; tidak ada pencarian atau indeks topik.

**Tindakan:** tambahkan tautan tindakan yang menutup modal dan membuka lokasi relevan. Jadikan bantuan per langkah dapat dibuka langsung di samping kontrol.

## Rekomendasi susunan panduan

1. **Mulai dari video** — pilih YouTube, Drive, atau file; tampilkan format dan batas ukuran/durasi yang berlaku.
2. **Pilih transkrip** — jelaskan subtitle YouTube, upload `.srt`/`.txt`, dan transkripsi server untuk file/Drive.
3. **Analisis** — jelaskan persetujuan pemrosesan AI, status tahap yang akan muncul, dan sumber data penilaian.
4. **Tinjau kandidat** — cari, filter/sortir, pratinjau, koreksi waktu, tandai, lalu buka Studio.
5. **Atur dan ekspor** — pilih klip (maksimal yang berlaku), rasio, framing, teks/subtitle dan opsi lain; jelaskan format hasil dan unduhan per klip.
6. **Riwayat dan pemecahan masalah** — jelaskan masa berlaku media, metadata, sumber yang tidak tersedia, error analisis, dan kapan mengulang proses.

Di versi ringkas, tampilkan keenam judul dan satu kalimat tiap langkah. Sediakan **Lihat detail** untuk artikel langkah demi langkah.

## Contoh naskah ringkas yang disarankan

> **Alur kerja ECLIPSE**  
> 1. **Tambahkan video.** Pilih YouTube, tautan Drive yang dapat diakses, atau unggah file yang didukung. Periksa batas ukuran dan durasi sebelum mulai.  
> 2. **Siapkan transkrip.** YouTube dapat memakai subtitle yang tersedia atau file subtitle Anda. Untuk file lokal dan Drive, ECLIPSE dapat membuat transkrip di server.  
> 3. **Analisis video.** Setelah Anda menyetujui pemrosesan, sistem menyiapkan transkrip dan menghasilkan kandidat klip. Cara penilaian bergantung pada sumber; skor hanya perkiraan, bukan jaminan performa.  
> 4. **Tinjau kandidat.** Pratinjau klip, cari atau urutkan hasil, koreksi batas waktu, lalu tandai klip yang ingin dipakai.  
> 5. **Atur di Studio.** Pilih rasio, framing, judul, subtitle, dan opsi tambahan. Ekspor klip yang dipilih dan unduh hasil MP4 satu per satu.  
> 6. **Gunakan riwayat.** Analisis dapat tetap tercatat setelah file media sementara dibersihkan. Jika video tidak dapat dipratinjau, ikuti langkah pemulihan atau muat ulang sumber.

Teks ini adalah rancangan; sebelum dipasang, isi angka batas dan instruksi pemulihan dari konfigurasi serta perilaku UI yang berlaku saat rilis.

## Rencana perbaikan dan pengembangan

### Tahap 1 — Akurasi dan kejelasan

- Selaraskan naskah ID/EN dan rasio keluaran.
- Tambahkan persyaratan sumber, format, ukuran, durasi, subtitle, persetujuan pemrosesan, dan metode skor.
- Jelaskan masa berlaku file media terpisah dari masa berlaku metadata riwayat.
- Hindari angka operasional duplikat; ambil angka dari endpoint batas server.

### Tahap 2 — Bantuan kontekstual

- Buat checklist langkah Sumber → Analisis → Tinjau → Studio → Ekspor.
- Tambahkan “?” atau “Pelajari” di samping input subtitle, filter kandidat, framing, dan ekspor.
- Tautkan tindakan bantuan ke langkah/panel yang relevan dan kembalikan fokus dengan benar.
- Tampilkan pemecahan masalah langsung di error state, termasuk aksi coba ulang yang aman.

### Tahap 3 — Pusat bantuan dan pengukuran

- Buat halaman bantuan dengan artikel singkat, FAQ, pencarian, serta tautan ke fitur terkait.
- Tambahkan versi/tanggal pembaruan konten agar perubahan alur bisa ditelusuri.
- Kumpulkan umpan balik sederhana “Apakah panduan ini membantu?” tanpa menyimpan data video/transkrip.
- Catat event navigasi bantuan secara minim dan agregat, bila analitik produk telah disetujui.

## Kriteria penerimaan

- Naskah Indonesia dan Inggris menyampaikan kemampuan serta batas yang sama.
- Tidak ada instruksi lama yang hanya menyebut 9:16 jika pilihan rasio lain masih aktif.
- Panduan menjelaskan jalur subtitle berbeda antara YouTube dan file/Drive dengan benar.
- Angka format/ukuran/durasi/retensi bersumber dari konfigurasi aktif atau tampil dengan tanggal/versi.
- Pengguna bisa membuka bantuan sesuai konteks tanpa kehilangan input atau draf yang sedang dikerjakan.
- Setiap error penting memiliki penjelasan dan langkah pemulihan yang diuji terhadap perilaku aplikasi.
- Modal dapat dipakai dengan keyboard, memiliki judul dan fokus yang jelas, dan tetap terbaca pada viewport sempit.

## Rujukan pemeriksaan

- `src/App.tsx` — pemicu navigasi dan modal panduan, termasuk Escape dan pemulihan fokus.
- `src/i18n.ts` — naskah panduan ID/EN, pesan persetujuan, batas input, dan penjelasan skor.
- `src/components/InputPanel.tsx` dan `src/types.ts` — pilihan sumber, subtitle, format file, dan batas frontend.
- `src/components/ClipsPanel.tsx` — pencarian, filter, sortasi, penandaan, dan aksi membuka Studio.
- `src/components/StudioOverlay.tsx` — pengaturan framing, teks, subtitle, aset, dan ekspor.
- `backend/config.py`, `backend/main.py`, `backend/media.py` — batas runtime dan cleanup file/media.
- `docs/perencanaan/02-ALUR-KERJA.md` — ringkasan alur implementasi backend dan retensi.

Pemeriksaan ini membaca source dan dokumen pada checkout lokal. Panduan belum diuji dengan pengguna baru, pembaca layar, viewport mobile, atau skenario error end-to-end.
