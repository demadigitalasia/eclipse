import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from 'react'
import { useFocusReturn } from './hooks'
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import BrandLogo from './components/BrandLogo'
import ProfileAvatar from './components/ProfileAvatar'
import NotificationBell from './components/NotificationBell'
import Icon from './components/Icon'
import { MVP_LIMITS, type Lang } from './types'
import { getStrings, getInlineCopy, getLocale } from './localization'
import { getSiteStrings } from './localization'
import { getAdminSubscriptionPayments, getServerLimits, type ServerLimits } from './api'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.RegisterPage })))
const ForgotPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.ForgotPage })))
const AdminPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.AdminPage })))
const SettingsPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.SettingsPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'))
const StudioPage = lazy(() => import('./pages/StudioPage'))

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="page" role="status">Memeriksa sesi…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/app" replace />
  return children
}

function PlanOnboardingDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = getSiteStrings(lang)
  const [limits, setLimits] = useState<ServerLimits | null>(null)
  const freeActionRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  useFocusReturn()

  useEffect(() => {
    let active = true
    getServerLimits().then((value) => { if (active) setLimits(value) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    freeActionRef.current?.focus()
  }, [])

  const choosePlan = (plan: 'lite' | 'pro') => {
    onClose()
    navigate(`/app/subscription?checkout=${plan}`)
  }
  const money = (amount: number | undefined, fallback: string) => amount === undefined ? fallback : new Intl.NumberFormat(getLocale(lang)).format(amount)
  const freeLimit = limits
    ? t.planWelcomeTrialDays(limits.freeRenderTrialDays, limits.freeDailyAnalyze)
    : t.planWelcomeFreeLimit
  const term = (months?: number) => months === undefined ? t.planWelcomeTerm : t.planWelcomeActiveTerm(months)
  const features = [
    { title: t.feat1t, description: t.feat1d },
    { title: t.feat2t, description: t.feat2d },
    { title: t.feat3t, description: t.feat3d },
    { title: t.planFeatureHistoryTitle, description: t.planFeatureHistoryDesc },
  ]

  return (
    <div className="modal-backdrop plan-onboarding-backdrop">
      <section className="panel plan-onboarding" role="dialog" aria-modal="true" aria-labelledby="plan-onboarding-title" aria-describedby="plan-onboarding-subtitle">
        <header className="plan-onboarding__header">
          <p className="section-kicker">{t.planWelcomeEyebrow}</p>
          <h2 id="plan-onboarding-title">{t.planWelcomeTitle}</h2>
          <p id="plan-onboarding-subtitle" className="helper">{t.planWelcomeSub}</p>
        </header>

          <div className="plan-onboarding__grid">
            <article className="plan-onboarding__card plan-onboarding__card--free">
              <div className="plan-onboarding__card-heading">
                <p className="section-kicker">{t.priceFree}</p>
                <span className="plan-onboarding__tag">{t.planWelcomeTrialBadge}</span>
              </div>
              <div className="plan-onboarding__quota"><strong>{limits ? `${limits.freeDailyRender}×` : '1×'}</strong><span>{t.planWelcomeQuotaUnit}</span></div>
              <p className="plan-onboarding__limit">{freeLimit}</p>
              <button ref={freeActionRef} type="button" className="btn-secondary plan-onboarding__free-action" onClick={onClose}>{t.planWelcomeFreeAction}</button>
            </article>
            <article className="plan-onboarding__card">
              <div className="plan-onboarding__card-heading">
                <p className="section-kicker">{t.priceLite}</p>
                <span className="plan-onboarding__tag">{t.planWelcomeMonthlyBadge}</span>
              </div>
              <div className="plan-onboarding__quota"><strong>{limits?.liteDailyRender ?? 15}</strong><span>{t.planWelcomeQuotaUnit}</span></div>
              <div className="plan-onboarding__price">{(limits?.liteDiscountAmountIdr ?? 0) > 0 && <s>Rp {money(limits?.liteMonthlyPriceIdr, t.priceLitePrice.replace(/^Rp\s*/, ''))}</s>}<strong>Rp {money((limits?.liteMonthlyPriceIdr ?? 150000) - (limits?.liteDiscountAmountIdr ?? 0), t.priceLitePrice.replace(/^Rp\s*/, ''))}</strong><small>{t.perMonth}</small></div>
              <p className="plan-onboarding__limit">{term(limits?.liteTermMonths)}</p>
              <button type="button" className="btn-primary" onClick={() => choosePlan('lite')}>{t.planWelcomeLiteAction}</button>
            </article>
            <article className="plan-onboarding__card plan-onboarding__card--pro">
              <div className="plan-onboarding__card-heading">
                <p className="section-kicker">{t.pricePro}</p>
                <span className="plan-onboarding__tag">{t.planWelcomeHighestBadge}</span>
              </div>
              <div className="plan-onboarding__quota"><strong>{limits?.proDailyRender ?? 25}</strong><span>{t.planWelcomeQuotaUnit}</span></div>
              <div className="plan-onboarding__price">{(limits?.proDiscountAmountIdr ?? 0) > 0 && <s>Rp {money(limits?.proMonthlyPriceIdr, t.priceProPrice.replace(/^Rp\s*/, ''))}</s>}<strong>Rp {money((limits?.proMonthlyPriceIdr ?? 300000) - (limits?.proDiscountAmountIdr ?? 0), t.priceProPrice.replace(/^Rp\s*/, ''))}</strong><small>{t.perMonth}</small></div>
              <p className="plan-onboarding__limit">{term(limits?.proTermMonths)}</p>
              <button type="button" className="btn-primary" onClick={() => choosePlan('pro')}>{t.planWelcomeProAction}</button>
            </article>
          </div>

        <section className="plan-onboarding__features" aria-labelledby="plan-onboarding-features-title">
          <header>
            <p className="section-kicker">{t.planWelcomeFeatureEyebrow}</p>
            <h3 id="plan-onboarding-features-title">{t.planFeaturesTitle}</h3>
            <p className="helper">{t.planFeaturesSub}</p>
          </header>
          <div className="plan-onboarding__feature-grid">
            {features.map((feature, index) => (
              <article key={feature.title} className="plan-onboarding__feature">
                <span aria-hidden="true">0{index + 1}</span>
                <div><h4>{feature.title}</h4><p>{feature.description}</p></div>
              </article>
            ))}
          </div>
          <p className="plan-onboarding__footnote">{t.planWelcomeCheckout} {t.planWelcomeAdmin}</p>
        </section>
      </section>
    </div>
  )
}

function Shell({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = getSiteStrings(lang)
  const { user, logout, loginEvent } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [railOpen, setRailOpen] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(loc.pathname.startsWith('/app/admin'))
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [showPlanOnboarding, setShowPlanOnboarding] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideLimits, setGuideLimits] = useState<ServerLimits | null>(null)
  const [pendingPayments, setPendingPayments] = useState<number | null>(null)
  useFocusReturn(confirmLogout)
  useFocusReturn(guideOpen)

  useEffect(() => {
    if (!guideOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGuideOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guideOpen])

  useEffect(() => {
    if (!guideOpen) return
    let active = true
    getServerLimits().then((limits) => { if (active) setGuideLimits(limits) }).catch(() => {
      if (active) setGuideLimits(null)
    })
    return () => { active = false }
  }, [guideOpen])

  useEffect(() => {
    if (user?.role !== 'admin') {
      setPendingPayments(null)
      return
    }
    let active = true
    const refreshPendingPayments = async () => {
      try {
        const { payments } = await getAdminSubscriptionPayments()
        if (active) setPendingPayments(payments.filter((payment) => payment.status === 'submitted').length)
      } catch {
        // Keep the last known count if a temporary request fails.
      }
    }
    void refreshPendingPayments()
    const timer = window.setInterval(() => void refreshPendingPayments(), 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user?.role])

  useEffect(() => {
    if (loginEvent > 0 && user?.role !== 'admin' && user?.plan === 'free') setShowPlanOnboarding(true)
  }, [loginEvent])

  useEffect(() => {
    if (!railOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [railOpen])

  useEffect(() => {
    if (!confirmLogout) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmLogout(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmLogout])

  const items: { to: string; label: string; end: boolean; icon: 'grid' | 'clapper' | 'sliders' | 'creditCard' }[] = [
    { to: '/app', label: t.navDashboard, end: true, icon: 'grid' },
    { to: '/app/studio', label: t.navApp, end: false, icon: 'clapper' },
    { to: '/app/subscription', label: t.navSubscription, end: false, icon: 'creditCard' },
    { to: '/app/settings', label: t.navSettings, end: false, icon: 'sliders' },
  ]
  const adminItems = [
    { to: '/app/admin/overview', label: t.navAdminOverview, icon: 'grid' as const },
    { to: '/app/admin/users', label: t.navAdminUsers, icon: 'users' as const },
    { to: '/app/admin/subscription', label: t.navAdminSubscription, icon: 'creditCard' as const },
    { to: '/app/admin/gemini', label: 'Gemini API', icon: 'key' as const },
    { to: '/app/admin/proxy', label: getInlineCopy(lang, "copy_proxy_egress_b7596d1"), icon: 'globe' as const },
    { to: '/app/admin/activity', label: t.navAdminActivity, icon: 'activity' as const },
    { to: '/app/admin/settings', label: t.navAdminSettings, icon: 'sliders' as const },
  ]

  return (
    <div className="shell">
      <aside className={`rail ${railOpen ? 'is-open' : ''}`} aria-label="Navigasi utama">
        <Link to="/" className="rail-brand">
          <BrandLogo />
        </Link>
        <nav className="rail-nav">
          {items.map((it) => {
            const active = it.end ? loc.pathname === '/app' : loc.pathname.startsWith(it.to)
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`rail-link ${active ? 'is-on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setRailOpen(false)}
              >
                <Icon name={it.icon} size={19} />
                {it.label}
              </Link>
            )
          })}
          <button type="button" className="rail-link rail-guide" onClick={() => setGuideOpen(true)}>
            <Icon name="book" size={19} />
            {t.navGuide}
          </button>
          {user?.role === 'admin' && (
            <div className="rail-group">
              <button
                type="button"
                className={`rail-link rail-group-trigger ${loc.pathname.startsWith('/app/admin') ? 'is-on' : ''}`}
                aria-expanded={adminExpanded}
                aria-controls="admin-subnav"
                onClick={() => setAdminExpanded((expanded) => !expanded)}
              >
                <Icon name="shield" size={19} />
                <span>{t.navAdmin}</span>
                <span className={`rail-chevron ${adminExpanded ? 'is-open' : ''}`} aria-hidden="true"><Icon name="chevronDown" size={14} /></span>
              </button>
              {adminExpanded && (
                <div className="rail-subnav" id="admin-subnav">
                  {adminItems.map((item) => {
                    const active = loc.pathname === item.to
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`rail-link rail-sublink ${active ? 'is-on' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setRailOpen(false)}
                      >
                        <Icon name={item.icon} size={17} />
                        {item.label}
                        {item.to === '/app/admin/subscription' && pendingPayments !== null && pendingPayments > 0 && <span className="rail-notification-count" aria-label={`${pendingPayments} payment receipts need review`}>{pendingPayments}</span>}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </nav>
        <div className="rail-foot">
          <div className="rail-tools">
            <div className="lang-switch lang-switch--rail" role="group" aria-label={t.navLanguage}>
              <button type="button" className={lang === 'id' ? 'is-on' : ''} onClick={() => setLang('id')} aria-pressed={lang === 'id'}>ID</button>
              <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>EN</button>
            </div>
          </div>
          <div className="rail-account">
            <Link to="/app/settings" className="rail-user" onClick={() => setRailOpen(false)}>
              <ProfileAvatar name={user?.name || '?'} photoUpdatedAt={user?.profilePhotoUpdatedAt} />
              <span className="rail-user-copy">
                <strong>{user?.name}</strong>
                <span>{user?.role === 'admin' ? t.navAdminUnlimited : `${user?.role} · ${user?.plan}`}</span>
              </span>
            </Link>
            <button type="button" className="btn-ghost" onClick={() => setConfirmLogout(true)}>
              <Icon name="logout" size={16} />
              {t.navLogout}
            </button>
          </div>
        </div>
      </aside>
      {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} aria-hidden="true" />}
      <div className={`shell-main ${loc.pathname === '/app/studio' ? 'shell-main--studio' : ''}`}>
        <div className="app-toolbar">
          <button type="button" className="rail-toggle btn-ghost" onClick={() => setRailOpen(!railOpen)} aria-label={t.navToggle} aria-expanded={railOpen}>
            <Icon name="menu" />
            <span className="rail-toggle-label">{t.navDashboard}</span>
          </button>
          {loc.pathname !== '/app/studio' && <NotificationBell lang={lang} />}
        </div>
        {user?.role === 'admin' && pendingPayments !== null && pendingPayments > 0 && loc.pathname.startsWith('/app/admin') && (
          <Link to="/app/admin/subscription" className="admin-payment-notice" aria-live="polite">
            <Icon name="creditCard" size={18} />
            <span><strong>{t.pendingPaymentNotice(pendingPayments)}</strong><small>{t.pendingPaymentHelp}</small></span>
            <span className="admin-payment-notice__action">{t.pendingPaymentAction} →</span>
          </Link>
        )}
        <Routes>
          <Route index element={<DashboardPage lang={lang} />} />
          <Route path="studio" element={<StudioPage lang={lang} />} />
          <Route path="subscription" element={<SubscriptionPage lang={lang} />} />
          <Route path="settings" element={<SettingsPage lang={lang} setLang={setLang} />} />
          <Route
            path="admin/*"
            element={
              <RequireAdmin>
                <AdminPage lang={lang} />
              </RequireAdmin>
            }
          />
        </Routes>
      </div>

      {confirmLogout && (
        <div className="modal-backdrop" onClick={() => setConfirmLogout(false)}>
          <div className="panel modal" role="dialog" aria-modal="true" aria-label={t.navLogout} onClick={(e) => e.stopPropagation()}>
            <h3>{t.navLogout}?</h3>
            <p className="helper">{user?.email}</p>
            <div className="row-inline modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmLogout(false)}>
                {t.close}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  void logout().finally(() => nav('/', { replace: true }))
                }}
              >
                {t.navLogout}
              </button>
            </div>
          </div>
        </div>
      )}

      {guideOpen && (() => {
        const guide = getStrings(lang)
        const acceptedFormats = MVP_LIMITS.acceptedExtensions.map((extension) => extension.slice(1).toUpperCase()).join(', ')
        const maxSourceSize = guideLimits?.maxSourceLabel ?? MVP_LIMITS.maxSourceLabel
        const maxDurationMinutes = Math.floor((guideLimits?.maxDurationSec ?? MVP_LIMITS.maxDurationSec) / 60)
        const mediaTtlHours = guideLimits?.tempFileTtlHours ?? MVP_LIMITS.tempFileTtlHours
        const metadataRetentionDays = guideLimits?.metadataRetentionDays ?? MVP_LIMITS.metadataRetentionDays
        const maxBatchClips = guideLimits?.maxBatchClips ?? MVP_LIMITS.maxBatchClips
        const exportFormat = guideLimits?.exportFormat ?? 'MP4'
        const guideSteps = [
          { title: guide.guideStep1Title, body: guide.guide1 },
          { title: guide.guideStep2Title, body: guide.guide2 },
          { title: guide.guideStep3Title, body: guide.guide3 },
          { title: guide.guideStep4Title, body: guide.guide4 },
          { title: guide.guideStep5Title, body: guide.guide5(maxBatchClips, exportFormat) },
          { title: guide.guideStep6Title, body: guide.guide6(mediaTtlHours, metadataRetentionDays) },
        ]
        return (
          <div className="modal-backdrop" onClick={() => setGuideOpen(false)}>
            <div className="panel modal guide-modal" role="dialog" aria-modal="true" aria-labelledby="user-guide-title" aria-describedby="user-guide-intro" onClick={(event) => event.stopPropagation()}>
              <header className="guide-modal__header">
                <h2 id="user-guide-title">{guide.guideTitle}</h2>
                <p id="user-guide-intro" className="helper">{guide.guideIntro}</p>
              </header>
              <section className="guide-limits" aria-label={guide.guideLimitsTitle}>
                <strong>{guide.guideLimitsTitle}</strong>
                <span>{guide.guideSourceLimits(acceptedFormats, maxSourceSize, maxDurationMinutes)}</span>
              </section>
              <ol className="guide-steps">
                {guideSteps.map((step, index) => (
                  <li className="guide-step" key={step.title}>
                    <span className="guide-step__number" aria-hidden="true">{index + 1}</span>
                    <div><h3>{step.title}</h3><p>{step.body}</p></div>
                  </li>
                ))}
              </ol>
              <p className="helper guide-score-note">{guide.guideScoreContext}</p>
              <div className="row-inline modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setGuideOpen(false)}>{guide.close}</button>
                <button type="button" className="btn-primary" autoFocus onClick={() => { setGuideOpen(false); nav('/app/studio') }}>{guide.guideOpenStudio}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {showPlanOnboarding && (
        <PlanOnboardingDialog lang={lang} onClose={() => setShowPlanOnboarding(false)} />
      )}
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('eclipse_lang') === 'en' ? 'en' : 'id'))
  const changeLang = (l: Lang) => {
    setLang(l)
    localStorage.setItem('eclipse_lang', l)
  }

  return (
    <AuthProvider>
      <HashRouter>
        <Suspense fallback={<div className="page" role="status">Memuat halaman…</div>}>
          <Routes>
            <Route path="/" element={<LandingPage lang={lang} setLang={changeLang} />} />
            <Route path="/login" element={<LoginPage lang={lang} />} />
            <Route path="/register" element={<RegisterPage lang={lang} />} />
            <Route path="/forgot" element={<ForgotPage lang={lang} />} />
            <Route
              path="/app/*"
              element={
                <RequireAuth>
                  <Shell lang={lang} setLang={changeLang} />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  )
}
