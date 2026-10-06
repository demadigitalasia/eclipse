# 04 — Roadmap & Backlog Keputusan ECLIPSE V.2

Tanggal: 7 Oktober 2026. Backlog rebuild (kode lama dihapus total).

## Decision log

| Tanggal | Keputusan | Status |
|---------|-----------|--------|
| 2026-10-07 | Tema Dark Lime + IDE 3-pane + stepper + studio overlay + hapus logo | diterapkan, belum di-PR |
| 2026-10-07 | Port env ECLIPSE_API_PORT/WEB_PORT (fallback 8000/5173) | diterapkan |
| 2026-10-07 | Filter medium = 70–89; thumbnail via /api/clip-frame | diterapkan |
| — | 8 keputusan bisnis (03) | terbuka |

## Backlog prioritas (dari LAPORAN-04)

**Sekarang (~30 mnt):**
- [ ] .gitignore: file settings berisi sekret + file konfigurasi deploy (settings terverifikasi belum di-ignore)
- [ ] Admin fail-closed: cookies POST/DELETE + system clear/update/restart (saat ini fail-open tanpa key)
- [ ] Blok dark override sisa kartu putih (~20 selektor: user-guide/cookies/studio-modal, batch item, loading/ai cards, count badge)
- [ ] Hapus grid-areas invalid + definisi dashboard-grid ganda; hapus `min-width:1200px` permanen

**Berikutnya:**
- [ ] Schema Pydantic ketat: ClipItem (0<=start<end, dur<=90, max 50), analyze (HttpUrl, Literal, ge/le), allowlist path uploads, tolak `../`
- [ ] TTL/cleanup job in-memory (created_at + 24h) sebelum persist sqlite/redis
- [ ] Jangan bawa komponen/CSS mati ke rebuild; review tiap modul baru vs spesifikasi 01/02
- [ ] Aksesibilitas: stepper `aria-current`, label search, studio tablist + arrow-key, kontras faint #8b93a6
- [ ] Retry 429 + sinkron locales en/id; migrasi storage key `cheat_clip_*` → `eclipse_*`

**Nanti:**
- [ ] Token CSS tunggal tanpa `!important`; modul kecil + code-split
- [ ] Job durable (sqlite/redis di ECLIPSE_DATA_DIR) + object storage + signed-URL upload
- [ ] Preset studio, cancel/pause/resume, cookie per-user terenkripsi, auth + quota + rate-limit
- [ ] Dokumentasikan ADMIN_API_KEY/ALLOWED_ORIGINS di template env + contoh generate
