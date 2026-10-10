import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import BrandLogo from '../components/BrandLogo'
import EclipseMark from '../components/EclipseMark'
import Icon from '../components/Icon'
import type { Lang } from '../types'
import { getSiteStrings, getInlineCopy, getLocale } from '../localization'
import { getServerLimits, type ServerLimits } from '../api'

export default function LandingPage({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = getSiteStrings(lang)
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [productMenuOpen, setProductMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [limits, setLimits] = useState<ServerLimits | null>(null)
  const faqs = [
    { q: t.faq1q, a: t.faq1a },
    { q: t.faq2q, a: t.faq2d },
    { q: t.faq3q, a: t.faq3a },
  ]
  const closeMenu = () => {
    setMenuOpen(false)
    setProductMenuOpen(false)
  }
  const isId = lang === 'id'
  useEffect(() => { let active = true; getServerLimits().then((value) => { if (active) setLimits(value) }).catch(() => {}); return () => { active = false } }, [])
  const money = (amount: number | undefined, fallback: string) => amount === undefined ? fallback : new Intl.NumberFormat(getLocale(lang)).format(amount)

  const phases = isId
    ? [
        { code: 'P1', name: 'Masukkan video', desc: 'Tempel tautan YouTube atau Google Drive yang dapat diakses, atau unggah video.', meta: '00:00 — SUMBER' },
        { code: 'P2', name: 'Analisis momen', desc: 'Eclipse membaca transkrip dan memberi skor pada kandidat klip.', meta: '00:42 — ANALISIS' },
        { code: 'P3', name: 'Atur potongan', desc: 'Tinjau kandidat, lalu tentukan titik awal dan akhir setiap klip.', meta: '01:17 — EDIT' },
        { code: 'P4', name: 'Ekspor klip', desc: 'Ekspor klip vertikal 9:16 dengan subtitle dan judul, lalu unduh MP4.', meta: '02:05 — EKSPOR' },
      ]
    : [
        { code: 'P1', name: 'Add a video', desc: 'Paste a public YouTube or accessible Google Drive link, or upload a video.', meta: '00:00 — SOURCE' },
        { code: 'P2', name: 'Analyze moments', desc: 'Eclipse reads the transcript and scores potential clips.', meta: '00:42 — ANALYSIS' },
        { code: 'P3', name: 'Adjust clips', desc: 'Review candidates, then set each clip’s start and end points.', meta: '01:17 — EDIT' },
        { code: 'P4', name: 'Export clips', desc: 'Export vertical 9:16 clips with subtitles and titles, then download MP4s.', meta: '02:05 — EXPORT' },
      ]

  const clips = [
    { tc: '00:12', title: getInlineCopy(isId, "copy_pembuka_1968d77"), score: '94', dur: '0:32', image: '/images/clip-opening.webp', alt: getInlineCopy(isId, "copy_kreator_indonesia_membuka_video_de_639eeda") },
    { tc: '04:47', title: getInlineCopy(isId, "copy_momen_lucu_cbb5ddc"), score: '82', dur: '0:28', image: '/images/clip-laugh.webp', alt: getInlineCopy(isId, "copy_kreator_indonesia_tertawa_saat_men_64d847e") },
    { tc: '11:03', title: getInlineCopy(isId, "copy_konteks_b3289a6"), score: '68', dur: '0:41', image: '/images/clip-context.webp', alt: getInlineCopy(isId, "copy_kreator_indonesia_menjelaskan_kont_fbc5e65") },
  ]

  return (
    <div className="eclipse-site">
      <div className="eclipse-field" aria-hidden="true">
        <span className="eclipse-field-glow" />
        <span className="eclipse-field-orbit eclipse-field-orbit--a" />
        <span className="eclipse-field-orbit eclipse-field-orbit--b" />
        <span className="eclipse-field-grain" />
      </div>

      <header className={`site-nav ${menuOpen ? 'is-menu-open' : ''}`}>
        <Link to="/" className="site-brand" onClick={closeMenu}>
          <BrandLogo />
        </Link>
        <button
          type="button"
          className="site-menu-toggle"
          aria-label={menuOpen ? 'Tutup navigasi' : 'Buka navigasi'}
          aria-controls="site-nav-content"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="site-nav-content" id="site-nav-content">
          <nav className="site-links" aria-label="Navigasi utama">
            <a
              href="#beranda"
              className="site-anchor"
              onClick={(event) => {
                event.preventDefault()
                closeMenu()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              {getInlineCopy(isId, "copy_beranda_fdb349e")}
            </a>
            <a href="#fase" className="site-anchor" onClick={closeMenu}>{getInlineCopy(isId, "copy_tentang_4fd3875")}</a>
            <div className={`site-nav-dropdown ${productMenuOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="site-anchor site-dropdown-trigger"
                aria-expanded={productMenuOpen}
                aria-controls="product-nav-menu"
                onClick={() => setProductMenuOpen((open) => !open)}
              >
                {getInlineCopy(isId, "copy_produk_73fc2b5")}
                <span className="dropdown-chevron" aria-hidden="true">
                  <Icon name="chevronDown" size={10} />
                </span>
              </button>
              <div className="site-dropdown-menu" id="product-nav-menu">
                <a href="#mesin" className="site-dropdown-item" onClick={closeMenu}>{getInlineCopy(isId, "copy_fitur_62b3439")}</a>
                <a href="#fase" className="site-dropdown-item" onClick={closeMenu}>{getInlineCopy(isId, "copy_cara_kerja_a99b66d")}</a>
                <a href="#hasil" className="site-dropdown-item" onClick={closeMenu}>{getInlineCopy(isId, "copy_contoh_hasil_1da2e58")}</a>
              </div>
            </div>
            <a href="#kuota" className="site-anchor" onClick={closeMenu}>Pricing</a>
            <a href="#faq" className="site-anchor" onClick={closeMenu}>FAQ</a>
          </nav>
          <div className="site-nav-actions">
            {user ? (
              <Link to="/app" className="btn-primary btn-sm nav-cta" onClick={closeMenu}>{t.navApp} →</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost nav-login" onClick={closeMenu}>{t.navLogin}</Link>
                <Link to="/register" className="btn-primary btn-sm nav-cta" onClick={closeMenu}>{getInlineCopy(isId, "copy_coba_gratis_c3d786a")}</Link>
              </>
            )}
            <div className="lang-switch" role="group" aria-label="Language">
              <button type="button" className={lang === 'id' ? 'is-on' : ''} onClick={() => { setLang('id'); closeMenu() }} aria-pressed={lang === 'id'}>ID</button>
              <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => { setLang('en'); closeMenu() }} aria-pressed={lang === 'en'}>EN</button>
            </div>
          </div>
        </div>
      </header>

      <main className="site site--home">
        <section className="hero-gerhana hero-gerhana--editorial" id="beranda">
          <div className="hero-main">
            <h1 className={`gerhana-title gerhana-title--mega ${isId ? 'gerhana-title--id' : ''}`}>
              {isId ? (
                <>
                  <span className="gerhana-line">EDIT VIDEO PANJANG</span>
                  <span className="gerhana-line">HINGGA MENJADI KLIP</span>
                  <span className="gerhana-line">YANG BERPOTENSI <span className="hero-title-viral">VIRAL!</span></span>
                </>
              ) : (
                <>
                  <span className="gerhana-line">TURN</span>
                  <span className="gerhana-line gerhana-line--serif">
                    long videos into
                    <span className="title-eclipse" aria-hidden="true"><EclipseMark /></span>
                  </span>
                  <span className="gerhana-line">short clips.</span>
                </>
              )}
            </h1>
            <div className="hero-foot">
              <p className="hero-sub">{t.landingSub}</p>
              <div className="hero-cta hero-cta--stack">
                <Link to={user ? '/app' : '/register'} className="btn-primary btn-lg btn-corona btn--sharp">{t.landingCtaApp} →</Link>
                <a href="#hasil" className="hero-link">{getInlineCopy(isId, "copy_lihat_hasilnya_b05b2d6")}</a>
              </div>
              <p className="hero-spec hero-spec--bare">
                2 GB · {getInlineCopy(isId, "copy_60_menit_7b30081")}<br />9:16 · {getInlineCopy(isId, "copy_hapus_otomatis_24_jam_7628c36")}
              </p>
            </div>
            <div className="hero-ruler" aria-hidden="true">
              <span>{getInlineCopy(isId, "copy_00_00_sumber_05aa546")}</span>
              <span>{getInlineCopy(isId, "copy_00_42_skor_49d5b8f")}</span>
              <span>01:17 EDIT</span>
              <span>{getInlineCopy(isId, "copy_02_05_ekspor_2700ece")}</span>
            </div>
          </div>
          <img
            className="hero-figure"
            src="/hero-editor-phone.png"
            alt={getInlineCopy(isId, "copy_tampilan_editor_video_eclipse_yang_2ec1d9c")}
          />
        </section>

        <section className="fase-gerhana" id="fase">
          <header className="section-heading section-heading--split">
            <div>
              <p className="section-kicker">01 — {getInlineCopy(isId, "copy_cara_kerja_7b8157b")}</p>
              <h2>{getInlineCopy(isId, "copy_dari_video_panjang_menjadi_klip_3cabdf1")}</h2>
            </div>
            <p className="section-side">{t.landingFeaturesSub}</p>
          </header>
          <div className="fase-grid">
            {phases.map((p) => (
              <article key={p.code} className="fase-card fase-card--v2">
                <div className="fase-top">
                  <span className="fase-code">{p.code}</span>
                  <span className="fase-meta">{p.meta}</span>
                </div>
                <h3>{p.name}</h3>
                <p>{p.desc}</p>
                <span className="fase-line" aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="hasil-gerhana" id="hasil">
          <header className="section-heading section-heading--split">
            <div>
              <p className="section-kicker">02 — {getInlineCopy(isId, "copy_hasil_162555f")}</p>
              <h2>{getInlineCopy(isId, "copy_video_58_menit_3_klip_vertikal_6721a2a")}</h2>
            </div>
            <p className="section-side">{getInlineCopy(isId, "copy_tinjau_skor_durasi_dan_waktu_mulai_3218955")}</p>
          </header>
          <div className="hasil-grid">
            <div className="hasil-source">
              <div className="hasil-source-head">
                <span className="chip is-on">{getInlineCopy(isId, "copy_16_9_video_sumber_cb97a34")}</span>
                <span className="hasil-mono">PODCAST · 58:20</span>
              </div>
              <figure className="hasil-source-preview">
                <img src="/images/source-video-podcast.webp" alt={getInlineCopy(isId, "copy_kreator_indonesia_sedang_merekam_p_ac301fa")} loading="lazy" decoding="async" />
              </figure>
              <div className="hasil-timeline" aria-hidden="true">
                <span className="hasil-chunk hasil-chunk--dim" />
                <span className="hasil-chunk hasil-chunk--hot" />
                <span className="hasil-chunk hasil-chunk--dim" />
                <span className="hasil-chunk hasil-chunk--warm" />
                <span className="hasil-chunk hasil-chunk--dim" />
                <span className="hasil-playhead" />
              </div>
              <div className="hasil-source-meta">
                <span>00:00</span>
                <span>{getInlineCopy(isId, "copy_transkrip_skor_per_menit_a1c0254")}</span>
                <span>58:20</span>
              </div>
              <div className="hasil-arrow" aria-hidden="true"><span>{getInlineCopy(isId, "copy_video_klip_a7c4a82")}</span></div>
            </div>
            <div className="hasil-clips">
              {clips.map((c, i) => (
                <article key={c.tc} className={`hasil-clip hasil-clip--${i + 1}`}>
                  <img className="hasil-clip-image" src={c.image} alt={c.alt} loading="lazy" decoding="async" />
                  <div className="hasil-clip-top">
                    <span className="hasil-tc">{c.tc}</span>
                    <span className="score score--high">{c.score}</span>
                  </div>
                  <div className="hasil-clip-body">
                    <strong>{c.title}</strong>
                    <span>{c.dur} · 9:16</span>
                  </div>
                  <div className="hasil-clip-bars" aria-hidden="true"><span /><span /><span /></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mesin-gerhana" id="mesin">
          <header className="section-heading section-heading--split">
            <div>
              <p className="section-kicker">03 — {t.featNav}</p>
              <h2>{t.landingFeaturesTitle}</h2>
            </div>
            <p className="section-side">{getInlineCopy(isId, "copy_pilih_momen_atur_potongan_lalu_sia_71ec956")}</p>
          </header>
          <div className="bento">
            <article className="bento-card bento-card--giant">
              <div className="bento-head">
                <p className="bento-kicker">{t.feat1t}</p>
                <span className="live-badge">AI</span>
              </div>
              <h3>{t.feat1d}</h3>
              <div className="score-strip" aria-hidden="true">
                <div className="score-row"><span>00:12 — {getInlineCopy(isId, "copy_pembuka_6a54aab")}</span><span className="score-bar"><span className="score-fill score-fill--high" /></span><strong>94</strong></div>
                <div className="score-row"><span>04:47 — {getInlineCopy(isId, "copy_momen_lucu_71ddb77")}</span><span className="score-bar"><span className="score-fill score-fill--mid" /></span><strong>82</strong></div>
                <div className="score-row"><span>11:03 — {getInlineCopy(isId, "copy_konteks_ba53778")}</span><span className="score-bar"><span className="score-fill score-fill--low" /></span><strong>68</strong></div>
              </div>
              <p className="bento-foot">{getInlineCopy(isId, "copy_skor_klip_merupakan_perkiraan_ai_b_e88ba71")}</p>
            </article>
            <article className="bento-card">
              <p className="bento-kicker">{t.feat2t}</p>
              <h3>{t.feat2d}</h3>
              <div className="trim-visual" aria-hidden="true">
                <span className="trim-track"><span className="trim-range" /></span>
                <span className="trim-ticks">00 · 15 · 30 · 45 · 60</span>
              </div>
            </article>
            <article className="bento-card">
              <p className="bento-kicker">{t.feat3t}</p>
              <h3>{t.feat3d}</h3>
              <div className="batch-visual" aria-hidden="true">
                <span>MP4 ▸ 9:16</span>
                <span>{getInlineCopy(isId, "copy_subtitle_aktif_f4e5da6")}</span>
                <span>{getInlineCopy(isId, "copy_5_klip_d4251c0")}</span>
              </div>
            </article>
            <article className="bento-card bento-card--strip">
              <div>
                <strong>{t.howT}</strong>
                <p>{t.how1d} → {t.how2d} → {t.how3d}</p>
              </div>
              <Link to={user ? '/app' : '/register'} className="btn-primary">{t.landingCtaApp} →</Link>
            </article>
          </div>
        </section>

        <section className="kuota-gerhana" id="kuota">
          <header className="section-heading section-heading--split">
            <div>
              <p className="section-kicker">04 — {t.priceT}</p>
              <h2>{getInlineCopy(isId, "copy_mulai_dengan_paket_gratis_9adab27")}</h2>
            </div>
          </header>
          <div className="kuota-duo">
            <div className="kuota-card kuota-card--free">
              <div className="kuota-left">
                <p className="section-kicker">{t.priceFree}</p>
                <h2 className="kuota-price kuota-price--free">{t.priceFree}</h2>
                <p className="helper">{limits ? (isId
                  ? `Gratis selama ${limits.freeRenderTrialDays} hari sejak mendaftar.`
                  : `Free for ${limits.freeRenderTrialDays} days after signup.`) : t.priceFreeD}</p>
              </div>
              <ul className="kuota-list">
                {[isId ? `Maks. ${limits?.freeDailyAnalyze ?? 3} analisis per hari` : `Up to ${limits?.freeDailyAnalyze ?? 3} analyses per day`, isId ? `${limits?.freeDailyRender ?? 1} batch generate per hari` : `${limits?.freeDailyRender ?? 1} generation batch per day`].map((f) => (
                  <li key={f}><span aria-hidden="true">◉</span> {f}</li>
                ))}
              </ul>
              <Link to={user ? '/app' : '/register'} className="btn-primary btn-lg btn-corona kuota-action">{t.landingCtaApp} →</Link>
            </div>
            <div className="kuota-card kuota-card--locked">
              <div className="kuota-left">
                <p className="section-kicker">{t.priceLite}</p>
                <h2 className="kuota-price">{(limits?.liteDiscountAmountIdr ?? 0) > 0 && <s>Rp {money(limits?.liteMonthlyPriceIdr, t.priceLitePrice.replace(/^Rp\s*/, ''))}</s>}<span className="kuota-price__current">Rp {money((limits?.liteMonthlyPriceIdr ?? 150000) - (limits?.liteDiscountAmountIdr ?? 0), t.priceLitePrice.replace(/^Rp\s*/, ''))}</span><small>{t.perMonth}</small></h2>
                <p className="helper">{limits ? (isId ? `${limits.liteDailyRender} batch generate video per hari selama ${limits.liteTermMonths} bulan. Aktivasi melalui Hub Admin.` : `${limits.liteDailyRender} video generation batches per day for ${limits.liteTermMonths} months. Activated by a Hub Admin.`) : t.priceLiteD}</p>
              </div>
              <ul className="kuota-list">
                <li><span aria-hidden="true">◉</span>{isId ? `${limits?.liteDailyRender ?? 15} batch generate video per hari` : `${limits?.liteDailyRender ?? 15} video generation batches per day`}</li>
                <li><span aria-hidden="true">◉</span>{isId ? `Aktif selama ${limits?.liteTermMonths ?? 1} bulan` : `Active for ${limits?.liteTermMonths ?? 1} month${(limits?.liteTermMonths ?? 1) === 1 ? '' : 's'}`}</li>
                <li><span aria-hidden="true">◉</span>{getInlineCopy(isId, "copy_aktivasi_dibantu_hub_admin_eb9c85c")}</li>
              </ul>
              <Link to={user ? '/app/subscription' : '/register'} className="btn-primary btn-lg kuota-action">{t.planWelcomeLiteAction}</Link>
            </div>
            <div className="kuota-card kuota-card--locked">
              <div className="kuota-left">
                <p className="section-kicker">{t.pricePro}</p>
                <h2 className="kuota-price">{(limits?.proDiscountAmountIdr ?? 0) > 0 && <s>Rp {money(limits?.proMonthlyPriceIdr, t.priceProPrice.replace(/^Rp\s*/, ''))}</s>}<span className="kuota-price__current">Rp {money((limits?.proMonthlyPriceIdr ?? 300000) - (limits?.proDiscountAmountIdr ?? 0), t.priceProPrice.replace(/^Rp\s*/, ''))}</span><small>{t.perMonth}</small></h2>
                <p className="helper">{limits ? (isId ? `${limits.proDailyRender} batch generate video per hari selama ${limits.proTermMonths} bulan. Aktivasi melalui Hub Admin.` : `${limits.proDailyRender} video generation batches per day for ${limits.proTermMonths} months. Activated by a Hub Admin.`) : t.priceProD}</p>
              </div>
              <ul className="kuota-list">
                <li><span aria-hidden="true">◉</span>{isId ? `${limits?.proDailyRender ?? 25} batch generate video per hari` : `${limits?.proDailyRender ?? 25} video generation batches per day`}</li>
                <li><span aria-hidden="true">◉</span>{isId ? `Aktif selama ${limits?.proTermMonths ?? 1} bulan` : `Active for ${limits?.proTermMonths ?? 1} month${(limits?.proTermMonths ?? 1) === 1 ? '' : 's'}`}</li>
                <li><span aria-hidden="true">◉</span>{getInlineCopy(isId, "copy_aktivasi_dibantu_hub_admin_eb9c85c")}</li>
              </ul>
              <Link to={user ? '/app/subscription' : '/register'} className="btn-primary btn-lg kuota-action">{t.planWelcomeProAction}</Link>
            </div>
            <div className="kuota-card kuota-card--locked">
              <div className="kuota-left">
                <p className="section-kicker">{t.unlimitedLabel}</p>
                <h2 className="kuota-price kuota-price--free">∞</h2>
                <p className="helper">{getInlineCopy(isId, "copy_kuota_tanpa_batas_untuk_akun_denga_c95342e")}</p>
              </div>
              <ul className="kuota-list">
                <li><span aria-hidden="true">○</span> {getInlineCopy(isId, "copy_tanpa_batas_batch_generate_harian_62f8708")}</li>
                <li><span aria-hidden="true">○</span> {getInlineCopy(isId, "copy_akses_berdasarkan_peran_hub_admin_3b68af8")}</li>
              </ul>
              <button type="button" className="btn-secondary btn-lg kuota-action" disabled>{getInlineCopy(isId, "copy_hubungi_admin_5408e84")}</button>
            </div>
          </div>
        </section>

        <section className="cta-totalitas">
          <div className="cta-eclipse" aria-hidden="true"><img className="cta-eclipse__image" src="/viral-clips-creator-id.png" alt="" /></div>
          <div className="cta-totalitas__copy">
            <p className="section-kicker">05 — {getInlineCopy(isId, "copy_mulai_gratis_73e295b")}</p>
            <h2>{getInlineCopy(isId, "copy_siap_membuat_klip_pertama_0adaf48")}</h2>
            <p className="helper">{getInlineCopy(isId, "copy_buat_akun_gratis_unggah_video_lalu_10aed01")}</p>
            <div className="hero-cta">
              <Link to={user ? '/app' : '/register'} className="btn-primary btn-lg btn-corona">{t.landingCtaApp} →</Link>
              {!user && <Link to="/login" className="btn-secondary btn-lg">{t.landingCtaLogin}</Link>}
            </div>
            <p className="kuota-foot">2 GB · {getInlineCopy(isId, "copy_60_menit_7b30081")} · 9:16 · {getInlineCopy(isId, "copy_file_dihapus_otomatis_dalam_24_jam_bd7db0b")}</p>
          </div>
        </section>

        <section className="faq faq--gerhana faq--split" id="faq">
          <div className="faq-side">
            <p className="section-kicker">FAQ</p>
            <h2>{t.faqT}</h2>
            <p className="helper">{getInlineCopy(isId, "copy_punya_pertanyaan_baca_jawaban_di_b_88bbb78")}</p>
            <Link to={user ? '/app' : '/register'} className="text-link">{t.landingCtaApp} →</Link>
          </div>
          <div className="faq-list">
            {faqs.map((f, i) => (
              <div key={f.q} className={`faq-item ${openFaq === i ? 'is-open' : ''}`}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span className="faq-num">0{i + 1}</span>
                  <span className="faq-question">{f.q}</span>
                  <span className="faq-toggle" aria-hidden="true">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && <p id={`faq-answer-${i}`}>{f.a}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer site-footer--gerhana">
        <div className="foot-inner">
        <div className="foot-grid">
          <div>
            <span className="site-brand">
              <BrandLogo />
            </span>
            <p>{t.footTag}</p>
            <p className="foot-status">{getInlineCopy(isId, "copy_video_panjang_klip_vertikal_64b3c20")}</p>
          </div>
          <div>
            <h4>{t.footProduct}</h4>
            <Link to="/app">{t.navApp}</Link>
            <a href="#mesin">{t.featNav}</a>
            <a href="#kuota">{t.priceT}</a>
          </div>
          <div>
            <h4>{getInlineCopy(isId, "copy_bantuan_0ca29a5")}</h4>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <h4>{t.footAccount}</h4>
            <Link to="/login">{t.navLogin}</Link>
            <Link to="/register">{t.navRegister}</Link>
          </div>
        </div>
        <p className="foot-base">{t.footer} — {getInlineCopy(isId, "copy_pilih_dan_siapkan_klip_dari_video__c344ccc")}</p>
        </div>
      </footer>
    </div>
  )
}
