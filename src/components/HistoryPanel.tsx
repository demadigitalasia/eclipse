import { useMemo, useState } from 'react'
import type { HistoryEntry } from '../types'
import type { Strings } from '../localization'
import Icon from './Icon'

interface Props {
  t: Strings
  entries: HistoryEntry[]
  onLoad: (e: HistoryEntry) => void
  onDelete: (id: string) => void
  onClear: () => void
}

export default function HistoryPanel({ t, entries, onLoad, onDelete, onClear }: Props) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(needle) ||
        e.url.toLowerCase().includes(needle) ||
        e.source.toLowerCase().includes(needle),
    )
  }, [entries, q])

  return (
    <section className="panel history" aria-label={t.historyTitle}>
      <div className="history-head">
        <h3>{t.historyTitle} · {entries.length}</h3>
        <p>{t.historySub}</p>
      </div>
      <div className="history-actions">
        <input
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          placeholder={t.historySearch}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.historySearch}
        />
        <button type="button" className="btn-danger" onClick={() => {
          if (window.confirm(t.historyClearConfirm)) onClear()
        }} disabled={entries.length === 0}>
          {t.historyClear}
        </button>
      </div>
      <div className="history-list">
        {entries.length === 0 && <p className="history-empty">{t.historyEmpty}</p>}
        {entries.length > 0 && shown.length === 0 && <p className="history-empty">{t.historyNoResult}</p>}
        {shown.map((e) => (
          <article key={e.video_id + e.analyzed_at} className="history-card">
            <div className="history-thumb" aria-hidden="true">
              {!e.thumbnail && (e.source === 'youtube'
                ? <img className="history-source-icon" src="/images/source-youtube.png" alt="" />
                : <Icon name={e.source === 'drive' ? 'grid' : 'upload'} size={20} />)}
              {e.thumbnail && <img className="history-preview" src={e.thumbnail} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
            </div>
            <div className="history-content">
              <div className="history-title">{e.title}</div>
              <div className="history-meta">
                <span>{t.clipsCount(e.clip_count)}</span>
                <span>•</span>
                <span>{e.duration_pref}</span>
              </div>
            </div>
            <div className="history-entry-actions">
              <button type="button" className="btn-secondary" onClick={() => onLoad(e)}>
                {t.historyLoad}
              </button>
              <button type="button" className="btn-danger" onClick={() => onDelete(e.video_id)} aria-label={`${t.historyDelete}: ${e.title}`}>
                <Icon name="trash" size={20} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
