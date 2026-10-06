import { useRef, useState } from 'react'
import type { DurationPref, SourceMode } from '../types'
import type { Strings } from '../i18n'

export interface InputState {
  source: SourceMode
  url: string
  fileName: string
  apiKey: string
  model: string
  duration: DurationPref
  prompt: string
  countMode: 'auto' | 'custom'
  count: number
  subs: 'auto' | 'manual'
  range: 'all' | 'custom'
  rangeStart: string
  rangeEnd: string
}

interface Props {
  t: Strings
  state: InputState
  setState: (s: InputState) => void
  loading: boolean
  onSubmit: () => void
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

export default function InputPanel({ t, state, setState, loading, onSubmit }: Props) {
  const [showKey, setShowKey] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const set = (p: Partial<InputState>) => setState({ ...state, ...p })

  return (
    <section className="panel" aria-label="Input">
      <span className="hero-eyebrow">{t.tagline}</span>
      <h2 className="hero-title">{t.heroTitle}</h2>
      <p className="hero-body">{t.heroBody}</p>

      <div className="source-tabs" role="group" aria-label="source">
        {(['youtube', 'drive', 'upload'] as SourceMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`source-tab ${state.source === m ? 'is-on' : ''}`}
            aria-pressed={state.source === m}
            onClick={() => set({ source: m })}
          >
            {m === 'youtube' ? t.tabYoutube : m === 'drive' ? t.tabDrive : t.tabUpload}
          </button>
        ))}
      </div>

      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        {state.source === 'youtube' && (
          <div className="row">
            <label className="field-label" htmlFor="src-url">{t.urlLabel}</label>
            <input
              id="src-url"
              className="input"
              placeholder={t.urlPlaceholder}
              value={state.url}
              onChange={(e) => set({ url: e.target.value })}
              disabled={loading}
              required={state.source === 'youtube'}
            />
          </div>
        )}
        {state.source === 'drive' && (
          <div className="row">
            <label className="field-label" htmlFor="src-drive">{t.driveLabel}</label>
            <input
              id="src-drive"
              className="input"
              placeholder={t.drivePlaceholder}
              value={state.url}
              onChange={(e) => set({ url: e.target.value })}
              disabled={loading}
              required={state.source === 'drive'}
            />
            <span className="helper">{t.driveNotice}</span>
          </div>
        )}
        {state.source === 'upload' && (
          <div className="row">
            <input
              ref={fileRef}
              type="file"
              accept=".mp4,.mov,.mkv,.webm,.avi,.m4v"
              style={{ display: 'none' }}
              onChange={(e) => set({ fileName: e.target.files?.[0]?.name || '', url: e.target.files?.[0]?.name || state.url })}
            />
            <div
              className={`dropzone ${dragOver ? 'is-over' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files?.[0]
                if (f) set({ fileName: f.name, url: f.name })
              }}
            >
              <div style={{ fontWeight: 700 }}>{state.fileName || t.dropTitle}</div>
              <div className="helper">{t.dropSubtitle}</div>
            </div>
          </div>
        )}

        <div className="form-grid-2">
          <div className="sub-card">
            <h3>{t.aiTitle}</h3>
            <div className="row">
              <span className="field-label" id="key-label">
                {t.apiKeyLabel} · {t.apiKeyRequired}
              </span>
              <div className="row-inline">
                <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--lime)' }}>
                  {t.getKey}
                </a>
                <button type="button" className="mini-btn" onClick={() => setShowKey(!showKey)}>
                  {showKey ? t.hideKey : t.showKey}
                </button>
              </div>
              <input
                aria-labelledby="key-label"
                className="input"
                type={showKey ? 'text' : 'password'}
                placeholder="AIza… / mock"
                value={state.apiKey}
                onChange={(e) => set({ apiKey: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="row">
              <label className="field-label" htmlFor="model">{t.modelLabel}</label>
              <select id="model" className="select" value={state.model} onChange={(e) => set({ model: e.target.value })} disabled={loading}>
                {MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="sub-card">
            <h3>{t.clipTitle}</h3>
            <div className="row">
              <span className="field-label">{t.durationLabel}</span>
              <div className="seg" role="group">
                {(['15s', '30s', '60s', 'auto'] as DurationPref[]).map((d) => (
                  <button key={d} type="button" className={state.duration === d ? 'is-on' : ''} onClick={() => set({ duration: d })}>
                    {d === 'auto' ? t.auto : `Klip ${d.replace('s', ' dtk')}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <label className="field-label" htmlFor="prompt">{t.promptLabel}</label>
              <input id="prompt" className="input" placeholder={t.promptPlaceholder} value={state.prompt} onChange={(e) => set({ prompt: e.target.value })} disabled={loading} />
            </div>
            <div className="row">
              <span className="field-label">{t.countLabel} — ≈ {state.countMode === 'auto' ? 'Auto' : `${state.count} Klip`}</span>
              <div className="seg" role="group">
                <button type="button" className={state.countMode === 'auto' ? 'is-on' : ''} onClick={() => set({ countMode: 'auto' })}>{t.auto}</button>
                <button type="button" className={state.countMode === 'custom' ? 'is-on' : ''} onClick={() => set({ countMode: 'custom' })}>{t.custom}</button>
              </div>
              {state.countMode === 'custom' && (
                <input type="range" min={1} max={50} value={state.count} onChange={(e) => set({ count: Number(e.target.value) })} disabled={loading} aria-label={t.countLabel} />
              )}
            </div>
          </div>
        </div>

        <div className="sub-card">
          <div className="row">
            <span className="field-label">{t.subtitleLabel}</span>
            <div className="radio-row">
              <label><input type="radio" checked={state.subs === 'auto'} onChange={() => set({ subs: 'auto' })} />{t.subtitleAuto}</label>
              <label><input type="radio" checked={state.subs === 'manual'} onChange={() => set({ subs: 'manual' })} />{t.subtitleManual}</label>
            </div>
          </div>
          <div className="row">
            <span className="field-label">{t.rangeLabel}</span>
            <div className="radio-row">
              <label><input type="radio" checked={state.range === 'all'} onChange={() => set({ range: 'all' })} />{t.rangeAll}</label>
              <label><input type="radio" checked={state.range === 'custom'} onChange={() => set({ range: 'custom' })} />{t.rangeCustom}</label>
            </div>
            {state.range === 'custom' && (
              <div className="row-inline">
                <input className="input" style={{ maxWidth: 140 }} placeholder="MM:SS" value={state.rangeStart} onChange={(e) => set({ rangeStart: e.target.value })} disabled={loading} />
                <span className="helper">–</span>
                <input className="input" style={{ maxWidth: 140 }} placeholder="MM:SS" value={state.rangeEnd} onChange={(e) => set({ rangeEnd: e.target.value })} disabled={loading} />
              </div>
            )}
          </div>
        </div>

        <div className="submit-bar">
          <span>{loading ? t.analyzing : t.submitHint}</span>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t.analyzing : t.submit}
          </button>
        </div>
      </form>
    </section>
  )
}
