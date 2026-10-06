import { useState } from 'react'
import type { ViralClip } from '../types'
import { formatTime } from '../types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  clip: ViralClip
  duration: number
  onClose: () => void
  onApply: (clip: ViralClip) => void
}

export default function TrimmerModal({ t, clip, duration, onClose, onApply }: Props) {
  const [start, setStart] = useState(clip.start_time)
  const [end, setEnd] = useState(clip.end_time)
  const valid = start >= 0 && end > start && end <= duration

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal" role="dialog" aria-modal="true" aria-label={t.trim} onClick={(e) => e.stopPropagation()}>
        <h3>{clip.title}</h3>
        <div style={{ height: 10 }} />
        <div className="trim-range">
          <div className="row">
            <label className="field-label" htmlFor="trim-start">Start (detik)</label>
            <input id="trim-start" className="input" type="number" min={0} max={duration} step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} />
          </div>
          <div className="row">
            <label className="field-label" htmlFor="trim-end">End (detik)</label>
            <input id="trim-end" className="input" type="number" min={0} max={duration} step={0.5} value={end} onChange={(e) => setEnd(Number(e.target.value))} />
          </div>
        </div>
        <p className="helper" style={{ marginTop: 8 }}>
          {formatTime(start)} → {formatTime(end)} · durasi video {formatTime(duration)}
        </p>
        {!valid && <p className="error-box" style={{ marginTop: 8 }}>Rentang tidak valid.</p>}
        <div className="row-inline" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{t.close}</button>
          <button type="button" className="btn-primary" disabled={!valid} onClick={() => onApply({ ...clip, start_time: start, end_time: end })}>
            {t.trim}
          </button>
        </div>
      </div>
    </div>
  )
}
