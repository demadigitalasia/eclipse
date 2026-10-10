import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { getHistory, getServerLimits, type ServerLimits } from '../api'
import Icon from '../components/Icon'
import type { HistoryEntry, Lang } from '../types'
import { getSiteStrings, getInlineCopy, getLocale } from '../localization'

export default function DashboardPage({ lang }: { lang: Lang }) {
  const t = getSiteStrings(lang)
  const { user } = useAuth()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [limits, setLimits] = useState<ServerLimits | null>(null)
  const isId = lang === 'id'

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setHistoryError(null)
    try {
      setHistory(await getHistory())
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : t.dashFetchError)
    } finally {
      setLoading(false)
    }
  }, [t.dashFetchError])

  useEffect(() => { void loadHistory() }, [loadHistory])
  useEffect(() => { let active = true; getServerLimits().then((value) => { if (active) setLimits(value) }).catch(() => {}); return () => { active = false } }, [])

  const totalClips = history.reduce((count, entry) => count + entry.clip_count, 0)
  const sourceLabel = (source: HistoryEntry['source']) => {
    if (source === 'youtube') return t.dashSourceYoutube
    if (source === 'drive') return t.dashSourceDrive
    return t.dashSourceUpload
  }
  const dateLabel = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(getLocale(lang), { dateStyle: 'medium' }).format(date)
  }
  const todayLabel = new Intl.DateTimeFormat(getLocale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const planSummary = user?.role === 'admin'
    ? (getInlineCopy(isId, "copy_hub_admin_dapat_melakukan_generate_55ecc8a"))
    : user?.plan === 'pro'
      ? (isId ? `Pro: ${limits?.proDailyRender ?? 25} batch generate per hari selama ${limits?.proTermMonths ?? 1} bulan · Rp${(limits?.proMonthlyPriceIdr ?? 300000).toLocaleString('id-ID')}.` : `Pro: ${limits?.proDailyRender ?? 25} batches per day for ${limits?.proTermMonths ?? 1} month(s) · Rp${(limits?.proMonthlyPriceIdr ?? 300000).toLocaleString('en-US')}.`)
      : user?.plan === 'lite'
        ? (isId ? `Lite: ${limits?.liteDailyRender ?? 15} batch generate per hari selama ${limits?.liteTermMonths ?? 1} bulan · Rp${(limits?.liteMonthlyPriceIdr ?? 150000).toLocaleString('id-ID')}.` : `Lite: ${limits?.liteDailyRender ?? 15} batches per day for ${limits?.liteTermMonths ?? 1} month(s) · Rp${(limits?.liteMonthlyPriceIdr ?? 150000).toLocaleString('en-US')}.`)
        : (isId ? `Free: ${limits?.freeDailyRender ?? 1} batch generate per hari selama ${limits?.freeRenderTrialDays ?? 3} hari sejak mendaftar; setelah itu perlu upgrade.` : `Free: ${limits?.freeDailyRender ?? 1} batch per day for ${limits?.freeRenderTrialDays ?? 3} days after signup; upgrade afterward.`)

  const stats = [
    { value: loading ? '—' : String(history.length), label: t.totalVideos, hint: getInlineCopy(isId, "copy_analisis_tersimpan_7a335c0") },
    { value: loading ? '—' : String(totalClips), label: t.totalClips, hint: getInlineCopy(isId, "copy_kandidat_terbentuk_f5d0efc") },
    { value: user?.role === 'admin' ? 'UNLIMITED' : (user?.plan || 'free').toUpperCase(), label: user?.role === 'admin' ? (getInlineCopy(isId, "copy_hub_admin_008c5c7")) : t.dashPlanActive, hint: user?.role === 'admin' ? (getInlineCopy(isId, "copy_kuota_tanpa_batas_50218ed")) : (getInlineCopy(isId, "copy_paket_aktif_4d6657e")), accent: true },
    { value: '24J', label: getInlineCopy(isId, "copy_retensi_file_51b9345"), hint: getInlineCopy(isId, "copy_hapus_otomatis_621380a") },
  ]

  return (
    <div className="page dashboard-page">
      <header className="dashboard-heading dashboard-heading--split">
        <div>
          <p className="section-kicker">{t.navDashboard} — {todayLabel}</p>
          <h2>{user?.name}</h2>
          <p className="helper">{t.dashWelcome}</p>
        </div>
        <Link to="/app/studio" className="btn-primary dashboard-primary-action">
          <Icon name="plus" size={16} />
          {t.dashStartAnalysis}
        </Link>
      </header>

      <section className="dashboard-stats" aria-label={getInlineCopy(isId, "copy_ringkasan_132bd64")}>
        {stats.map((s) => (
          <div key={s.label} className={`dash-stat${s.accent ? ' dash-stat--accent' : ''}`}>
            <span className="dash-stat-hint">{s.hint}</span>
            <strong>{s.value}</strong>
            <span className="dash-stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      {!loading && !historyError && history.length === 0 && (
        <section className="dashboard-onboarding dashboard-onboarding--v2" aria-labelledby="dashboard-onboarding-title">
          <div className="onboarding-glow" aria-hidden="true" />
          <div className="dashboard-onboarding-copy">
            <p className="section-kicker">{t.dashFirstRunLabel} — P1 · P2 · P3</p>
            <h3 id="dashboard-onboarding-title">{t.dashFirstRunTitle}</h3>
            <p>{t.dashFirstRunHelp}</p>
            <div className="onboarding-cta-row">
              <Link to="/app/studio" className="btn-primary btn-lg btn-corona">
                <Icon name="clapper" size={18} />
                {t.dashStartAnalysis}
              </Link>
              <span className="dashboard-limits">{t.dashLimits}</span>
            </div>
          </div>
          <div className="onboarding-side">
            <img
              className="onboarding-visual"
              src="/images/onboarding-video-clips.png"
              alt={getInlineCopy(isId, "copy_video_panjang_yang_diolah_menjadi__a64cb51")}
            />
            <ol className="dashboard-workflow" aria-label={t.dashFirstRunLabel}>
              {[t.dashStepSource, t.dashStepAnalyze, t.dashStepReview].map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                  <Icon name="arrowRight" size={16} aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {!loading && historyError && (
        <div className="dashboard-error" role="alert">
          <p>{historyError}</p>
          <button type="button" className="btn-secondary" onClick={() => void loadHistory()}>{t.dashRetry}</button>
        </div>
      )}

      {!loading && !historyError && history.length > 0 && (
        <section className="dashboard-continue dashboard-continue--v2" aria-labelledby="dashboard-continue-title">
          <div className="dashboard-continue-mark" aria-hidden="true"><Icon name="clapper" size={20} /></div>
          <div className="dashboard-continue-copy">
            <p className="section-kicker">{t.dashContinueLabel}</p>
            <h3 id="dashboard-continue-title" title={history[0].title}>{history[0].title}</h3>
            <p>{sourceLabel(history[0].source)} <span aria-hidden="true">·</span> {history[0].clip_count} {t.totalClips.toLowerCase()} <span aria-hidden="true">·</span> {dateLabel(history[0].analyzed_at)}</p>
          </div>
          <Link
            to="/app/studio"
            state={{ loadVideoId: history[0].video_id }}
            className="btn-primary btn-corona"
          >
            {t.dashContinue}
            <Icon name="arrowRight" size={16} />
          </Link>
        </section>
      )}

      <div className="dashboard-layout dashboard-layout--v2">
        <section className="dashboard-recent" aria-labelledby="dashboard-recent-title">
          <div className="dashboard-section-heading">
            <div>
              <p className="section-kicker">{t.dashRecentLabel}</p>
              <h3 id="dashboard-recent-title">{t.dashRecent}</h3>
            </div>
            {!loading && !historyError && history.length > 0 && <span className="dashboard-count">{history.length}</span>}
          </div>

          {loading && <p className="helper" role="status">{t.dashLoading}</p>}
          {!loading && !historyError && history.length === 0 && (
            <div className="dashboard-empty-art">
              <div className="empty-orbit" aria-hidden="true">
                <span className="empty-disc" />
              </div>
              <div>
                <h4>{t.dashRecentEmpty}</h4>
                <p className="helper">{t.dashRecentEmptyHelp}</p>
                <Link to="/app/studio" className="text-link">{t.dashStartAnalysis} →</Link>
              </div>
            </div>
          )}

          {!loading && !historyError && history.length > 0 && (
            <div className="dashboard-history-list">
              {history.slice(1, 7).map((entry) => (
                <article className="dashboard-history-row" key={entry.video_id}>
                  <div className="dashboard-history-source" aria-hidden="true"><Icon name="clapper" size={17} /></div>
                  <div className="dashboard-history-copy">
                    <h4 title={entry.title}>{entry.title}</h4>
                    <p className="dashboard-history-meta">
                      <span>{sourceLabel(entry.source)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.clip_count} {t.totalClips.toLowerCase()}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={entry.analyzed_at}>{dateLabel(entry.analyzed_at)}</time>
                    </p>
                  </div>
                  <Link
                    to="/app/studio"
                    state={{ loadVideoId: entry.video_id }}
                    className="dashboard-history-load"
                    aria-label={`${t.dashLoad}: ${entry.title}`}
                  >
                    <span>{t.dashLoad}</span>
                    <Icon name="arrowRight" size={16} />
                  </Link>
                </article>
              ))}
            </div>
          )}
          {!loading && !historyError && history.length === 1 && <p className="dashboard-empty-note">{t.dashNoMoreHistory}</p>}
          {!loading && !historyError && history.length > 7 && (
            <Link to="/app/studio" className="dashboard-view-all">{t.dashViewAll}<Icon name="arrowRight" size={15} /></Link>
          )}
        </section>

        <div className="dashboard-side-stack">
          {!loading && !historyError && (
            <aside className="dashboard-summary dashboard-summary--v2" aria-label={t.dashPlanActive}>
              <div className="dashboard-summary-head">
                <span>{t.dashPlanActive}</span>
                <strong>{user?.role === 'admin' ? 'Unlimited · Hub Admin' : user?.plan}</strong>
              </div>
              <div className="plan-ring" aria-hidden="true">
                <span className="plan-ring-fill" />
              </div>
              <p className="helper">{planSummary}</p>
              <Link to="/app/studio" className="btn-secondary">{t.goStudio} →</Link>
              {history.length > 0 && (
                <div className="dashboard-summary-stats">
                  <div><strong>{history.length}</strong><span>{t.dashRecentVideoCount}</span></div>
                  <div><strong>{totalClips}</strong><span>{t.dashRecentClipCount}</span></div>
                </div>
              )}
            </aside>
          )}

          <aside className="panel limits-card" aria-label={getInlineCopy(isId, "copy_batas_84050af")}>
            <p className="section-kicker">{getInlineCopy(isId, "copy_batas_paket_5e39719")}</p>
            <ul>
              <li><strong>2 GB</strong><span>{getInlineCopy(isId, "copy_per_video_1163a1c")}</span></li>
              <li><strong>180 {getInlineCopy(isId, "copy_mnt_8458f97")}</strong><span>{getInlineCopy(isId, "copy_durasi_maks_04e338f")}</span></li>
              <li><strong>9:16</strong><span>MP4 · H.264</span></li>
            </ul>
          </aside>

          <aside className="panel quick-card" aria-label={getInlineCopy(isId, "copy_jalan_pintas_a57c023")}>
            <p className="section-kicker">{getInlineCopy(isId, "copy_jalan_pintas_46b26d3")}</p>
            <Link to="/app/studio" className="quick-link"><Icon name="clapper" size={15} /> Studio →</Link>
            <Link to="/app/settings" className="quick-link"><Icon name="sliders" size={15} /> {t.navSettings} →</Link>
          </aside>
        </div>
      </div>
    </div>
  )
}
