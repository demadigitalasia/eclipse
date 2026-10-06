import type { Lang } from '../types'
import type { Strings } from '../i18n'

interface Props {
  step: 1 | 2 | 3
  hasResult: boolean
  loading: boolean
  lang: Lang
  setLang: (l: Lang) => void
  t: Strings
  onGoInput: () => void
  onGoDiscover: () => void
  onGoStudio: () => void
}

export default function Topbar({ step, hasResult, loading, lang, setLang, t, onGoInput, onGoDiscover, onGoStudio }: Props) {
  const canDiscover = hasResult || loading
  return (
    <header className="topbar">
      <div className="brand">
        ECLIPSE<b>.</b>
      </div>
      <nav className="stepper" aria-label="Workflow steps">
        <button
          type="button"
          className={`step ${step === 1 ? 'is-active' : step > 1 ? 'is-done' : ''}`}
          aria-current={step === 1 ? 'step' : undefined}
          onClick={onGoInput}
        >
          <span className="dot">1</span>
          <span className="lbl">Input</span>
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
          <span className="lbl">Discover</span>
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
          <span className="lbl">Studio</span>
        </button>
      </nav>
      <div className="topbar-actions">
        <button type="button" className="btn-ghost" title={t.guide}>
          {t.guide}
        </button>
        <div className="lang-switch" role="group" aria-label="Language">
          <button type="button" className={lang === 'id' ? 'is-on' : ''} onClick={() => setLang('id')} aria-pressed={lang === 'id'}>
            ID
          </button>
          <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>
            EN
          </button>
        </div>
      </div>
    </header>
  )
}
