# Audit Dual Bahasa ECLIPSE — 10 Oktober 2026

## Ringkasan eksekutif

Status lokalisasi aplikasi saat ini **parsial dan tersebar**. ECLIPSE sudah menyediakan Bahasa Indonesia dan English, menyimpan pilihan bahasa di `localStorage`, serta memiliki dua katalog yang masing-masing berisi 243 dan 215 kunci per bahasa. Namun, katalog belum menjadi sumber tunggal untuk seluruh teks UI: terdapat setidaknya **412 baris source** yang memuat pola pemilihan bahasa inline (`lang === 'id' ? ...`, `isId ? ...`, dan sejenisnya), belum termasuk string Indonesia yang hanya ditulis langsung. Angka ini adalah hitungan baris hasil pencarian, bukan jumlah semua ekspresi atau jumlah kata.

Area yang paling berisiko adalah Studio, panel admin/akun, pembayaran, dan pesan kesalahan. Akibatnya, perubahan bahasa dapat menghasilkan campuran Indonesia–English, pesan error server tidak selalu mengikuti bahasa terpilih, dan terminologi berpotensi berbeda antarhalaman.

**Rekomendasi utama:** konsolidasikan katalog menjadi sumber terjemahan terpusat dan bertipe; pindahkan semua teks UI ke katalog; format angka/tanggal melalui helper locale; dan ubah kontrak error API agar UI menerjemahkan kode error, bukan menampilkan kalimat dari server secara langsung. Lakukan migrasi bertahap per alur. Audit ini hanya menulis laporan dan tidak mengubah aplikasi.

## Cakupan dan metode

Pemeriksaan statis mencakup:

- katalog bahasa `src/i18n.ts` dan `src/site-i18n.ts`;
- state/persistensi bahasa serta pemformatan locale di shell dan halaman;
- penggunaan terjemahan pada halaman utama dan komponen;
- teks inline dan string UI yang masih tertanam pada komponen;
- jalur error API frontend dan envelope error backend.

Ini bukan pemeriksaan visual seluruh route dalam browser. Pada tahap audit awal, perubahan hanya dilakukan pada laporan. Tindak lanjut implementasi setelah persetujuan dicatat di bagian akhir dokumen ini.

## Temuan terperinci

### 1. Dua katalog dengan pembagian yang tidak jelas — P1

- `src/i18n.ts` berisi 243 kunci untuk masing-masing bahasa dan terutama melayani Studio serta panduan.
- `src/site-i18n.ts` berisi 215 kunci untuk masing-masing bahasa dan melayani landing, autentikasi, dashboard, langganan, dan sebagian akun.
- Beberapa halaman mengimpor keduanya. Contohnya `src/pages/AccountPages.tsx` mengambil `getSiteStrings` dan `getStrings`; `src/App.tsx` juga memakai katalog situs untuk shell dan katalog utama untuk panduan.
- Key count yang sama di dalam masing-masing berkas menunjukkan keseimbangan jumlah kunci ID/EN, tetapi **tidak membuktikan** bahwa setiap pasangan terjemahan akurat, konsisten, atau semua teks UI sudah masuk katalog.

**Dampak:** penulis perlu tahu katalog mana yang harus diubah; key dapat tumpang tindih atau berbeda gaya; halaman lintas area mudah mencampur sumber terjemahan.

### 2. Teks bahasa masih tertanam di komponen — P1

Pencarian source menemukan 412 baris yang mengandung pola pemilihan bahasa inline. Sebaran baris tersebut:

| Berkas | Baris dengan pola bahasa inline |
| --- | ---: |
| `src/pages/AccountPages.tsx` | 174 |
| `src/pages/LandingPage.tsx` | 58 |
| `src/components/GeminiApiPanel.tsx` | 42 |
| `src/components/PaymentCheckout.tsx` | 36 |
| `src/components/ProxySettingsPanel.tsx` | 35 |
| `src/App.tsx` | 19 |
| `src/pages/SubscriptionPage.tsx` | 19 |
| `src/pages/DashboardPage.tsx` | 18 |
| `src/components/NotificationBell.tsx` | 10 |
| `src/pages/StudioPage.tsx` | 1 |
| **Total baris** | **412** |

Sebagian hit ini juga mencakup pemformatan locale atau teks turunan dari status, jadi bukan 412 label unik. Meski demikian, jumlahnya menunjukkan banyak komponen memegang tanggung jawab menerjemahkan sendiri.

Contoh yang terkonfirmasi:

- `src/App.tsx:216-222,249,289-322` — nama navigasi Admin, Panduan pengguna, aksesibilitas tombol bahasa, label pengguna, dan notifikasi pembayaran inline.
- `src/components/PaymentCheckout.tsx:25-177` — status transaksi, validasi file, seluruh label QRIS, promo, total, instruksi, dan konfirmasi inline.
- `src/components/GeminiApiPanel.tsx:40-105` dan bagian sesudahnya — state admin Gemini serta notifikasi/form menggunakan ternary bahasa di komponen.
- `src/pages/AccountPages.tsx` — banyak label, status, dialog, aksi admin, promo, dan pengaturan diterjemahkan inline; bagian admin pembayaran tampak antara lain pada `:690-697`.

### 3. Studio Overlay memiliki banyak teks Indonesia langsung — P1

`src/components/StudioOverlay.tsx` menerima `t`, tetapi banyak teks yang tampil masih berupa literal. Contoh terukur pada area render Studio:

- `:1055-1072` — tombol kembali “Input”, “FORMAT EKSPOR”, label tab “Pratinjau/Pengaturan”, dan `aria-label` “Tampilan Studio”.
- `:1112,1129-1134` — instruksi crop, posisi X/Y, panduan aman, nama layer, dan label aksesibilitas.
- `:1335-1352` — pengaturan gaya subtitle, font/efek/animasi, warna dan kontras, serta label pemilih warna.
- `:1443-1504` — pengaturan watermark, unggah, posisi, nama file, akselerasi render, dan keterangan encoder.
- `:1539-1578` — ringkasan ekspor, status render, dan instruksi ekspor masih mengandung literal/status Indonesia.
- Di luar JSX, `:474-486,570-587,826,885-930` memuat validasi, error, dan notifikasi yang juga ditampilkan ke pengguna.

**Dampak:** pengguna EN dapat melihat panel utama berbahasa Inggris tetapi kontrol Studio, error, atau status render tetap berbahasa Indonesia. Ini merupakan gap terbesar pada pengalaman inti produk.

### 4. Error API/backend mengirim kalimat, bukan hanya kode — P1

- `src/api.ts:77-92` meneruskan `detail.message` dan `detail.hint` dari backend langsung ke caller. Validasi lokal di `src/api.ts:55-72,82` juga memiliki pesan Indonesia.
- `backend/core/errors.py:37-43` membuat envelope `{code, message, hint}`, tetapi tidak mengikat bahasa pada locale permintaan.
- Rute backend sering mengirim kalimat Indonesia; misalnya `backend/main.py:979-1008` menyimpan dan mengembalikan pesan pipeline secara langsung. Banyak rute lain mengikuti pola serupa.
- Beberapa halaman menangkap `cause.message` apa adanya. Contohnya `PaymentCheckout.tsx`, `GeminiApiPanel.tsx`, dan `StudioOverlay.tsx`.

**Dampak:** bahasa error ditentukan oleh asal pesan, bukan pilihan pengguna. Detail exception mentah juga dapat berubah-ubah dan tidak cocok dijadikan teks produk.

### 5. Istilah dan sumber terjemahan berpotensi tidak konsisten — P2

Katalog maupun inline copy mencampur istilah seperti “file/berkas”, “unggah/upload”, “subtitle/subtitel”, “render/ekspor”, “admin/Hub Admin”, dan “batch generate”. Sebagian mungkin sengaja dipertahankan sebagai istilah teknis, tetapi belum tampak ada glossary atau aturan penamaan terpusat. Konsistensi plural, kapitalisasi, tanda baca, dan nada English perlu ditinjau setelah sumber teks disatukan.

### 6. Locale dasar sudah ada, tetapi perlu dibakukan — P2

- `Lang` dibatasi ke `'id' | 'en'` di `src/types.ts:51`.
- `src/App.tsx:418-421` membaca dan menyimpan pilihan di `localStorage` (`eclipse_lang`). Jadi preferensi tetap berlaku setelah reload pada browser yang sama.
- Beberapa tempat memanggil `Intl.NumberFormat` dan `Intl.DateTimeFormat` secara terpisah. Contoh di `DashboardPage.tsx`, `SubscriptionPage.tsx`, `PaymentCheckout.tsx`, serta halaman akun.

**Dampak:** locale formatting berpotensi berbeda antarfitur (terutama tanggal/jam, pemisah desimal, plural, dan currency), sekalipun label diterjemahkan dengan benar. Format `Rp` sendiri merupakan keputusan mata uang produk yang dapat tetap IDR saat UI English, tetapi format nominal/tanggal sebaiknya konsisten.

## Bagian yang sudah berjalan baik

- Tipe bahasa eksplisit hanya menerima `id` atau `en`.
- Pilihan bahasa disimpan dan diterapkan melalui state aplikasi.
- Katalog berupa objek TypeScript dengan tipe turunan sehingga akses ke key tertentu dapat diperiksa compiler.
- Komponen seperti `InputPanel`, `ClipsPanel`, `HistoryPanel`, `YouTubeCookiesControl`, dan halaman autentikasi sudah banyak menggunakan objek terjemahan, jadi tersedia pola migrasi yang dapat diperluas.
- Backend telah memiliki kode error terstruktur dan daftar kode di `backend/core/errors.py`; ini dasar yang baik untuk memisahkan identitas error dari teks lokal.

## Rekomendasi arsitektur

### A. Jadikan satu API katalog sebagai sumber tunggal

Gunakan satu modul lokalisasi dengan namespace berdasarkan domain, misalnya `common`, `navigation`, `studio`, `account`, `billing`, `admin`, `errors`, dan `guide`. Bisa tetap dipecah menjadi beberapa file fisik untuk pemeliharaan, tetapi ekspor publiknya satu API `t(lang)`/`getStrings(lang)` dan semua key mempunyai pasangan ID/EN.

Hindari menjadikan satu objek monolitik yang sulit dipelihara; tujuan konsolidasi adalah kontrak dan cara akses tunggal, bukan harus satu file raksasa.

### B. Pindahkan semua copy UI ke katalog

Label, helper, placeholder, pesan toast, status, error, dialog konfirmasi, teks kosong, judul aksesibilitas, `aria-label`, `title`, dan alt text UI harus menggunakan key katalog. Nilai pengguna, nama video, teks subtitle hasil AI, ID transaksi, kode enum/protokol, merek, nama font/codec, URL, dan angka dinamis bukan copy UI yang perlu diterjemahkan—tetap gunakan data/enum yang semestinya.

### C. Gunakan parameter/interpolasi dan plural yang terencana

Hindari merangkai fragmen kalimat di JSX. Buat value terformat atau fungsi terjemahan berparameter untuk jumlah klip, status file, batas ukuran, nama paket, dan durasi. Bila katalog tetap berupa TypeScript, pastikan fungsi ID/EN mempunyai signature yang sama. Untuk pertumbuhan bahasa/aturan plural, evaluasi ICU MessageFormat/FormatJS.

### D. Pisahkan kode error dari pesan

Backend mengirim `code`, parameter aman, dan status; frontend memilih kalimat dari `errors.*` sesuai `lang`. Gunakan pesan backend berbahasa manusia hanya sebagai fallback teknis yang dinetralkan, dan jangan menampilkan exception mentah pada UI umum. Untuk error validasi dengan konteks (misalnya batas file), kirim parameter terstruktur agar UI membentuk kalimat lokal.

### E. Sentralisasikan pemformatan locale

Tambahkan helper untuk tanggal, waktu, angka, durasi, ukuran file, dan nominal uang yang menerima `lang`. Tentukan eksplisit mata uang produk: bila pembayaran selalu rupiah, gunakan IDR untuk ID maupun EN namun label, tanggal, dan pemisah digit tetap sesuai locale; bila suatu hari multi-currency, gunakan mata uang data transaksi.

### F. Cegah regresi dengan pemeriksaan otomatis

- Pastikan key set ID dan EN sama.
- Tolak key terjemahan yang kosong dan tipe parameter yang berbeda.
- Tambahkan pemeriksaan/lint yang menandai ternary bahasa inline dan literal UI non-ASCII di JSX area aplikasi, dengan pengecualian yang eksplisit untuk konten data/teknis.
- Buat smoke test untuk mengganti bahasa di tiap route utama, modal, status loading/error/empty, dan kontrol aksesibilitas.
- Tambahkan pemeriksaan snapshot/string rendering untuk Studio, billing, akun, dan admin; jangan bergantung hanya pada screenshot satu route.

## Urutan pelaksanaan yang disarankan

1. **Fondasi lokalisasi (prioritas tertinggi):** definisikan API tunggal/namespace, glossary ID–EN, interpolasi, helper locale, serta renderer error berbasis kode. Sepakati fallback dan mata uang.
2. **Studio:** pindahkan semua literal StudioOverlay, termasuk state/error/aria-label; verifikasi seluruh langkah Studio dalam ID dan EN. Ini alur inti dan area gap terlihat terbesar.
3. **Akun, admin, Gemini, proxy, notifikasi, pembayaran:** migrasikan 412 baris pola inline menurut domain. Pertahankan status bisnis dan data server sebagai nilai, tetapi petakan labelnya lewat katalog.
4. **Landing, dashboard, langganan, auth, shell, panduan:** rapikan pola inline, samakan terminologi, serta sentralisasikan tanggal/angka.
5. **Quality gate:** jalankan pemeriksaan key parity, lint literal, smoke test seluruh route, dan telaah native/keyboard screen reader dalam kedua bahasa.

Pekerjaan migrasi sebaiknya dilakukan per kelompok alur dan mempertahankan perilaku/layout. Jangan mengubah API kontrak error sekaligus tanpa fallback, karena client dan backend harus diperbarui secara kompatibel.

## Kriteria selesai yang disarankan

- Semua copy UI aplikasi tersedia dalam ID dan EN melalui katalog; tidak ada kalimat UI yang memilih bahasa dengan ternary tersebar.
- Mengganti bahasa mengubah label, hint, empty/loading/error, dialog, tooltip, dan nama aksesibilitas tanpa reload dan tetap tersimpan setelah reload.
- Semua error backend yang dikenal dipetakan ke terjemahan UI; pesan teknis tak dikenal mempunyai fallback EN/ID yang jelas dan tidak memunculkan campuran bahasa tak sengaja.
- Tanggal, waktu, angka, durasi, dan ukuran konsisten; format mata uang sesuai keputusan produk.
- Jumlah/key parity dan pemeriksaan literal/inline masuk ke quality gate agar perubahan berikutnya tidak mengembalikan hardcoded copy.

## Batas audit

Temuan berasal dari pencarian dan pembacaan source, bukan pengujian runtime per route. Sebagian pola inline adalah locale formatting, identifier aksesibilitas, nilai pilihan, atau konten dinamis; hitungan 412 baris tidak boleh dibaca sebagai jumlah string yang pasti perlu dipindah. Akurasi linguistik setiap pasangan di katalog juga belum ditelaah baris demi baris.

## Tindak lanjut implementasi setelah audit

Implementasi awal dilakukan setelah pengguna menyetujui rekomendasi:

- Menambahkan `src/localization.ts` sebagai pintu masuk bersama untuk katalog aplikasi, situs, terjemahan copy yang dipindahkan, pemformatan locale, dan pesan error.
- Memindahkan 427 ekspresi pemilihan bahasa yang cabangnya berupa string statis dari 10 berkas React. Pasangan yang sama dipakai ulang, menghasilkan 350 entri copy di `src/inline-copy.ts`. Ekspresi untuk kelas CSS dan format locale yang bukan copy UI dikembalikan ke kondisi khususnya.
- Memindahkan label dan instruksi checkout QRIS ke katalog `src/i18n.ts`.
- Menambahkan pemetaan pesan error Studio berdasarkan kode supaya pesan server tidak langsung ditampilkan di jalur Input/Studio dan checkout.
- Memindahkan sebagian label shell dan rute admin ke katalog situs.
- Memusatkan pemilihan locale tanggal/angka ke helper `getLocale` untuk pemakaian lintas halaman.

Pemeriksaan `npx tsc --noEmit --pretty false` berhasil setelah perubahan tersebut. Belum ada pengujian interaksi atau peninjauan visual browser.

Migrasi belum tuntas. Ternary dengan interpolasi dinamis masih ada, terutama di ringkasan paket/kuota; `StudioOverlay` juga masih memiliki literal UI Indonesia yang perlu pasangan English dan pemindahan ke katalog. Sejumlah area akun/admin, Gemini, proxy, notifikasi, dan backend masih meneruskan pesan kalimat langsung. Entri `copy_*` yang dihasilkan otomatis sudah terpusat, tetapi perlu ditata ulang menjadi key domain yang mudah dirawat, seperti `account.*`, `billing.*`, dan `admin.*`. Lanjutkan dari sisa temuan tersebut sebelum menyatakan UI sepenuhnya bebas dari hardcoded copy.
