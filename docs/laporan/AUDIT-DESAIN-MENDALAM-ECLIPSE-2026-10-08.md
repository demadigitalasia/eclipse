# A-10 — Audit Desain Mendalam ECLIPSE V.2

Tanggal: 8 Oktober 2026  
Ruang lingkup: arah visual, komposisi landing page, autentikasi, struktur dashboard, pola Studio/Admin, sistem token/CSS, konsistensi terhadap dokumen desain, serta aksesibilitas visual.  
Metode: inspeksi browser lokal untuk landing page dan register pada viewport desktop 1280 × 720; pembacaan implementasi React/CSS untuk halaman yang memerlukan sesi; pemeriksaan dokumen `05-DESAIN.md` dan audit visual sebelumnya.  
Status: skor dan temuan mencatat baseline sebelum perbaikan; tindak lanjut yang disetujui dicatat pada bagian akhir dokumen.

## Ringkasan eksekutif

**Skor desain keseluruhan: 68/100.** Fondasi teknis visualnya cukup baik: identitas korona amber di latar gelap sudah dikenali, Space Grotesk dan DM Sans digunakan sesuai peran, navigasi dan kontrol memakai bentuk yang konsisten, dan beberapa aturan aksesibilitas telah disediakan. Namun, hasil saat ini belum terasa sebagai produk penyuntingan video yang khas. Landing page memakai kerangka yang lazim untuk SaaS, dashboard mengulang pola kartu statistik umum, sedangkan elemen yang seharusnya membuat ECLIPSE berbeda—materi video, timeline, bentuk gelombang, dan hasil klip nyata—belum menjadi fokus.

Masalah visual paling jelas dan terverifikasi adalah hero landing page memakai grid dua kolom tetapi hanya merender kolom teks. Ruang kanan kosong pada tampilan browser. CSS masih menyimpan rancangan preview Studio yang tidak dipakai, sementara poster dan video hero di `public/` juga tidak digunakan. Akibatnya, headline dan CTA tampak kecil di tengah ruang yang seharusnya menjelaskan produk.

Kesimpulan praktis: desain tidak perlu diganti total. Pertahankan fondasi gelap dan korona amber, lalu bangun ulang hierarki halaman depan dan dashboard dengan bukti produk nyata. Setelah itu rapikan lapisan CSS serta konsistensi konten dan validasi viewport.

## Skor per area

| Area | Skor | Dasar penilaian |
|---|---:|---|
| Kekhasan identitas ECLIPSE | 61 | Palet dan logo konsisten, tetapi pola layout serta hero belum membedakan produk dari template SaaS AI. |
| Komposisi dan hierarki | 58 | Hero memiliki kolom kosong; informasi fitur, cara kerja, harga, dan FAQ disusun sebagai urutan landing page generik. |
| Konsistensi sistem desain | 65 | Token tersedia, tetapi stylesheet berisi aturan berulang, override, dan komponen mockup tak terpakai. |
| Kecocokan dengan produk | 68 | Bahasa produk sudah ada, tetapi visual utama belum menunjukkan proses pemilihan momen sampai ekspor. |
| Tipografi | 86 | Dua keluarga font memiliki peran jelas dan skala ukuran tersedia; hierarki teks masih dapat lebih terarah. |
| Warna dan kontras | 80 | Amber berfungsi sebagai identitas dan teks cukup terbaca pada halaman yang ditinjau; glow ungu dekoratif melemahkan aturan warna tunggal. |
| Usabilitas dan aksesibilitas | 68 | Kontrol dan fokus keyboard punya dasar; link logo di area `aria-hidden` adalah cacat yang terverifikasi. |
| Kesiapan responsif | 72 | Breakpoint untuk navigasi, admin, dan landing tersedia, tetapi audit ini belum memvalidasi hasil di viewport ponsel/tablet. |

Skor total adalah rata-rata berbobot: identitas 15%, komposisi 20%, konsistensi 15%, kecocokan produk 15%, tipografi 10%, warna 10%, aksesibilitas 5%, dan responsif 10%. Nilai ini merupakan rubrik audit desain, bukan metrik otomatis. Skor tipografi/warna berbeda dari A-07 karena A-07 menilai kepatuhan token dan implementasi font/warna secara statis, sedangkan A-10 menilai pengalaman desain keseluruhan dan tampilan browser.

## Tahap audit dan bukti

### 1. Arah visual dan identitas

Dokumen [05-DESAIN](../perencanaan/05-DESAIN.md) telah menetapkan dasar yang masuk akal: angkasa gelap, korona amber, satu motif gerhana, font display/body yang jelas, serta peran semantik untuk warna. Ini memberi ECLIPSE fondasi untuk tampak premium dan tenang.

Dalam implementasi, fondasi tersebut belum menjadi bahasa produk yang kuat. Permukaan, tombol pil, garis tipis, angka statistik, dan bagian fitur berupa teks adalah pola UI SaaS yang umum. Amber sendiri belum cukup membedakan aplikasi karena belum dipadukan dengan bentuk khas pekerjaan editing. Bagian auth juga menambah glow violet yang besar di latar kiri; violet lebih tepat disimpan untuk seleksi/status sekunder, bukan menjadi dekorasi merek tandingan.

**Rekomendasi:** jadikan urutan sumber → momen terpilih → timeline/waveform → klip vertikal sebagai motif visual yang berulang. Gunakan amber hanya untuk playhead, momen terpilih, atau aksi utama. Jaga violet untuk status terpilih dan status semantik sesuai token.

### 2. Landing page dan komposisi

**Temuan prioritas P1 — hero tidak lengkap.** `LandingPage.tsx` merender satu `.hero-copy` saja (baris 68–79), sedangkan `.hero--cinematic` menetapkan grid dua kolom dan tinggi minimum 500px (`styles.css` 709–720). Kolom kedua kosong saat dibuka pada 1280 × 720. Ada aturan `.hero-studio` dan mockup Studio di `styles.css` 721–755, tetapi tidak ada markup yang menggunakannya. `public/hero-eclipse-poster.png` dan `public/hero-eclipse.mp4` juga tidak dirujuk oleh source.

Ini menyebabkan area kosong yang besar dan membuat pesan produk terasa abstrak. Gambar/poster yang sudah tersedia dapat dipakai sebagai bahan awal, tetapi tampilan produk yang benar-benar berjalan akan lebih meyakinkan daripada mockup yang menampilkan data buatan.

**Temuan P2 — konten mengikuti pola template.** Setelah hero, landing page menampilkan tiga fitur, tiga langkah, satu paket harga, FAQ, dan footer. Susunan ini mudah dipindai, tetapi tiap bagian berbentuk teks berulang dan tidak menunjukkan bukti atau contoh proses ECLIPSE.

**Rekomendasi:** pilih satu dari dua keputusan desain: (a) pulihkan kolom kanan dengan cuplikan produk aktual yang menunjukkan sebuah video, momen terpilih, dan hasil klip; atau (b) ubah hero menjadi satu kolom yang sengaja disusun rapat dan hapus CSS mockup mati. Opsi (a) lebih kuat untuk membangun kepercayaan. Hindari skor, status AI, atau klaim performa yang tidak berasal dari data nyata.

### 3. Autentikasi dan konsistensi konten

Tampilan register yang diperiksa memiliki pembagian layar kiri/kanan dan form yang rapi, tetapi bahasa visualnya masih serupa halaman login SaaS standar. Sidebar kiri berisi logo, slogan, dan tiga benefit yang tidak memiliki hubungan visual langsung dengan alur produk.

**Temuan P1 — elemen fokus berada dalam area tersembunyi dari teknologi bantu.** `AuthPages.tsx` memberi `aria-hidden="true"` pada `<aside>` yang di dalamnya terdapat link logo ke beranda (baris 12–15). Link tersebut tetap dapat menerima fokus keyboard tetapi disembunyikan dari pembaca layar. Hapus link dari area dekoratif, atau jadikan area tersebut dapat diakses dan jangan sembunyikan seluruh aside.

**Temuan P2 — informasi pendaftaran kurang kontekstual.** Register selalu menyebut akun pertama menjadi administrator (`AuthPages.tsx` 174–176). Backend menolak pendaftaran ketika `allow_registration` mati (`backend/routes/auth.py` 16–21), dan default produksi memang mematikan pendaftaran (`backend/config.py` 57–60). Halaman tetap tampak mengundang pendaftaran, baru setelah submit pengguna mengetahui kebijakan server. Ini merusak kepercayaan dan terasa seperti status yang belum selesai.

**Rekomendasi:** saat pendaftaran dinonaktifkan, tampilkan keadaan akses yang jelas dan jalur menghubungi admin, bukan form aktif. Saat diaktifkan, tampilkan informasi bootstrap admin hanya jika itu memang perilaku yang dikehendaki untuk deployment tersebut. Rapikan panel kiri agar memakai materi produk yang nyata atau hilangkan panel itu pada layar sempit.

### 4. Dashboard, Studio, dan Admin

Dashboard yang ditinjau dari source hanya menyajikan jumlah video, jumlah klip, paket, dan satu tombol ke Studio (`DashboardPage.tsx` 20–40). Data utamanya nyata, tetapi susunan tiga kartu statistik ditambah CTA adalah pola generik. Riwayat tidak menjadi titik masuk utama, padahal pemrosesan video merupakan aktivitas inti.

Studio dan admin memakai pola panel gelap, border tipis, toolbar, badge, dan aksen amber yang selaras dengan token. Pola itu cukup konsisten, tetapi jika tiap fungsi dibungkus sebagai kartu serupa, hierarki antar tugas melemah. Dalam Studio, area kerja video/timeline seharusnya dominan; pengaturan, riwayat, dan status hanya mendukungnya. Admin seharusnya mengutamakan tabel/daftar yang mudah dipindai, lalu memakai panel untuk ringkasan atau tindakan terkait.

**Rekomendasi:** dashboard membuka dengan aksi lanjut yang kontekstual (misalnya pekerjaan terakhir bila tersedia), diikuti aktivitas/riwayat terbaru dan metrik pendukung. Studio harus memberi bobot visual terbesar pada media dan momen pilihan, bukan pada pembungkus panel. Pertahankan pola sidebar global yang sudah ditetapkan dan variasikan permukaan sesuai kepentingan konten.

### 5. CSS dan konsistensi implementasi

Token terpusat dan checker warna merupakan kekuatan yang patut dipertahankan. Namun, `styles.css` memuat lebih dari satu iterasi gaya: definisi dasar, bagian “homepage polish”, “homepage hidup”, “product studio hero”, serta aturan harga dan responsif. Contoh konkret: `.feature-card` dan `.how-card` mula-mula ditetapkan sebagai kartu berbatas/padat lalu langsung ditimpa menjadi latar transparan dengan garis atas (`styles.css` 592–598); aturan footer muncul di lebih dari satu tempat (605 dan 657). Sementara itu, kelompok `.studio-*` tidak mempunyai markup aktif pada halaman depan.

Token juga menyimpan banyak varian yang sangat dekat—misalnya beberapa tingkat `--brand-amber-border-*` dan `--surface-hover-*`. Ini membuat pemilihan token membingungkan dan perubahan visual mudah tidak seragam.

**Rekomendasi:** setelah arah visual diputuskan, rapikan CSS per komponen dan hapus aturan yang tidak digunakan. Gabungkan definisi tiap selector menjadi satu tempat. Kurangi token ke peran yang benar-benar dipakai (default, hover, selected, border, semantic), lalu jalankan pemeriksaan warna/build sebagai bagian dari verifikasi implementasi.

## Rencana rekomendasi bertahap

### Tahap 0 — Tutup cacat nyata

1. Perbaiki komposisi hero: tampilkan visual produk yang aktual atau tetapkan layout hero satu kolom.
2. Perbaiki `aria-hidden` yang mencakup link logo pada halaman auth.
3. Selaraskan layar register dengan konfigurasi pendaftaran server.

### Tahap 1 — Tegaskan identitas produk

1. Buat satu visual utama yang menunjukkan alur kerja ECLIPSE dengan bukti media nyata.
2. Gunakan bahasa visual editing video secara konsisten: timecode, frame, waveform, playhead, dan crop klip.
3. Susun landing page dari masalah pengguna, bukti hasil, cara kerja ringkas, lalu CTA. Pertahankan FAQ/harga hanya jika benar-benar membantu keputusan.

### Tahap 2 — Benahi hierarki aplikasi

1. Jadikan Studio/media sebagai pusat visual.
2. Jadikan dashboard berorientasi aktivitas dan kelanjutan pekerjaan.
3. Bedakan ringkasan, data, kontrol, dan status dengan jarak/typography, bukan menambah border dan warna.
4. Sederhanakan dekorasi auth dan simpan warna sekunder untuk status.

### Tahap 3 — Rapikan dan validasi sistem

1. Hapus CSS mockup mati dan aturan override/duplikat.
2. Pangkas alias token yang berdekatan setelah pemakaian dipetakan.
3. Tinjau ulang layar landing, auth, dashboard, Studio, dan admin pada desktop, tablet, dan ponsel.
4. Periksa fokus keyboard, pembaca layar, kontras teks kecil, empty/error/loading state, dan pengaturan reduced motion.

## Urutan prioritas

| Prioritas | Item | Dampak |
|---|---|---|
| P1 | Hero dua kolom dengan sisi kanan kosong | Kesan produk dan kualitas visual pada halaman pertama |
| P1 | Link fokus di dalam area `aria-hidden` | Aksesibilitas login/register |
| P1 | Status pendaftaran tidak diselaraskan dengan server | Kejelasan dan kepercayaan sebelum membuat akun |
| P2 | Dashboard hanya statistik dan CTA | Identitas aplikasi dan kemudahan kembali ke pekerjaan |
| P2 | Landing page teks generik tanpa bukti hasil | Diferensiasi dan kepercayaan |
| P2 | CSS berulang, override, mockup mati | Kecepatan iterasi dan konsistensi visual |
| P3 | Validasi visual ponsel/tablet dan state lain | Kepastian kualitas lintas kondisi |

## Hal yang sebaiknya dipertahankan

- Motif gerhana, latar gelap, dan amber sebagai aksen utama.
- Space Grotesk untuk display dan DM Sans untuk teks/UI.
- Ikon SVG terpusat, fokus yang terlihat, reduced motion, dan breakpoint responsif.
- Token warna dan pemeriksaan otomatis yang sudah ada.
- Sidebar aplikasi yang sudah ditetapkan dalam pedoman desain.

## Status tindak lanjut setelah persetujuan

Perbaikan berikut diterapkan setelah rekomendasi disetujui. Skor 68/100 di atas tetap menjadi baseline audit; belum dihitung ulang.

- **Hero:** grid kosong diganti komposisi editorial dengan motif gerhana dan garis potong. Visual ini merupakan elemen merek, bukan mockup atau hasil video contoh.
- **Sistem visual:** blok CSS mockup hero yang tidak dipakai, override berulang pada komponen landing, animasi dekoratif yang tidak diperlukan, serta token tanpa pemakaian dihapus.
- **Autentikasi:** link logo tidak lagi berada di dalam area `aria-hidden`. Form daftar mengambil status akses dari endpoint publik server dan menampilkan keadaan memeriksa, ditutup, atau gagal dimuat sebelum meminta data pengguna.
- **Dashboard:** kartu statistik generik diganti daftar riwayat analisis aktual, ringkasan akun, dan empty state yang mengarahkan ke Studio. Tautan riwayat membuka analisis terkait di Studio.
- **Verifikasi:** `npm run build` lulus, mencakup pemeriksaan warna, TypeScript, dan bundel Vite. Landing dan register ditinjau lagi di browser lokal; status register berhasil terbaca setelah API dimulai ulang.

Validasi viewport ponsel/tablet, halaman dashboard setelah login, dan pengujian pembaca layar masih belum dilakukan.

## Batas audit

Browser diperiksa pada landing page dan register pada desktop 1280 × 720. Dashboard, Studio, Admin, serta Settings ditinjau melalui implementasi source; sesi login aktif tidak tersedia untuk menginspeksi halaman tersebut di browser pada audit ini. Tampilan mobile/tablet, pengujian pembaca layar, dan pengukuran kontras overlay belum dilakukan. Karena itu, skor responsif dan aksesibilitas adalah penilaian awal dan perlu dikonfirmasi pada tahap 3.

## Berkas rujukan

- [Sistem desain yang berlaku](../perencanaan/05-DESAIN.md)
- [A-07 — Audit kerapihan, font, warna & poles](AUDIT-RAPIH-FONT-WARNA-POLES-ECLIPSE-2026-10-08.md)
- [A-09 — Audit kesehatan coding](AUDIT-KESEHATAN-CODE-ECLIPSE-2026-10-08.md)
