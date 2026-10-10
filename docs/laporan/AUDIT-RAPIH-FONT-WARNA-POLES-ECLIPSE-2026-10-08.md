# A-07 — Audit Kerapihan, Font, Warna & Poles ECLIPSE

Tanggal: 8 Oktober 2026
Ruang lingkup: `src/theme/tokens.css`, `src/styles.css`, `src/components/Icon.tsx`, `scripts/check-colors.mjs`, `index.html`, dan pemakaian font/warna/glif di seluruh `src/`.
Jenis audit: pemeriksaan statis + grep; bukan uji visual lintas viewport (tetap bagian R1).

## Ringkasan skor

| Area | Skor | Ringkasan |
|---|---:|---|
| Kerapihan | 82/100 | Aturan token dipatuhi guard; tersisa kode mati, inline-style berulang, dan class tak terpakai |
| Font | 88/100 | Peran display/body benar, skala token dipakai penuh, tanpa px/bobot liar; tracking belum ditokenisasi, `.tnum` tak terpakai |
| Warna | 91/100 | Guard lulus, peran semantik konsisten; 2 pemakaian `--faint` melanggar aturan teks kecil |
| Poles | 84/100 | State demo jujur dan aksesibilitas dasar ada; 2 tombol ikon masih glif teks, chevron bukan SVG |

**Kesimpulan:** fondasi visual sehat dan lolos guard. Tidak ada pelanggaran berat; temuan adalah inkonsistensi kecil yang bisa ditutup dalam satu putaran poles sebelum R1.

## Temuan

### P0 — Pelanggaran aturan 05 (perbaiki dulu)

1. **`--faint` pada teks kecil (<0.8rem).** Aturan 05: teks kecil wajib `--muted` (kontras 4.5:1).
   - `src/styles.css:408` `.status--idle` (`--type-xs` 12px) memakai `--faint`.
   - `src/styles.css:745` `.studio-project-name b` memakai `--faint` pada label kecil.
   - Pemakaian `--faint` lain (`.helper`, placeholder, empty-state di 14px) masih dalam batas aturan, tetapi kontrasnya di atas konten nyata belum diukur ulang sejak revisi — verifikasi saat R1.
2. **Tombol ikon-only memakai glif teks, bukan SVG** (aturan 05).
   - `src/pages/AccountPages.tsx:236` tombol batal pilih `✕` (mini-btn ikon-only).
   - `src/pages/DemoPage.tsx:18` tombol tutup banner `✕` (mini-btn ikon-only, ada aria-label).
   - Ganti keduanya dengan `Icon name="x"`.
3. **Chevron sidebar bukan SVG.** `src/App.tsx:105` memakai karakter `⌄` (aria-hidden). Set ikon `Icon.tsx` tidak memiliki chevron — tambah `chevronDown` dan pakai di sini.

### P1 — Konsistensi & kerapihan

4. **Class `.tnum` tidak pernah dipakai.** Didefinisikan di `src/styles.css:240`, tetapi tidak ada satu pun `tnum` di tsx. Sementara `.score` (`styles.css:361`), waktu klip (`.clip-meta`), dan `.stat-num` (`:515`) tidak memakai `tabular-nums` — angka skor/waktu bisa bergeser lebar saat berubah. Terapkan `.tnum` ke ketiganya, atau hapus class bila memang tak dibutuhkan.
5. **Skala tracking liar: 13 nilai berbeda, tanpa token.** Ditemukan `-0.04, -0.02, 0.02, 0.03, 0.04, 0.05, 0.055, 0.06, 0.08, 0.09, 0.14, 0.22, 0.3em`. Saran token: `--track-tight: -0.02em`, `--track-label: 0.05em`, `--track-eyebrow: 0.14em`, dan petakan ulang.
6. **Kode mati di penjaga warna.** `scripts/check-colors.mjs:22` `HEX_RE` tidak dipakai (sudah menjadi warning lint). Hapus.
7. **Celah checker: named colors.** Regex hanya menangkap hex dan fungsi warna; `transparent`, `currentColor`, atau nama warna lolos tanpa token. Hari ini yang dipakai hanya `transparent` (wajar), tetapi perluas regex atau daftarkan pengecualian eksplisit agar aturan "satu-satunya sumber" benar-benar tertutup.
8. **Inline-style berulang.** Pola `style={{ marginTop: 12, justifyContent: 'flex-end' }}` muncul 4x untuk aksi modal (`AccountPages.tsx`), dan `<div style={{ height: 10 }} />` dipakai sebagai spacer di beberapa panel. Ganti dengan class `.modal-actions` dan gap token agar satu perubahan menjangkau semua.
9. **`text-transform: capitalize` pada `.stat-num`** (`styles.css:515`) membuat paket tampil "Free"/"Pro" di dashboard sementara tempat lain lowercase (`free`/`pro`). Seragamkan: tampilkan nilai apa adanya, atau buat label paket khusus.

### P2 — Keputusan & verifikasi tertunda

10. **Font masih eksternal** (`index.html:8-10` Google Fonts). Item terbuka sejak A-02: putuskan self-host vs eksternal + fallback, karena memengaruhi wrapping saat offline.
11. **Radius kecil 6px** (`styles.css:752` label studio) di luar skala aksi 10–16px pada 05. Pertimbangkan token `--radius-xs` atau samakan ke 10px.
12. **Overlay transparan + status di atas konten nyata** belum ditinjau visual (dicatat sejak A-02). Masukkan ke checklist R1.

## Hal yang sudah baik (pertahankan)

- Seluruh `font-family` memakai `var(--font-*)`; nol `font-size` px; nol bobot di luar 400–700.
- Guard warna lulus; peran amber/violet/mint/merah/abu konsisten di token dan komponen baru (consent, notice demo, badge batch).
- Glif `→ ← • + − ✓` dipakai sesuai izin 05; `…`, em-dash, `·` dipakai tipografis dengan benar.
- `:focus-visible`, `prefers-reduced-motion`, dan breakpoint responsif tersedia di CSS.
- Tidak ada warna mentah, emoji, atau maskot di luar aturan.

## Rekomendasi urutan kerja

1. Tutup P0 (tiga file, tanpa perubahan desain): `--muted` untuk 2 selektor, `Icon x` untuk 2 tombol, tambah + pakai `chevronDown`.
2. Tutup P1 no. 4–5 dan 8–9 dalam satu sentuhan CSS + hapus `HEX_RE`.
3. Putuskan no. 10 (font) bersama R1 agar tinjauan viewport menilai hasil akhir.
4. Setelah poles: `npm run build` (guard ikut) + catat di doc 06 A5 sebagai bukti R1.

## Batas audit

Audit statis atas source 8 Oktober 2026. Tidak mengukur screenshot, tidak menguji kontras overlay berlapis, tidak menilai backend. Skor kerapihan/font/warna/poles adalah kualitas implementasi visual, terpisah dari skor dokumen (A-05) dan kesiapan modul (A-01).
