export const ADMIN_KEY_STORAGE = 'eclipse_admin_key';

export const getAdminHeaders = (overrideKey?: string): Record<string, string> => {
  let key = overrideKey?.trim() || '';
  if (!key) {
    try {
      key = localStorage.getItem(ADMIN_KEY_STORAGE)?.trim() || '';
    } catch {
      key = '';
    }
  }
  if (!key) return {};
  // X-Admin-Key is used by Settings/Cookies; X-API-Key keeps existing
  // System endpoints compatible with their established authentication.
  return { 'X-Admin-Key': key, 'X-API-Key': key };
};
