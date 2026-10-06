import type { HistoryEntry } from '../types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  entries: HistoryEntry[]
  onLoad: (e: HistoryEntry) => void
  onDelete: (id: string) => void
  onClear: () => void
}

export default function HistoryPanel({ t, entries, onLoad, onDelete, onClear }: Props) {
  return (
    <section className="panel history" aria-label={t.historyTitle}>
      <div className="history-head">
        <h3>{t.historyTitle} · {entries.length}</h3>
        <p>{t.historySub}</p>
      </div>
      <div className="history-actions">
        <button type="button" className="btn-danger" onClick={onClear} disabled={entries.length === 0}>
          {t.historyClear}
        </button>
      </div>
      <div className="history-list">
        {entries.length === 0 && <p className="history-empty">{t.historyEmpty}</p>}
        {entries.map((e) => (
          <article key={e.video_id + e.analyzed_at} className="history-card">
            <div className="history-thumb" aria-hidden="true" />
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
              <button type="button" className="btn-danger" onClick={() => onDelete(e.video_id)} aria-label={e.title}>
                ✕
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
