# Audit Navigasi Dashboard ECLIPSE — Snapshot dan Tindak Lanjut

Tanggal audit awal: 8 Oktober 2026  
Pembaruan setelah implementasi frontend: 8 Oktober 2026  
Ruang lingkup: navigasi aplikasi, halaman Dashboard, halaman Admin, dokumen alur kerja, sistem desain, dan rencana MVP.  
Jenis audit: pemeriksaan statis UI dan dokumentasi; bukan uji pengguna.

## Ringkasan

Audit awal menemukan sidebar global untuk Dashboard, Studio, Pengaturan, dan Admin; bagian Admin ketika itu masih berupa tab horizontal. Setelah audit, rekomendasi sidebar diterapkan di frontend. Admin sekarang memiliki route anak untuk Ringkasan, Pengguna & Role, Gemini API, Aktivitas, Pengaturan Sistem, dan Proxy/Egress. Dashboard pengguna tetap berbeda dari Ringkasan Admin dan hanya menampilkan data prototipe lokal.

Pada audit awal, dokumen 05 belum menetapkan hierarki Admin dan dokumen 02/06 belum mencatat route khususnya. Dokumen 02, 05, 06, dan 01 kini telah diperbarui untuk menyebut struktur sidebar; rencana 06 belum menandai milestone A1 selesai karena deep-link, akses keyboard, dan seluruh kriteria penerimaan belum diverifikasi menyeluruh.

**Hasil:** pola satu sidebar global dan route anak Admin sudah diterapkan. Submenu tetap memakai drawer global pada layar kecil. Backend masih harus menegakkan otorisasi admin dan memasok metrik operasional; UI frontend bukan kontrol akses atau sumber metrik produksi.

## Kondisi saat ini

| Area | Kondisi terverifikasi | Kekurangan |
|---|---|---|
| Sidebar global | Dashboard, Studio, Pengaturan, dan grup Admin untuk role admin; submenu memakai drawer global. | Perilaku deep-link dan keyboard perlu melewati pemeriksaan penerimaan A1/A5. |
| Dashboard pengguna | Kartu video, klip, paket, dan CTA ke Studio. | Data lokal; bukan analitik penggunaan atau status job server. |
| Admin | Route anak `/app/admin/overview`, `/app/admin/users`, `/app/admin/gemini`, `/app/admin/activity`, `/app/admin/settings`, dan `/app/admin/proxy`. | State pengguna/log/proxy dan pool Gemini tetap simulasi/localStorage. |
| Ringkasan Admin | Menampilkan angka pengguna dan log lokal dengan label prototipe serta pesan batas backend. | Belum ada metrik job, provider, biaya, atau kesehatan sistem yang bersumber dari backend. |
| Dokumentasi | Dokumen 01, 02, 05, dan 06 menyebut navigasi Admin terbaru. | A-03 merupakan snapshot skor sebelumnya; A-05 menjadi audit kualitas dokumen aktif. |

## Struktur sidebar Admin yang disarankan

1. **Ringkasan** — jumlah pengguna, job analisis/render, rasio berhasil/gagal, waktu proses, kesehatan provider, dan pemakaian/biaya Gemini.
2. **Pengguna & role** — daftar, pencarian/filter, detail, role, paket, dan status akun.
3. **Gemini API** — entri key/project, status, kebijakan failover, dan pemakaian yang tersedia.
4. **Aktivitas** — audit perubahan admin dan kejadian sistem.
5. **Pengaturan sistem** — batas ukuran/durasi, retensi, kuota pengguna, dan kebijakan sumber setelah diputuskan.
6. **Proxy/Egress** — tampilkan hanya jika metode konektor benar-benar memerlukannya; selain itu, tempatkan di pengaturan lanjutan atau sembunyikan dari MVP.

Gunakan satu rail global: saat Admin dibuka, item Admin di rail menampilkan submenu dan item aktif. Setiap submenu memiliki route langsung, contohnya `/app/admin/overview`, `/app/admin/users`, `/app/admin/gemini`, `/app/admin/activity`, dan `/app/admin/settings`. Pada layar kecil, submenu mengikuti drawer global. Guard role harus tetap dijalankan di backend saat backend tersedia; menyembunyikan menu saja bukan kontrol akses.

## Rekomendasi isi halaman Ringkasan

- **Aktivitas produk:** pengguna terdaftar/aktif, job analisis dan render, serta antrean saat ini.
- **Keberhasilan alur:** persentase job berhasil/gagal per tahap dan waktu median sampai ekspor.
- **Provider Gemini:** entri aktif, error/failover, pemakaian token/biaya dari data yang benar-benar tersedia.
- **Tindakan:** pintasan ke Pengguna, Gemini API, dan Aktivitas.

Semua metrik harus diberi rentang waktu dan sumber data. Selama frontend-only, tampilkan label simulasi. Bila Google tidak menyediakan angka sisa kuota untuk API, tunjukkan “tidak tersedia” dan jangan menebak nilainya. Pisahkan biaya provider dari paket Free/Pro; kuota dan billing pelanggan belum diputuskan.

## Dampak dan urutan implementasi

1. **Fase frontend:** implementasi route anak dan submenu responsif sudah dilakukan; verifikasi deep-link, navigasi keyboard, akses role, dan ukuran layar tetap menjadi bagian Gate A.
2. **Fase backend:** sediakan endpoint agregasi analitik, otorisasi admin di server, serta pencatatan event job/provider yang menjadi sumber metrik.
3. **Setelah baseline:** tetapkan filter waktu, batas retensi audit, kuota pengguna, cap biaya, dan alert berdasarkan data pemakaian nyata.

## Kesimpulan

Hasil audit awal ditindaklanjuti dengan grup Admin pada sidebar global dan route langsung untuk Ringkasan, Pengguna & Role, Gemini API, Aktivitas, Pengaturan Sistem, serta Proxy/Egress. Ringkasan menampilkan hitungan lokal berlabel prototipe dan menjelaskan bahwa metrik operasional memerlukan backend. Pengaturan Sistem menampilkan batas MVP sebagai keputusan perencanaan, bukan kontrol backend. A-05 menjadi sumber skor kualitas dokumen terbaru; file ini dipertahankan untuk merekam temuan awal serta tindak lanjut.

## File yang ditinjau

- `src/App.tsx` — sidebar global, grup Admin, dan route anak.
- `src/pages/AccountPages.tsx` — halaman Admin berbasis route.
- `src/pages/DashboardPage.tsx` — ringkasan Dashboard pengguna.
- `src/components/GeminiApiPanel.tsx` — simulasi panel pool Gemini.
- `docs/perencanaan/02-ALUR-KERJA.md`
- `docs/perencanaan/05-DESAIN.md`
- `docs/perencanaan/06-RENCANA-IMPLEMENTASI-MVP-1.md`
