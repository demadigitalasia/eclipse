# 02 — Alur Kerja ECLIPSE V.2 (terbaru, pasca-overhaul UI)

Tanggal: 7 Oktober 2026. Spesifikasi workflow rebuild.

## Navigasi: stepper 3 langkah (dapat diklik)

`1 Input → 2 Discover → 3 Studio`. Step 2–3 disabled sampai ada hasil analisis.

## Langkah 1 — Input (layar 2 kolom)

Kiri: sumber (YouTube/GDrive/upload drag-drop) + API key (+mode `mock`) + durasi (15/30/60/auto) + jumlah (auto/custom ≤50) + range (entire/custom detik/MM:SS/HH:MM:SS) + prompt fokus + subtitle (auto/manual .srt/.txt) + tombol `Cari Klip`.
Kanan (sticky): Riwayat Video Dianalisis — search, hapus 1/semua, kartu (thumbnail 64px, judul clamp-2, meta wrap, `Muat Analisis` full-width).
Sukses → form otomatis terlipat, pindah ke Discover.

## Langkah 2 — Discover (IDE 3-pane)

Kiri 300px: compact source bar (judul + n klip + durasi + model, tombol `← Input` / `Studio →`) + form terlipat + history.
Tengah: player (YT IFrame / `<video /api/video>`) + HeatmapTimeline (keyboard slider) + Summary + Transcript + tombol refresh/unduh mentah (job polling).
Kanan 380px: toolbar (search title+transcript, filter all/high ≥90 / medium 70–89 / marked, sort virality/time/duration/marked, mark-all) + kartu klip (badge skor 3 tier: ≥90 lime, 70–89 violet, <70 grey; badge marked lime; hook-time violet) + trimmer (±120s, preset, transcript navigator, unduh mentah) + ekspor JSON/SRT/Markdown + salin timestamp.
≤1280px: 2 kolom; ≤900px: stack vertikal.

## Langkah 3 — Studio (overlay fullscreen)

Terbuka via stepper/compact bar; menutup halaman (`fixed inset-0 z-80`, scroll terkunci, Esc menutup).
Kiri: preview 9:16 + safe-area + compare Source/Result (mendatang). Kanan: Frame (5 rasio, blur/hitam, face tracking YuNet/Haar, facecam split/PiP), Text (judul/file-pattern, 7 preset caption + off, font bawaan/unggah, posisi/size/case), Audio&Brand (BGM/SFX/watermark, volume/offset/XY/opacity), Export (encoder auto/nvenc/amf/qsv/cpu + info).
`Batch Render (n)` → SSE per-klip (pending/downloading/transcribing/rendering/completed/error) → retry gagal → unduh MP4/ZIP. Satu drawer progres untuk semua job (target — saat ini toast + alert campur, lihat 04).

## Pipeline backend (jangan ulangi kegagalan lama)

Analyze SSE 4-step → klasifikasi sumber → metadata platform (+heatmap native atau energi-audio) → transkrip berlapis/manual → prompt AI + fallback model → klip (clamp auto 90s, cap 200) → cache localStorage.
Render: batch_id + BackgroundTasks, sekuensial per-klip (segmen → ASS/PNG → filtergraph → encoder + fallback cpu) → ZIP. State in-memory (batas: restart = hilang — lihat 04).
