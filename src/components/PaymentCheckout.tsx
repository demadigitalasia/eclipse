import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Lang } from '../types'
import { getStrings, getCaughtErrorMessage, getLocale } from '../localization'
import { applySubscriptionPromo, cancelSubscriptionPayment, removeSubscriptionPromo, submitSubscriptionPaymentProof, type SubscriptionPayment } from '../api'

export default function PaymentCheckout({
  lang,
  payment,
  onClose,
  onUpdate,
  onCancel,
}: {
  lang: Lang
  payment: SubscriptionPayment
  onClose: () => void
  onUpdate: (payment: SubscriptionPayment) => void
  onCancel: () => void
}) {
  const t = getStrings(lang)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [promoCode, setPromoCode] = useState(payment.promo_code || '')
  const [qrSrc, setQrSrc] = useState('/api/subscription/payment-qr')
  const formatMoney = (value: number) => `Rp ${new Intl.NumberFormat(getLocale(lang)).format(value)}`
  const statusLabel = payment.status === 'submitted'
    ? t.paymentStatusSubmitted
    : payment.status === 'approved'
      ? t.paymentStatusApproved
      : t.paymentStatusAwaiting

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0] || null
    setError('')
    if (!selected) { setFile(null); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError(t.paymentInvalidProof)
      event.currentTarget.value = ''
      setFile(null)
      return
    }
    if (selected.size > 8 * 1024 * 1024) {
      setError(t.paymentProofTooLarge)
      event.currentTarget.value = ''
      setFile(null)
      return
    }
    setFile(selected)
  }

  const submitProof = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await submitSubscriptionPaymentProof(payment.id, file)
      onUpdate(result.payment)
    } catch (cause) {
      setError(getCaughtErrorMessage(cause, lang))
    } finally {
      setBusy(false)
    }
  }

  const cancelOrder = async () => {
    setBusy(true)
    setError('')
    try {
      await cancelSubscriptionPayment(payment.id)
      onCancel()
    } catch (cause) {
      setError(getCaughtErrorMessage(cause, lang))
    } finally {
      setBusy(false)
    }
  }

  const applyPromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!promoCode.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await applySubscriptionPromo(payment.id, promoCode.trim())
      onUpdate(result.payment)
      setPromoCode(result.payment.promo_code)
    } catch (cause) {
      setError(getCaughtErrorMessage(cause, lang))
    } finally { setBusy(false) }
  }

  const removePromo = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await removeSubscriptionPromo(payment.id)
      onUpdate(result.payment)
      setPromoCode('')
    } catch (cause) {
      setError(getCaughtErrorMessage(cause, lang))
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop subscription-checkout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="panel subscription-checkout" role="dialog" aria-modal="true" aria-labelledby="subscription-checkout-title">
        <header className="subscription-checkout__header">
          <div>
            <p className="section-kicker">{t.paymentSectionLabel}</p>
            <h2 id="subscription-checkout-title">{t.paymentHeading(payment.plan.toUpperCase())}</h2>
            <p className="helper">{t.paymentInstructions}</p>
          </div>
          <button type="button" className="mini-btn" onClick={onClose} aria-label={t.close}>×</button>
        </header>

        <div className="subscription-checkout__body">
          <div className="subscription-checkout__qr-wrap">
            <img src={qrSrc} alt={t.paymentImageAlt} onError={() => { if (qrSrc !== '/payment-qris.png') setQrSrc('/payment-qris.png') }} />
            <span>QRIS · GOPAY MERCHANT</span>
          </div>

          <div className="subscription-checkout__details">
            <div className="subscription-checkout__amount">
              <span>{t.paymentExactTransfer}</span>
              <strong>{formatMoney(payment.total_amount)}</strong>
              <small>{t.paymentUniqueIncluded}</small>
            </div>
            {payment.status === 'awaiting_payment' && <form className="subscription-promo-form" onSubmit={(event) => void applyPromo(event)}>
              <label className="admin-subscription-field">
                <span>{t.paymentPromoOptional}</span>
                <input className="input" value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder={t.paymentPromoPlaceholder} maxLength={32} disabled={busy || !!payment.promo_code} />
              </label>
              {payment.promo_code
                ? <button type="button" className="btn-secondary btn-sm" onClick={() => void removePromo()} disabled={busy}>{t.paymentRemoveCode}</button>
                : <button type="submit" className="btn-secondary btn-sm" disabled={busy || promoCode.trim().length < 3}>{t.paymentApplyCode}</button>}
            </form>}
            <dl className="subscription-checkout__receipt">
              <div><dt>{t.paymentPlanPrice}</dt><dd>{formatMoney(payment.base_amount)}</dd></div>
              {payment.discount_amount > 0 && <div className="subscription-checkout__discount"><dt>{t.paymentDiscount}{payment.promo_code ? ' · ' + payment.promo_code : ''}</dt><dd>−{formatMoney(payment.discount_amount)}</dd></div>}
              <div><dt>{t.paymentUniqueCode}</dt><dd className="subscription-checkout__code">{String(payment.unique_code).padStart(3, '0')}</dd></div>
              <div><dt>{t.paymentTransactionId}</dt><dd>{payment.id}</dd></div>
              <div><dt>{t.paymentPlan}</dt><dd>{payment.plan.toUpperCase()}</dd></div>
            </dl>
            {payment.expires_at && payment.status === 'awaiting_payment' && <p className="helper">{t.paymentPayBefore} {new Date(payment.expires_at).toLocaleString(getLocale(lang))}.</p>}

            {payment.status === 'submitted' ? (
              <div className="subscription-checkout__waiting" role="status">
                <strong>{statusLabel}</strong>
                <p>{t.paymentReceiptReceived}</p>
              </div>
            ) : payment.status === 'approved' ? (
              <div className="subscription-checkout__waiting is-approved" role="status">
                <strong>{statusLabel}</strong>
                <p>{t.paymentPlanActive}</p>
              </div>
            ) : payment.status === 'awaiting_payment' ? (
              <form className="subscription-checkout__proof" onSubmit={(event) => void submitProof(event)}>
                <label className="admin-subscription-field">
                  <span>{t.paymentUploadProof}</span>
                  <input ref={fileRef} className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={busy} />
                </label>
                {file && <p className="helper subscription-checkout__filename">{file.name}</p>}
                {error && <p className="error-box" role="alert">{error}</p>}
                <button type="submit" className="btn-primary" disabled={!file || busy}>{busy ? t.paymentSending : t.paymentConfirm}</button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => void cancelOrder()}>{t.paymentCancelOrder}</button>
              </form>
            ) : (
              <div className="subscription-checkout__waiting is-rejected" role="status">
                <strong>{payment.status === 'rejected' ? t.paymentRejected : t.paymentEnded}</strong>
                <p>{payment.decision_note || t.paymentChoosePlanAgain}</p>
              </div>
            )}
            {error && payment.status !== 'awaiting_payment' && <p className="error-box" role="alert">{error}</p>}
          </div>
        </div>
        <p className="subscription-checkout__footnote">{t.paymentFootnote}</p>
      </section>
    </div>
  )
}
