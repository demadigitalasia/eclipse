import { useLanguage } from '../locales';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px',
        borderRadius: '10px',
        background: '#f3f3f3',
        border: '1px solid #e5e5e5',
        backdropFilter: 'none',
        position: 'relative',
        userSelect: 'none',
      }}
      role="group"
      aria-label={t.accessibility.languageSelection}
    >
      <button
        type="button"
        onClick={() => setLanguage('id')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0',
          padding: '4px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          border: 'none',
          borderRadius: '7px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          background: language === 'id'
            ? 'var(--primary)'
            : 'transparent',
          color: language === 'id' ? '#ffffff' : 'var(--text-secondary)',
          boxShadow: language === 'id' ? '0 2px 6px rgba(98, 98, 98, 0.18)' : 'none',
        }}
        title={t.accessibility.indonesian}
      >
        <span>ID</span>
      </button>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0',
          padding: '4px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          border: 'none',
          borderRadius: '7px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          background: language === 'en'
            ? 'var(--primary)'
            : 'transparent',
          color: language === 'en' ? '#ffffff' : 'var(--text-secondary)',
          boxShadow: language === 'en' ? '0 2px 6px rgba(98, 98, 98, 0.18)' : 'none',
        }}
        title={t.accessibility.english}
      >
        <span>EN</span>
      </button>
    </div>
  );
};
