import { useLanguage } from '../locales';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="header-language-switcher"
      role="group"
      aria-label={t.accessibility.languageSelection}
    >
      <button
        type="button"
        onClick={() => setLanguage('id')}
        className={`header-language-btn${language === 'id' ? ' is-active' : ''}`}
        aria-pressed={language === 'id'}
        title={t.accessibility.indonesian}
      >
        <span>ID</span>
      </button>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`header-language-btn${language === 'en' ? ' is-active' : ''}`}
        aria-pressed={language === 'en'}
        title={t.accessibility.english}
      >
        <span>EN</span>
      </button>
    </div>
  );
};
