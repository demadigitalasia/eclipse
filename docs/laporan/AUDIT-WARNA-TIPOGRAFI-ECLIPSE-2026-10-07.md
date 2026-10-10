# Audit Warna dan Tipografi ECLIPSE V.2

Tanggal: 7 Oktober 2026  
Ruang lingkup: dokumen desain 05, `src/theme/tokens.css`, `src/styles.css`, komponen frontend, pemeriksa warna, dan halaman lokal ECLIPSE.

> **Snapshot historis:** audit ini merekam kondisi dan perubahan yang diperiksa pada 7 Oktober. Skor dokumen dan rekomendasi terbaru ada di [A-05 — audit lengkap dokumen](AUDIT-LENGKAP-DOKUMEN-ECLIPSE-2026-10-08.md); keputusan yang tercatat pada audit 8 Oktober sebelumnya ada di [A-03](AUDIT-DOKUMEN-ECLIPSE-2026-10-08.md).

## Ringkasan

| Area | Skor | Ringkasan |
|---|---:|---|
| Warna | 90/100 | Warna kini dipusatkan di token; pemeriksa menolak hex/RGB/HSL mentah dan lulus. Kontras teks putih di atas violet telah diperbaiki menjadi 4.99:1. |
| Tipografi | 86/100 | Space Grotesk dan DM Sans membentuk pasangan display/body yang jelas. Skala token sudah diterapkan, teks fungsional minimum 12 px, dan bobot 800 dibersihkan. Strategi font eksternal serta pemeriksaan viewport masih perlu ditinjau. |

**Kesimpulan:** sistem warna konsisten dengan keputusan palet dan aturan kontras. Tipografi mendapat skor 86 setelah skala ukuran diterapkan; sisa risiko adalah pemuatan font eksternal dan pemeriksaan layout lintas viewport.

## Metode dan batas audit

- Membandingkan aturan `docs/perencanaan/05-DESAIN.md` dengan token dan CSS yang dipakai frontend.
- Memindai deklarasi warna/font di `src` dan meninjau struktur halaman lokal melalui browser.
- Menghitung kontras relatif WCAG dari nilai token; angka ini perhitungan statis atas warna solid, bukan pengukuran screenshot atau transparansi berlapis.
- Setelah keputusan palet disetujui, warna hardcoded dipusatkan, pemeriksa warna diperluas, dan `npm run build` berhasil. Test suite tidak dijalankan.
- Audit ini tidak mencakup seluruh halaman pada ukuran desktop/mobile atau uji pengguna.

## Temuan warna

### Yang sudah baik

- Amber `#ffc24b`, latar gelap, dan teks warm membentuk identitas yang konsisten.
- Rasio kontras teks utama `#f4f1e8` terhadap empat lapis surface berkisar **13.72:1–17.84:1**.
- Teks muted `#a8a294` terhadap empat lapis surface berkisar **6.09:1–7.93:1**.
- Teks gelap tombol utama `#241300` di atas amber menghasilkan **11.19:1**.
- Teks putih `--on-violet` terhadap violet yang diperbarui `#8050e6` menghasilkan **4.99:1**, melewati ambang 4.5:1.

### Perbaikan warna yang sudah diterapkan

- Semua warna hex dan fungsi `rgb/rgba/hsl/hsla` di source dipindah ke token; pemindaian saat ini tidak menemukan warna mentah di luar `src/theme/tokens.css`.
- `scripts/check-colors.mjs` kini menolak hex dan fungsi warna mentah. `npm run check:colors` lulus.
- Peran token diselaraskan: brand amber, violet, success/mint, warning, danger, surface, overlay, dan video.
- `--lime`, alias `--amber`, duplikasi danger, serta aksen hijau lama pada scrollbar dihapus.
- Warna `--violet` digelapkan agar `--on-violet` memenuhi AA.

### Sisa pemeriksaan warna

- Tinjau transparansi overlay di atas konten nyata dan semua status UI pada viewport desktop serta ponsel; angka kontras di atas dihitung untuk warna solid.

## Temuan tipografi

### Yang sudah baik

- Space Grotesk untuk display dan DM Sans untuk body/UI memberi pembagian peran yang jelas. DM Sans dipilih sebagai pengganti Inter.
- Font control mewarisi font aplikasi. Angka diberi dukungan tabular di class `.tnum` dan beberapa label waktu.
- Ukuran hero memakai `clamp`, sehingga heading utama menyesuaikan viewport.

### Temuan yang perlu diperbaiki

1. **Skala sudah diterapkan ke 97 deklarasi ukuran statis.** Ukuran teks fungsional terkecil kini 0.75 rem/12 px; body/UI utama dipetakan ke 14–16 px.
2. **Bobot 800 dihapus.** Bobot `.studio-project-name span` kini 700 sesuai rentang font yang dimuat.
3. **Font masih dimuat dari Google Fonts.** Jika koneksi gagal, fallback system-ui dapat mengubah lebar teks dan wrapping; opsi self-host masih terbuka.
4. **Layout belum diperiksa setelah skala diterapkan.** Metadata preview Studio kini lebih terbaca, tetapi perlu ditinjau pada viewport sempit untuk memastikan tidak terpotong atau bertumpuk.

## Rekomendasi

### P0 — Sistem warna (selesai)

- Warna source memakai token dan guard menangkap hex/RGB/HSL mentah.
- Identitas, semantic roles, dan kontras teks violet mengikuti keputusan pengguna.

### P1 — Tipografi (perbaikan dasar selesai)

- Verifikasi kombinasi warna aksen pada konten nyata, termasuk status dan overlay transparan.
- Skala 12–32 px dan batas minimum untuk label fungsional sudah ditetapkan di token serta dokumen desain.
- Kurangi jumlah warna aksen yang tampil bersamaan. Pakai amber untuk tindakan utama, violet untuk seleksi/status yang sudah ditetapkan, mint untuk sukses, dan merah untuk bahaya.

### P2 — Tinjau layout responsif dan pemuatan font

- Tinjau hasil skala 12–32 px di layar desktop dan ponsel; koreksi jika ada label terpotong atau hirarki heading yang terlalu rapat.
- Selaraskan line-height komponen berdasarkan review visual.
- Putuskan apakah Google Fonts tetap dipakai atau font di-host lokal; pastikan fallback menjaga layout saat jaringan tidak tersedia.
- Tinjau landing, Studio, akun, dan admin pada desktop serta ponsel, termasuk hover/focus, disabled, error, dan konten panjang.

## Urutan kerja yang disarankan

1. Tinjau overlay transparan dan status warna pada halaman desktop/mobile.
2. Tinjau skala tipografi yang baru pada desktop dan ponsel.
3. Putuskan strategi pemuatan font lokal atau eksternal.

## File yang ditinjau

- `docs/perencanaan/05-DESAIN.md`
- `src/theme/tokens.css`
- `src/styles.css`
- `scripts/check-colors.mjs`
- `index.html`
