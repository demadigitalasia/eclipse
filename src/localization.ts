import type { AppError, ErrorCode, Lang } from './types'
import { getStrings, type Strings } from './i18n'
import { getSiteStrings, type SiteStrings } from './site-i18n'
import { getInlineCopy } from './inline-copy'

export { getStrings, getSiteStrings }
export { getInlineCopy }

/** One application-facing localization entry point; dictionaries stay split by domain. */
export function getLocalization(lang: Lang) {
  return {
    lang,
    app: getStrings(lang),
    site: getSiteStrings(lang),
    inline: (key: string) => getInlineCopy(lang, key),
  }
}

export type Localization = ReturnType<typeof getLocalization>
export type { Lang, Strings, SiteStrings }

const ERROR_COPY: Record<ErrorCode, (t: Strings, error: AppError) => string> = {
  invalid_url: (t) => t.errorInvalidUrl,
  drive_not_accessible: (t) => t.errorDriveUnavailable,
  file_required: (t) => t.errorFileRequired,
  file_too_large: (t, error) => t.errorFileTooLarge(error.limitLabel || '2 GB'),
  file_type_unsupported: (t) => t.errorFileType,
  invalid_range: (t) => t.errorInvalidRange,
  consent_required: (t) => t.errorConsent,
  quota_exceeded: (t) => t.errorQuota,
  empty_result: (t) => t.errorEmptyResult,
  backend_offline: (t) => t.errorBackendOffline,
  unknown: (t) => t.errorUnknown,
}

/** Translate known API errors at the UI boundary; server prose is not user-facing copy. */
export function getErrorMessage(error: AppError, lang: Lang): string {
  const t = getStrings(lang)
  return ERROR_COPY[error.code]?.(t, error) ?? t.errorUnknown
}

export function getCaughtErrorMessage(error: unknown, lang: Lang): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code in ERROR_COPY) {
    return getErrorMessage(error as AppError, lang)
  }
  return getStrings(lang).errorUnknown
}

export function getLocale(lang: Lang): string {
  return lang === 'id' ? 'id-ID' : 'en-US'
}

export function formatNumber(value: number, lang: Lang, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(lang), options).format(value)
}

export function formatDate(value: Date | number | string, lang: Lang, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(lang), options).format(new Date(value))
}
