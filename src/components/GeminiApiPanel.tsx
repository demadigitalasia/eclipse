import { getInlineCopy, getLocale } from '../localization'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Icon from './Icon'
import type { Lang } from '../types'

type GeminiKeyEntry = {
  id: string
  alias: string
  project: string
  maskedKey: string
  enabled: boolean
  priority: number
  status: 'healthy' | 'error' | 'untested' | string
  lastCheck: string
  projectCooldownUntil: number
  projectFailures: number
}

type GeminiUsage = {
  period_days: number
  totals: {
    calls: number; succeeded: number; failed: number; usage_available: number; usage_unknown: number
    input_tokens: number; output_tokens: number; total_tokens: number; cached_tokens: number; thought_tokens: number
  }
  by_project_model: Array<{
    project: string; model: string; calls: number; usage_available: number; usage_unknown: number
    input_tokens: number | null; output_tokens: number | null; total_tokens: number | null
  }>
  by_account: Array<{
    account_id: string; account_name: string; calls: number; usage_unknown: number
    input_tokens: number | null; output_tokens: number | null; total_tokens: number | null
  }>
  by_job: Array<{
    job_id: string; account_id: string; account_name: string; calls: number; usage_unknown: number
    input_tokens: number | null; output_tokens: number | null; total_tokens: number | null
  }>
  cost_usd: number | null
  cost_status: 'unavailable' | string
}

export default function GeminiApiPanel({ lang }: { lang: Lang }) {
  const id = lang === 'id'
  const [entries, setEntries] = useState<GeminiKeyEntry[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [alias, setAlias] = useState('')
  const [project, setProject] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<GeminiUsage | null>(null)
  const [usageError, setUsageError] = useState('')

  const loadUsage = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/gemini-usage?days=30', { credentials: 'same-origin' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`)
      setUsage(body as GeminiUsage)
      setUsageError('')
    } catch (cause) {
      setUsageError(cause instanceof Error ? cause.message : 'Gagal memuat pemakaian Gemini.')
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/gemini-keys', { credentials: 'same-origin' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`)
      setEntries(body.keys || [])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memuat pool Gemini.')
    }
  }, [])

  useEffect(() => { void load(); void loadUsage() }, [load, loadUsage])

  const mutate = async (path: string, method: string, body?: unknown) => {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = data?.error || {}
      const explanation = [detail.message, detail.hint].filter(Boolean).join(' ')
      throw new Error(explanation || data?.message || `Permintaan gagal (HTTP ${response.status}).`)
    }
    return data
  }

  const addEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await mutate('/api/admin/gemini-keys', 'POST', { alias, project, apiKey })
      setAlias(''); setProject(''); setApiKey(''); setFormOpen(false)
      setNotice(getInlineCopy(id, "copy_api_key_disimpan_terenkripsi_di_se_782456a"))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menambah API key.')
    } finally { setBusy(false) }
  }

  const changeEntry = async (entry: GeminiKeyEntry, patch: { enabled?: boolean; priority?: number }) => {
    setBusy(true); setError(''); setNotice('')
    try {
      await mutate(`/api/admin/gemini-keys/${encodeURIComponent(entry.id)}`, 'PATCH', patch)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memperbarui API key.')
    } finally { setBusy(false) }
  }

  const testEntry = async (entry: GeminiKeyEntry) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await mutate(`/api/admin/gemini-keys/${encodeURIComponent(entry.id)}/test`, 'POST')
      setNotice(result.message)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tes koneksi Gemini gagal.')
      await load()
    } finally { setBusy(false) }
  }

  const deleteEntry = async (entry: GeminiKeyEntry) => {
    if (!window.confirm(`${getInlineCopy(id, "copy_hapus_api_key_94b05a5")} ${entry.alias}?`)) return
    setBusy(true); setError('')
    try {
      await mutate(`/api/admin/gemini-keys/${encodeURIComponent(entry.id)}`, 'DELETE')
      setNotice(getInlineCopy(id, "copy_api_key_dihapus_17acf97"))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menghapus API key.')
    } finally { setBusy(false) }
  }

  const activeCount = entries.filter((entry) => entry.enabled).length
  const activeProjects = new Set(entries.filter((entry) => entry.enabled && entry.status !== 'invalid').map((entry) => entry.project)).size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="notice" role="note">
        <strong>{getInlineCopy(id, "copy_kredensial_server_d962b64")}</strong>{' '}
        {getInlineCopy(id, "copy_api_key_disimpan_terenkripsi_di_se_83b2a3e")}
      </div>
      <p className="helper" role="note">
        {getInlineCopy(id, "copy_pemakaian_token_dari_respons_gemin_b1449a5")}
      </p>

      <section className="panel" aria-labelledby="gemini-pool-heading">
        <div className="row-inline" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 id="gemini-pool-heading" style={{ margin: 0 }}>{getInlineCopy(id, "copy_pool_api_gemini_6800733")}</h3>
            <p className="helper" style={{ margin: '0.35rem 0 0' }}>
              {id ? `${activeCount} key aktif · ${activeProjects} project aktif · rotasi per project` : `${activeCount} active keys · ${activeProjects} projects · project-level rotation`}
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => { setFormOpen((open) => !open); setNotice(''); setError('') }}>
            <Icon name="plus" size={15} /> {getInlineCopy(id, "copy_tambah_api_22bc8ef")}
          </button>
        </div>

        {formOpen && (
          <form onSubmit={(event) => void addEntry(event)} className="panel" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ margin: 0 }}>{getInlineCopy(id, "copy_tambah_kredensial_gemini_82ef511")}</h4>
            <div className="form-grid-2">
              <div className="row">
                <label className="field-label" htmlFor="gemini-alias">{getInlineCopy(id, "copy_nama_alias_a4556a2")}</label>
                <input id="gemini-alias" className="input" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Gemini API 01" required autoComplete="off" />
              </div>
              <div className="row">
                <label className="field-label" htmlFor="gemini-project">Google project ID</label>
                <input id="gemini-project" className="input" value={project} onChange={(event) => setProject(event.target.value)} placeholder="eclipse-project-a" required autoComplete="off" />
              </div>
            </div>
            <div className="row">
              <label className="field-label" htmlFor="gemini-key">Gemini API key</label>
              <input id="gemini-key" className="input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIza…" required minLength={20} autoComplete="new-password" />
            </div>
            <div className="row-inline" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => { setFormOpen(false); setAlias(''); setProject(''); setApiKey('') }}>
                {getInlineCopy(id, "copy_batal_ad558c5")}
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !alias.trim() || !project.trim() || !apiKey.trim()}>
                {busy ? '…' : (getInlineCopy(id, "copy_simpan_key_ce28c12"))}
              </button>
            </div>
          </form>
        )}

        {error && <p className="error-box" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <div className="admin-scroll" style={{ marginTop: '0.8rem' }}>
          <table className="admin-table">
            <thead><tr>
              <th>{getInlineCopy(id, "copy_aktif_d4476e1")}</th><th>{getInlineCopy(id, "copy_nama_6551fec")}</th><th>Google project</th>
              <th>API key</th><th>{getInlineCopy(id, "copy_status_aba2332")}</th><th>{getInlineCopy(id, "copy_urutan_a96401f")}</th><th>{getInlineCopy(id, "copy_aksi_944b421")}</th>
            </tr></thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.id}>
                  <td data-label="Aktif"><input type="checkbox" checked={entry.enabled} disabled={busy} onChange={(event) => void changeEntry(entry, { enabled: event.target.checked })} aria-label={`${getInlineCopy(id, "copy_aktifkan_a7f8fcc")} ${entry.alias}`} /></td>
                  <td data-label="Nama">{entry.alias}</td>
                  <td data-label="Google project">{entry.project}</td>
                  <td data-label="API key"><code>{entry.maskedKey}</code></td>
                  <td data-label="Status"><span className={`status status--${entry.status === 'healthy' ? 'ok' : entry.status === 'error' || entry.status === 'invalid' ? 'err' : 'idle'}`}>
                    {entry.status === 'invalid' ? (getInlineCopy(id, "copy_key_tidak_valid_4734f1d")) : entry.projectCooldownUntil > Date.now() / 1000 ? (id ? `Project cooldown · ${new Date(entry.projectCooldownUntil * 1000).toLocaleTimeString(getLocale(lang))}` : `Project cooldown · ${new Date(entry.projectCooldownUntil * 1000).toLocaleTimeString('en-US')}`) : entry.status === 'healthy' ? (getInlineCopy(id, "copy_terhubung_17658ce")) : entry.status === 'error' ? (getInlineCopy(id, "copy_error_5a4f95b")) : (getInlineCopy(id, "copy_belum_diuji_90030b8"))}
                  </span></td>
                  <td data-label="Urutan"><div className="row-inline">
                    <span>{index + 1}</span>
                    <button className="mini-btn" type="button" disabled={busy || index === 0} onClick={() => void changeEntry(entry, { priority: Math.max(0, entry.priority - 1) })} aria-label="Naikkan prioritas">↑</button>
                    <button className="mini-btn" type="button" disabled={busy || index === entries.length - 1} onClick={() => void changeEntry(entry, { priority: entry.priority + 1 })} aria-label="Turunkan prioritas">↓</button>
                  </div></td>
                  <td data-label="Aksi"><div className="row-inline">
                    <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void testEntry(entry)}>{getInlineCopy(id, "copy_tes_5e4455b")}</button>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => void deleteEntry(entry)} aria-label={`${getInlineCopy(id, "copy_hapus_7290f3b")} ${entry.alias}`}><Icon name="x" size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <p className="helper">{getInlineCopy(id, "copy_belum_ada_api_key_tambahkan_key_ag_83e1c3c")}</p>}
        </div>
      </section>

      <section className="panel" aria-labelledby="gemini-usage-heading">
        <div className="row-inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h3 id="gemini-usage-heading" style={{ margin: 0 }}>{getInlineCopy(id, "copy_pemakaian_gemini_30_hari_5058bd7")}</h3>
            <p className="helper" style={{ margin: '0.35rem 0 0' }}>
              {getInlineCopy(id, "copy_token_aktual_yang_dilaporkan_api_b_232c0cb")}
            </p>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadUsage()}>
            {getInlineCopy(id, "copy_muat_ulang_da98d05")}
          </button>
        </div>
        {usageError && <p className="error-box" role="alert">{usageError}</p>}
        {usage && <>
          <div className="stat-grid" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>
            <div className="panel stat-card"><span className="stat-num">{usage.totals.calls.toLocaleString()}</span><span className="stat-label">{getInlineCopy(id, "copy_panggilan_dicatat_595b231")}</span></div>
            <div className="panel stat-card"><span className="stat-num">{usage.totals.succeeded.toLocaleString()}</span><span className="stat-label">{getInlineCopy(id, "copy_respons_sukses_f6abf2a")}</span></div>
            <div className="panel stat-card"><span className="stat-num">{usage.totals.failed.toLocaleString()}</span><span className="stat-label">{getInlineCopy(id, "copy_respons_gagal_40c26e5")}</span></div>
            <div className="panel stat-card"><span className="stat-num">{usage.totals.input_tokens.toLocaleString()}</span><span className="stat-label">{getInlineCopy(id, "copy_token_input_fbb2f67")}</span></div>
            <div className="panel stat-card"><span className="stat-num">{usage.totals.output_tokens.toLocaleString()}</span><span className="stat-label">{getInlineCopy(id, "copy_token_output_e4240a3")}</span></div>
            <div className="panel stat-card"><span className="stat-num">{usage.totals.usage_unknown.toLocaleString()}</span><span className="stat-label">{getInlineCopy(id, "copy_respons_tanpa_usage_6d290ac")}</span></div>
          </div>
          {usage.by_project_model.length > 0 ? <div className="admin-scroll" style={{ marginTop: '1rem' }}>
            <table className="admin-table">
              <thead><tr>
                <th>{getInlineCopy(id, "copy_project_659bd73")}</th><th>{getInlineCopy(id, "copy_model_855d5a7")}</th><th>{getInlineCopy(id, "copy_panggilan_440ff1a")}</th>
                <th>{getInlineCopy(id, "copy_input_token_f192a15")}</th><th>{getInlineCopy(id, "copy_output_token_f3dc7b5")}</th><th>{getInlineCopy(id, "copy_total_token_5349357")}</th>
              </tr></thead>
              <tbody>{usage.by_project_model.map((row) => <tr key={`${row.project}:${row.model}`}>
                <td data-label="Project">{row.project || '—'}</td><td data-label="Model">{row.model || '—'}</td>
                <td data-label="Calls">{row.calls.toLocaleString()}</td>
                <td data-label="Input tokens">{(row.input_tokens ?? 0).toLocaleString()}</td>
                <td data-label="Output tokens">{(row.output_tokens ?? 0).toLocaleString()}</td>
                <td data-label="Total tokens">{(row.total_tokens ?? 0).toLocaleString()}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="helper" style={{ marginTop: '1rem' }}>{getInlineCopy(id, "copy_belum_ada_panggilan_gemini_tercata_616e3cf")}</p>}
          {usage.by_account.length > 0 && <div className="admin-scroll" style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.6rem' }}>{getInlineCopy(id, "copy_pemakaian_per_pengguna_19fb284")}</h4>
            <table className="admin-table">
              <thead><tr>
                <th>{getInlineCopy(id, "copy_pengguna_9fb0dcf")}</th><th>{getInlineCopy(id, "copy_panggilan_440ff1a")}</th>
                <th>{getInlineCopy(id, "copy_input_token_f192a15")}</th><th>{getInlineCopy(id, "copy_output_token_f3dc7b5")}</th>
                <th>{getInlineCopy(id, "copy_total_token_5349357")}</th><th>{getInlineCopy(id, "copy_tanpa_usage_e5d89d3")}</th>
              </tr></thead>
              <tbody>{usage.by_account.map((row) => <tr key={row.account_id || row.account_name}>
                <td data-label="User">{row.account_name}</td><td data-label="Calls">{row.calls.toLocaleString()}</td>
                <td data-label="Input tokens">{(row.input_tokens ?? 0).toLocaleString()}</td>
                <td data-label="Output tokens">{(row.output_tokens ?? 0).toLocaleString()}</td>
                <td data-label="Total tokens">{(row.total_tokens ?? 0).toLocaleString()}</td>
                <td data-label="Usage unknown">{row.usage_unknown.toLocaleString()}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {usage.by_job.length > 0 && <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer' }}>{getInlineCopy(id, "copy_rincian_per_job_1b34771")}</summary>
            <div className="admin-scroll" style={{ marginTop: '0.65rem' }}>
              <table className="admin-table">
                <thead><tr>
                  <th>Job</th><th>{getInlineCopy(id, "copy_pengguna_9fb0dcf")}</th><th>{getInlineCopy(id, "copy_panggilan_440ff1a")}</th>
                  <th>{getInlineCopy(id, "copy_input_token_f192a15")}</th><th>{getInlineCopy(id, "copy_output_token_f3dc7b5")}</th>
                  <th>{getInlineCopy(id, "copy_total_token_5349357")}</th>
                </tr></thead>
                <tbody>{usage.by_job.map((row, index) => <tr key={`${row.job_id}:${row.account_id}:${index}`}>
                  <td data-label="Job"><code>{row.job_id || '—'}</code></td><td data-label="User">{row.account_name}</td>
                  <td data-label="Calls">{row.calls.toLocaleString()}</td>
                  <td data-label="Input tokens">{(row.input_tokens ?? 0).toLocaleString()}</td>
                  <td data-label="Output tokens">{(row.output_tokens ?? 0).toLocaleString()}</td>
                  <td data-label="Total tokens">{(row.total_tokens ?? 0).toLocaleString()}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>}
          <p className="helper" style={{ marginTop: '0.75rem' }}>
            {getInlineCopy(id, "copy_pencatatan_dimulai_setelah_pembaru_5e26913")}
          </p>
        </>}
      </section>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{getInlineCopy(id, "copy_perilaku_failover_508e51a")}</h3>
        <ul style={{ marginBottom: 0, paddingLeft: '1.2rem', color: 'var(--muted)' }}>
          <li>{getInlineCopy(id, "copy_jika_model_pilihan_gagal_atau_kuot_6357cfa")}</li>
          <li>{getInlineCopy(id, "copy_key_dari_project_yang_sama_bisa_be_3509947")}</li>
          <li>{getInlineCopy(id, "copy_key_mentah_tidak_ditampilkan_kemba_e6d3a1f")}</li>
        </ul>
      </div>
    </div>
  )
}
