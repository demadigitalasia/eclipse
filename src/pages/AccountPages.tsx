import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useFocusReturn } from '../hooks'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import Icon from '../components/Icon'
import ProfileAvatar from '../components/ProfileAvatar'
import GeminiApiPanel from '../components/GeminiApiPanel'
import ProxySettingsPanel from '../components/ProxySettingsPanel'
import YouTubeCookiesControl from '../components/YouTubeCookiesControl'
import type { Lang } from '../types'
import { getSiteStrings, getInlineCopy, getLocale } from '../localization'
import { getStrings } from '../localization'
import { createAdminSubscriptionPromo, decideAdminSubscriptionPayment, deleteAdminSubscriptionPromo, getAdminSubscriptionPayments, getAdminSubscriptionPromos, getAdminSubscriptionSettings, getRenderCapabilities, getServerHealth, getServerLimits, saveAdminSubscriptionSettings, setAdminSubscriptionPromoActive, type RenderCapabilities, type ServerHealth, type ServerLimits, type SubscriptionPayment, type SubscriptionPromo, type SubscriptionSettings, uploadAdminSubscriptionQr } from '../api'

function AdminRoleDropdown({
  value,
  disabled,
  label,
  userLabel,
  adminLabel,
  placement,
  onChange,
}: {
  value: 'admin' | 'user'
  disabled: boolean
  label: string
  userLabel: string
  adminLabel: string
  placement: 'top' | 'bottom'
  onChange: (value: 'admin' | 'user') => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const options: Array<{ value: 'user' | 'admin'; label: string }> = [
    { value: 'user', label: userLabel },
    { value: 'admin', label: adminLabel },
  ]

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const focusOption = (index: number) => optionRefs.current[index]?.focus()
  const openAt = (index: number) => {
    setOpen(true)
    requestAnimationFrame(() => focusOption(index))
  }

  return (
    <div className="admin-role-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-role-dropdown__trigger${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openAt(event.key === 'ArrowDown' ? options.findIndex((option) => option.value === value) : 1 - options.findIndex((option) => option.value === value))
          }
        }}
      >
        <span>{value === 'admin' ? adminLabel : userLabel}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {open && (
        <div className={`admin-role-dropdown__menu admin-role-dropdown__menu--${placement}`} id={listboxId} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element }}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={`admin-role-dropdown__option${value === option.value ? ' is-selected' : ''}`}
              onClick={() => {
                if (option.value !== value) onChange(option.value)
                setOpen(false)
                triggerRef.current?.focus()
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  focusOption(event.key === 'ArrowDown' ? (index + 1) % options.length : (index + options.length - 1) % options.length)
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault()
                  focusOption(event.key === 'Home' ? 0 : options.length - 1)
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (option.value !== value) onChange(option.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SettingsPage({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = getSiteStrings(lang)
  const inputT = getStrings(lang)
  const { user, updateMe, uploadProfilePhoto } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoMessage, setPhotoMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [planLimits, setPlanLimits] = useState<ServerLimits | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { let active = true; getServerLimits().then((value) => { if (active) setPlanLimits(value) }).catch(() => {}); return () => { active = false } }, [])
  if (!user) return null

  const normalizedName = name.trim()
  const hasNameChanged = normalizedName !== user.name
  const planName = user.role === 'admin'
    ? t.unlimitedLabel
    : user.plan === 'free' ? t.planFree : user.plan === 'lite' ? t.planLite : t.planPro
  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setPhotoMessage(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoMessage({ text: getInlineCopy(lang, "copy_pilih_foto_jpg_png_atau_webp_6ae0054"), error: true })
      input.value = ''
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoMessage({ text: getInlineCopy(lang, "copy_ukuran_foto_maksimal_8_mb_716bed2"), error: true })
      input.value = ''
      return
    }
    setPhotoUploading(true)
    const message = await uploadProfilePhoto(file)
    setPhotoMessage(message
      ? { text: message, error: true }
      : { text: getInlineCopy(lang, "copy_foto_profil_berhasil_diperbarui_54373be"), error: false })
    input.value = ''
    setPhotoUploading(false)
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || !hasNameChanged || !normalizedName || normalizedName.length > 120) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const message = await updateMe({ name: normalizedName })
      if (message) setError(message)
      else setName(normalizedName)
      setSaved(!message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page account-settings-page">
      <header className="account-settings-heading account-settings-heading--v2">
        <ProfileAvatar name={user.name} photoUpdatedAt={user.profilePhotoUpdatedAt} className="rail-avatar--lg" />
        <div>
          <p className="section-kicker">{t.navSettings} — {planName}</p>
          <h2>{t.setT}</h2>
          <p className="helper">{t.setIntro} {user.email}</p>
        </div>
        <span className="chip is-on">{planName}</span>
      </header>

      <div className="account-settings-grid account-settings-grid--v2">
        <div className="settings-main-stack">
        <section className="panel settings-profile" aria-labelledby="settings-profile-title">
          <div className="settings-profile-head">
            <div>
              <h3 id="settings-profile-title">{t.setProfile}</h3>
              <p className="helper settings-section-help">{t.setProfileHelp}</p>
            </div>
            <div className="profile-photo-control">
              <input
                ref={photoInputRef}
                className="profile-photo-input"
                id="profile-photo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={t.setPhotoChange}
                onChange={(event) => void uploadPhoto(event)}
              />
              <button
                type="button"
                className="profile-photo-button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                aria-label={photoUploading ? t.setPhotoUploading : t.setPhotoChange}
              >
                <ProfileAvatar name={user.name} photoUpdatedAt={user.profilePhotoUpdatedAt} className="profile-avatar-preview" />
                <span className="profile-photo-edit" aria-hidden="true"><Icon name="upload" size={15} /></span>
              </button>
              <span className="profile-photo-action">{t.setPhotoChange}</span>
              <span className="helper profile-photo-hint">{photoUploading ? t.setPhotoUploading : t.setPhotoHint}</span>
              {photoMessage && <span className={`field-message ${photoMessage.error ? 'field-message--error' : 'field-message--success'}`} role={photoMessage.error ? 'alert' : 'status'}>{photoMessage.text}</span>}
            </div>
          </div>
          <form className="settings-profile-form" onSubmit={(event) => void saveProfile(event)}>
            <div className="row">
              <label className="field-label" htmlFor="set-name">{t.fName}</label>
              <input
                id="set-name"
                className="input"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setSaved(false)
                  setError(null)
                }}
                required
                maxLength={120}
                autoComplete="name"
                aria-describedby={error ? 'settings-name-help settings-name-error' : 'settings-name-help'}
              />
              <span id="settings-name-help" className="helper">{t.setNameHelp}</span>
              {error && <span id="settings-name-error" className="field-message field-message--error" role="alert">{error}</span>}
            </div>
            <div className="settings-form-actions">
              <button type="submit" className="btn-primary" disabled={saving || !hasNameChanged || !normalizedName || normalizedName.length > 120}>
                {saving ? t.setSaving : t.setSave}
              </button>
              {saved && <span className="field-message field-message--success" role="status">{t.setSaved}</span>}
            </div>
          </form>
        </section>

        <section className="panel settings-youtube-cookies" aria-labelledby="settings-youtube-cookies-title">
          <div>
            <h3 id="settings-youtube-cookies-title">{inputT.youtubeCookiesTitle}</h3>
            <p className="helper">{inputT.youtubeCookiesHelp}</p>
          </div>
          <YouTubeCookiesControl t={inputT} />
        </section>

          <section className="panel quota-strip" aria-label={getInlineCopy(lang, "copy_kuota_453abd3")}>
            <div>
              <p className="section-kicker">{getInlineCopy(lang, "copy_kuota_harian_443f473")}</p>
              {user.role === 'admin' ? (
                <>
                  <h3>{getInlineCopy(lang, "copy_tanpa_batas_harian_41d0ef2")}</h3>
                  <p className="helper">{getInlineCopy(lang, "copy_akun_admin_dapat_menganalisis_dan__ff19923")}</p>
                </>
              ) : user.plan === 'pro' ? (
                <>
                  <h3>{lang === 'id' ? `${planLimits?.proDailyRender ?? 25}× batch generate per hari` : `${planLimits?.proDailyRender ?? 25}× generation batches per day`}</h3>
                  <p className="helper">{lang === 'id' ? `Rp${(planLimits?.proMonthlyPriceIdr ?? 300000).toLocaleString('id-ID')} untuk masa aktif ${planLimits?.proTermMonths ?? 1} bulan. Kuota direset harian.${user.planExpiresAt ? ` Berakhir ${new Date(user.planExpiresAt).toLocaleDateString('id-ID')}.` : ''}` : `Rp${(planLimits?.proMonthlyPriceIdr ?? 300000).toLocaleString('en-US')} for ${planLimits?.proTermMonths ?? 1} month(s). Daily quota resets each day.${user.planExpiresAt ? ` Expires ${new Date(user.planExpiresAt).toLocaleDateString('en-US')}.` : ''}`}</p>
                </>
              ) : user.plan === 'lite' ? (
                <>
                  <h3>{lang === 'id' ? `${planLimits?.liteDailyRender ?? 15}× batch generate per hari` : `${planLimits?.liteDailyRender ?? 15}× generation batches per day`}</h3>
                  <p className="helper">{lang === 'id' ? `Rp${(planLimits?.liteMonthlyPriceIdr ?? 150000).toLocaleString('id-ID')} untuk masa aktif ${planLimits?.liteTermMonths ?? 1} bulan. Kuota direset harian.${user.planExpiresAt ? ` Berakhir ${new Date(user.planExpiresAt).toLocaleDateString('id-ID')}.` : ''}` : `Rp${(planLimits?.liteMonthlyPriceIdr ?? 150000).toLocaleString('en-US')} for ${planLimits?.liteTermMonths ?? 1} month(s). Daily quota resets each day.${user.planExpiresAt ? ` Expires ${new Date(user.planExpiresAt).toLocaleDateString('en-US')}.` : ''}`}</p>
                </>
              ) : (
                <>
                  <h3>{lang === 'id' ? `${planLimits?.freeDailyRender ?? 1}× generate per hari selama ${planLimits?.freeRenderTrialDays ?? 3} hari` : `${planLimits?.freeDailyRender ?? 1}× generation per day for ${planLimits?.freeRenderTrialDays ?? 3} days`}</h3>
                  <p className="helper">{lang === 'id' ? `Berlaku sejak tanggal mendaftar. Maks. ${planLimits?.freeDailyAnalyze ?? 3} analisis per hari. Setelah itu, upgrade untuk melanjutkan.` : `Available from signup. Up to ${planLimits?.freeDailyAnalyze ?? 3} analyses per day. Upgrade to continue afterward.`}</p>
                </>
              )}
            </div>
            <div className="quota-bars" aria-hidden="true">
              <div><span>ANALISIS</span><span className="quota-track"><span className="quota-fill" /></span></div>
              <div><span>RENDER</span><span className="quota-track"><span className="quota-fill quota-fill--alt" /></span></div>
            </div>
          </section>
        </div>

        <aside className="panel settings-side settings-side--v2">
          <section className="settings-account-info" aria-labelledby="settings-account-title">
            <h3 id="settings-account-title">{t.setAccountInfo}</h3>
            <dl className="settings-account-facts">
              <div>
                <dt>{t.fEmail}</dt>
                <dd>{user.email}</dd>
                <p className="helper">{t.setEmailHelp}</p>
              </div>
              <div>
                <dt>{t.setPlan}</dt>
                <dd><span className="chip is-on">{planName}</span></dd>
                <p className="helper">{t.setPlanHelp}</p>
              </div>
              <div>
                <dt>{getInlineCopy(lang, "copy_peran_2299c98")}</dt>
                <dd><span className="chip">{user.role}</span></dd>
              </div>
            </dl>
          </section>

          <section className="settings-preferences" aria-labelledby="settings-preferences-title">
            <h3 id="settings-preferences-title">{t.setPreferences}</h3>
            <span className="field-label">{t.setLang}</span>
            <div className="lang-switch lang-switch--large" role="group" aria-label={t.setLang}>
              <button type="button" className={lang === 'id' ? 'is-on' : ''} onClick={() => setLang('id')} aria-pressed={lang === 'id'}>ID — Indonesia</button>
              <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>EN — English</button>
            </div>
            <p className="helper">{t.setLanguageHelp}</p>
          </section>

          <section className="session-card" aria-label={getInlineCopy(lang, "copy_sesi_6f6d566")}>
            <h3>{getInlineCopy(lang, "copy_sesi_6f6d566")}</h3>
            <p className="helper">{getInlineCopy(lang, "copy_sesi_browser_memakai_cookie_httpon_f72154c")}</p>
            <div className="session-row">
              <span className="compact-dot" aria-hidden="true" />
              <span className="helper">{user.email}</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function AdminSubscriptionSettings({ lang }: { lang: Lang }) {
  const isId = lang === 'id'
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const getErrorMessage = (cause: unknown, fallback: string) => {
    if (cause instanceof Error) return cause.message
    if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') {
      return cause.message
    }
    return fallback
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getAdminSubscriptionSettings()
      setSettings(result.settings)
    } catch (cause) {
      setError(getErrorMessage(cause, getInlineCopy(isId, "copy_pengaturan_paket_gagal_dimuat_f1498f4")))
    } finally {
      setLoading(false)
    }
  }, [isId])
  useEffect(() => { void load() }, [load])

  const update = (key: keyof SubscriptionSettings, raw: string) => {
    setSaved(false)
    setSettings((current) => current ? {
      ...current,
      [key]: typeof current[key] === 'string' ? raw : raw === '' ? 0 : Number(raw),
    } as SubscriptionSettings : current)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!settings) return
    setError('')
    setSaved(false)
    const missingDates = [
      { label: 'Lite', percent: settings.liteDiscountPercent, start: settings.liteDiscountStart, end: settings.liteDiscountEnd },
      { label: 'Pro', percent: settings.proDiscountPercent, start: settings.proDiscountStart, end: settings.proDiscountEnd },
    ].filter((plan) => plan.percent > 0 && (!plan.start || !plan.end))
    if (missingDates.length > 0) {
      const plans = missingDates.map((plan) => plan.label).join(' dan ')
      setError(isId
        ? `Lengkapi tanggal mulai dan akhir promo untuk paket ${plans}, atau ubah diskonnya menjadi 0%.`
        : `Set both campaign dates for ${plans}, or set the discount to 0%.`)
      return
    }
    setSaving(true)
    try {
      const result = await saveAdminSubscriptionSettings(settings)
      setSettings(result.settings)
      setSaved(true)
    } catch (cause) {
      setError(getErrorMessage(cause, getInlineCopy(isId, "copy_pengaturan_paket_gagal_disimpan_f5d7779")))
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof SubscriptionSettings, label: string, min: number, max: number, suffix?: string) => (
    <label className="admin-subscription-field" key={key}>
      <span>{label}</span>
      <span className="admin-subscription-input-wrap">
        <input
          className="input"
          type="number"
          min={min}
          max={max}
          step="1"
          value={settings?.[key] ?? ''}
          disabled={!settings || loading || saving}
          onChange={(event) => update(key, event.target.value)}
          required
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  )
  const dateField = (key: 'liteDiscountStart' | 'liteDiscountEnd' | 'proDiscountStart' | 'proDiscountEnd', label: string) => (
    <label className="admin-subscription-field" key={key}>
      <span>{label}</span>
      <input className="input" type="datetime-local" value={settings?.[key] || ''} disabled={!settings || loading || saving} onChange={(event) => update(key, event.target.value)} />
    </label>
  )

  return (
    <div className="admin-subscription-workspace">
    <form className="admin-subscription-settings" onSubmit={(event) => void save(event)}>
      <div className="admin-subscription-intro">
        <div><h3>{getInlineCopy(isId, "copy_ketentuan_paket_dbf59ca")}</h3><p className="helper">{getInlineCopy(isId, "copy_nilai_ini_langsung_dipakai_sebagai_4d031f9")}</p></div>
        <div className="row-inline">
          <Link to="/app/admin/users" className="btn-secondary btn-sm">{getInlineCopy(isId, "copy_kelola_paket_akun_072ea66")}</Link>
          <button type="button" className="btn-secondary btn-sm" disabled={loading || saving} onClick={() => void load()}>{getInlineCopy(isId, "copy_muat_ulang_da98d05")}</button>
        </div>
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {saved && <p className="notice" role="status">{getInlineCopy(isId, "copy_pengaturan_langganan_tersimpan_dan_cedc53e")}</p>}
      {loading && <p className="helper" role="status">{getInlineCopy(isId, "copy_memuat_pengaturan_d6918f2")}</p>}
      {!loading && settings && <>
        <section className="admin-subscription-plan">
          <header><span className="section-kicker">FREE</span><p className="helper">{getInlineCopy(isId, "copy_akses_awal_setelah_pendaftaran_217a368")}</p></header>
          <div className="admin-subscription-fields">
            {field('freeDailyRender', getInlineCopy(isId, "copy_batch_video_per_hari_893c88b"), 0, 10000)}
            {field('freeRenderTrialDays', getInlineCopy(isId, "copy_masa_free_sejak_daftar_7b52de2"), 1, 365, getInlineCopy(isId, "copy_hari_133a711"))}
            {field('freeDailyAnalyze', getInlineCopy(isId, "copy_analisis_per_hari_4dfa8f1"), 0, 10000)}
          </div>
        </section>
        <section className="admin-subscription-plan">
          <header><span className="section-kicker">LITE</span><p className="helper">{getInlineCopy(isId, "copy_langganan_bulanan_ae1141e")}</p></header>
          <div className="admin-subscription-fields">
            {field('liteDailyRender', getInlineCopy(isId, "copy_batch_generate_per_hari_5f6d833"), 0, 10000)}
            {field('liteMonthlyPriceIdr', getInlineCopy(isId, "copy_harga_per_bulan_28e1357"), 0, 1000000000, 'Rp')}
            {field('liteTermMonths', getInlineCopy(isId, "copy_masa_aktif_efd0ab9"), 1, 24, getInlineCopy(isId, "copy_bulan_001e80f"))}
            {field('liteDiscountPercent', getInlineCopy(isId, "copy_diskon_periode_promo_4b049a4"), 0, 90, '%')}
            {dateField('liteDiscountStart', getInlineCopy(isId, "copy_promo_lite_mulai_5883c42"))}
            {dateField('liteDiscountEnd', getInlineCopy(isId, "copy_promo_lite_berakhir_ea2afbf"))}
          </div>
          <p className="helper admin-subscription-note">{getInlineCopy(isId, "copy_jika_diskon_lebih_dari_0_isi_tangg_168d7ca")}</p>
        </section>
        <section className="admin-subscription-plan">
          <header><span className="section-kicker">PRO</span><p className="helper">{getInlineCopy(isId, "copy_langganan_bulanan_ae1141e")}</p></header>
          <div className="admin-subscription-fields">
            {field('proDailyRender', getInlineCopy(isId, "copy_batch_generate_per_hari_5f6d833"), 0, 10000)}
            {field('proMonthlyPriceIdr', getInlineCopy(isId, "copy_harga_per_bulan_28e1357"), 0, 1000000000, 'Rp')}
            {field('proTermMonths', getInlineCopy(isId, "copy_masa_aktif_efd0ab9"), 1, 24, getInlineCopy(isId, "copy_bulan_001e80f"))}
            {field('proDiscountPercent', getInlineCopy(isId, "copy_diskon_periode_promo_4b049a4"), 0, 90, '%')}
            {dateField('proDiscountStart', getInlineCopy(isId, "copy_promo_pro_mulai_be3a2dc"))}
            {dateField('proDiscountEnd', getInlineCopy(isId, "copy_promo_pro_berakhir_82baca1"))}
          </div>
          <p className="helper admin-subscription-note">{getInlineCopy(isId, "copy_jika_diskon_lebih_dari_0_isi_tangg_168d7ca")}</p>
        </section>
        <section className="admin-subscription-plan admin-subscription-plan--unlimited">
          <header><span className="section-kicker">UNLIMITED · HUB ADMIN</span><p className="helper">{getInlineCopy(isId, "copy_tidak_ada_batas_kuota_paket_ini_me_5de8f00")}</p></header>
        </section>
        <p className="helper admin-subscription-note">{getInlineCopy(isId, "copy_perubahan_kuota_dan_harga_berlaku__f0a981a")}</p>
        <div className="admin-subscription-actions"><button type="submit" className="btn-primary" disabled={saving}>{saving ? (getInlineCopy(isId, "copy_menyimpan_84f6256")) : (getInlineCopy(isId, "copy_simpan_perubahan_paket_e24730f"))}</button></div>
      </>}
    </form>
    <AdminSubscriptionPromos lang={lang} />
    <AdminSubscriptionQr lang={lang} />
    <AdminPaymentReview lang={lang} />
    </div>
  )
}

function AdminSubscriptionPromos({ lang }: { lang: Lang }) {
  const isId = lang === 'id'
  const [promos, setPromos] = useState<SubscriptionPromo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [code, setCode] = useState('')
  const [appliesTo, setAppliesTo] = useState<SubscriptionPromo['applies_to']>('all')
  const [discountType, setDiscountType] = useState<SubscriptionPromo['discount_type']>('percent')
  const [discountValue, setDiscountValue] = useState(10)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [maxUses, setMaxUses] = useState(0)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setPromos((await getAdminSubscriptionPromos()).promos) }
    catch (cause) { setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_kode_promo_gagal_dimuat_318ef6e"))) }
    finally { setLoading(false) }
  }, [isId])
  useEffect(() => { void load() }, [load])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await createAdminSubscriptionPromo({ code, appliesTo, discountType, discountValue, startsAt, endsAt, maxUses })
      setCode('')
      setNotice(getInlineCopy(isId, "copy_kode_promo_berhasil_dibuat_ebeb55b"))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_kode_promo_gagal_dibuat_74e1499")))
    } finally { setSaving(false) }
  }

  const toggle = async (promo: SubscriptionPromo) => {
    setError('')
    try { await setAdminSubscriptionPromoActive(promo.id, !promo.active); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_status_promo_gagal_diubah_843d154"))) }
  }
  const remove = async (promo: SubscriptionPromo) => {
    setError('')
    try { await deleteAdminSubscriptionPromo(promo.id); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_kode_promo_gagal_dihapus_724234b"))) }
  }
  const dateLabel = (value: string) => value ? new Date(value).toLocaleString(getLocale(lang)) : (getInlineCopy(isId, "copy_tanpa_batas_waktu_9e150bf"))
  const discountLabel = (promo: SubscriptionPromo) => promo.discount_type === 'percent'
    ? promo.discount_value + '%'
    : 'Rp ' + new Intl.NumberFormat('id-ID').format(promo.discount_value)

  return (
    <section className="panel admin-promo-manager" aria-labelledby="admin-promo-title">
      <header className="admin-promo-manager__header">
        <div><p className="section-kicker">{getInlineCopy(isId, "copy_promo_06bc536")}</p><h3 id="admin-promo-title">{getInlineCopy(isId, "copy_kode_promo_1d6b7da")}</h3><p className="helper">{getInlineCopy(isId, "copy_buat_kode_diskon_terbatas_atur_pak_0bf042a")}</p></div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>{getInlineCopy(isId, "copy_muat_ulang_da98d05")}</button>
      </header>
      <form className="admin-promo-form" onSubmit={(event) => void create(event)}>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_kode_promo_8620d13")}</span><input className="input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} minLength={3} maxLength={32} placeholder="HEMAT20" required /></label>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_untuk_paket_8f523e4")}</span><select className="input" value={appliesTo} onChange={(event) => setAppliesTo(event.target.value as SubscriptionPromo['applies_to'])}><option value="all">{getInlineCopy(isId, "copy_lite_dan_pro_02def75")}</option><option value="lite">Lite</option><option value="pro">Pro</option></select></label>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_jenis_potongan_18ee103")}</span><select className="input" value={discountType} onChange={(event) => setDiscountType(event.target.value as SubscriptionPromo['discount_type'])}><option value="percent">{getInlineCopy(isId, "copy_persentase_990ca5b")}</option><option value="fixed">{getInlineCopy(isId, "copy_nominal_rupiah_46d5e00")}</option></select></label>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_nilai_diskon_77d1715")}</span><input className="input" type="number" min={1} max={discountType === 'percent' ? 100 : 1000000000} value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value))} required /></label>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_mulai_opsional_e484b23")}</span><input className="input" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_berakhir_opsional_50dfa9f")}</span><input className="input" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_maks_pemakaian_0_tanpa_batas_2888424")}</span><input className="input" type="number" min={0} max={1000000} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label>
        <button type="submit" className="btn-primary" disabled={saving || code.trim().length < 3}>{saving ? (getInlineCopy(isId, "copy_membuat_7827993")) : (getInlineCopy(isId, "copy_buat_kode_promo_86f2030"))}</button>
      </form>
      {error && <p className="error-box" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {loading ? <p className="helper">{getInlineCopy(isId, "copy_memuat_kode_promo_dae48d3")}</p> : promos.length === 0 ? <p className="helper">{getInlineCopy(isId, "copy_belum_ada_kode_promo_2a3ba88")}</p> : (
        <div className="admin-promo-list">
          {promos.map((promo) => <article className="admin-promo-card" key={promo.id}>
            <div className="admin-promo-card__main"><strong>{promo.code}</strong><span>{discountLabel(promo)} · {promo.applies_to === 'all' ? (getInlineCopy(isId, "copy_lite_pro_117c89c")) : promo.applies_to.toUpperCase()}</span><small>{dateLabel(promo.starts_at)} → {dateLabel(promo.ends_at)}</small><small>{promo.use_count} / {promo.max_uses || '∞'} {getInlineCopy(isId, "copy_pemakaian_44ca085")}</small></div>
            <span className={'chip' + (promo.active ? ' is-on' : '')}>{promo.active ? (getInlineCopy(isId, "copy_aktif_703c7d8")) : (getInlineCopy(isId, "copy_nonaktif_1d7d6c0"))}</span>
            <div className="row-inline"><button type="button" className="btn-secondary btn-sm" onClick={() => void toggle(promo)}>{promo.active ? (getInlineCopy(isId, "copy_nonaktifkan_8b9cb3c")) : (getInlineCopy(isId, "copy_aktifkan_a7f8fcc"))}</button><button type="button" className="btn-danger btn-sm" onClick={() => void remove(promo)}>{getInlineCopy(isId, "copy_hapus_7290f3b")}</button></div>
          </article>)}
        </div>
      )}
    </section>
  )
}

function AdminSubscriptionQr({ lang }: { lang: Lang }) {
  const isId = lang === 'id'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(Date.now())
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const file = (form.elements.namedItem('paymentQr') as HTMLInputElement | null)?.files?.[0]
    if (!file || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await uploadAdminSubscriptionQr(file)
      setVersion(Date.now())
      setMessage(getInlineCopy(isId, "copy_qr_pembayaran_berhasil_diperbarui_8f554fb"))
      form.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_qr_gagal_diperbarui_6273560")))
    } finally { setBusy(false) }
  }
  return (
    <section className="admin-subscription-qr panel" aria-labelledby="admin-subscription-qr-title">
      <div><p className="section-kicker">QRIS</p><h3 id="admin-subscription-qr-title">{getInlineCopy(isId, "copy_kode_qr_pembayaran_0e5d3ff")}</h3><p className="helper">{getInlineCopy(isId, "copy_qr_ini_ditampilkan_pada_checkout_s_d19f44e")}</p></div>
      <img src={`/api/subscription/payment-qr?v=${version}`} alt={getInlineCopy(isId, "copy_qris_pembayaran_saat_ini_6d45637")} />
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      <form className="admin-subscription-qr__form" onSubmit={(event) => void upload(event)}>
        <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_pilih_gambar_qris_f8efd6d")}<input className="input" type="file" name="paymentQr" accept="image/jpeg,image/png,image/webp" required disabled={busy} /></span></label>
        <p className="helper">{getInlineCopy(isId, "copy_format_jpg_png_webp_maksimal_5_mb_efe0992")}</p>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? (getInlineCopy(isId, "copy_mengunggah_34db028")) : (getInlineCopy(isId, "copy_perbarui_qr_pembayaran_3a6e393"))}</button>
      </form>
    </section>
  )
}

function AdminPaymentReview({ lang }: { lang: Lang }) {
  const isId = lang === 'id'
  const { refreshAdmin } = useAuth()
  const [payments, setPayments] = useState<SubscriptionPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [proofId, setProofId] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setPayments((await getAdminSubscriptionPayments()).payments) }
    catch (cause) { setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_daftar_pembayaran_gagal_dimuat_22aed03"))) }
    finally { setLoading(false) }
  }, [isId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!proofId) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setProofId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [proofId])
  const decide = async (payment: SubscriptionPayment, decision: 'approve' | 'reject') => {
    setBusyId(payment.id)
    setError('')
    setSuccess('')
    try {
      await decideAdminSubscriptionPayment(payment.id, decision, notes[payment.id] || '')
      setSuccess(decision === 'approve'
        ? (isId ? `${payment.plan.toUpperCase()} aktif untuk ${payment.account_email}.` : `${payment.plan.toUpperCase()} activated for ${payment.account_email}.`)
        : (getInlineCopy(isId, "copy_bukti_pembayaran_ditolak_39d6ee2")))
      await load()
      if (decision === 'approve') await refreshAdmin()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(isId, "copy_keputusan_pembayaran_gagal_disimpa_6c7fe27")))
    } finally { setBusyId(null) }
  }
  const formatMoney = (amount: number) => `Rp ${new Intl.NumberFormat(getLocale(lang)).format(amount)}`
  const statusText = (status: SubscriptionPayment['status']) => ({
    awaiting_payment: getInlineCopy(isId, "copy_menunggu_pembayaran_82c41dc"),
    submitted: getInlineCopy(isId, "copy_perlu_ditinjau_45af867"),
    approved: getInlineCopy(isId, "copy_disetujui_c20de56"),
    rejected: getInlineCopy(isId, "copy_ditolak_03c608c"),
    cancelled: getInlineCopy(isId, "copy_dibatalkan_dd218ec"),
    expired: getInlineCopy(isId, "copy_kedaluwarsa_430998f"),
  })[status]
  const pendingCount = payments.filter((item) => item.status === 'submitted').length
  return (
    <section className="admin-payment-review panel" aria-labelledby="admin-payment-review-title">
      <header className="admin-payment-review__header">
        <div><p className="section-kicker">{getInlineCopy(isId, "copy_pembayaran_masuk_7040f45")}</p><h3 id="admin-payment-review-title">{getInlineCopy(isId, "copy_verifikasi_langganan_b6cb892")}</h3><p className="helper">{getInlineCopy(isId, "copy_setujui_bukti_untuk_mengaktifkan_a_09f1a00")}</p></div>
        <div className="row-inline"><span className={`chip${error ? '' : ' is-on'}`}>{error ? (getInlineCopy(isId, "copy_gagal_dimuat_130b237")) : `${pendingCount} ${getInlineCopy(isId, "copy_perlu_ditinjau_d2ee16a")}`}</span><button type="button" className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading || busyId !== null}>{getInlineCopy(isId, "copy_muat_ulang_da98d05")}</button></div>
      </header>
      {error && <p className="error-box" role="alert">{error}</p>}
      {success && <p className="notice" role="status">{success}</p>}
      {loading ? <p className="helper" role="status">{getInlineCopy(isId, "copy_memuat_transaksi_987cddd")}</p> : error ? null : payments.length === 0 ? <p className="helper">{getInlineCopy(isId, "copy_belum_ada_pesanan_langganan_d8c1fd7")}</p> : (
        <div className="admin-payment-list">
          {payments.map((payment) => (
            <article className={`admin-payment-card is-${payment.status}`} key={payment.id}>
              <div className="admin-payment-card__top"><div><strong>{payment.account_name || payment.account_email}</strong><span>{payment.account_email} · {payment.plan.toUpperCase()}</span></div><span className={`chip${payment.status === 'submitted' || payment.status === 'approved' ? ' is-on' : ''}`}>{statusText(payment.status)}</span></div>
              <div className="admin-payment-card__facts"><span><small>{getInlineCopy(isId, "copy_nominal_akhir_6237ad9")}</small><b>{formatMoney(payment.total_amount)}</b></span>{payment.discount_amount > 0 && <span><small>{getInlineCopy(isId, "copy_potongan_617761a")}</small><b>−{formatMoney(payment.discount_amount)}{payment.promo_code ? ' · ' + payment.promo_code : ''}</b></span>}<span><small>{getInlineCopy(isId, "copy_kode_unik_5ce57f3")}</small><b>{String(payment.unique_code).padStart(3, '0')}</b></span><span><small>{getInlineCopy(isId, "copy_id_transaksi_9eb9763")}</small><b>{payment.id}</b></span><span><small>{getInlineCopy(isId, "copy_dibuat_06abc1a")}</small><b>{new Date(payment.created_at).toLocaleString(getLocale(lang))}</b></span></div>
              {payment.status === 'submitted' && <div className="admin-payment-card__review">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setProofId(payment.id)}>{getInlineCopy(isId, "copy_lihat_bukti_64b17c5")}</button>
                <label className="admin-subscription-field"><span>{getInlineCopy(isId, "copy_catatan_penolakan_opsional_4d8f7b1")}</span><textarea className="input" rows={2} value={notes[payment.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [payment.id]: event.target.value }))} /></label>
                <div className="row-inline"><button type="button" className="btn-danger btn-sm" disabled={busyId === payment.id} onClick={() => void decide(payment, 'reject')}>{getInlineCopy(isId, "copy_tolak_824ad24")}</button><button type="button" className="btn-primary btn-sm" disabled={busyId === payment.id} onClick={() => void decide(payment, 'approve')}>{busyId === payment.id ? (getInlineCopy(isId, "copy_menyimpan_84f6256")) : (getInlineCopy(isId, "copy_setujui_aktifkan_a6a1782"))}</button></div>
              </div>}
              {(payment.status === 'rejected' && payment.decision_note) && <p className="helper">{getInlineCopy(isId, "copy_alasan_870171e")} {payment.decision_note}</p>}
            </article>
          ))}
        </div>
      )}
      {proofId && <div className="modal-backdrop admin-payment-proof-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProofId(null) }}><section className="panel admin-payment-proof" role="dialog" aria-modal="true" aria-label={getInlineCopy(isId, "copy_bukti_pembayaran_4f7baac")}><button type="button" className="mini-btn" onClick={() => setProofId(null)}>{getInlineCopy(isId, "copy_tutup_9b1d062")}</button><img src={`/api/admin/subscription-payments/${encodeURIComponent(proofId)}/proof`} alt={getInlineCopy(isId, "copy_bukti_transfer_pelanggan_e482045")} /></section></div>}
    </section>
  )
}

export function AdminPage({ lang }: { lang: Lang }) {
  const t = getSiteStrings(lang)
  const { user, users, audit, adminDataError, setRole, setPlan, renewPlan, setActive, clearAudit, removeUser, refreshAdmin } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const section = loc.pathname.replace(/\/$/, '').split('/').at(-1) || 'overview'
  useEffect(() => {
    if (loc.pathname === '/app/admin' || loc.pathname === '/app/admin/') navigate('/app/admin/overview', { replace: true })
  }, [loc.pathname, navigate])
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState<'all' | 'admin' | 'user'>('all')
  const [statusF, setStatusF] = useState<'all' | 'active' | 'inactive'>('all')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [statusTargetId, setStatusTargetId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [pageIndex, setPageIndex] = useState(1)
  const [pendingUserAction, setPendingUserAction] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [systemSnapshot, setSystemSnapshot] = useState<{ limits: ServerLimits; health: ServerHealth; render: RenderCapabilities } | null>(null)
  const [systemLoading, setSystemLoading] = useState(false)
  const [systemError, setSystemError] = useState('')

  const loadSystemSnapshot = useCallback(async () => {
    setSystemLoading(true)
    setSystemError('')
    try {
      const [limits, health, render] = await Promise.all([getServerLimits(), getServerHealth(), getRenderCapabilities()])
      setSystemSnapshot({ limits, health, render })
    } catch {
      setSystemError(getInlineCopy(lang, "copy_konfigurasi_server_tidak_dapat_dim_faf7146"))
    } finally {
      setSystemLoading(false)
    }
  }, [lang])
  useEffect(() => {
    if (section === 'settings') void loadSystemSnapshot()
  }, [section, loadSystemSnapshot])

  const anyModal = confirmId != null || confirmBulk || detailId != null || statusTargetId != null
  useFocusReturn(anyModal)
  useEffect(() => {
    if (!anyModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmId(null)
        setConfirmBulk(false)
        setDetailId(null)
        setStatusTargetId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyModal])

  const filtered = users.filter((u) => {
    const needle = q.trim().toLowerCase()
    const matchQ = !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    const matchR = roleF === 'all' || u.role === roleF
    const matchStatus = statusF === 'all' || (statusF === 'active' ? u.active : !u.active)
    return matchQ && matchR && matchStatus
  })
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageUsers = filtered.slice((pageIndex - 1) * pageSize, pageIndex * pageSize)
  const selectedUsers = users.filter((u) => selected.includes(u.id))
  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.active).length
  const confirmTarget = users.find((u) => u.id === confirmId) || null
  const statusTarget = users.find((u) => u.id === statusTargetId) || null
  const detailUser = users.find((u) => u.id === detailId) || null
  const detailLog = detailUser ? audit.filter((a) => a.detail.includes(detailUser.email)) : []

  useEffect(() => { setPageIndex((current) => Math.min(current, pageCount)) }, [pageCount])

  const flash = (msg: string | null, isErr: boolean) => {
    if (isErr) {
      setErr(msg)
      setOk(null)
    } else {
      setOk(msg)
      setErr(null)
    }
  }

  const toggleSel = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const doDelete = async () => {
    if (!confirmTarget) return
    setPendingUserAction(confirmTarget.id)
    try {
      const msg = await removeUser(confirmTarget.id)
      flash(msg || t.deletedOk, !!msg)
      if (!msg) setConfirmId(null)
    } finally {
      setPendingUserAction(null)
    }
  }

  const doBulkDelete = async () => {
    const selectedActiveAdmins = selectedUsers.filter((account) => account.active && account.role === 'admin').length
    if (selectedActiveAdmins >= activeAdminCount) {
      flash(getInlineCopy(lang, "copy_hapus_atau_nonaktifkan_akun_admin__3d4fe10"), true)
      return
    }
    let firstErr: string | null = null
    let deletedCount = 0
    const failedIds: string[] = []
    setPendingUserAction('bulk')
    try {
      for (const id of selected) {
        const msg = await removeUser(id)
        if (msg) {
          failedIds.push(id)
          if (!firstErr) firstErr = msg
        } else deletedCount += 1
      }
      setSelected(failedIds)
      setConfirmBulk(false)
      const result = firstErr
        ? (lang === 'id' ? `${deletedCount} akun berhasil dihapus; ${failedIds.length} gagal. ${firstErr}` : `${deletedCount} accounts deleted; ${failedIds.length} failed. ${firstErr}`)
        : (lang === 'id' ? `Data ${deletedCount} akun dan media terkait telah dihapus.` : `Data and media for ${deletedCount} accounts have been deleted.`)
      flash(result, !!firstErr)
    } finally {
      setPendingUserAction(null)
    }
  }

  const doToggleStatus = async () => {
    if (!statusTarget) return
    setPendingUserAction(statusTarget.id)
    try {
      const nextActive = !statusTarget.active
      const message = await setActive(statusTarget.id, nextActive)
      flash(message || (lang === 'id' ? `Akun ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}.` : `Account ${nextActive ? 'activated' : 'deactivated'}.`), !!message)
      if (!message) setStatusTargetId(null)
      else await refreshAdmin()
    } finally {
      setPendingUserAction(null)
    }
  }

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'eclipse-audit.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const pageCopy: Record<string, { title: string; description: string }> = {
    overview: {
      title: getInlineCopy(lang, "copy_ringkasan_admin_213e8b0"),
      description: getInlineCopy(lang, "copy_status_data_dan_akun_pada_server_e_4b1c15b"),
    },
    users: { title: getInlineCopy(lang, "copy_pengguna_role_ce5c0f9"), description: t.admSub },
    subscription: { title: getInlineCopy(lang, "copy_pengaturan_subscription_bcde249"), description: getInlineCopy(lang, "copy_kelola_kuota_harga_dan_masa_aktif__4fd524b") },
    gemini: { title: 'Gemini API', description: getInlineCopy(lang, "copy_kelola_konfigurasi_provider_gemini_bdd8c29") },
    proxy: { title: 'Proxy / Egress', description: getInlineCopy(lang, "copy_kelola_jalur_koneksi_keluar_server_2435417") },
    activity: { title: getInlineCopy(lang, "copy_aktivitas_6a83bdd"), description: getInlineCopy(lang, "copy_tinjau_aktivitas_yang_tercatat_di__df0a3a9") },
    settings: { title: getInlineCopy(lang, "copy_pengaturan_sistem_39937ed"), description: getInlineCopy(lang, "copy_batas_aktif_dan_kemampuan_runtime__e3bd17c") },
  }
  const copy = pageCopy[section] || pageCopy.overview

  return (
    <div className="page">
      <header className="admin-page-heading">
        <div>
          <p className="eyebrow">{t.admT}</p>
          <h2>{copy.title}</h2>
          <p className="helper">{copy.description}</p>
        </div>
        <span className="chip">{getInlineCopy(lang, "copy_server_eclipse_8a1231e")}</span>
      </header>
      {adminDataError && <p className="error-box" role="alert">{adminDataError}</p>}

      {section === 'overview' && (
        <>
          <div className="stat-grid admin-overview-grid">
            <div className="panel stat-card"><span className="stat-num">{users.length}</span><span className="stat-label">{getInlineCopy(lang, "copy_akun_pada_server_58b9fe3")}</span></div>
            <div className="panel stat-card"><span className="stat-num">{audit.length}</span><span className="stat-label">{getInlineCopy(lang, "copy_aktivitas_tersimpan_di_server_c17a7f1")}</span></div>
            <div className="panel stat-card"><span className="stat-num">—</span><span className="stat-label">{getInlineCopy(lang, "copy_metrik_job_dan_biaya_provider_belu_2eb4588")}</span></div>
          </div>
          <div className="panel admin-status-note">
            <h3>{getInlineCopy(lang, "copy_cakupan_ringkasan_8826e58")}</h3>
            <p className="helper">{getInlineCopy(lang, "copy_jumlah_akun_dan_aktivitas_dimuat_d_7b2286c")}</p>
          </div>
        </>
      )}

      {section === 'users' && (
        <>
          <div className="toolbar-row">
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder={t.historySearch}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPageIndex(1) }}
              aria-label={t.historySearch}
            />
            <div className="seg" role="group" style={{ width: 'auto' }}>
              {(['all', 'admin', 'user'] as const).map((r) => (
                <button key={r} type="button" className={roleF === r ? 'is-on' : ''} onClick={() => { setRoleF(r); setPageIndex(1) }}>
                  {r === 'all' ? t.filterAll : r === 'admin' ? t.roleAdmin : t.roleUser}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label={getInlineCopy(lang, "copy_status_akun_b3f830f")} style={{ width: 'auto' }}>
              {(['all', 'active', 'inactive'] as const).map((status) => (
                <button key={status} type="button" className={statusF === status ? 'is-on' : ''} onClick={() => { setStatusF(status); setPageIndex(1) }}>
                  {status === 'all' ? (getInlineCopy(lang, "copy_semua_status_1211fc1")) : status === 'active' ? (getInlineCopy(lang, "copy_aktif_703c7d8")) : (getInlineCopy(lang, "copy_nonaktif_1d7d6c0"))}
                </button>
              ))}
            </div>
          </div>
          <p className="helper admin-users-count">{lang === 'id' ? `${filtered.length} dari ${users.length} akun` : `${filtered.length} of ${users.length} accounts`}</p>
          {err && (
            <p className="error-box" role="alert">
              {err}
            </p>
          )}
          {ok && <p className="notice" role="status">{ok}</p>}
          {selected.length > 0 && (
            <div className="toolbar-row bulk-bar" role="group" aria-label={t.selectedN(selected.length)}>
              <span className="chip is-on">{t.selectedN(selected.length)}</span>
              <button type="button" className="btn-danger" onClick={() => setConfirmBulk(true)}>
                {t.bulkDel}
              </button>
              <button type="button" className="mini-btn" onClick={() => setSelected([])} aria-label={t.close}>
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          <div className="panel admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={pageUsers.some((u) => u.id !== user?.id && !(u.role === 'admin' && u.active && activeAdminCount <= 1)) && pageUsers.filter((u) => u.id !== user?.id && !(u.role === 'admin' && u.active && activeAdminCount <= 1)).every((u) => selected.includes(u.id))}
                      onChange={() => {
                        const ids = pageUsers.filter((u) => u.id !== user?.id && !(u.role === 'admin' && u.active && activeAdminCount <= 1)).map((u) => u.id)
                        setSelected((s) => (ids.every((id) => s.includes(id)) ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]))
                      }}
                      aria-label={getInlineCopy(lang, "copy_pilih_semua_akun_di_halaman_ini_3c39806")}
                    />
                  </th>
                  <th>{t.admUsers}</th>
                  <th>{t.fEmail}</th>
                  <th>{getInlineCopy(lang, "copy_paket_ec463b5")}</th>
                  <th>{getInlineCopy(lang, "copy_status_aba2332")}</th>
                  <th>{t.admRole}</th>
                  <th>{t.admJoined}</th>
                  <th>{t.admAct}</th>
                </tr>
              </thead>
              <tbody>
                {pageUsers.map((u, index) => (
                  <tr key={u.id}>
                    <td data-label="✓">
                      <input type="checkbox" checked={selected.includes(u.id)} disabled={u.id === user?.id || (u.role === 'admin' && u.active && activeAdminCount <= 1)} onChange={() => toggleSel(u.id)} aria-label={u.email} />
                    </td>
                    <td data-label={t.admUsers}>
                      <button type="button" className="mini-btn admin-user-detail-trigger" onClick={() => setDetailId(u.id)}>
                        {u.name}
                      </button>{' '}
                      {u.id === user?.id && <span className="chip is-on">{t.admYou}</span>}
                    </td>
                    <td className="helper" data-label={t.fEmail}>{u.email}</td>
                    <td data-label={getInlineCopy(lang, "copy_paket_ec463b5")}>
                      <div>{u.role === 'admin' ? t.unlimitedLabel : u.plan === 'free' ? t.planFree : u.plan === 'lite' ? t.planLite : t.planPro}</div>
                      {u.role !== 'admin' && u.plan !== 'free' && <div className="helper">{getInlineCopy(lang, "copy_berakhir_a0af4d1")}{u.planExpiresAt ? new Date(u.planExpiresAt).toLocaleDateString(getLocale(lang)) : '—'}</div>}
                      {u.role !== 'admin' && <select
                        className="input admin-plan-select"
                        aria-label={`${getInlineCopy(lang, "copy_paket_akun_ee9dd28")}: ${u.name}`}
                        value={u.plan}
                        disabled={pendingUserAction === u.id || pendingUserAction === 'bulk'}
                        onChange={async (event) => {
                          const plan = event.target.value as 'free' | 'lite' | 'pro'
                          setPendingUserAction(u.id)
                          try {
                            const msg = await setPlan(u.id, plan)
                            flash(msg || (getInlineCopy(lang, "copy_paket_akun_diperbarui_be85eb4")), !!msg)
                            if (msg) await refreshAdmin()
                          } finally {
                            setPendingUserAction(null)
                          }
                        }}
                      >
                        <option value="free">Free</option>
                        <option value="lite">Lite</option>
                        <option value="pro">Pro</option>
                      </select>}
                      {u.role !== 'admin' && u.plan !== 'free' && <button type="button" className="mini-btn" disabled={pendingUserAction === u.id || pendingUserAction === 'bulk'} onClick={async () => {
                        setPendingUserAction(u.id)
                        try {
                          const msg = await renewPlan(u.id, u.plan as 'lite' | 'pro')
                          flash(msg || (getInlineCopy(lang, "copy_paket_diperpanjang_sesuai_masa_akt_028eb03")), !!msg)
                          if (msg) await refreshAdmin()
                        } finally { setPendingUserAction(null) }
                      }}>{getInlineCopy(lang, "copy_perpanjang_paket_9c17b54")}</button>}
                    </td>
                    <td data-label={getInlineCopy(lang, "copy_status_aba2332")}>
                      <span className={`chip ${u.active ? 'is-on' : ''}`}>{u.active ? (getInlineCopy(lang, "copy_aktif_703c7d8")) : (getInlineCopy(lang, "copy_nonaktif_1d7d6c0"))}</span>
                    </td>
                    <td data-label={t.admRole}>
                      <div className="admin-role-control">
                        <AdminRoleDropdown
                          value={u.role}
                          disabled={u.id === user?.id || (u.role === 'admin' && u.active && activeAdminCount <= 1) || pendingUserAction === u.id || pendingUserAction === 'bulk'}
                          label={`${t.admRole}: ${u.name}`}
                          userLabel={t.roleUser}
                          adminLabel={t.roleAdmin}
                          placement={index === pageUsers.length - 1 ? 'top' : 'bottom'}
                          onChange={async (role) => {
                            setPendingUserAction(u.id)
                            try {
                              const msg = await setRole(u.id, role)
                              flash(msg || t.savedRole, !!msg)
                              if (msg) await refreshAdmin()
                            } finally {
                              setPendingUserAction(null)
                            }
                          }}
                        />
                        {pendingUserAction === u.id && <span className="helper" role="status">{getInlineCopy(lang, "copy_menyimpan_84f6256")}</span>}
                      </div>
                    </td>
                    <td className="helper" data-label={t.admJoined}>{new Date(u.createdAt).toLocaleDateString(getLocale(lang))}</td>
                    <td data-label={t.admAct}>
                      <div className="row-inline admin-user-actions">
                        <button type="button" className="btn-secondary btn-sm" disabled={u.id === user?.id || (u.role === 'admin' && u.active && activeAdminCount <= 1) || pendingUserAction === u.id || pendingUserAction === 'bulk'} onClick={() => setStatusTargetId(u.id)}>
                          {u.active ? (getInlineCopy(lang, "copy_nonaktifkan_8b9cb3c")) : (getInlineCopy(lang, "copy_aktifkan_a7f8fcc"))}
                        </button>
                        <button type="button" className="btn-danger" disabled={u.id === user?.id || (u.role === 'admin' && u.active && activeAdminCount <= 1) || pendingUserAction === u.id || pendingUserAction === 'bulk'} onClick={() => setConfirmId(u.id)}>
                          {t.admDelete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="helper">{getInlineCopy(lang, "copy_tidak_ada_akun_yang_cocok_dengan_p_72d4b59")}</p>}
          </div>
          {filtered.length > pageSize && <nav className="admin-users-pagination" aria-label={getInlineCopy(lang, "copy_halaman_daftar_akun_f3183a6")}>
            <button type="button" className="btn-secondary btn-sm" disabled={pageIndex <= 1} onClick={() => setPageIndex((page) => Math.max(1, page - 1))}>{getInlineCopy(lang, "copy_sebelumnya_040e05e")}</button>
            <span className="helper">{lang === 'id' ? `Halaman ${pageIndex} dari ${pageCount}` : `Page ${pageIndex} of ${pageCount}`}</span>
            <button type="button" className="btn-secondary btn-sm" disabled={pageIndex >= pageCount} onClick={() => setPageIndex((page) => Math.min(pageCount, page + 1))}>{getInlineCopy(lang, "copy_berikutnya_37371cd")}</button>
          </nav>}
          <p className="helper">{getInlineCopy(lang, "copy_admin_dapat_mengatur_free_lite_dan_a64b7b9")}</p>
        </>
      )}

      {section === 'activity' && (
        <div className="panel">
          <div className="toolbar-row" style={{ marginBottom: '0.6rem' }}>
            <button type="button" className="btn-secondary" onClick={exportLog} disabled={audit.length === 0}>
              {t.exportLog}
            </button>
            <button type="button" className="btn-danger" onClick={async () => {
              const message = await clearAudit()
              flash(message || (getInlineCopy(lang, "copy_log_aktivitas_dihapus_5c18826")), !!message)
            }} disabled={audit.length === 0}>
              {t.clearLog}
            </button>
            {err && <p className="error-box" role="alert">{err}</p>}
            {ok && <p className="notice" role="status">{ok}</p>}
          </div>
          {audit.length === 0 && <p className="helper">—</p>}
          {audit.map((a) => (
            <div key={a.id} className="batch-item">
              <span style={{ flex: 1 }}>
                <strong>{a.action}</strong> — {a.detail}
                <br />
                <span className="helper">
                  {a.actor} • {new Date(a.at).toLocaleString()}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {section === 'gemini' && <GeminiApiPanel lang={lang} />}
      {section === 'proxy' && <ProxySettingsPanel lang={lang} />}
      {section === 'subscription' && <AdminSubscriptionSettings lang={lang} />}


      {section === 'settings' && (
        <section className="panel admin-system-settings" aria-labelledby="system-settings-title">
          <div className="admin-system-settings__header">
            <div>
              <p className="section-kicker">{getInlineCopy(lang, "copy_status_sistem_hanya_baca_18aefd5")}</p>
              <h3 id="system-settings-title">{getInlineCopy(lang, "copy_konfigurasi_operasional_91d21bf")}</h3>
              <p className="helper">{getInlineCopy(lang, "copy_nilai_dimuat_langsung_dari_backend_8a7d0f8")}</p>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void loadSystemSnapshot()} disabled={systemLoading}>
              {systemLoading ? (getInlineCopy(lang, "copy_memuat_12b6bfe")) : (getInlineCopy(lang, "copy_muat_ulang_da98d05"))}
            </button>
          </div>

          {systemError && <p className="error-box" role="alert">{systemError}</p>}
          {systemLoading && !systemSnapshot && <p className="helper" role="status">{getInlineCopy(lang, "copy_memuat_konfigurasi_server_8a2d484")}</p>}
          {systemSnapshot && (() => {
            const { limits, health, render } = systemSnapshot
            const durationHours = Math.floor(limits.maxDurationSec / 3600)
            const durationMinutes = Math.floor((limits.maxDurationSec % 3600) / 60)
            const maxDuration = lang === 'id'
              ? `${durationHours ? `${durationHours} jam` : ''}${durationHours && durationMinutes ? ' ' : ''}${durationMinutes ? `${durationMinutes} menit` : ''}`
              : `${durationHours ? `${durationHours} hr` : ''}${durationHours && durationMinutes ? ' ' : ''}${durationMinutes ? `${durationMinutes} min` : ''}`
            const encoderLabels = { nvenc: 'NVIDIA NVENC', amf: 'AMD AMF', qsv: 'Intel Quick Sync', cpu: 'CPU · libx264' } as const
            return <>
              <div className="admin-system-settings__grid">
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">{getInlineCopy(lang, "copy_sumber_video_5168e81")}</span>
                  <strong>{limits.maxSourceLabel}</strong>
                  <span>{lang === 'id' ? `Durasi maksimum ${maxDuration}` : `Maximum duration ${maxDuration}`}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">{getInlineCopy(lang, "copy_retensi_b661241")}</span>
                  <strong>{limits.tempFileTtlHours} {getInlineCopy(lang, "copy_jam_5fcffd1")}</strong>
                  <span>{lang === 'id' ? `File sementara · metadata ${limits.metadataRetentionDays} hari` : `Temporary files · metadata ${limits.metadataRetentionDays} days`}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">{getInlineCopy(lang, "copy_free_hari_8af2464")}</span>
                  <strong>{limits.freeDailyAnalyze} {getInlineCopy(lang, "copy_analisis_afc724a")} · {limits.freeDailyRender} {lang === 'id' ? `generate Free/hari · ${limits.freeRenderTrialDays} hari` : `Free generations/day · ${limits.freeRenderTrialDays} days`}</strong>
                  <span>{lang === 'id' ? `Maksimum ${limits.maxBatchClips} klip per batch` : `Up to ${limits.maxBatchClips} clips per batch`}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">LITE / {getInlineCopy(lang, "copy_bulan_46d675d")}</span>
                  <strong>{limits.liteDailyRender} {getInlineCopy(lang, "copy_batch_rp_9368d56")}{limits.liteMonthlyPriceIdr.toLocaleString(getLocale(lang))}</strong>
                  <span>{lang === 'id' ? `Kuota direset harian · paket aktif ${limits.liteTermMonths} bulan, diatur admin` : `Daily quota · ${limits.liteTermMonths}-month plan assigned by admin`}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">PRO / {getInlineCopy(lang, "copy_bulan_46d675d")}</span>
                  <strong>{limits.proDailyRender} {getInlineCopy(lang, "copy_batch_rp_9368d56")}{limits.proMonthlyPriceIdr.toLocaleString(getLocale(lang))}</strong>
                  <span>{lang === 'id' ? `Kuota direset harian · paket aktif ${limits.proTermMonths} bulan, diatur admin` : `Daily quota · ${limits.proTermMonths}-month plan assigned by admin`}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">HUB ADMIN</span>
                  <strong>Unlimited</strong>
                  <span>{getInlineCopy(lang, "copy_tanpa_batas_generate_92a0d63")}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">{getInlineCopy(lang, "copy_format_ekspor_7910236")}</span>
                  <strong>{limits.exportFormat.toUpperCase()} · {limits.exportCodec.toUpperCase()}</strong>
                  <span>{lang === 'id' ? `Rasio bawaan ${limits.mvpAspect}` : `Default aspect ratio ${limits.mvpAspect}`}</span>
                </article>
                <article className="admin-system-fact admin-system-fact--wide">
                  <span className="admin-system-fact__eyebrow">{getInlineCopy(lang, "copy_render_server_fe528dd")}</span>
                  <strong>{getInlineCopy(lang, "copy_encoder_ffmpeg_yang_terdeteksi_65b3b9d")}</strong>
                  <div className="admin-system-badges">
                    {(Object.keys(encoderLabels) as Array<keyof typeof encoderLabels>).map((encoder) => (
                      <span key={encoder} className={`chip ${render.encoders[encoder] ? 'is-on' : ''}`}>
                        {encoderLabels[encoder]} · {render.encoders[encoder] ? (getInlineCopy(lang, "copy_tersedia_649f655")) : (getInlineCopy(lang, "copy_tidak_ada_856bde7"))}
                      </span>
                    ))}
                  </div>
                  <span>{getInlineCopy(lang, "copy_direkomendasikan_9fa5ab5")}: {encoderLabels[render.recommended]}</span>
                  <span>{getInlineCopy(lang, "copy_ai_focus_framing_wajah_orang_245ba26")}: {render.ai_focus ? (getInlineCopy(lang, "copy_tersedia_649f655")) : (getInlineCopy(lang, "copy_tidak_tersedia_b604bbf"))} · {getInlineCopy(lang, "copy_fallback_gerakan_1c68616")}: {render.auto_focus ? (getInlineCopy(lang, "copy_tersedia_649f655")) : (getInlineCopy(lang, "copy_tidak_tersedia_b604bbf"))}</span>
                </article>
                <article className="admin-system-fact">
                  <span className="admin-system-fact__eyebrow">{getInlineCopy(lang, "copy_layanan_api_cec1f51")}</span>
                  <strong><span className="compact-dot" aria-hidden="true" /> {health.status === 'ok' ? (getInlineCopy(lang, "copy_berjalan_e101b62")) : health.status}</strong>
                  <span>{getInlineCopy(lang, "copy_versi_bc33ded")} {health.version}</span>
                </article>
              </div>
              <p className="helper admin-system-settings__footnote">{lang === 'id'
                ? `Diperbarui ${new Date(health.time * 1000).toLocaleString()}. Informasi ini bersifat hanya-baca; perubahan memerlukan konfigurasi backend.`
                : `Updated ${new Date(health.time * 1000).toLocaleString()}. This information is read-only; changes require backend configuration.`}</p>
            </>
          })()}
        </section>
      )}

      {confirmTarget && (
        <div className="modal-backdrop" onClick={() => pendingUserAction !== confirmTarget.id && setConfirmId(null)}>
          <div className="panel modal" role="dialog" aria-modal="true" aria-label={t.admDelete} onClick={(e) => e.stopPropagation()}>
            <h3>
              {t.admDelete}: {confirmTarget.name}?
            </h3>
            <p className="helper">{confirmTarget.email}</p>
            <p className="helper">{getInlineCopy(lang, "copy_penghapusan_permanen_menghapus_aku_8f2d413")}</p>
            <div className="row-inline modal-actions">
              <button type="button" className="btn-secondary" disabled={pendingUserAction === confirmTarget.id} onClick={() => setConfirmId(null)}>
                {t.close}
              </button>
              <button type="button" className="btn-danger" disabled={pendingUserAction === confirmTarget.id} onClick={() => void doDelete()}>
                {pendingUserAction === confirmTarget.id ? (getInlineCopy(lang, "copy_menghapus_1ec66c0")) : t.admDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBulk && (
        <div className="modal-backdrop" onClick={() => pendingUserAction !== 'bulk' && setConfirmBulk(false)}>
          <div className="panel modal" role="dialog" aria-modal="true" aria-label={t.bulkDel} onClick={(e) => e.stopPropagation()}>
            <h3>
              {t.bulkDel} ({selected.length})?
            </h3>
            <p className="helper">{getInlineCopy(lang, "copy_ini_menghapus_permanen_akun_sesi_j_71aec76")}</p>
            <ul className="admin-bulk-preview">
              {selectedUsers.slice(0, 8).map((account) => <li key={account.id}><strong>{account.name}</strong><span className="helper">{account.email}</span></li>)}
              {selectedUsers.length > 8 && <li className="helper">{lang === 'id' ? `dan ${selectedUsers.length - 8} akun lainnya` : `and ${selectedUsers.length - 8} more accounts`}</li>}
            </ul>
            <div className="row-inline modal-actions">
              <button type="button" className="btn-secondary" disabled={pendingUserAction === 'bulk'} onClick={() => setConfirmBulk(false)}>
                {t.close}
              </button>
              <button type="button" className="btn-danger" disabled={pendingUserAction === 'bulk'} onClick={() => void doBulkDelete()}>
                {pendingUserAction === 'bulk' ? (getInlineCopy(lang, "copy_menghapus_1ec66c0")) : t.bulkDel}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusTarget && (
        <div className="modal-backdrop" onClick={() => pendingUserAction !== statusTarget.id && setStatusTargetId(null)}>
          <div className="panel modal" role="dialog" aria-modal="true" aria-label={statusTarget.active ? (getInlineCopy(lang, "copy_nonaktifkan_akun_ab1a87b")) : (getInlineCopy(lang, "copy_aktifkan_akun_68d47b4"))} onClick={(e) => e.stopPropagation()}>
            <h3>{lang === 'id' ? `${statusTarget.active ? 'Nonaktifkan' : 'Aktifkan'} akun ${statusTarget.name}?` : `${statusTarget.active ? 'Disable' : 'Enable'} ${statusTarget.name}?`}</h3>
            <p className="helper">{statusTarget.email}</p>
            <p className="helper">{statusTarget.active
              ? (getInlineCopy(lang, "copy_akun_akan_langsung_kehilangan_akse_9a02265"))
              : (getInlineCopy(lang, "copy_akun_dapat_masuk_kembali_riwayat_d_8a91f9f"))}</p>
            <div className="row-inline modal-actions">
              <button type="button" className="btn-secondary" disabled={pendingUserAction === statusTarget.id} onClick={() => setStatusTargetId(null)}>{t.close}</button>
              <button type="button" className={statusTarget.active ? 'btn-danger' : 'btn-primary'} disabled={pendingUserAction === statusTarget.id} onClick={() => void doToggleStatus()}>
                {pendingUserAction === statusTarget.id ? (getInlineCopy(lang, "copy_menyimpan_84f6256")) : statusTarget.active ? (getInlineCopy(lang, "copy_nonaktifkan_akun_ab1a87b")) : (getInlineCopy(lang, "copy_aktifkan_akun_68d47b4"))}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailUser && (
        <div className="modal-backdrop" onClick={() => setDetailId(null)}>
          <div className="panel modal" role="dialog" aria-modal="true" aria-label={t.detailT} onClick={(e) => e.stopPropagation()}>
            <h3>{t.detailT}</h3>
            <p><strong>{detailUser.name}</strong></p>
            <p className="helper">{detailUser.email}</p>
            <p className="helper">
              {detailUser.role} • {detailUser.role === 'admin' ? t.unlimitedLabel : detailUser.plan === 'free' ? t.planFree : detailUser.plan === 'lite' ? t.planLite : t.planPro} • {detailUser.active ? (getInlineCopy(lang, "copy_aktif_703c7d8")) : (getInlineCopy(lang, "copy_nonaktif_1d7d6c0"))} • {new Date(detailUser.createdAt).toLocaleString(getLocale(lang))}
            </p>
            <h4 style={{ marginTop: 8 }}>{getInlineCopy(lang, "copy_aktivitas_6a83bdd")} ({detailLog.length})</h4>
            {detailLog.length === 0 && <p className="helper">—</p>}
            {detailLog.map((a) => (
              <div key={a.id} className="batch-item">
                <span style={{ flex: 1 }}>
                  <strong>{a.action}</strong> — {a.detail}
                  <br />
                  <span className="helper">{new Date(a.at).toLocaleString()}</span>
                </span>
              </div>
            ))}
            <div className="row-inline modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDetailId(null)}>
                <Icon name="x" size={14} /> {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
