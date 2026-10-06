import { useMemo, useState } from 'react'
import type { AnalyzeResult } from '../types'
import { formatTime } from '../types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  result: AnalyzeResult
  currentTime: number
  onSeek: (sec: number) => void
}

export default function PlayerPanel({ t, result, currentTime, onSeek }: Props) {
  const [tab, setTab] = useState<'transcript' | 'summary'>('transcript')
  const max = useMemo(() => Math.max(...result.heatmap.map((p) => p.value), 1), [result])

  const W = 600
  const H = 64
  const pts = result.heatmap
    .map((p, i) => `${((i / Math.max(1, result.heatmap.length - 1)) * W).toFixed(1)},${(H - (p.value / max) * (H - 8) - 4).toFixed(1)}`)
    .join(' ')
  const playX = result.duration > 0 ? (Math.min(currentTime, result.duration) / result.duration) * W : 0

  return (
    <div className="stage">
      <div className="panel">
        <h2 className="player-title">{result.title}</h2>
        <div style={{ height: 12 }} />
        <div className="player-box">
          {result.source === 'youtube' ? (
            <span>YouTube player — {result.video_id}</span>
          ) : (
            <video src={result.video_url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', background: '#000' }} />
          )}
        </div>
        <div style={{ height: 12 }} />
        {result.heatmap.length > 0 ? (
          <svg
            className="heatmap"
            viewBox={`0 0 ${W} ${H}`}
            role="slider"
            aria-label="heatmap"
            aria-valuenow={Math.round(currentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(result.duration)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') onSeek(currentTime + 5)
              if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 5))
            }}
            onClick={(e) => {
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
              const ratio = (e.clientX - rect.left) / rect.width
              onSeek(ratio * result.duration)
            }}
          >
            <polyline points={pts} fill="none" stroke="#c6ff3e" strokeWidth="2" strokeLinejoin="round" />
            <line x1={playX} y1={0} x2={playX} y2={H} stroke="#7c5cff" strokeWidth="2" />
          </svg>
        ) : (
          <p className="heatmap-fallback">—</p>
        )}
      </div>

      <div className="panel">
        <div className="tabs" role="group">
          <button type="button" className={tab === 'transcript' ? 'is-on' : ''} onClick={() => setTab('transcript')}>
            {t.transcript}
          </button>
          <button type="button" className={tab === 'summary' ? 'is-on' : ''} onClick={() => setTab('summary')}>
            {t.summary}
          </button>
        </div>
        <div style={{ height: 10 }} />
        {tab === 'summary' ? (
          <p className="summary-text">{result.summary}</p>
        ) : (
          <div className="transcript-list">
            {result.transcript.slice(0, 400).map((l, i) => (
              <button key={i} type="button" onClick={() => onSeek(l.start)}>
                <time>{formatTime(l.start)}</time>
                {l.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
