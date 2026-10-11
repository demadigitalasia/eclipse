import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { getGoogleAuthStatus, getPasswordResetStatus, getRegistrationStatus } from '../api'
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

type GoogleCredentialResponse = { credential?: string }
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; use_fedcm_for_button?: boolean }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

let gisScriptPromise: Promise<void> | null = null
let gisInitializedClientId: string | null = null
let gisCredentialHandler: ((credential: string) => void) | null = null
function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gisScriptPromise) return gisScriptPromise
  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('google-gis'))
    document.head.appendChild(script)
  })
  return gisScriptPromise
}

function GoogleGlyph() {
  return (
    <svg className="google-glyph" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path style={{ fill: 'var(--google-blue)' }} d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path style={{ fill: 'var(--google-green)' }} d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path style={{ fill: 'var(--google-yellow)' }} d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9641 10.71z" />
      <path style={{ fill: 'var(--google-red)' }} d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </svg>
  )
}

function GoogleAuthButton({ lang, divider = true }: { lang: Lang; divider?: boolean }) {
  const t = getSiteStrings(lang)
  const { loginWithGoogle } = useAuth()
  const nav = useNavigate()
  const holder = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  const [state, setState] = useState<'checking' | 'hidden' | 'ready'>('checking')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getGoogleAuthStatus().then((status) => {
      if (!active) return
      if (!status.enabled || !status.client_id) {
        setState('hidden')
        return
      }
      loadGisScript().then(() => {
        if (!active || !holder.current || !window.google?.accounts?.id) return
        gisCredentialHandler = async (credential) => {
          if (busyRef.current) return
          busyRef.current = true
          const message = await loginWithGoogle(credential)
          busyRef.current = false
          if (message) setErr(message)
          else nav('/app', { replace: true })
        }
        if (gisInitializedClientId !== status.client_id) {
          window.google.accounts.id.initialize({
            client_id: status.client_id,
            use_fedcm_for_button: false,
            callback: (response) => {
              if (response.credential) void gisCredentialHandler?.(response.credential)
            },
          })
          gisInitializedClientId = status.client_id
        }
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 400,
        })
        setState('ready')
      }).catch(() => {
        if (active) setErr(t.googleUnavailable)
      })
    }).catch(() => {
      if (active) setState('hidden')
    })
    return () => { active = false }
  }, [loginWithGoogle, nav, t.googleUnavailable])

  if (state === 'hidden') return null
  const ready = state === 'ready'
  return (
    <div className="google-auth">
      {divider && <div className="auth-divider" aria-hidden="true"><span>{t.authOr}</span></div>}
      <div className="google-signin">
        <span className="btn-secondary google-signin__btn" aria-hidden="true">
          {ready ? (<><GoogleGlyph /><span>{t.googleContinue}</span></>) : (<span>{t.googleLoading}</span>)}
        </span>
        <div className="google-signin__mount" ref={holder} />
      </div>
      <ErrorBox msg={err} />
    </div>
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
      <GoogleAuthButton lang={lang} />
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
  const [googleEnabled, setGoogleEnabled] = useState(false)
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
  useEffect(() => {
    let active = true
    getGoogleAuthStatus().then((status) => {
      if (active) setGoogleEnabled(Boolean(status.enabled && status.client_id))
    }).catch(() => {})
    return () => { active = false }
  }, [])
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
          <p>{googleEnabled ? t.regClosedGoogle : t.regClosedBody}</p>
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
      {registrationStatus !== 'checking' && <GoogleAuthButton lang={lang} divider={registrationStatus === 'open'} />}
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
