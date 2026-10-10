import { useEffect, useRef, useState } from 'react'
import type { DurationPref, SourceMode, AppError, Lang } from '../types'
import { getErrorMessage } from '../localization'
import type { Strings } from '../localization'
import Icon from './Icon'
import { formatTime, MVP_LIMITS } from '../types'
import type { ServerLimits } from '../api'

export interface InputState {
  source: SourceMode
  subtitleSource: 'youtube' | 'manual'
  subtitleFile: File | null
  url: string
  fileName: string
  fileSizeBytes: number | null
  file: File | null
  fileObjectUrl: string | null
  duration: DurationPref
  prompt: string
  countMode: 'auto' | 'custom'
  count: number
}

interface Props {
  t: Strings
  lang: Lang
  state: InputState
  setState: (s: InputState) => void
  loading: boolean
  progress: number
  error: AppError | null
  serverLimits?: ServerLimits | null
  onSubmit: () => void
}

export default function InputPanel({ t, lang, state, setState, loading, progress, error, serverLimits, onSubmit }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [progressRate, setProgressRate] = useState<number | null>(null)
  const progressSamples = useRef<Array<{ progress: number; at: number }>>([])
  const fileRef = useRef<HTMLInputElement | null>(null)
  const subtitleRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0)
      setProgressRate(null)
      progressSamples.current = []
      return
    }
    const startedAt = Date.now()
    progressSamples.current = []
    const timer = window.setInterval(() => {
      const now = Date.now()
      setElapsedSeconds(Math.floor((now - startedAt) / 1000))
      const recent = progressSamples.current.filter((sample) => now - sample.at <= 30000)
      progressSamples.current = recent
      const first = recent[0]
      const last = recent[recent.length - 1]
      if (first && last && last !== first && now - last.at <= 10000 && last.at - first.at >= 3000) {
        setProgressRate((last.progress - first.progress) / ((last.at - first.at) / 60000))
      } else {
        setProgressRate(null)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [loading])
  useEffect(() => {
    if (!loading) return
    const samples = progressSamples.current
    const last = samples[samples.length - 1]
    if (!last || progress > last.progress) {
      samples.push({ progress, at: Date.now() })
    }
  }, [loading, progress])
  const set = (p: Partial<InputState>) => {
    setState({ ...state, ...p })
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    const extension = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    const maxBytes = serverLimits?.maxSourceBytes ?? MVP_LIMITS.maxSourceBytes
    const maxLabel = serverLimits?.maxSourceLabel ?? MVP_LIMITS.maxSourceLabel
    if (!(MVP_LIMITS.acceptedExtensions as readonly string[]).includes(extension)) {
      setFileError(t.uploadTypeError)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (f.size > maxBytes) {
      setFileError(t.uploadSizeError(maxLabel))
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setFileError(null)
    const fileObjectUrl = URL.createObjectURL(f)
    set({ fileName: f.name, fileSizeBytes: f.size, file: f, fileObjectUrl, url: f.name })
  }

  const maxSourceLabel = serverLimits?.maxSourceLabel ?? MVP_LIMITS.maxSourceLabel
  const maxDurationMinutes = Math.floor((serverLimits?.maxDurationSec ?? MVP_LIMITS.maxDurationSec) / 60)
  const acceptedFormats = MVP_LIMITS.acceptedExtensions.map((extension) => extension.slice(1).toUpperCase()).join(', ')

  const sourceIcons: Record<SourceMode, string> = {
    youtube: '/images/source-youtube.png',
    drive: '/images/source-drive.png',
    upload: '/images/source-upload.png',
  }
  const stages = [
    {
      title: t.pipelineStageSource,
      stepTitle: t.pipelineStepSource,
      description: state.source === 'youtube' ? t.pipelineSourceYoutube
        : state.source === 'drive' ? t.pipelineSourceDrive : t.pipelineSourceUpload,
      active: progress < 10,
      complete: progress >= 10,
    },
    {
      title: t.pipelineStageTranscript,
      stepTitle: t.pipelineStepTranscript,
      description: state.source === 'youtube'
        ? state.subtitleSource === 'manual' ? t.pipelineTranscriptManual : t.pipelineTranscriptYoutube
        : t.pipelineTranscriptWhisper,
      active: progress >= 10 && progress < 55,
      complete: progress >= 55,
    },
    {
      title: t.pipelineStageHeatmap,
      stepTitle: t.pipelineStepHeatmap,
      description: t.pipelineHeatmapDescription,
      active: progress >= 55 && progress < 65,
      complete: progress >= 65,
    },
    {
      title: t.pipelineStageGemini,
      stepTitle: t.pipelineStepGemini,
      description: state.source === 'youtube' ? t.pipelineGeminiYoutube : t.pipelineGeminiVideo,
      active: progress >= 65 && progress < 90,
      complete: progress >= 90,
    },
    {
      title: t.pipelineStageValidate,
      stepTitle: t.pipelineStepValidate,
      description: t.pipelineValidateDescription,
      active: progress >= 90 && progress < 100,
      complete: progress >= 100,
    },
  ]
  const activeStage = stages.find((stage) => stage.active) ?? stages[stages.length - 1]

  return (
    <section className="panel input-gerhana" aria-label={t.inputPanelLabel}>
      <div className="input-gerhana-head">
        <div>
          <span className="hero-eyebrow">{t.tagline}</span>
          <h2 className="input-title">{t.heroTitle}</h2>
          <p className="hero-body">{t.heroBody}</p>
        </div>
      </div>

      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!loading) onSubmit()
        }}
      >
        <fieldset className="input-controls" disabled={loading}>
        <div className={`input-main-grid input-main-grid--${state.source}`}>
          <div className="source-tabs" role="group" aria-label={t.sourceGroupLabel}>
            {(['youtube', 'drive', 'upload'] as SourceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`source-tab ${state.source === m ? 'is-on' : ''}`}
                aria-pressed={state.source === m}
                aria-label={m === 'youtube' ? t.tabYoutube : m === 'drive' ? t.tabDrive : t.tabUpload}
                disabled={loading}
                onClick={() => set({ source: m })}
              >
                <img className="source-icon" src={sourceIcons[m]} alt="" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="input-main">
            {state.source === 'youtube' && (
              <div className="row">
                <input
                  id="src-url"
                  className="input input--big"
                  aria-label={t.urlLabel}
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
                <input
                  id="src-drive"
                  className="input input--big"
                  aria-label={t.driveLabel}
                  placeholder={t.drivePlaceholder}
                  value={state.url}
                  onChange={(e) => set({ url: e.target.value })}
                  disabled={loading}
                  required={state.source === 'drive'}
                />
              </div>
            )}
            {state.source === 'upload' && (
              <div className="row">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".mp4,.mov,.mkv,.webm,.avi,.m4v"
                  style={{ display: 'none' }}
                  onChange={(e) => pickFile(e.target.files?.[0])}
                  disabled={loading}
                />
                <div
                  className={`dropzone ${dragOver ? 'is-over' : ''} ${state.fileName ? 'has-file' : ''} ${loading ? 'is-disabled' : ''}`}
                  role="button"
                  aria-disabled={loading}
                  tabIndex={loading ? -1 : 0}
                  onClick={() => { if (!loading) fileRef.current?.click() }}
                  onKeyDown={(e) => {
                    if (!loading && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      fileRef.current?.click()
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (loading) return
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (loading) return
                    setDragOver(false)
                    pickFile(e.dataTransfer.files?.[0])
                  }}
                >
                  <span className="drop-orbit" aria-hidden="true"><Icon name="upload" size={20} /></span>
                  <div className="drop-title">{state.fileName || t.dropTitle}</div>
                  <div className="helper">{t.dropSubtitle(acceptedFormats, maxSourceLabel, maxDurationMinutes)}</div>
                  {state.fileName && state.fileSizeBytes != null && (
                    <div className="chip is-on">{t.fileChosen}: {state.fileName} · {(state.fileSizeBytes / 1048576).toFixed(1)} MB</div>
                  )}
                </div>
                {fileError && <span className="field-message field-message--error" role="alert">{fileError}</span>}
              </div>
            )}
          </div>

            <div className={`duration-subtitle-grid ${state.source === 'youtube' ? '' : 'duration-subtitle-grid--solo'} ${state.source === 'youtube' && state.subtitleSource === 'manual' ? 'duration-subtitle-grid--manual' : ''}`}>
              <div className="duration-control duration-control--cards">
                <span className="field-label">{t.durationLabel}</span>
                <div className="duration-grid" role="group" aria-label={t.durationLabel}>
                  {(['15s', '30s', '60s'] as DurationPref[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`duration-card ${state.duration === d ? 'is-on' : ''}`}
                      aria-pressed={state.duration === d}
                      disabled={loading}
                      onClick={() => set({ duration: d })}
                    >
                      <strong>{d === '15s' ? t.duration15 : d === '30s' ? t.duration30 : t.duration60}</strong>
                      <span>{d === '15s' ? t.duration15Help : d === '30s' ? t.duration30Help : t.duration60Help}</span>
                    </button>
                  ))}
                </div>
              </div>

              {state.source === 'youtube' && (
                <div className="advanced-group source-subtitle-panel">
                  <h3>{t.subtitleSource}</h3>
                  <div className="subtitle-source-control">
                    <div className="subtitle-source-options" role="radiogroup" aria-label={t.subtitleSource}>
                      <label className="subtitle-source-option">
                        <input type="radio" name="subtitle-source" checked={state.subtitleSource === 'youtube'} onChange={() => set({ subtitleSource: 'youtube' })} disabled={loading} />
                        <span>{t.subtitleYoutube}</span>
                      </label>
                      <label className="subtitle-source-option">
                        <input type="radio" name="subtitle-source" checked={state.subtitleSource === 'manual'} onChange={() => set({ subtitleSource: 'manual' })} disabled={loading} />
                        <span>{t.subtitleManual}</span>
                      </label>
                    </div>
                    {state.subtitleSource === 'manual' && (
                      <div className="row source-subtitle-upload">
                        <input ref={subtitleRef} type="file" accept=".srt,.txt,text/plain,application/x-subrip" style={{ display: 'none' }} onChange={(event) => set({ subtitleFile: event.target.files?.[0] || null })} disabled={loading} />
                        <div className="row-inline source-subtitle-upload__controls">
                          <button type="button" className="btn-secondary btn-sm" onClick={() => subtitleRef.current?.click()} disabled={loading}>{t.subtitleChooseFile}</button>
                          <span className="helper">{state.subtitleFile?.name || t.subtitleNoFile}</span>
                          {state.subtitleFile && <button type="button" className="mini-btn" onClick={() => { set({ subtitleFile: null }); if (subtitleRef.current) subtitleRef.current.value = '' }} disabled={loading}>{t.close}</button>}
                        </div>
                        <span className="helper">{t.subtitleManualHelp}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="error-box" role="alert">
                <strong>{t.analyzeErrorTitle}:</strong> {getErrorMessage(error, lang)}
                {error.hint ? ` ${error.hint}` : ''}
              </p>
            )}
        </div>

        <section className="advanced-settings" aria-label={t.advancedSettings}>
          <div className="advanced-settings-body">
              <div className="advanced-group advanced-group--clip">
                <h3>{t.clipTitle}</h3>
                <div className="row">
                  <label className="field-label" htmlFor="prompt">{t.promptLabel}</label>
                  <input id="prompt" className="input" placeholder={t.promptPlaceholder} value={state.prompt} onChange={(e) => set({ prompt: e.target.value })} disabled={loading} />
                </div>
                <div className="row">
                  <span className="field-label">{t.countLabel} — {state.countMode === 'auto' ? t.auto : t.countValue(state.count)}</span>
                  <div className="seg" role="group" aria-label={t.countLabel}>
                    <button type="button" className={state.countMode === 'auto' ? 'is-on' : ''} aria-pressed={state.countMode === 'auto'} onClick={() => set({ countMode: 'auto' })}>{t.auto}</button>
                    <button type="button" className={state.countMode === 'custom' ? 'is-on' : ''} aria-pressed={state.countMode === 'custom'} onClick={() => set({ countMode: 'custom' })}>{t.custom}</button>
                  </div>
                  {state.countMode === 'custom' && <input type="range" min={1} max={12} value={Math.min(state.count, 12)} onChange={(e) => set({ count: Number(e.target.value) })} disabled={loading} aria-label={t.countLabel} />}
                </div>
              </div>
          </div>
        </section>
        </fieldset>

        <div className={`submit-bar submit-bar--v2 ${loading ? 'is-processing' : ''}`}>
          {loading ? (
            <div className="pipeline-loader" role="status" aria-live="polite">
              <div className="pipeline-loader-head">
                <div className="pipeline-loader-heading">
                  <strong>{t.pipelineTitle}</strong>
                  <span className="pipeline-elapsed">{t.pipelineElapsed(formatTime(elapsedSeconds))}</span>
                </div>
              </div>
              <div className="pipeline-active-copy">
                <strong>{activeStage.title}</strong>
                <span>{activeStage.description}</span>
              </div>
              <div className="pipeline-progress-row">
                <span>{t.pipelinePercent(Math.round(progress))}</span>
                <span>{progressRate == null ? t.pipelineRateWaiting : t.pipelineRate(progressRate.toFixed(1))}</span>
              </div>
              <div
                className="pipeline-indicator"
                role="progressbar"
                aria-label={t.pipelineTitle}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
              <ol className="pipeline-steps" aria-label={t.pipelineTitle}>
                {stages.map((stage, index) => (
                  <li key={stage.title} className={`${stage.active ? 'is-active' : ''} ${stage.complete ? 'is-complete' : ''}`}>
                    <span className="pipeline-step-marker">{stage.complete ? '✓' : index + 1}</span>
                    <span className="pipeline-step-title">{stage.stepTitle}</span>
                    <span className="pipeline-step-state">{stage.complete ? t.pipelineComplete : stage.active ? t.pipelineWorking : t.pipelineWaiting}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="submit-copy">
              <strong>{t.readyAnalyze}</strong>
              <span>{t.submitHint}</span>
            </div>
          )}
          <button type="submit" className="btn-primary btn-lg btn-corona" disabled={loading}>
            {loading ? t.processing : `${t.submit} →`}
          </button>
        </div>
      </form>
    </section>
  )
}
