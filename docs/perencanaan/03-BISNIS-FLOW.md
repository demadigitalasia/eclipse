# 03 — Bisnis Flow ECLIPSE V.2

Tanggal: 7 Oktober 2026. Fondasi keputusan bisnis rebuild.

## Canvas (kondisi kode hari ini)

- Persona: kreator solo (hook cepat) → editor (trim presisi) → tim sosmed (konsistensi brand).
- Value: URL/upload → momen AI → review → trim → studio konsisten → batch+retry → MP4/ZIP. Tanpa publikasi langsung sosmed, tanpa kolaborasi.
- Channel: lokal (frontend + backend 1 mesin); staging hosting statis + container; hosting kontainer same-origin.
- Revenue: 0 (MIT, no payment/quota by design).
- Cost: AI generatif = BYOK user atau server key; transkrip pihak ketiga = operator bila diset; bandwidth/compute/storage (transkripsi lokal + render, upload besar) = operator/host; lokal = user.
- Partner/risiko: API generatif, platform video (blokir bot/cookie/perubahan ekstraktor), API transkrip, proxy, Drive link-publik (tanpa OAuth). Skor viralitas ≠ jaminan performa — dilarang dipasarkan sebagai garansi.

## Opsi monetisasi (realistis, tanpa refactor → butuh refactor)

1. Lisensi self-host one-time (siap sekarang, BYOK di user).
2. Managed single-tenant per klien (isolasi alami, ADMIN_KEY per instance).
3. Jasa pay-per-pack (operator internal, tanpa expose backend).
4. SaaS BYOK metered (butuh: auth + quota + rate-limit + job durable).

## 8 Keputusan terbuka — status: BELUM DIJAWAB (jawab sebelum bangun SaaS)

1. Lokal / single-web / SaaS multi-user? — terbuka
2. Akun pengguna? Proyek/kuota/kepemilikan? — terbuka
3. Siapa bayar AI/transkripsi (BYOK vs layanan)? — praktik hari ini: BYOK
4. Batas unggah/durasi/klip/paralel/retensi? — praktik: 4GB/≈200 auto/retensi 48h manual
5. Drive link-publik vs OAuth? — hari ini: link publik
6. Kebijakan cookie platform video (privat/lokal saja?) — terbuka
7. Platform ekspor prioritas? — terbuka
8. Target metrik keberhasilan? — usulan: waktu klip pertama, % sesi→download, % analyze valid, % render sukses, % rekomendasi dipakai, % self-recovery — belum diinstrumentasi

Rekomendasi default bila ingin jalan cepat: single-tenant BYOK (opsi 1–3), cookie lokal-saja, retensi 48h, metrik = % sesi→≥1 download.
