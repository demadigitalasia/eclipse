import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import Icon from '../components/Icon'
import PaymentCheckout from '../components/PaymentCheckout'
import type { Lang } from '../types'
import { getSiteStrings, getInlineCopy, getLocale } from '../localization'
import { createSubscriptionPayment, getMySubscriptionPayments, getServerLimits, type ServerLimits, type SubscriptionPayment } from '../api'

export default function SubscriptionPage({ lang }: { lang: Lang }) {
  const t = getSiteStrings(lang)
  const { user, refreshUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPlan, setSelectedPlan] = useState<'unlimited' | null>(null)
  const [limits, setLimits] = useState<ServerLimits | null>(null)
  const [payment, setPayment] = useState<SubscriptionPayment | null>(null)
  const [paymentsReady, setPaymentsReady] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const autoStart = useRef(false)
  useEffect(() => { let active = true; getServerLimits().then((value) => { if (active) setLimits(value) }).catch(() => {}); return () => { active = false } }, [])
  useEffect(() => {
    let active = true
    getMySubscriptionPayments().then(({ payments }) => {
      if (!active) return
      const pending = payments.find((item) => item.status === 'awaiting_payment' || item.status === 'submitted')
      setPayment(pending || payments[0] || null)
    }).catch(() => {}).finally(() => { if (active) setPaymentsReady(true) })
    return () => { active = false }
  }, [])
  const isId = lang === 'id'
  const isAdmin = user?.role === 'admin'
  const accountPlan = user?.plan ?? 'free'
  const freeTrialDays = limits?.freeRenderTrialDays ?? 3
  const freeExpiry = new Date(new Date(user?.createdAt || Date.now()).getTime() + freeTrialDays * 24 * 60 * 60 * 1000)
  const expiry = accountPlan === 'free' ? freeExpiry : user?.planExpiresAt ? new Date(user.planExpiresAt) : null
  const isExpired = !isAdmin && expiry !== null && Date.now() >= expiry.getTime()
  const activeName = isAdmin ? t.unlimitedLabel : accountPlan === 'free' ? t.planFree : accountPlan === 'lite' ? t.planLite : t.planPro
  const expiryLabel = expiry && !Number.isNaN(expiry.getTime())
    ? new Intl.DateTimeFormat(getLocale(lang), { dateStyle: 'long' }).format(expiry)
    : '—'
  const money = (amount: number | undefined, fallback: string) => amount === undefined ? fallback : new Intl.NumberFormat(getLocale(lang)).format(amount)
  const formatMoney = (amount: number) => `Rp ${new Intl.NumberFormat(getLocale(lang)).format(amount)}`
  const freeLimit = limits
    ? isId
      ? `Uji coba ${limits.freeRenderTrialDays} hari sejak mendaftar · maks. ${limits.freeDailyAnalyze} analisis/hari`
      : `${limits.freeRenderTrialDays}-day trial after signup · up to ${limits.freeDailyAnalyze} analyses/day`
    : t.planWelcomeFreeLimit
  const term = (months?: number) => months === undefined
    ? t.planWelcomeTerm
    : isId ? `Masa aktif ${months} bulan` : `Active for ${months} ${months === 1 ? 'month' : 'months'}`
  const priceNote = isId
    ? `Lite Rp${money(limits?.liteMonthlyPriceIdr, '150.000')}/bulan · Pro Rp${money(limits?.proMonthlyPriceIdr, '300.000')}/bulan · bayar via QRIS.${(limits?.liteDiscountAmountIdr || limits?.proDiscountAmountIdr) ? ' Diskon periode promo diterapkan otomatis; kode promo bisa dimasukkan saat checkout.' : ''}`
    : `Lite is Rp${money(limits?.liteMonthlyPriceIdr, '150,000')}/month · Pro is Rp${money(limits?.proMonthlyPriceIdr, '300,000')}/month · pay by QRIS.${(limits?.liteDiscountAmountIdr || limits?.proDiscountAmountIdr) ? ' Scheduled discounts apply automatically; enter promo codes at checkout.' : ''}`
  const plans = [
    { id: 'free', name: t.priceFree, price: getInlineCopy(isId, "copy_gratis_bd4ffb5"), basePrice: 0, discountAmount: 0, quota: `${limits?.freeDailyRender ?? 1}×`, period: freeLimit, current: !isAdmin && accountPlan === 'free' },
    { id: 'lite', name: t.priceLite, price: `Rp ${money(limits?.liteMonthlyPriceIdr, '150.000')}`, basePrice: limits?.liteMonthlyPriceIdr ?? 150000, discountAmount: limits?.liteDiscountAmountIdr ?? 0, quota: `${limits?.liteDailyRender ?? 15}×`, period: term(limits?.liteTermMonths), current: !isAdmin && accountPlan === 'lite' },
    { id: 'pro', name: t.pricePro, price: `Rp ${money(limits?.proMonthlyPriceIdr, '300.000')}`, basePrice: limits?.proMonthlyPriceIdr ?? 300000, discountAmount: limits?.proDiscountAmountIdr ?? 0, quota: `${limits?.proDailyRender ?? 25}×`, period: term(limits?.proTermMonths), current: !isAdmin && accountPlan === 'pro' },
    { id: 'unlimited', name: t.unlimitedLabel, price: getInlineCopy(isId, "copy_khusus_hub_admin_806a185"), basePrice: 0, discountAmount: 0, quota: '∞', period: getInlineCopy(isId, "copy_tanpa_batas_kuota_bca1285"), current: isAdmin },
  ]
  const startPayment = async (plan: 'lite' | 'pro') => {
    setPaymentError('')
    if (payment && (payment.status === 'awaiting_payment' || payment.status === 'submitted')) {
      setShowCheckout(true)
      if (payment.plan !== plan) setPaymentError(isId ? `Selesaikan atau batalkan pesanan ${payment.plan.toUpperCase()} terlebih dahulu.` : `Finish or cancel your ${payment.plan.toUpperCase()} order first.`)
      return
    }
    setPaymentBusy(true)
    try {
      const result = await createSubscriptionPayment(plan)
      setPayment(result.payment)
      setShowCheckout(true)
    } catch (cause) {
      setPaymentError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_pesanan_pembayaran_gagal_dibuat_c544d69")))
      try {
        const { payments } = await getMySubscriptionPayments()
        const pending = payments.find((item) => item.status === 'awaiting_payment' || item.status === 'submitted')
        if (pending) { setPayment(pending); setShowCheckout(true) }
      } catch { /* keep the original order error */ }
    } finally {
      setPaymentBusy(false)
    }
  }

  const checkoutPlan = searchParams.get('checkout')
  useEffect(() => {
    if (autoStart.current || !paymentsReady || (checkoutPlan !== 'lite' && checkoutPlan !== 'pro')) return
    autoStart.current = true
    void startPayment(checkoutPlan)
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
  }, [checkoutPlan, paymentsReady, searchParams, setSearchParams])

  useEffect(() => {
    if (!payment || payment.status !== 'submitted') return
    let active = true
    const refreshPayment = async () => {
      try {
        const { payments } = await getMySubscriptionPayments()
        const latest = payments.find((item) => item.id === payment.id)
        if (!active || !latest) return
        setPayment(latest)
        if (latest.status === 'approved') {
          setShowCheckout(false)
          await refreshUser()
        }
      } catch { /* keep the last known payment state until the next check */ }
    }
    const timer = window.setInterval(() => void refreshPayment(), 15000)
    const onFocus = () => { void refreshPayment() }
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [payment, refreshUser])
  const features = [
    { title: t.feat1t, description: t.feat1d },
    { title: t.feat2t, description: t.feat2d },
    { title: t.feat3t, description: t.feat3d },
    { title: t.planFeatureHistoryTitle, description: t.planFeatureHistoryDesc },
  ]

  if (!user) return null

  return (
    <main className="page subscription-page">
      <header className="dashboard-heading dashboard-heading--split">
        <div>
          <p className="section-kicker">{t.navSubscription}</p>
          <h2>{t.subscriptionHeading}</h2>
          <p className="helper">{t.subscriptionIntro}</p>
        </div>
        <Link to="/app/settings" className="btn-secondary subscription-settings-link">
          <Icon name="sliders" size={16} />
          {t.navSettings}
        </Link>
      </header>

      <section className="panel subscription-current" aria-labelledby="subscription-current-title">
        <div className="subscription-current__main">
          <p className="section-kicker">{t.subscriptionActive}</p>
          <h3 id="subscription-current-title">{activeName}</h3>
          {isAdmin ? (
            <p className="helper">{t.unlimitedDesc}</p>
          ) : (
            <p className="helper">
              {isExpired
                ? t.subscriptionExpired
                : user.plan === 'free'
                  ? `${t.subscriptionTrialEnds}: ${expiryLabel}`
                  : `${t.subscriptionExpires}: ${expiryLabel}`}
            </p>
          )}
        </div>
        <div className="subscription-current__quota">
          <strong>{isAdmin ? '∞' : accountPlan === 'free' ? `${limits?.freeDailyRender ?? 1}×` : accountPlan === 'lite' ? `${limits?.liteDailyRender ?? 15}×` : `${limits?.proDailyRender ?? 25}×`}</strong>
          <span>{getInlineCopy(isId, "copy_batch_generate_per_hari_9974f90")}</span>
        </div>
        {!isAdmin && isExpired && <span className="chip subscription-expired-chip">{getInlineCopy(isId, "copy_perlu_upgrade_5f1db35")}</span>}
      </section>

      <section className="subscription-section" aria-labelledby="subscription-plans-title">
        <header className="subscription-section__heading">
          <div>
            <p className="section-kicker">01 — {t.subscriptionAvailable}</p>
            <h3 id="subscription-plans-title">{getInlineCopy(isId, "copy_pilih_kuota_yang_sesuai_d0e030b")}</h3>
          </div>
          <p className="helper">{priceNote}</p>
        </header>
        <div className="subscription-plans">
          {plans.map((plan) => {
            const chosen = selectedPlan === plan.id
            const actionLabel = plan.current
              ? t.subscriptionCurrentButton
              : chosen
                ? t.subscriptionSelected
                : plan.id === 'lite'
                  ? t.subscriptionChooseLite
                  : plan.id === 'pro'
                    ? t.subscriptionChoosePro
                    : t.subscriptionChooseUnlimited
            const selectable = !plan.current && (plan.id !== 'free' || accountPlan === 'free')
            return (
            <article key={plan.id} className={`subscription-plan-card${plan.current ? ' is-current' : ''}${plan.id === 'pro' ? ' is-pro' : ''}${chosen ? ' is-selected' : ''}`}>
              <div className="subscription-plan-card__top">
                <p className="section-kicker">{plan.name}</p>
                {plan.current && <span className="chip is-on">{getInlineCopy(isId, "copy_paket_aktif_5571bf6")}</span>}
              </div>
              <div className="subscription-plan-card__quota"><strong>{plan.id === 'unlimited' ? '∞' : plan.quota}</strong><span>{getInlineCopy(isId, "copy_batch_generate_hari_1117d0b")}</span></div>
              <div className="subscription-plan-card__price">{plan.discountAmount > 0 ? <><s>{plan.price}</s><strong>Rp {money(plan.basePrice - plan.discountAmount, '0')}</strong><span className="subscription-promo-badge">-{Math.round(plan.discountAmount / plan.basePrice * 100)}% {getInlineCopy(isId, "copy_promo_2aa0cce")}</span></> : plan.price}{(plan.id === 'lite' || plan.id === 'pro') && <small>{t.perMonth}</small>}</div>
              <p className="subscription-plan-card__term">{plan.period}</p>
              {plan.current ? (
                <button type="button" className="btn-secondary subscription-plan-card__action" disabled>{actionLabel}</button>
              ) : selectable ? (
                <button
                  type="button"
                  className={chosen ? 'btn-secondary subscription-plan-card__action' : 'btn-primary subscription-plan-card__action'}
                  disabled={paymentBusy || ((plan.id === 'lite' || plan.id === 'pro') && (limits?.[plan.id === 'lite' ? 'liteMonthlyPriceIdr' : 'proMonthlyPriceIdr'] ?? 1) <= 0)}
                  onClick={() => {
                    if (plan.id === 'lite' || plan.id === 'pro') void startPayment(plan.id)
                    else setSelectedPlan('unlimited')
                  }}
                >
                  {actionLabel}
                </button>
              ) : null}
            </article>
          )})}
        </div>
        {paymentError && <p className="error-box" role="alert">{paymentError}</p>}
        {selectedPlan === 'unlimited' && <p className="subscription-selection-notice" role="status">{t.planWelcomeAdmin}</p>}
        {payment && ['awaiting_payment', 'submitted', 'approved', 'rejected'].includes(payment.status) && !showCheckout && (
          <div className={`subscription-payment-banner is-${payment.status}`} role="status">
            <div>
              <strong>{payment.status === 'awaiting_payment' ? (getInlineCopy(isId, "copy_pembayaran_belum_selesai_4a2adb4")) : payment.status === 'submitted' ? (getInlineCopy(isId, "copy_bukti_menunggu_verifikasi_c886c46")) : payment.status === 'approved' ? (getInlineCopy(isId, "copy_langganan_aktif_1ceb2dd")) : (getInlineCopy(isId, "copy_pembayaran_ditolak_3cd6b9e"))}</strong>
              <span>{payment.status === 'approved' ? `${payment.plan.toUpperCase()} · ${formatMoney(payment.total_amount)}` : payment.status === 'rejected' ? (payment.decision_note || (getInlineCopy(isId, "copy_buat_pesanan_baru_untuk_mencoba_ke_d7c5162"))) : `${payment.id} · ${formatMoney(payment.total_amount)}`}</span>
            </div>
            {(payment.status === 'awaiting_payment' || payment.status === 'submitted') && <button type="button" className="btn-secondary btn-sm" onClick={() => setShowCheckout(true)}>{getInlineCopy(isId, "copy_lihat_pembayaran_0e9aa39")}</button>}
          </div>
        )}
        <p className="subscription-admin-note">{getInlineCopy(isId, "copy_pembayaran_melalui_qris_diverifika_de40a22")} {t.planWelcomeAdmin}</p>
      </section>

      <section className="subscription-section" aria-labelledby="subscription-features-title">
        <header className="subscription-section__heading">
          <div>
            <p className="section-kicker">02 — {getInlineCopy(isId, "copy_fitur_b8a4208")}</p>
            <h3 id="subscription-features-title">{t.subscriptionFeatureTitle}</h3>
          </div>
        </header>
        <div className="subscription-features">
          {features.map((feature, index) => (
            <article className="subscription-feature" key={feature.title}>
              <span aria-hidden="true">0{index + 1}</span>
              <div><h4>{feature.title}</h4><p>{feature.description}</p></div>
            </article>
          ))}
        </div>
      </section>
      {showCheckout && payment && <PaymentCheckout
        lang={lang}
        payment={payment}
        onClose={() => setShowCheckout(false)}
        onUpdate={(updated) => { setPayment(updated); setPaymentError(''); if (updated.status === 'approved') void refreshUser() }}
        onCancel={() => { setPayment((current) => current ? { ...current, status: 'cancelled' } : null); setShowCheckout(false) }}
      />}
    </main>
  )
}
