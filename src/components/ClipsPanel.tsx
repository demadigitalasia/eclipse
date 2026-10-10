import { useMemo, useState } from 'react'
import type { SortBy, SourceMode, ViralClip, ViralityFilter } from '../types'
import { formatTime, scoreTier } from '../types'
import type { Strings } from '../localization'
import ThemedSelect from './ThemedSelect'

interface Props {
  t: Strings
  source: SourceMode
  clips: ViralClip[]
  marked: Record<string, boolean>
  onToggleMark: (key: string) => void
  onToggleAll: () => void
  onPreview: (clip: ViralClip) => void
  onTrim: (clip: ViralClip) => void
  onOpenStudio: () => void
}

export const clipKey = (c: ViralClip) => `${c.start_time}_${c.end_time}`

export default function ClipsPanel({ t, source, clips, marked, onToggleMark, onToggleAll, onPreview, onTrim, onOpenStudio }: Props) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<ViralityFilter>('all')
  const [sort, setSort] = useState<SortBy>('virality')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = clips.filter((c) => {
      const matchQ = !needle || c.title.toLowerCase().includes(needle) || c.transcript.toLowerCase().includes(needle)
      const matchF =
        filter === 'all' ||
        (filter === 'high' && c.virality_score >= 90) ||
        (filter === 'medium' && c.virality_score >= 70 && c.virality_score < 90) ||
        (filter === 'marked' && !!marked[clipKey(c)])
      return matchQ && matchF
    })
    return [...list].sort((a, b) =>
      sort === 'virality' ? b.virality_score - a.virality_score : sort === 'time' ? a.start_time - b.start_time : b.end_time - b.start_time - (a.end_time - a.start_time),
    )
  }, [clips, q, filter, sort, marked])

  const markedCount = clips.filter((c) => marked[clipKey(c)]).length

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyNotice(t.copiedTimeFeedback)
      window.setTimeout(() => setCopyNotice(''), 2400)
    } catch {
      setCopyNotice('')
    }
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(clips, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'eclipse-clips.json'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="panel inspector">
      <p className="helper" role="note">{source === 'youtube' ? t.scoreExplanationYoutube : t.scoreExplanationVideo}</p>
      <button type="button" className="btn-primary clips-open-studio" onClick={onOpenStudio} disabled={markedCount === 0}>
        {t.openStudio(markedCount)}
      </button>
      <div className="toolbar">
        <input className="input" placeholder={t.searchClips} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchClips} />
        <div className="toolbar-section">
          <span className="toolbar-label">{t.filterGroupLabel}</span>
          <div className="toolbar-row toolbar-row--filters" role="group" aria-label={t.filterGroupLabel}>
            {(['all', 'high', 'medium', 'marked'] as ViralityFilter[]).map((f) => (
              <button key={f} type="button" className={`chip ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? t.filterAll : f === 'high' ? t.filterHigh : f === 'medium' ? t.filterMid : t.filterMarked}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-section">
          <span className="toolbar-label">{t.sortGroupLabel}</span>
          <ThemedSelect
            label={t.sortGroupLabel}
            value={sort}
            options={[
              { value: 'virality', label: t.sortVirality },
              { value: 'time', label: t.sortTime },
              { value: 'duration', label: t.sortDuration },
            ]}
            onChange={(value) => setSort(value as SortBy)}
          />
        </div>
        <div className="toolbar-row toolbar-row--bulk" role="group" aria-label={t.bulkActionsLabel}>
          <button type="button" className="chip" onClick={onToggleAll}>
            {markedCount === clips.length ? t.unmarkAll : t.markAll}
          </button>
          <button type="button" className="chip" onClick={exportJSON}>
            JSON
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <p className="history-empty" role="status">{t.clipsEmptyFilter}</p>
      )}
      {shown.map((c) => {
        const k = clipKey(c)
        const tier = scoreTier(c.virality_score)
        const open = expanded === k
        return (
          <article key={k} className={`clip-card ${marked[k] ? 'is-marked' : ''}`}>
            <div className="clip-top">
              <input type="checkbox" className="clip-check" checked={!!marked[k]} onChange={() => onToggleMark(k)} aria-label={c.title} />
              <span className="clip-title">{c.title}</span>
              <span className={`score score--${tier === 'high' ? 'high' : tier === 'mid' ? 'mid' : 'low'}`}>{c.virality_score}%</span>
            </div>
            <div className="clip-meta">
              <span>{formatTime(c.start_time)} → {formatTime(c.end_time)}</span>
              <button type="button" className="hook-pill" title="hook" onClick={() => onPreview(c)}>
                hook {formatTime(c.hook_time)}
              </button>
              {marked[k] && <span className="marked-badge">✓</span>}
            </div>
            <div className="clip-actions">
              <button type="button" className="mini-btn" onClick={() => onPreview(c)}>{t.preview}</button>
              <button type="button" className="mini-btn" onClick={() => onTrim(c)}>{t.trim}</button>
              <button type="button" className="mini-btn" onClick={() => copy(`${formatTime(c.start_time)} - ${c.title}`)}>{t.copyTime}</button>
              <button type="button" className="mini-btn" onClick={() => setExpanded(open ? null : k)}>
                {open ? '−' : '+'}
              </button>
            </div>
            {open && <p className="clip-transcript">{c.transcript}</p>}
          </article>
        )
      })}

      {copyNotice && <p className="action-feedback" role="status" aria-live="polite">{copyNotice}</p>}
    </div>
  )
}
