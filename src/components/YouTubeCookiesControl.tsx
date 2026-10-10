import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import type { Strings } from '../localization'

type CookieStatus = { configured: boolean; sizeBytes: number; updatedAt: string | null }

export default function YouTubeCookiesControl({ t, disabled = false }: { t: Strings; disabled?: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/youtube-cookies', { credentials: 'same-origin' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || t.youtubeCookiesLoadError)
      setConfigured(Boolean((body as CookieStatus).configured))
      setError('')
    } catch (cause) {
      setConfigured(null)
      if (open) setError(cause instanceof Error ? cause.message : t.youtubeCookiesLoadError)
    }
  }, [open, t.youtubeCookiesLoadError])

  useEffect(() => { void loadStatus() }, [loadStatus])
  useEffect(() => {
    if (!disabled || busy) return
    setOpen(false)
    setContent('')
    setError('')
    setNotice('')
  }, [disabled, busy])

  const close = () => {
    setOpen(false)
    setContent('')
    setError('')
    setNotice('')
  }

  const readFile = async (file?: File) => {
    if (!file) return
    setError('')
    setNotice('')
    if (file.size > 512_000) {
      setError(t.youtubeCookiesFileTooLarge)
      return
    }
    try {
      setContent(await file.text())
    } catch {
      setError(t.youtubeCookiesLoadError)
    }
  }

  const save = async () => {
    if (!content.trim()) {
      setError(t.youtubeCookiesEmpty)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/youtube-cookies', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error?.message || t.youtubeCookiesLoadError)
      setConfigured(true)
      setContent('')
      setNotice(t.youtubeCookiesSaved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.youtubeCookiesLoadError)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(t.youtubeCookiesConfirmDelete)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/youtube-cookies', { method: 'DELETE', credentials: 'same-origin' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error?.message || t.youtubeCookiesLoadError)
      setConfigured(false)
      setContent('')
      setNotice(t.youtubeCookiesDeleted)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.youtubeCookiesLoadError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="youtube-cookie-button"
        disabled={disabled}
        onClick={() => { setOpen(true); setError(''); setNotice('') }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="key" size={15} />
        <span>{t.youtubeCookiesButton}</span>
        <span className={`youtube-cookie-status ${configured ? 'is-ready' : ''}`}>
          {configured === null ? '…' : configured ? t.youtubeCookiesReady : t.youtubeCookiesMissing}
        </span>
      </button>

      {open && (
        <div className="modal-backdrop youtube-cookie-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <section className="youtube-cookie-modal" role="dialog" aria-modal="true" aria-labelledby="youtube-cookie-title">
            <header className="youtube-cookie-header">
              <div>
                <span className="section-kicker">YOUTUBE</span>
                <h2 id="youtube-cookie-title">{t.youtubeCookiesTitle}</h2>
              </div>
              <button type="button" className="mini-btn" onClick={close} aria-label={t.close} disabled={busy}>
                <Icon name="x" size={16} />
              </button>
            </header>

            <div className={`youtube-cookie-status-box ${configured ? 'is-ready' : ''}`} role="status">
              <span className="youtube-cookie-status-dot" aria-hidden="true" />
              <div>
                <strong>{configured ? t.youtubeCookiesStored : t.youtubeCookiesEmpty}</strong>
                <p>{t.youtubeCookiesHelp}</p>
              </div>
            </div>

            <p className="youtube-cookie-network-note">{t.youtubeCookiesNetworkNote}</p>

            <label className="youtube-cookie-file">
              <Icon name="upload" size={16} />
              {t.youtubeCookiesChoose}
              <input
                type="file"
                accept=".txt,.json,text/plain,application/json"
                disabled={busy}
                onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = '' }}
              />
            </label>

            <label className="field-label youtube-cookie-text-label" htmlFor="youtube-cookie-content">{t.youtubeCookiesPaste}</label>
            <textarea
              id="youtube-cookie-content"
              className="youtube-cookie-textarea"
              rows={8}
              maxLength={512_000}
              autoComplete="off"
              spellCheck={false}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t.youtubeCookiesPlaceholder}
              disabled={busy}
            />

            {(error || notice) && <p className={error ? 'error-box youtube-cookie-feedback' : 'notice youtube-cookie-feedback'} role={error ? 'alert' : 'status'}>{error || notice}</p>}

            <footer className="youtube-cookie-actions">
              {configured && <button type="button" className="btn-danger-outline" onClick={() => void remove()} disabled={busy}>{t.youtubeCookiesDelete}</button>}
              <div />
              <button type="button" className="btn-ghost" onClick={close} disabled={busy}>{t.close}</button>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || !content.trim()}>
                {busy ? t.youtubeCookiesSaving : t.youtubeCookiesSave}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
