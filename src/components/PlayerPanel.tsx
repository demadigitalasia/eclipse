import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyzeResult } from '../types'
import { formatTime } from '../types'
import type { Strings } from '../localization'
import { downloadRawYouTube } from '../api'

interface Props {
  t: Strings
  result: AnalyzeResult
  currentTime: number
  onSeek: (sec: number) => void
}

export default function PlayerPanel({ t, result, currentTime, onSeek }: Props) {
  const [tab, setTab] = useState<'transcript' | 'summary'>('transcript')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [downloadingRaw, setDownloadingRaw] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')
  const [sourceVideoError, setSourceVideoError] = useState(false)
  const sourceMediaUrl = result.source === 'youtube'
    ? `/api/media/${encodeURIComponent(result.video_id)}/source`
    : result.video_url

  useEffect(() => {
    if (!Number.isFinite(currentTime)) return
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 1) {
      videoRef.current.currentTime = currentTime
    }
  }, [currentTime])
  const W = 600
  const H = 72
  const heatmapValues = useMemo(() => {
    const binCount = 100
    const duration = Math.max(1, result.duration)
    const bins = Array<number>(binCount).fill(0)
    const transcript = result.transcript.filter((line) => line.text.trim() && Number.isFinite(line.start))

    if (transcript.length) {
      for (const line of transcript) {
        const start = Math.max(0, Math.min(duration, line.start))
        const end = Math.max(start + 0.25, Math.min(duration, line.end || start + 1))
        const first = Math.min(binCount - 1, Math.floor((start / duration) * binCount))
        const last = Math.min(binCount - 1, Math.floor((end / duration) * binCount))
        const words = Math.max(1, line.text.trim().split(/\s+/).length)
        for (let index = first; index <= last; index += 1) {
          const binStart = (index / binCount) * duration
          const binEnd = ((index + 1) / binCount) * duration
          const overlap = Math.max(0, Math.min(end, binEnd) - Math.max(start, binStart))
          bins[index] += words * (overlap / Math.max(0.25, end - start))
        }
      }
    } else {
      // Hasil lama mungkin tidak menyertakan transkrip; tetap tampilkan heatmap tersimpan.
      for (const point of result.heatmap) {
        const index = Math.max(0, Math.min(binCount - 1, Math.floor((point.time / duration) * binCount)))
        bins[index] = Math.max(bins[index], point.value)
      }
    }

    // Smoothing ringan agar tiap jeda antarsegmen tidak membuat grafik tampak putus.
    const smooth = bins.map((value, index) =>
      (bins[index - 1] ?? value) * 0.2 + value * 0.6 + (bins[index + 1] ?? value) * 0.2,
    )
    const peak = Math.max(...smooth, 0)
    return peak > 0 ? smooth.map((value) => value / peak) : []
  }, [result.duration, result.heatmap, result.transcript])
  const seekTo = (seconds: number) => onSeek(Math.max(0, Math.min(result.duration, seconds)))
  const playX = result.duration > 0 ? (Math.min(currentTime, result.duration) / result.duration) * W : 0

  return (
    <div className="stage">
      <div className="panel">
        <h2 className="player-title">{result.title}</h2>
        <div style={{ height: 12 }} />
        <div className="player-box">
          <video
            ref={videoRef}
            src={sourceMediaUrl}
            controls
            playsInline
            preload="metadata"
            onError={() => setSourceVideoError(true)}
            onLoadedData={() => setSourceVideoError(false)}
            onTimeUpdate={(event) => onSeek(event.currentTarget.currentTime)}
            style={{ width: '100%', height: '100%', background: 'var(--video-bg)' }}
          />
        </div>
        {sourceVideoError && <p className="error-box" role="alert">{t.studioMediaPreviewError}</p>}
        {result.source === 'youtube' && (
          <div className="row-inline" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={downloadingRaw}
              onClick={() => {
                setDownloadingRaw(true)
                setDownloadError('')
                void downloadRawYouTube(result.video_id, setDownloadProgress)
                  .catch((error: unknown) => setDownloadError(error instanceof Error ? error.message : 'Unduhan video gagal.'))
                  .finally(() => setDownloadingRaw(false))
              }}
            >
              {downloadingRaw ? `${t.downloadingRawVideo} ${Math.round(downloadProgress)}%` : t.downloadRawVideo}
            </button>
            {downloadError && <span role="alert" style={{ color: 'var(--danger)' }}>{downloadError}</span>}
          </div>
        )}
        <p className="helper heatmap-caption">{t.heatmapLabel}</p>
        <div style={{ height: 12 }} />
        {heatmapValues.length > 0 ? (
          <>
            <svg
              className="heatmap"
              viewBox={`0 0 ${W} ${H}`}
              role="slider"
              aria-label={t.heatmapLabel}
              aria-valuenow={Math.round(currentTime)}
              aria-valuemin={0}
              aria-valuemax={Math.round(result.duration)}
              aria-valuetext={formatTime(currentTime)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') seekTo(currentTime + 5)
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') seekTo(currentTime - 5)
                if (e.key === 'Home') seekTo(0)
                if (e.key === 'End') seekTo(result.duration)
              }}
              onClick={(e) => {
                const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
                const ratio = (e.clientX - rect.left) / rect.width
                seekTo(ratio * result.duration)
              }}
            >
              <line x1="0" y1={H - 1} x2={W} y2={H - 1} className="heatmap-baseline" />
              {result.clips.map((clip, index) => {
                const x = Math.max(0, (clip.start_time / result.duration) * W)
                const right = Math.min(W, (clip.end_time / result.duration) * W)
                return <rect key={`${clip.start_time}-${index}`} x={x} y="0" width={Math.max(0, right - x)} height={H} className="heatmap-clip-range"><title>{clip.title}</title></rect>
              })}
              {heatmapValues.map((value, index) => {
                const barWidth = W / heatmapValues.length
                const height = Math.max(2, value * (H - 12))
                return <rect key={index} x={index * barWidth + 0.5} y={H - height - 1} width={Math.max(1, barWidth - 1)} height={height} rx="1" className="heatmap-bar" />
              })}
              <line x1={playX} y1={0} x2={playX} y2={H} className="heatmap-playhead" />
            </svg>
            <div className="heatmap-scale" aria-hidden="true"><span>0:00</span><span>{formatTime(result.duration)}</span></div>
          </>
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
