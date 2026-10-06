import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../locales';

type UserGuideModalProps = {
  onClose: () => void;
};

export function UserGuideModal({ onClose }: UserGuideModalProps) {
  const { t } = useLanguage();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const updateCurrentSectionRef = useRef<(() => void) | null>(null);
  const programmaticNavigationRef = useRef(false);
  const navigationTimerRef = useRef<number | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const sections = Array.from(content.querySelectorAll<HTMLElement>('.user-guide-section'));
    const updateCurrentSection = () => {
      if (programmaticNavigationRef.current) return;
      const readingLine = content.getBoundingClientRect().top + 36;
      let activeIndex = 0;
      sections.forEach((section, index) => {
        if (section.getBoundingClientRect().top <= readingLine) activeIndex = index;
      });
      setCurrentSection((previous) => previous === activeIndex ? previous : activeIndex);
    };
    updateCurrentSectionRef.current = updateCurrentSection;
    const finishScroll = () => {
      programmaticNavigationRef.current = false;
      if (navigationTimerRef.current !== null) window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
      updateCurrentSection();
    };
    updateCurrentSection();
    content.addEventListener('scroll', updateCurrentSection, { passive: true });
    content.addEventListener('scrollend', finishScroll);
    return () => {
      content.removeEventListener('scroll', updateCurrentSection);
      content.removeEventListener('scrollend', finishScroll);
      if (navigationTimerRef.current !== null) window.clearTimeout(navigationTimerRef.current);
    };
  }, [t.guide.sections]);

  const guide = t.guide;
  const goToSection = (index: number) => {
    const target = contentRef.current?.querySelector<HTMLElement>(`#user-guide-section-${index + 1}`);
    if (!target || index < 0 || index >= guide.sections.length) return;
    if (navigationTimerRef.current !== null) window.clearTimeout(navigationTimerRef.current);
    programmaticNavigationRef.current = true;
    setCurrentSection(index);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    navigationTimerRef.current = window.setTimeout(() => {
      programmaticNavigationRef.current = false;
      navigationTimerRef.current = null;
      updateCurrentSectionRef.current?.();
    }, 900);
  };

  return (
    <div className="modal-backdrop user-guide-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={modalRef}
        className="user-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-guide-title"
        aria-describedby="user-guide-description"
      >
        <header className="user-guide-header">
          <div>
            <span className="user-guide-eyebrow">ECLIPSE · {guide.eyebrow}</span>
            <h2 id="user-guide-title">{guide.title}</h2>
            <p id="user-guide-description">{guide.subtitle}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="user-guide-close" onClick={onClose} aria-label={guide.closeLabel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="user-guide-layout">
          <nav className="user-guide-toc" aria-label={guide.contentsTitle}>
            <h3>{guide.contentsTitle}</h3>
            {guide.sections.map((section, index) => (
              <button
                type="button"
                key={section.title}
                className={currentSection === index ? 'active' : ''}
                aria-current={currentSection === index ? 'step' : undefined}
                onClick={() => goToSection(index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>{section.title}
              </button>
            ))}
          </nav>
          <div className="user-guide-content" ref={contentRef}>
            {guide.sections.map((section, index) => (
              <article className="user-guide-section" id={`user-guide-section-${index + 1}`} key={section.title}>
                <div className="user-guide-section-heading">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{section.title}</h3>
                </div>
                <p>{section.intro}</p>
                <ol>
                  {section.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </article>
            ))}
          </div>
        </div>
        <footer className="user-guide-footer">
          <div className="user-guide-progress-wrap">
            <span>{guide.sectionProgress(currentSection + 1, guide.sections.length)}</span>
            <div className="user-guide-progress" role="progressbar" aria-valuemin={1} aria-valuemax={guide.sections.length} aria-valuenow={currentSection + 1} aria-label={guide.contentsTitle}>
              <span style={{ width: `${((currentSection + 1) / guide.sections.length) * 100}%` }} />
            </div>
          </div>
          <div className="user-guide-pager">
            <button type="button" onClick={() => goToSection(currentSection - 1)} disabled={currentSection === 0}>
              <span aria-hidden="true">←</span>{guide.previousSection}
            </button>
            <button type="button" onClick={() => goToSection(currentSection + 1)} disabled={currentSection === guide.sections.length - 1}>
              {guide.nextSection}<span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
