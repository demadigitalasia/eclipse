# Referensi Studio Lama — Analisis Fitur

Delapan screenshot di folder ini disimpan sebagai referensi visual dari Studio sebelumnya. Screenshot adalah bukti bentuk fitur dan alur lama, bukan instruksi konfigurasi atau spesifikasi implementasi yang otomatis harus disalin persis.

## Arsip gambar

1. [Hook dan judul klip](01-hook-title.png)
2. [Kontrol tipografi judul](02-title-controls.png)
3. [Preset gaya subtitle](03-subtitle-styles.png)
4. [Editor teks dan waktu subtitle](04-subtitle-editor.png)
5. [Unggah musik, SFX, dan volume audio asli](05-audio-branding.png)
6. [Kontrol audio dan watermark](06-audio-controls.png)
7. [Pilihan encoder ekspor](07-export-encoder.png)
8. [Nama berkas ekspor](08-export-filename.png)

## Fitur yang terlihat

| Area | Kemampuan yang tampak di screenshot |
| --- | --- |
| Pembingkaian | 9:16, 1:1, 4:3, 16:9 letterbox, dan 16:9 landscape; pelacakan wajah/objek dengan pilihan fokus; tata letak video tunggal, facecam di atas gameplay, dan picture-in-picture. |
| Judul | Spanduk hook dapat ditampilkan/disembunyikan; judul hook per klip; awalan/akhiran bersama; pilihan font, ukuran preset/kustom, kapitalisasi, durasi tampil, dan posisi vertikal dengan reset. |
| Subtitle | Preset gaya animasi, pilihan font/ukuran/kapitalisasi/posisi, serta editor per klip untuk mengubah teks dan waktu mulai/selesai. Ada kontrol tambah baris dan reset klip. |
| Audio dan branding | Unggah BGM dan SFX hook; atur level audio asli; aktif/nonaktifkan watermark video. |
| Ekspor | Encoder otomatis atau pilihan NVENC, AMD AMF, Intel QuickSync, dan CPU libx264; awalan/akhiran nama berkas serta pratinjau hasil. |
| Batch dan pratinjau | Tab kerja untuk klip, pembingkaian, judul/subtitle, audio, dan ekspor; pratinjau langsung serta indikator jumlah klip terpilih. |

## Baseline sebelum pemulihan

Pada saat audit awal, `src/components/StudioOverlay.tsx` hanya menyediakan rasio 9:16, panduan safe area, satu teks judul umum, toggle subtitle `viral_pop`/mati, pratinjau, dan ekspor batch maksimal lima klip. Kontrak render hanya mengirim daftar klip, judul umum, status subtitle, dan gaya caption. Renderer memotong ke 9:16 dan selalu memakai libx264.

Kontrol lanjutan tidak sekadar tersembunyi di tab: model data, API ekspor, dan sebagian dukungan renderer juga sudah tidak ada di baseline tersebut. Ada bukti kuat bahwa ini bagian dari pengurangan cakupan saat rebuild: commit `340914b` menghapus `src/components/ClipStudioSection.tsx` (4.382 baris), `backend/video_engine.py` (3.120 baris), dan `backend/services/render_service.py` (369 baris). Riwayat kode sebelumnya memuat dukungan rasio, teks, BGM, watermark, facecam, dan pilihan encoder.

## Implementasi yang sudah dipulihkan

Studio MVP sekarang sudah menerapkan rasio 9:16, 1:1, 4:3, 16:9 letterbox, dan 16:9 landscape; fokus crop manual; judul per klip dengan awalan/akhiran, font, ukuran, kapitalisasi, dan posisi; preset subtitle, ukuran/posisi, serta editor teks dan waktu tiap baris; upload BGM/SFX, volume audio, watermark teks; nama berkas; dan pemilihan encoder yang mengikuti kemampuan FFmpeg server. Deteksi otomatis mengambil lima sampel frame per klip, memilih wajah yang konsisten dengan Haar Cascade, lalu mencoba fokus gerakan visual jika wajah tidak ditemukan. Berkas audio dibatasi 50 MB dan disimpan di direktori job yang sama, mengikuti kepemilikan akses job.

Deteksi ini bukan pengenalan objek semantik atau pelacakan wajah frame-per-frame. Tata letak facecam/gameplay/PiP multi-sumber, watermark gambar, dan tema subtitle animasi per kata belum dipulihkan. Fokus manual tetap tersedia sebagai pengaturan crop dan fallback ketika deteksi tidak menemukan wajah/gerakan.

## Kesimpulan dan urutan pemulihan

Fitur-fitur tersebut hilang karena Studio dibangun ulang dengan cakupan MVP yang jauh lebih kecil, bukan karena akun atau pilihan pengguna. Pengembalian harus mencakup UI, kontrak API, validasi file/opsi, pratinjau, dan renderer agar kontrol benar-benar memengaruhi video hasil.

Urutan yang disarankan:

1. **Selesai:** kontrol dasar, subtitle per klip, deteksi fokus otomatis, audio/branding teks, nama berkas, dan pemilihan encoder aktual.
2. **Tahap berikutnya:** pelacakan objek semantik dan komposisi facecam/gameplay/PiP setelah ada sumber video yang dapat ditata sebagai lapisan terpisah.

Screenshot lama membantu memulihkan cakupan dan perilaku yang diharapkan. Nilai default yang sudah dipilih pada implementasi awal tetap dapat disesuaikan berdasarkan umpan balik pengguna.
