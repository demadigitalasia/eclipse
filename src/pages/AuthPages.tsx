import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { getPasswordResetStatus, getRegistrationStatus } from '../api'
import BrandLogo from '../components/BrandLogo'
import Icon from '../components/Icon'
import type { Lang } from '../types'
import { getSiteStrings, type SiteStrings } from '../localization'

function AuthShell({ t, title, sub, children, onSubmit }: { t: SiteStrings; title: string; sub: string; children: ReactNode; onSubmit?: () => void }) {
  return (
    <div className="auth-split">
      <aside className="auth-side">
        <Link to="/" className="site-brand">
          <BrandLogo />
        </Link>
        <p className="section-kicker">EDITOR VIDEO AI</p>
        <h2>{t.authSideT}</h2>
        <ul>
          <li>{t.authSide1}</li>
          <li>{t.authSide2}</li>
          <li>{t.authSide3}</li>
        </ul>
        <p className="auth-limits">{t.authLimits}</p>
      </aside>
      <div className="auth-main">
        <form className="panel auth-card" onSubmit={(e) => { e.preventDefault(); onSubmit?.() }}>
          <h2>{title}</h2>
          {sub && <p className="helper">{sub}</p>}
          {children}
        </form>
      </div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string | null }) {
  const ref = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (msg) ref.current?.focus()
  }, [msg])
  if (!msg) return null
  return (
    <p className="error-box" role="alert" tabIndex={-1} ref={ref}>
      {msg}
    </p>
  )
}

function PassField({
  id, label, value, onChange, showLabel, hideLabel, autoComplete = 'current-password',
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; showLabel: string; hideLabel: string; autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="row">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="pass-wrap">
        <input
          id={id}
          className="input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={6}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="mini-btn pass-toggle"
          onClick={() => setShow(!show)}
          aria-pressed={show}
          aria-label={show ? hideLabel : showLabel}
        >
          <Icon name={show ? 'eyeOff' : 'eye'} />
        </button>
      </div>
    </div>
  )
}

function strength(pass: string): 0 | 1 | 2 | 3 {
  if (pass.length < 6) return 0
  let s = 1
  if (pass.length >= 10) s++
  if (/[A-Z]/.test(pass) && /[0-9]/.test(pass)) s++
  return Math.min(3, s) as 0 | 1 | 2 | 3
}

export function LoginPage({ lang }: { lang: Lang }) {
  const t = getSiteStrings(lang)
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const doLogin = async () => {
    if (busy) return
    setBusy(true)
    const msg = await login(email, pass)
    setBusy(false)
    if (msg) setErr(msg)
    else nav('/app', { replace: true })
  }

  return (
    <AuthShell t={t} title={t.loginT} sub={t.loginSub} onSubmit={doLogin}>
      <div className="row">
        <label className="field-label" htmlFor="login-email">{t.fEmail}</label>
        <input id="login-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <PassField id="login-pass" label={t.fPass} value={pass} onChange={setPass} showLabel={t.passShow} hideLabel={t.passHide} />
      <div className="row-inline" style={{ justifyContent: 'flex-end' }}>
        <Link to="/forgot" className="text-link">{t.forgotLink}</Link>
      </div>
      <ErrorBox msg={err} />
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? '…' : t.navLogin}
      </button>
      <p className="helper">
        {t.needAccount} <Link to="/register">{t.navRegister}</Link>
      </p>
    </AuthShell>
  )
}

export function RegisterPage({ lang }: { lang: Lang }) {
  const t = getSiteStrings(lang)
  const { register } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [registrationStatus, setRegistrationStatus] = useState<'checking' | 'open' | 'closed' | 'unavailable'>('checking')
  const s = strength(pass)
  const labels = ['', t.passWeak, t.passMid, t.passStrong]
  const checkRegistration = useCallback(async () => {
    setRegistrationStatus('checking')
    try {
      const status = await getRegistrationStatus()
      setRegistrationStatus(status.enabled ? 'open' : 'closed')
    } catch {
      setRegistrationStatus('unavailable')
    }
  }, [])
  useEffect(() => { void checkRegistration() }, [checkRegistration])
  const doRegister = async () => {
    if (busy || registrationStatus !== 'open') return
    setBusy(true)
    const msg = await register(name, email, pass)
    setBusy(false)
    if (msg) setErr(msg)
    else nav('/app', { replace: true })
  }

  return (
    <AuthShell
      t={t}
      title={registrationStatus === 'closed' ? t.regClosedTitle : t.regT}
      sub={registrationStatus === 'closed' ? '' : t.regSub}
      onSubmit={doRegister}
    >
      {registrationStatus === 'checking' && <p className="auth-status" role="status">{t.regChecking}</p>}
      {registrationStatus === 'closed' && (
        <div className="auth-status" role="status">
          <p>{t.regClosedBody}</p>
        </div>
      )}
      {registrationStatus === 'unavailable' && (
        <div className="auth-status auth-status--error" role="alert">
          <p>{t.regUnavailable}</p>
          <button type="button" className="btn-secondary" onClick={() => void checkRegistration()}>{t.regRetry}</button>
        </div>
      )}
      {registrationStatus === 'open' && (
        <>
          <div className="row">
            <label className="field-label" htmlFor="reg-name">{t.fName}</label>
            <input id="reg-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </div>
          <div className="row">
            <label className="field-label" htmlFor="reg-email">{t.fEmail}</label>
            <input id="reg-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
      <PassField id="reg-pass" label={t.fPass} value={pass} onChange={setPass} showLabel={t.passShow} hideLabel={t.passHide} autoComplete="new-password" />
          {pass && (
            <div className="strength" aria-live="polite">
              <div className="progress"><div style={{ width: `${(s / 3) * 100}%` }} /></div>
              <span className="helper">{labels[s]}</span>
            </div>
          )}
          <ErrorBox msg={err} />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '…' : t.navRegister}
          </button>
        </>
      )}
      {registrationStatus !== 'checking' && <p className="helper">{t.haveAccount} <Link to="/login">{t.navLogin}</Link></p>}
    </AuthShell>
  )
}

export function ForgotPage({ lang }: { lang: Lang }) {
  const t = getSiteStrings(lang)
  const { requestReset, confirmReset } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pass, setPass] = useState('')
  const [stage, setStage] = useState<'email' | 'code' | 'done'>('email')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetStatus, setResetStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  useEffect(() => {
    let active = true
    getPasswordResetStatus().then(({ enabled }) => {
      if (active) setResetStatus(enabled ? 'available' : 'unavailable')
    }).catch(() => {
      if (active) setResetStatus('unavailable')
    })
    return () => { active = false }
  }, [])
  const sendCode = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const message = await requestReset(email)
    setBusy(false)
    if (message) {
      setErr(message)
      return
    }
    setSent(true)
    setStage('code')
  }
  const savePassword = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const message = await confirmReset(email, code, pass)
    setBusy(false)
    if (message) {
      setErr(message)
      return
    }
    setStage('done')
  }
  return (
    <AuthShell t={t} title={t.forgotT} sub={stage === 'email' && resetStatus === 'available' ? t.forgotSub : ''} onSubmit={stage === 'email' ? sendCode : savePassword}>
      {resetStatus === 'checking' && <p className="auth-status" role="status">…</p>}
      {resetStatus === 'unavailable' && <p className="notice" role="status">{t.forgotUnavailable}</p>}
      {resetStatus === 'available' && stage === 'email' && (
        <>
          <div className="row">
            <label className="field-label" htmlFor="forgot-email">{t.fEmail}</label>
            <input id="forgot-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </div>
          <ErrorBox msg={err} />
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '…' : t.forgotSend}</button>
        </>
      )}
      {resetStatus === 'available' && stage === 'code' && (
        <>
          {sent && <p className="notice" role="status">{t.forgotSent}</p>}
          <div className="row">
            <label className="field-label" htmlFor="forgot-code">{t.forgotCodeLabel}</label>
            <input id="forgot-code" className="input" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
          </div>
          <PassField id="forgot-pass" label={t.forgotNewPass} value={pass} onChange={setPass} showLabel={t.passShow} hideLabel={t.passHide} autoComplete="new-password" />
          <ErrorBox msg={err} />
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? '…' : t.forgotApply}</button>
        </>
      )}
      {resetStatus === 'available' && stage === 'done' && (
        <>
          <p className="notice" role="status">{t.forgotDone}</p>
          <button type="button" className="btn-primary" onClick={() => nav('/login', { replace: true })}>{t.navLogin}</button>
        </>
      )}
      {stage !== 'done' && <p className="helper"><Link to="/login">{t.forgotBack}</Link></p>}
    </AuthShell>
  )
}
