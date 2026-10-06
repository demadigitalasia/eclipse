import { useEffect, useState } from 'react'
import type { StudioSettings, ViralClip } from '../types'
import { clipKey } from './ClipsPanel'
import type { Strings } from '../i18n'

export type BatchStatus = 'idle' | 'running' | 'done' | 'error'

export interface BatchItem {
  key: string
  title: string
  progress: number
  status: BatchStatus
}

interface Props {
  t: Strings
  clips: ViralClip[]
  marked: Record<string, boolean>
  onExit: () => void
}

export default function StudioOverlay({ t, clips, marked, onExit }: Props) {
  const selected = clips.filter((c) => marked[clipKey(c)])
  const [settings, setSettings] = useState<StudioSettings>({ aspect: '9:16', caption: 'viral_pop', title_text: '' })
  const [safe, setSafe] = useState(true)
  const [items, setItems] = useState<BatchItem[]>([])
  const [running, setRunning] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onExit])

  const preview = selected[previewIdx] || selected[0]

  const startBatch = () => {
    if (running || selected.length === 0) return
    setRunning(true)
    setItems(selected.map((c) => ({ key: clipKey(c), title: c.title, progress: 0, status: 'running' as BatchStatus })))
  }

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setItems((prev) => {
        const next = prev.map((it) =>
          it.status === 'running' ? { ...it, progress: Math.min(100, it.progress + 8 + Math.random() * 14) } : it,
        )
        const done = next.map((it) => (it.progress >= 100 ? { ...it, progress: 100, status: 'done' as BatchStatus } : it))
        if (done.every((it) => it.status === 'done')) {
          clearInterval(timer)
          setRunning(false)
        }
        return done
      })
    }, 350)
    return () => clearInterval(timer)
  }, [running])

  const failed = items.filter((i) => i.status === 'error').length
  const retry = () => {
    setItems((prev) => prev.map((it) => (it.status === 'error' ? { ...it, status: 'running', progress: 0 } : it)))
    setRunning(true)
  }

  return (
    <div className="studio-overlay" role="dialog" aria-modal="true" aria-label={t.studioTitle}>
      <div className="studio-head">
        <button type="button" className="btn-secondary" onClick={onExit}>← Input</button>
        <div>
          <h2>{t.studioTitle}</h2>
          <p>{t.studioSub}</p>
        </div>
      </div>

      <div className="studio-grid">
        <div className="panel">
          <div className="studio-preview">
            {safe && <div className="safe-overlay" aria-hidden="true" />}
            <span>{preview ? `${preview.title} · ${settings.aspect}` : '—'}</span>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-inline">
            <label style={{ fontSize: '0.8rem' }}>
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> safe-area
            </label>
          </div>
          {selected.length > 1 && (
            <div className="toolbar-row" style={{ marginTop: 8 }}>
              {selected.map((c, i) => (
                <button key={clipKey(c)} type="button" className={`chip ${i === previewIdx ? 'is-on' : ''}`} onClick={() => setPreviewIdx(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="studio-controls">
          <div className="panel">
            <div className="row">
              <span className="field-label">{t.aspectLabel}</span>
              <div className="seg" role="group">
                {(['9:16', '1:1', '4:3', '16:9'] as const).map((a) => (
                  <button key={a} type="button" className={settings.aspect === a ? 'is-on' : ''} onClick={() => setSettings({ ...settings, aspect: a })}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 10 }} />
            <div className="row">
              <span className="field-label">{t.captionLabel}</span>
              <div className="seg" role="group">
                {(['viral_pop', 'clean_minimal', 'off'] as const).map((c) => (
                  <button key={c} type="button" className={settings.caption === c ? 'is-on' : ''} onClick={() => setSettings({ ...settings, caption: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 10 }} />
            <div className="row">
              <label className="field-label" htmlFor="studio-title">{t.titleLabel}</label>
              <input id="studio-title" className="input" value={settings.title_text} onChange={(e) => setSettings({ ...settings, title_text: e.target.value })} placeholder="Judul overlay" />
            </div>
          </div>

          <div className="panel">
            <div className="row-inline" style={{ justifyContent: 'space-between' }}>
              <strong>Batch ({selected.length})</strong>
              {failed > 0 && (
                <button type="button" className="mini-btn" onClick={retry}>{t.retryFailed} ({failed})</button>
              )}
            </div>
            <div style={{ height: 8 }} />
            {items.length === 0 && <p className="helper">Belum dirender.</p>}
            {items.map((it) => (
              <div key={it.key} className="batch-item">
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                <span className={`status status--${it.status === 'done' ? 'ok' : it.status === 'running' ? 'run' : it.status === 'error' ? 'err' : 'idle'}`}>
                  {it.status === 'done' ? '✓' : `${Math.round(it.progress)}%`}
                </span>
              </div>
            ))}
            {items.length > 0 && (
              <div className="progress" style={{ marginTop: 8 }}>
                <div style={{ width: `${items.reduce((a, i) => a + i.progress, 0) / Math.max(1, items.length)}%` }} />
              </div>
            )}
            <div style={{ height: 10 }} />
            <div className="row-inline">
              <button type="button" className="btn-primary" onClick={startBatch} disabled={running || selected.length === 0}>
                {running ? t.rendering : t.batchRender}
              </button>
              <button type="button" className="btn-secondary" disabled={!items.length || items.some((i) => i.status !== 'done')}>
                {t.downloadZip}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
