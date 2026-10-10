import type { Lang } from '../types'
import type { Strings } from '../localization'
import { Link } from 'react-router-dom'
import NotificationBell from './NotificationBell'

interface Props {
  step: 1 | 2 | 3
  hasResult: boolean
  loading: boolean
  lang: Lang
  t: Strings
  onGoInput: () => void
  onGoDiscover: () => void
  onGoStudio: () => void
}

export default function Topbar({ step, hasResult, loading, lang, t, onGoInput, onGoDiscover, onGoStudio }: Props) {
  const canDiscover = hasResult || loading
  return (
    <header className="topbar">
      <Link to="/" className="brand topbar-brand" aria-label="ECLIPSE Studio">
        <img className="studio-wordmark" src="/images/studio-wordmark.png" alt="Studio" />
      </Link>
      <nav className="stepper" aria-label="Workflow steps">
        <button
          type="button"
          className={`step ${step === 1 ? 'is-active' : step > 1 ? 'is-done' : ''}`}
          aria-current={step === 1 ? 'step' : undefined}
          onClick={onGoInput}
        >
          <span className="dot">1</span>
          <span className="lbl">{t.inputStep}</span>
        </button>
        <span className="step-arrow" aria-hidden="true">→</span>
        <button
          type="button"
          className={`step ${step === 2 ? 'is-active' : step === 3 || hasResult ? 'is-done' : ''}`}
          aria-current={step === 2 ? 'step' : undefined}
          disabled={!canDiscover}
          onClick={onGoDiscover}
        >
          <span className="dot">2</span>
          <span className="lbl">{t.discoverStep}</span>
        </button>
        <span className="step-arrow" aria-hidden="true">→</span>
        <button
          type="button"
          className={`step ${step === 3 ? 'is-active' : ''}`}
          aria-current={step === 3 ? 'step' : undefined}
          disabled={!hasResult}
          onClick={onGoStudio}
        >
          <span className="dot">3</span>
          <span className="lbl">{t.studioStep}</span>
        </button>
      </nav>
      <div className="topbar-actions">
        <NotificationBell lang={lang} />
      </div>
    </header>
  )
}
