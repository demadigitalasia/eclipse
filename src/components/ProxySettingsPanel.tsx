import { getInlineCopy, getLocale } from '../localization'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Icon from './Icon'
import type { Lang } from '../types'

type ProxyEntry = {
  id: string
  alias: string
  endpoint: string | null
  enabled: boolean
  priority: number
  status: 'healthy' | 'error' | 'untested' | string
  failureCount: number
  cooldownUntil: number
  lastCheck: string
  lastUsedAt: number
}

type ProxyPool = {
  proxies: ProxyEntry[]
  environmentFallback: string | null
  environmentFallbackActive: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, credentials: 'same-origin', headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = body?.error || {}
    throw new Error([detail.message, detail.hint].filter(Boolean).join(' ') || body?.message || `HTTP ${response.status}`)
  }
  return body as T
}

export default function ProxySettingsPanel({ lang }: { lang: Lang }) {
  const id = lang === 'id'
  const [pool, setPool] = useState<ProxyPool | null>(null)
  const [alias, setAlias] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [showUrl, setShowUrl] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [testIps, setTestIps] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      setPool(await request<ProxyPool>('/api/admin/proxies'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(id, "copy_gagal_memuat_pool_proxy_ff930f9")))
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await request('/api/admin/proxies', { method: 'POST', body: JSON.stringify({ alias, proxyUrl }) })
      setAlias(''); setProxyUrl(''); setShowUrl(false)
      setNotice(getInlineCopy(id, "copy_proxy_disimpan_terenkripsi_di_serv_81d92bf"))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(id, "copy_gagal_menambahkan_proxy_9025491")))
    } finally { setBusy(false) }
  }

  const changeProxy = async (entry: ProxyEntry, enabled: boolean) => {
    setBusyId(entry.id); setError(''); setNotice('')
    try {
      await request(`/api/admin/proxies/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(id, "copy_gagal_memperbarui_proxy_0ba6678")))
    } finally { setBusyId('') }
  }

  const testProxy = async (entry: ProxyEntry) => {
    setBusyId(entry.id); setError(''); setNotice('')
    try {
      const result = await request<{ egressIp: string }>(`/api/admin/proxies/${encodeURIComponent(entry.id)}/test`, { method: 'POST' })
      setTestIps((current) => ({ ...current, [entry.id]: result.egressIp }))
      await load()
      setNotice(id ? `Pemeriksaan ${entry.alias} berhasil.` : `${entry.alias} passed its connectivity check.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(id, "copy_pemeriksaan_proxy_gagal_a34f9c2")))
      await load()
    } finally { setBusyId('') }
  }

  const deleteProxy = async (entry: ProxyEntry) => {
    if (!window.confirm(id ? `Hapus proxy “${entry.alias}” dari pool? Job berikutnya akan memilih proxy lain yang sehat.` : `Remove “${entry.alias}” from the pool? New jobs will use another healthy proxy.`)) return
    setBusyId(entry.id); setError(''); setNotice('')
    try {
      await request(`/api/admin/proxies/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
      setTestIps((current) => { const next = { ...current }; delete next[entry.id]; return next })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (getInlineCopy(id, "copy_gagal_menghapus_proxy_111f71e")))
    } finally { setBusyId('') }
  }

  const statusLabel = (entry: ProxyEntry) => {
    if (!entry.enabled) return getInlineCopy(id, "copy_nonaktif_3dbd84d")
    if (entry.cooldownUntil > Date.now() / 1000) return getInlineCopy(id, "copy_cooldown_893b92f")
    if (entry.status === 'healthy') return getInlineCopy(id, "copy_sehat_3879846")
    if (entry.status === 'error') return getInlineCopy(id, "copy_perlu_diperiksa_7206bdb")
    return getInlineCopy(id, "copy_belum_diuji_90030b8")
  }

  return (
    <div className="admin-proxy-panel">
      <section className="panel" aria-labelledby="admin-proxy-title">
        <div className="admin-system-settings__header">
          <div>
            <p className="section-kicker">{getInlineCopy(id, "copy_pool_egress_rahasia_server_89bbf14")}</p>
            <h3 id="admin-proxy-title">Proxy / Egress</h3>
            <p className="helper">{getInlineCopy(id, "copy_tambahkan_proxy_sebanyak_yang_dipe_7a4a49a")}</p>
          </div>
          <span className="chip is-on">{pool?.proxies.filter((item) => item.enabled).length ?? '—'} {getInlineCopy(id, "copy_aktif_ad949a8")}</span>
        </div>

        {error && <p className="error-box" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {pool?.environmentFallback && <div className="admin-proxy-env-note">
          <strong>{getInlineCopy(id, "copy_fallback_environment_ec79d98")}</strong>
          <span>{pool.environmentFallback}</span>
          <small>{pool.environmentFallbackActive
            ? (getInlineCopy(id, "copy_sedang_digunakan_karena_belum_ada__99d8100"))
            : (getInlineCopy(id, "copy_dipakai_jika_pool_admin_dihapus_se_bd1220e"))}</small>
        </div>}

        <form className="admin-proxy-add-form" onSubmit={(event) => void add(event)}>
          <label>
            <span>{getInlineCopy(id, "copy_nama_proxy_7323030")}</span>
            <input className="input" value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={100} required placeholder={getInlineCopy(id, "copy_contoh_egress_asia_01_b4f0e32")} />
          </label>
          <label className="admin-proxy-field">
            <span>{getInlineCopy(id, "copy_url_proxy_6e5b827")}</span>
            <span className="admin-proxy-input-wrap">
              <input className="input" type={showUrl ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} required placeholder="http://user:password@proxy.example.com:8080" />
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowUrl((visible) => !visible)} aria-pressed={showUrl}>
                <Icon name={showUrl ? 'eyeOff' : 'eye'} size={15} />{showUrl ? (getInlineCopy(id, "copy_sembunyikan_ca01fef")) : (getInlineCopy(id, "copy_tampilkan_b649d8a"))}
              </button>
            </span>
          </label>
          <button type="submit" className="btn-primary" disabled={busy || !alias.trim() || !proxyUrl.trim()}>
            <Icon name="plus" size={16} />{busy ? (getInlineCopy(id, "copy_menyimpan_84f6256")) : (getInlineCopy(id, "copy_tambah_proxy_1fff4c3"))}
          </button>
          <p className="helper">{getInlineCopy(id, "copy_mendukung_http_https_kredensial_di_40fc13a")}</p>
        </form>
      </section>

      <section className="admin-proxy-list" aria-label={getInlineCopy(id, "copy_daftar_proxy_9c8de93")}>
        {pool?.proxies.map((entry) => (
          <article className="panel admin-proxy-card" key={entry.id}>
            <div className="admin-proxy-card__heading">
              <div className="admin-proxy-card__name">
                <span className={`compact-dot ${entry.status === 'error' || entry.cooldownUntil > Date.now() / 1000 ? 'is-error' : ''}`} aria-hidden="true" />
                <div><h4>{entry.alias}</h4><span className="helper">{entry.endpoint}</span></div>
              </div>
              <span className={`chip ${entry.enabled && entry.status === 'healthy' ? 'is-on' : ''}`}>{statusLabel(entry)}</span>
            </div>
            <div className="admin-proxy-card__meta">
              <span>{getInlineCopy(id, "copy_kegagalan_beruntun_1ed6062")}: <strong>{entry.failureCount}</strong></span>
              <span>{getInlineCopy(id, "copy_prioritas_ff1aa0c")}: <strong>{entry.priority + 1}</strong></span>
              <span>{getInlineCopy(id, "copy_terakhir_diuji_6ea6912")}: <strong>{entry.lastCheck ? new Date(entry.lastCheck).toLocaleString(getLocale(lang)) : '—'}</strong></span>
              {testIps[entry.id] && <span>{getInlineCopy(id, "copy_ip_keluar_5e5d203")}: <strong>{testIps[entry.id]}</strong></span>}
              {entry.cooldownUntil > Date.now() / 1000 && <span>{getInlineCopy(id, "copy_aktif_kembali_f4476db")}: <strong>{new Date(entry.cooldownUntil * 1000).toLocaleTimeString(getLocale(lang))}</strong></span>}
            </div>
            <div className="row-inline admin-proxy-card__actions">
              <button type="button" className="btn-secondary btn-sm" disabled={busyId === entry.id} onClick={() => void testProxy(entry)}>
                {busyId === entry.id ? (getInlineCopy(id, "copy_memeriksa_aebc44d")) : (getInlineCopy(id, "copy_uji_egress_859729e"))}
              </button>
              <label className="admin-proxy-toggle admin-proxy-toggle--compact">
                <input type="checkbox" checked={entry.enabled} disabled={busyId === entry.id} onChange={(event) => void changeProxy(entry, event.target.checked)} />
                <span>{getInlineCopy(id, "copy_aktif_d4476e1")}</span>
              </label>
              <button type="button" className="btn-danger btn-sm" disabled={busyId === entry.id} onClick={() => void deleteProxy(entry)}>{getInlineCopy(id, "copy_hapus_7bd98ef")}</button>
            </div>
          </article>
        ))}
        {pool && pool.proxies.length === 0 && <div className="panel admin-proxy-empty">
          <h4>{pool.environmentFallbackActive ? (getInlineCopy(id, "copy_proxy_environment_aktif_7f6b172")) : (getInlineCopy(id, "copy_pool_proxy_masih_kosong_83d68dd"))}</h4>
          <p className="helper">{pool.environmentFallbackActive
            ? (getInlineCopy(id, "copy_endpoint_environment_digunakan_seb_1a5b8fc"))
            : (getInlineCopy(id, "copy_tambahkan_beberapa_endpoint_untuk__37b4c75"))}</p>
        </div>}
      </section>

      <p className="helper admin-proxy-footnote">{getInlineCopy(id, "copy_proxy_dipertahankan_per_akun_dan_p_ee3e4ad")}</p>
    </div>
  )
}
