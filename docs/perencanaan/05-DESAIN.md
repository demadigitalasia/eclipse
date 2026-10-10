# 05 — Sistem Desain ECLIPSE V.2 ("Total Eclipse")

Pedoman visual/interaksi frontend. Referensi terhadap demo, kredensial lokal, dan ringkasan prototipe di bawah mencatat desain awal dan bukan status implementasi sekarang; lihat dokumen 02 dan 04 untuk perilaku aktual.

## Identitas

Korona amber (`#ffc24b → #ff7a2c`) di angkasa hitam (`#060709`), teks warm (`#f4f1e8`). Satu-satunya motif: **cincin gerhana** (komponen `EclipseMark`, ID gradient unik). Tidak ada maskot, tidak ada ilustrasi stok.

## Token (`src/theme/tokens.css` — satu-satunya sumber)

bg/surface 4 lapis, border, brand-amber/ink/wash, violet/dim/soft, corona/light, success, warning, danger/dim/soft, text/muted/faint, overlay/scrim, radius 16/10, shadow, font display Archivo + body/UI IBM Plex Sans.

## Aturan desain

Build menjalankan `scripts/check-colors.mjs` lewat `npm run check:colors`. Semua warna kode harus memakai `var(--...)` dari token; nilai hex, `rgb/rgba`, dan `hsl/hsla` mentah hanya berada di `src/theme/tokens.css`. `EclipseMark` dan background video juga memakai token.

1. Tidak ada warna mentah di luar `tokens.css`.
2. Dark-only. Tidak ada light mode.
3. Teks kecil (<0.8rem) minimal kontras 4.5:1 → pakai `--muted`, bukan `--faint`.
4. Peran warna: amber untuk identitas/aksi utama; violet untuk seleksi/status sekunder; mint untuk sukses; merah untuk bahaya; abu-abu untuk informasi netral. Teks di atas warna aksen mencapai kontras minimal 4.5:1.
5. Badge skor 3-tier: ≥90 amber solid, 70–89 violet tint, <70 abu-abu. Filter "medium" = 70–89.

## Tipografi (konsisten)

- Display: Archivo 400–700 — heading, skor, angka besar, CTA.
- Body/UI: IBM Plex Sans 400–700 — semua teks lain; `button/input/select/textarea` ikut `font: inherit`.
- Skala ukuran bersama memakai token `--type-xs` (12 px), `--type-sm` (14 px), `--type-base` (16 px), `--type-lg` (18 px), `--type-xl` (24 px), dan `--type-2xl` (32 px). Heading responsif boleh memakai `clamp()`.
- Teks fungsional minimal 12 px; body/UI utama memakai minimal 14 px. Jangan gunakan ukuran yang lebih kecil untuk menyampaikan label, status, atau waktu.
- Angka waktu/skor: `font-variant-numeric: tabular-nums` (class `.tnum` tersedia).
- Bobot di luar 400–700 dilarang; dilarang `font-family` mentah di luar token; dilarang font ketiga tanpa keputusan desain.

Reveal-on-scroll sekali (IO, stagger 0.08s), count-up easing, marquee mask-tepi, heat-draw trace, tilt mock ±5°, shine CTA 4.5s, orb drift, karaoke caption, kata berputar 2.4s. Semua `transform/opacity` saja; semua tunduk `prefers-reduced-motion`.

## Daftar "jangan"

- Jangan tambah lapis CSS baru; jangan `!important` (kecuali darurat tercatat).
- Jangan bawa komponen mati; jangan testimoni fiktif (ganti demo interaktif).
- Jangan klaim skor = jaminan viral.
- Jangan putus rantai fokus: modal overlay `aria-modal` + Esc menutup + fokus kembali ke pemicu.

## Skala tombol (konsisten)

- Ukuran: xs 30 (mini/chip) / sm 36 (ghost/nav) / md 44 (primary/secondary default) / lg 52 (hero CTA).
- Radius aksi 12 (primary) / 10–12 (secondary/ghost); pil 999 HANYA untuk tag (chip/filter/skor/hook).
- Interaksi seragam: hover angkat+glow (primer) / border (sekunder); `:active scale(.98)`; disabled `opacity .5 + not-allowed` di semua varian.
- Font primer display 0.95rem; tombol sebaris wajib satu tinggi (min-height, bukan padding saja).

## Pola auth (konsisten)

- Split-screen: panel gerhana kiri (brand + headline + 3 capability), form kanan 440px.
- Field sandi memakai tombol toggle dengan ikon SVG dari `Icon.tsx`; tombol submit + Enter; loading di tombol; error `role="alert"` + fokus otomatis.
- Register: indikator kekuatan 3 tingkat. Email reset belum dikonfigurasi; layar lupa sandi menyatakan keterbatasan dan tidak mengklaim email terkirim.
- Tidak ada kredensial demo/default yang ditampilkan. Akun dan sesi disimpan oleh backend.

## Ikon (konsisten)

- Satu sumber: `src/components/Icon.tsx` — 24 viewBox, stroke `currentColor` 1.8, round caps. Ukuran default 16.
- Tombol ikon-only wajib SVG (jangan emoji — render beda tiap OS).
- Glif teks yang diizinkan sebagai pemisah/label: `→ ← • + − ✓` (tipografi, bukan ikon).
- Logo gerhana terpisah di `EclipseMark.tsx`.

## Pola admin (konsisten)

- Aksi destruktif selalu modal konfirmasi (nama target + Batal/Hapus + Esc).
- Tabel → kartu di ≤760px via `data-label` (jangan scroll horizontal mentah).
- Proteksi: diri sendiri + admin terakhir tidak bisa dihapus/diturunkan, dengan pesan jelas.
- Setiap perubahan role/hapus tercatat di tab Aktivitas (siapa, kapan, apa) — siap pindah ke backend.

## Pola admin lanjutan

- Bulk: checkbox header + hapus massal dengan konfirmasi jumlah + batal pilih.
- Detail user: klik nama → drawer info + aktivitas user tersebut.
- Sukses selalu toast/notice (jangan hanya error); log bisa diekspor JSON + dibersihkan.
- Pengelolaan paket belum tersedia; MVP beroperasi dengan kuota Free.

## Pola sidebar (rail)

- Tiap link punya ikon (`Icon`) + label; state aktif `aria-current="page"` memakai token amber yang sesuai peran.
- User chip = tautan ke Pengaturan, dengan avatar inisial di surface netral/amber; jangan gunakan warna lime atau gradien sebagai aksen terpisah.
- Mobile: drawer + backdrop (klik-luar/Esc menutup); toggle menu memakai SVG dari `Icon.tsx`, label aksesibel, dan `aria-expanded`.
- Logout selalu modal konfirmasi (perangkat bersama).

### Navigasi Admin (diterapkan di frontend 8 Oktober 2026)

Sidebar aplikasi memuat Dashboard, Studio, Pengaturan, dan grup Admin untuk role admin. Grup Admin memakai route langsung dan tetap berada di sidebar global, bukan sidebar kedua.

Struktur menu Admin:

1. **Ringkasan** — saat ini jumlah akun dan event audit dari server. Statistik job, biaya provider, dan kesehatan pool belum diekspos oleh API.
2. **Pengguna & role** — pencarian, filter, detail, perubahan role, dan tindakan akun.
3. **Gemini API** — pool key/project, status, tes koneksi, dan failover per project. Meter biaya belum tersedia.
4. **Aktivitas** — audit admin dan kejadian sistem.
5. **Pengaturan sistem** — batas video, retensi, kuota, dan kebijakan sumber setelah keputusannya ditetapkan.
6. **Proxy/Egress** — admin mengelola URL proxy HTTP/HTTPS terenkripsi di server dan dapat menguji IP egress. Proxy digunakan untuk ingest metadata, subtitle, dan media; sumber yang tidak dapat diunduh tetap ditolak.

Setiap submenu aktif memiliki URL langsung, state aktif, guard role di frontend, dan judul halaman. Backend memeriksa role untuk operasi admin. Statistik job dan biaya provider belum tersedia.

## Panel admin pool API

- Admin dapat menambah beberapa kredensial provider, mengaktifkan/menonaktifkan, dan mengganti key. Contoh lima entri bukan batas produk.
- Setelah disimpan, tampilkan alias, project, status, dan waktu tes; rahasia hanya ditampilkan saat input dan tidak pernah dipantulkan kembali.
- Keadaan pool meliputi sehat, sedang backoff, perlu perhatian, dan nonaktif. Jangan menampilkan sisa kuota presisi jika provider tidak menyediakannya.
