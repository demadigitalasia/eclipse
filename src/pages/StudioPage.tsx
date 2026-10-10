import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Topbar from '../components/Topbar'
import InputPanel, { type InputState } from '../components/InputPanel'
import HistoryPanel from '../components/HistoryPanel'
import PlayerPanel from '../components/PlayerPanel'
import ClipsPanel, { clipKey } from '../components/ClipsPanel'
import TrimmerModal from '../components/TrimmerModal'
import Icon from '../components/Icon'
import StudioOverlay from '../components/StudioOverlay'
import { getStrings, getInlineCopy } from '../localization'
import { analyzeVideo, clearHistory, deleteHistoryEntry, getAnalysis, getHistory, getJobProgress, getServerLimits, type ServerLimits } from '../api'
import type { AnalyzeResult, AppError, HistoryEntry, Lang, ViralClip } from '../types'
import { formatTime } from '../types'

const DEFAULT_INPUT: InputState = {
  source: 'youtube',
  subtitleSource: 'youtube',
  subtitleFile: null,
  url: '',
  fileName: '',
  fileSizeBytes: null,
  file: null,
  fileObjectUrl: null,
  duration: '15s',
  prompt: '',
  countMode: 'custom',
  count: 3,
}

export default function StudioPage({ lang }: { lang: Lang }) {
  const t = useMemo(() => getStrings(lang), [lang])
  const location = useLocation()
  const requestedVideoId = (location.state as { loadVideoId?: unknown } | null)?.loadVideoId
  const [input, setInput] = useState<InputState>(DEFAULT_INPUT)
  const [loading, setLoading] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analyzeError, setAnalyzeError] = useState<AppError | null>(null)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [marked, setMarked] = useState<Record<string, boolean>>({})
  const [showSetup, setShowSetup] = useState(true)
  const [studioOpen, setStudioOpen] = useState(false)
  const [trimmer, setTrimmer] = useState<ViralClip | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [serverLimits, setServerLimits] = useState<ServerLimits | null>(null)
  const analyzeLock = useRef(false)

  const updateInput = useCallback((next: InputState) => {
    setAnalyzeError(null)
    setInput(next)
  }, [])

  useEffect(() => {
    getHistory().then((entries) => { setHistory(entries); setHistoryError(null) }).catch((error: unknown) => {
      setHistoryError(error instanceof Error ? error.message : 'Riwayat gagal dimuat.')
    })
  }, [])

  useEffect(() => {
    let active = true
    getServerLimits().then((limits) => { if (active) setServerLimits(limits) }).catch(() => {
      // Keep the matching frontend limits as a fallback when the endpoint is unavailable.
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const step: 1 | 2 | 3 = studioOpen ? 3 : result ? 2 : 1

  const runAnalyze = useCallback(async () => {
    if (analyzeLock.current) return
    analyzeLock.current = true
    setAnalyzeError(null)
    setAnalysisProgress(0)
    setLoading(true)
    let pollTimer: number | null = null
    let pollInFlight = false
    try {
      const res = await analyzeVideo({
        source: input.source,
        url: input.url,
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        duration: input.duration,
        prompt: input.prompt,
        countMode: input.countMode,
        count: input.count,
        consent: true,
        subtitleSource: input.source === 'youtube' ? input.subtitleSource : 'transcribe',
      }, input.file, {
        manualSubtitleFile: input.source === 'youtube' && input.subtitleSource === 'manual' ? input.subtitleFile : null,
        onJobCreated: (jobId) => {
          // Backend updates progress while fetching YouTube source, before transcription.
          setAnalysisProgress(0)
          pollTimer = window.setInterval(async () => {
            if (pollInFlight) return
            pollInFlight = true
            try {
              const progress = await getJobProgress(jobId)
              setAnalysisProgress(Math.max(0, Math.min(100, progress.progress)))
            } catch {
              // Keep the current phase visible if a transient status poll fails.
            } finally {
              pollInFlight = false
            }
          }, 750)
        },
      })
      const r = res.data
      setAnalysisProgress(100)
      setResult(r)
      setMarked(Object.fromEntries(r.clips.slice(0, 5).map((c) => [clipKey(c), true])))
      setShowSetup(false)
      try {
        setHistory(await getHistory())
        setHistoryError(null)
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'Riwayat gagal dimuat.')
      }
      setTimeout(() => document.querySelector('.ide, .discover-anchor')?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      setAnalyzeError(e as AppError)
      setTimeout(() => document.querySelector('.error-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    } finally {
      if (pollTimer !== null) window.clearInterval(pollTimer)
      analyzeLock.current = false
      setLoading(false)
    }
  }, [input])

  const loadEntry = async (e: HistoryEntry) => {
    setAnalyzeError(null)
    setLoading(true)
    try {
      const response = await getAnalysis(e.video_id)
      const r = response.data
      setResult(r)
      setMarked(Object.fromEntries(r.clips.slice(0, 5).map((c) => [clipKey(c), true])))
      setShowSetup(false)
    } catch (error) {
      setAnalyzeError(error as AppError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (typeof requestedVideoId !== 'string' || !requestedVideoId) return
    let active = true
    setAnalyzeError(null)
    setLoading(true)
    getAnalysis(requestedVideoId).then((response) => {
      if (!active) return
      const loaded = response.data
      setResult(loaded)
      setMarked(Object.fromEntries(loaded.clips.slice(0, 5).map((clip) => [clipKey(clip), true])))
      setShowSetup(false)
      setCurrentTime(0)
    }).catch((error: unknown) => {
      if (active) setAnalyzeError(error as AppError)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [requestedVideoId])

  const toggleMark = (k: string) => setMarked((m) => ({ ...m, [k]: !m[k] }))
  const toggleAll = () => {
    if (!result) return
    const all = result.clips.every((c) => marked[clipKey(c)])
    setMarked(all ? {} : Object.fromEntries(result.clips.map((c) => [clipKey(c), true])))
  }

  return (
    <div className={`app ${result ? 'app--ide' : ''}`}>
      <Topbar
        step={step}
        hasResult={!!result}
        loading={loading}
        lang={lang}
        t={t}
        onGoInput={() => {
          setStudioOpen(false)
          setShowSetup(true)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        onGoDiscover={() => {
          setStudioOpen(false)
          document.querySelector('.ide')?.scrollIntoView({ behavior: 'smooth' })
        }}
        onGoStudio={() => setStudioOpen(true)}
      />

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label={t.close}><Icon name="x" size={14} /></button>
        </div>
      )}

      {!result && (
        <div className={`input-layout ${history.length === 0 ? 'input-layout--first-run' : ''}`}>
          <InputPanel t={t} lang={lang} state={input} setState={updateInput} loading={loading} progress={analysisProgress} error={analyzeError} serverLimits={serverLimits} onSubmit={runAnalyze} />
          {history.length > 0 && (
            <HistoryPanel
              t={t}
              entries={history}
              onLoad={loadEntry}
              onDelete={(id) => void deleteHistoryEntry(id).then(() => getHistory()).then(setHistory).catch(setToast)}
              onClear={() => void clearHistory().then(() => getHistory()).then(setHistory).catch(setToast)}
            />
          )}
          {historyError && <p className="error-box" role="alert">{historyError}</p>}
        </div>
      )}

      {result && (
        <>
          {showSetup && (
            <InputPanel t={t} lang={lang} state={input} setState={updateInput} loading={loading} progress={analysisProgress} error={analyzeError} serverLimits={serverLimits} onSubmit={runAnalyze} />
          )}
          <div className="ide discover-anchor">
            <div className="ide-side">
              <section className="panel compact" aria-label="Current source">
                <div className="compact-info">
                  <span className="compact-dot" aria-hidden="true" />
                  <div>
                    <div className="compact-title">{result.title}</div>
                    <div className="compact-sub">
                      {t.clipsCount(result.clips.length)} • {input.duration}
                    </div>
                  </div>
                </div>
                <div className="compact-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowSetup(!showSetup)}>
                    {showSetup ? t.backInput : t.backInput}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setStudioOpen(true)}>
                    {t.toStudio}
                  </button>
                </div>
                <p className="helper">{getInlineCopy(lang, "copy_analisis_diproses_oleh_server_ecli_c765da6")}</p>
              </section>
              <HistoryPanel
                t={t}
                entries={history}
                onLoad={loadEntry}
                onDelete={(id) => void deleteHistoryEntry(id).then(() => getHistory()).then(setHistory).catch(setToast)}
                onClear={() => void clearHistory().then(() => getHistory()).then(setHistory).catch(setToast)}
              />
              {historyError && <p className="error-box" role="alert">{historyError}</p>}
            </div>

            <PlayerPanel t={t} result={result} currentTime={currentTime} onSeek={setCurrentTime} />

            <ClipsPanel
              t={t}
              source={result.source}
              clips={result.clips}
              marked={marked}
              onToggleMark={toggleMark}
              onToggleAll={toggleAll}
              onPreview={(c) => {
                setCurrentTime(c.start_time)
                setToast(`${t.preview}: ${formatTime(c.start_time)}`)
              }}
              onTrim={(c) => setTrimmer(c)}
              onOpenStudio={() => setStudioOpen(true)}
            />
          </div>
        </>
      )}

      {trimmer && result && (
        <TrimmerModal
          t={t}
          clip={trimmer}
          duration={result.duration}
          onClose={() => setTrimmer(null)}
          onApply={(c) => {
            setResult({ ...result, clips: result.clips.map((x) => (clipKey(x) === clipKey(trimmer) ? c : x)) })
            setTrimmer(null)
            setToast(t.copied)
          }}
        />
      )}

      {studioOpen && result && (
        <StudioOverlay t={t} lang={lang} jobId={result.video_id} videoUrl={result.video_url} source={result.source} clips={result.clips} transcript={result.transcript} marked={marked} onToggleMark={toggleMark} onExit={() => setStudioOpen(false)} />
      )}
    </div>
  )
}
