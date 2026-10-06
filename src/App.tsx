import { useCallback, useEffect, useMemo, useState } from 'react'
import Topbar from './components/Topbar'
import InputPanel, { type InputState } from './components/InputPanel'
import HistoryPanel from './components/HistoryPanel'
import PlayerPanel from './components/PlayerPanel'
import ClipsPanel, { clipKey } from './components/ClipsPanel'
import TrimmerModal from './components/TrimmerModal'
import StudioOverlay from './components/StudioOverlay'
import { getStrings } from './i18n'
import { loadHistory, mockAnalyze, saveHistory, toHistoryEntry, tryAnalyzeBackend } from './api'
import type { AnalyzeResult, HistoryEntry, Lang, ViralClip } from './types'

const DEFAULT_INPUT: InputState = {
  source: 'youtube',
  url: '',
  fileName: '',
  apiKey: localStorage.getItem('eclipse_api_key') || '',
  model: 'gemini-2.5-flash',
  duration: '15s',
  prompt: '',
  countMode: 'custom',
  count: 3,
  subs: 'auto',
  range: 'all',
  rangeStart: '',
  rangeEnd: '',
}

export default function App() {
  const [lang, setLang] = useState<Lang>('id')
  const t = useMemo(() => getStrings(lang), [lang])
  const [input, setInput] = useState<InputState>(DEFAULT_INPUT)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [marked, setMarked] = useState<Record<string, boolean>>({})
  const [showSetup, setShowSetup] = useState(true)
  const [studioOpen, setStudioOpen] = useState(false)
  const [trimmer, setTrimmer] = useState<ViralClip | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    localStorage.setItem('eclipse_api_key', input.apiKey)
  }, [input.apiKey])

  useEffect(() => {
    saveHistory(history)
  }, [history])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const step: 1 | 2 | 3 = studioOpen ? 3 : result ? 2 : 1

  const runAnalyze = useCallback(async () => {
    if (input.source !== 'upload' && !input.url.trim()) return
    setLoading(true)
    setDemo(false)
    const count = input.countMode === 'auto' ? 6 : input.count
    await tryAnalyzeBackend({ url: input.url }, () => setDemo(true))
    // Demo lokal (backend penuh disambungkan nanti sesuai 01-TEKNOLOGI)
    await new Promise((r) => setTimeout(r, 900))
    const r = mockAnalyze(input.source, input.url || input.fileName || 'demo', input.duration, count)
    setResult(r)
    setMarked(Object.fromEntries(r.clips.map((c) => [clipKey(c), true])))
    setShowSetup(false)
    setLoading(false)
    setHistory((h) => {
      const entry = toHistoryEntry(r, input.duration)
      const next = [entry, ...h.filter((x) => x.video_id !== entry.video_id)].slice(0, 50)
      return next
    })
    setTimeout(() => document.querySelector('.ide, .discover-anchor')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [input])

  const loadEntry = (e: HistoryEntry) => {
    // Riwayat demo: bangun ulang hasil dari entri (backend: muat cache analisis)
    const r = mockAnalyze(e.source, e.url || e.title, (e.duration_pref as InputState['duration']) || '15s', Math.max(3, e.clip_count))
    r.title = e.title
    r.video_id = e.video_id
    setResult(r)
    setMarked(Object.fromEntries(r.clips.map((c) => [clipKey(c), true])))
    setShowSetup(false)
  }

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
        setLang={setLang}
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
          <button type="button" onClick={() => setToast(null)} aria-label={t.close}>✕</button>
        </div>
      )}

      {!result && (
        <div className="input-layout">
          <InputPanel t={t} state={input} setState={setInput} loading={loading} onSubmit={runAnalyze} />
          <HistoryPanel
            t={t}
            entries={history}
            onLoad={loadEntry}
            onDelete={(id) => setHistory((h) => h.filter((x) => x.video_id !== id))}
            onClear={() => setHistory([])}
          />
        </div>
      )}

      {loading && !result && (
        <div className="panel">
          <strong>{t.analyzing}</strong>
          <div className="progress" style={{ marginTop: 8 }}>
            <div style={{ width: '45%' }} />
          </div>
        </div>
      )}

      {result && (
        <>
          {showSetup && (
            <InputPanel t={t} state={input} setState={setInput} loading={loading} onSubmit={runAnalyze} />
          )}
          <div className="ide discover-anchor">
            <div className="ide-side">
              <section className="panel compact" aria-label="Current source">
                <div className="compact-info">
                  <span className="compact-dot" aria-hidden="true" />
                  <div>
                    <div className="compact-title">{result.title}</div>
                    <div className="compact-sub">
                      {t.clipsCount(result.clips.length)} • {input.duration} • {result.model}
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
                {demo && <p className="notice">{t.backendOffline}</p>}
              </section>
              <HistoryPanel
                t={t}
                entries={history}
                onLoad={loadEntry}
                onDelete={(id) => setHistory((h) => h.filter((x) => x.video_id !== id))}
                onClear={() => setHistory([])}
              />
            </div>

            <PlayerPanel t={t} result={result} currentTime={currentTime} onSeek={setCurrentTime} />

            <ClipsPanel
              t={t}
              clips={result.clips}
              marked={marked}
              onToggleMark={toggleMark}
              onToggleAll={toggleAll}
              onPreview={() => setToast(t.preview)}
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
        <StudioOverlay t={t} clips={result.clips} marked={marked} onExit={() => setStudioOpen(false)} />
      )}
    </div>
  )
}
