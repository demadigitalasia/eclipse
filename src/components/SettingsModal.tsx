import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../locales';
import { ADMIN_KEY_STORAGE, getAdminHeaders } from '../utils/admin';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SettingsStatus {
  admin_configured: boolean;
  supadata: {
    configured: boolean;
    keys_count: number;
    masked_keys: string[];
    source: 'settings' | 'env' | 'none';
    usage?: {
      total_limit?: number;
      total_used?: number;
      total_remaining?: number;
      active_keys?: number;
    } | null;
  };
  proxy: {
    configured: boolean;
    masked_url: string;
    source: 'settings' | 'env' | 'none';
    egress_ip?: string | null;
  };
  pot_provider: {
    configured: boolean;
    url: string;
    source: 'settings' | 'env' | 'none';
  };
}

const readAdminKey = (): string => {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE) || '';
  } catch {
    return '';
  }
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [adminKey, setAdminKey] = useState<string>(() => readAdminKey());
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [supadataInput, setSupadataInput] = useState<string>('');
  const [proxyInput, setProxyInput] = useState<string>('');
  const [potInput, setPotInput] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ text: string; ok: boolean } | null>(null);

  const adminHeaders = useCallback((): Record<string, string> => {
    return getAdminHeaders(adminKey);
  }, [adminKey]);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', { headers: adminHeaders() });
      if (res.status === 403) {
        setStatus(null);
        setMessage({ text: t.settings.adminNotConfigured, type: 'error' });
        return;
      }
      if (res.status === 401) {
        setStatus(null);
        setMessage({ text: t.settings.adminInvalid, type: 'error' });
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      } else {
        setMessage({ text: data.detail || t.settings.networkError, type: 'error' });
      }
    } catch {
      setMessage({ text: t.settings.networkError, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [adminHeaders, t]);

  useEffect(() => {
    if (isOpen) {
      const stored = readAdminKey();
      setAdminKey(stored);
      setSupadataInput('');
      setProxyInput('');
      setPotInput('');
      setTestResult(null);
      setMessage(null);
      if (stored) {
        loadStatus();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const persistAdminKey = () => {
    try {
      localStorage.setItem(ADMIN_KEY_STORAGE, adminKey.trim());
    } catch {
      // Ignore storage failures (private mode)
    }
  };

  const handleAdminKeyBlur = () => {
    persistAdminKey();
    if (adminKey.trim()) {
      loadStatus();
    }
  };

  const handleSave = async (overrides?: { supadata_api_keys?: string; proxy_url?: string; pot_provider_url?: string }) => {
    persistAdminKey();
    const body: Record<string, string> = {};
    if (overrides) {
      Object.assign(body, overrides);
    } else {
      if (supadataInput.trim()) body.supadata_api_keys = supadataInput.trim();
      if (proxyInput.trim()) body.proxy_url = proxyInput.trim();
      if (potInput.trim()) body.pot_provider_url = potInput.trim();
    }

    if (Object.keys(body).length === 0) {
      setMessage({ text: t.settings.nothingToSave, type: 'info' });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(data);
        setSupadataInput('');
        setProxyInput('');
        setPotInput('');
        setMessage({ text: t.settings.savedMsg, type: 'success' });
      } else if (res.status === 401) {
        setMessage({ text: t.settings.adminInvalid, type: 'error' });
      } else {
        setMessage({ text: data.detail || t.settings.networkError, type: 'error' });
      }
    } catch {
      setMessage({ text: t.settings.networkError, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestProxy = async () => {
    persistAdminKey();
    setIsTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, string> = {};
      if (proxyInput.trim()) body.proxy_url = proxyInput.trim();
      const res = await fetch('/api/settings/test-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({ text: t.settings.testProxyOk(String(data.egress_ip), Number(data.latency_ms)), ok: true });
      } else {
        setTestResult({ text: t.settings.testProxyFailed(String(data.detail || data.error || 'Unknown error')), ok: false });
      }
    } catch (err: any) {
      setTestResult({ text: t.settings.testProxyFailed(err?.message || 'Network error'), ok: false });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const supadataUsage = status?.supadata.usage;
  const supadataSourceLabel = status?.supadata.source === 'settings'
    ? t.settings.sourceSettings
    : status?.supadata.source === 'env'
      ? t.settings.sourceEnv
      : '';

  const maskedProxy = status?.proxy.masked_url
    ? status.proxy.masked_url
    : t.settings.proxyNotConfigured;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cookies-modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="studio-modal-header">
          <div className="studio-header-title">
            <div className="studio-icon-badge"></div>
            <div>
              <div className="studio-title-row">
                <h2 id="settings-modal-title">{t.settings.modalTitle}</h2>
                <span className={`status-pill ${status ? 'active' : 'inactive'}`}>
                  {status ? t.settings.statusUnlocked : t.settings.statusLocked}
                </span>
              </div>
              <p className="studio-header-desc">{t.settings.headerDesc}</p>
            </div>
          </div>
          <button className="studio-close-btn" onClick={onClose} aria-label={t.settings.closeBtn} title={t.settings.closeBtn}>
            ×
          </button>
        </div>

        <div className="cookies-modal-scrollable">
          {/* Admin key */}
          <div className="cookies-status-section">
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem' }}>{t.settings.adminKeyLabel}</label>
            <input
              type="password"
              className="cookies-textarea"
              style={{ minHeight: 'auto', padding: '0.6rem 0.75rem', fontFamily: 'inherit' }}
              placeholder={t.settings.adminKeyPlaceholder}
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onBlur={handleAdminKeyBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <p style={{ marginTop: '0.45rem', fontSize: '0.8rem', opacity: 0.75 }}>{t.settings.adminKeyHelp}</p>
            {status && (
              <p style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
                {status.admin_configured ? t.settings.adminConfiguredBadge : t.settings.adminNotConfiguredBadge}
              </p>
            )}
          </div>

          {message && (
            <div className={`cookie-alert-box alert-${message.type}`}>{message.text}</div>
          )}

          {/* Supadata */}
          <div className="cookies-body-section">
            <h3 style={{ marginTop: 0 }}>{t.settings.supadataSectionTitle}</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>{t.settings.supadataDesc}</p>

            {status?.supadata.configured ? (
              <div className="cookie-status-box active" style={{ marginBottom: '0.75rem' }}>
                <span className="status-icon"></span>
                <div className="status-info">
                  <strong>{t.settings.supadataActiveKeys(status.supadata.keys_count)}</strong>
                  <p>{status.supadata.masked_keys.join(', ')}{supadataSourceLabel ? ` — ${supadataSourceLabel}` : ''}</p>
                  {supadataUsage && typeof supadataUsage.total_limit === 'number' ? (
                    <p>{t.settings.supadataUsage(Number(supadataUsage.total_remaining ?? 0), Number(supadataUsage.total_limit ?? 0))}</p>
                  ) : (
                    <p>{t.settings.supadataUsageUnavailable}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="cookie-status-box warning" style={{ marginBottom: '0.75rem' }}>
                <span className="status-icon"></span>
                <div className="status-info">
                  <strong>{t.settings.supadataNotConfiguredTitle}</strong>
                  <p>{t.settings.supadataNotConfiguredDesc}</p>
                </div>
              </div>
            )}

            <textarea
              className="cookies-textarea"
              rows={4}
              placeholder={t.settings.supadataPlaceholder}
              value={supadataInput}
              onChange={(e) => setSupadataInput(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {status?.supadata.source === 'settings' && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => handleSave({ supadata_api_keys: '' })}
                  disabled={isSaving}
                >
                  {t.settings.supadataClearBtn}
                </button>
              )}
            </div>
          </div>

          {/* Proxy */}
          <div className="cookies-body-section">
            <h3>{t.settings.proxySectionTitle}</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>{t.settings.proxyDesc}</p>
            <p style={{ fontSize: '0.85rem' }}>
              <strong>{t.settings.proxyActiveLabel}</strong> {maskedProxy}
            </p>
            <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>
              {status?.proxy.egress_ip
                ? t.settings.egressCurrent(status.proxy.egress_ip)
                : t.settings.egressUnavailable}
            </p>

            <input
              type="text"
              className="cookies-textarea"
              style={{ minHeight: 'auto', padding: '0.6rem 0.75rem', fontFamily: 'monospace' }}
              placeholder={t.settings.proxyPlaceholder}
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {status?.proxy.source === 'settings' && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => handleSave({ proxy_url: '' })}
                  disabled={isSaving}
                >
                  {t.settings.proxyClearBtn}
                </button>
              )}
              <button
                type="button"
                className="btn-danger-outline"
                onClick={handleTestProxy}
                disabled={isTesting}
              >
                {isTesting ? t.settings.testingProxyBtn : t.settings.testProxyBtn}
              </button>
            </div>
            {testResult && (
              <div className={`cookie-alert-box alert-${testResult.ok ? 'success' : 'error'}`} style={{ marginTop: '0.6rem' }}>
                {testResult.text}
              </div>
            )}
          </div>

          {/* PO token provider */}
          <div className="cookies-body-section">
            <h3>{t.settings.potSectionTitle}</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>{t.settings.potDesc}</p>
            <p style={{ fontSize: '0.85rem' }}>
              <strong>{t.settings.potActiveLabel}</strong>{' '}
              {status?.pot_provider.configured
                ? status.pot_provider.url
                : t.settings.potNotConfigured}
            </p>

            <input
              type="text"
              className="cookies-textarea"
              style={{ minHeight: 'auto', padding: '0.6rem 0.75rem', fontFamily: 'monospace' }}
              placeholder={t.settings.potPlaceholder}
              value={potInput}
              onChange={(e) => setPotInput(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {status?.pot_provider.source === 'settings' && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => handleSave({ pot_provider_url: '' })}
                  disabled={isSaving}
                >
                  {t.settings.potClearBtn}
                </button>
              )}
            </div>
          </div>

          {isLoading && <p style={{ opacity: 0.7 }}>{t.settings.loadingBtn}</p>}
        </div>

        {/* Footer */}
        <div className="studio-modal-footer">
          <button className="studio-btn-cancel" onClick={onClose}>
            {t.settings.closeBtn}
          </button>
          <button
            className="studio-btn-render glowing-btn"
            onClick={() => handleSave()}
            disabled={isSaving || (!supadataInput.trim() && !proxyInput.trim() && !potInput.trim())}
          >
            {isSaving ? t.settings.savingBtn : t.settings.saveBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
