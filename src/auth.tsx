import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Role = 'admin' | 'user'

export interface Account {
  id: string
  name: string
  email: string
  role: Role
  createdAt: string
  plan: 'free' | 'lite' | 'pro'
  planExpiresAt?: string
  profilePhotoUpdatedAt?: string
  active: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  detail: string
}

interface AuthCtx {
  ready: boolean
  loginEvent: number
  user: Account | null
  users: Account[]
  audit: AuditEntry[]
  adminDataError: string | null
  login: (email: string, pass: string) => Promise<string | null>
  register: (name: string, email: string, pass: string) => Promise<string | null>
  logout: () => Promise<void>
  updateMe: (patch: Partial<Account>) => Promise<string | null>
  uploadProfilePhoto: (file: File) => Promise<string | null>
  refreshUser: () => Promise<void>
  setRole: (id: string, role: Role) => Promise<string | null>
  setPlan: (id: string, plan: 'free' | 'lite' | 'pro') => Promise<string | null>
  renewPlan: (id: string, plan: 'lite' | 'pro') => Promise<string | null>
  setActive: (id: string, active: boolean) => Promise<string | null>
  clearAudit: () => Promise<string | null>
  removeUser: (id: string) => Promise<string | null>
  requestReset: (email: string) => Promise<string | null>
  confirmReset: (email: string, code: string, pass: string) => Promise<string | null>
  refreshAdmin: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

type ApiAccount = { id: string; name: string; email: string; role: Role; plan: 'free' | 'lite' | 'pro'; plan_expires_at?: string; profile_photo_updated_at?: string; active?: boolean; created_at?: string }
type ApiAudit = { id: number; created_at: string; actor: string; action: string; detail: string }

function accountFromApi(value: ApiAccount): Account {
  return { ...value, planExpiresAt: value.plan_expires_at, profilePhotoUpdatedAt: value.profile_photo_updated_at, active: value.active ?? true, createdAt: value.created_at || new Date().toISOString() }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin' })
  } catch {
    throw new Error('Backend tidak dapat dihubungi. Pastikan server API ECLIPSE berjalan.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || `Permintaan gagal (HTTP ${response.status}).`)
  return body as T
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loginEvent, setLoginEvent] = useState(0)
  const [user, setUser] = useState<Account | null>(null)
  const [users, setUsers] = useState<Account[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [adminDataError, setAdminDataError] = useState<string | null>(null)

  const refreshAdmin = useCallback(async () => {
    try {
      const [userData, auditData] = await Promise.all([
        api<{ users: ApiAccount[] }>('/admin/users'),
        api<{ audit: ApiAudit[] }>('/admin/audit'),
      ])
      setUsers(userData.users.map(accountFromApi))
      setAudit(auditData.audit.map((entry) => ({
        id: String(entry.id), at: entry.created_at, actor: entry.actor, action: entry.action, detail: entry.detail,
      })))
      setAdminDataError(null)
    } catch (error) {
      setAdminDataError(error instanceof Error ? error.message : 'Data admin gagal dimuat.')
    }
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<{ user: ApiAccount }>('/auth/me')
      const next = accountFromApi(data.user)
      setUser(next)
      if (next.role === 'admin') await refreshAdmin()
    } catch {
      setUser(null)
    } finally {
      setReady(true)
    }
  }, [refreshAdmin])

  useEffect(() => { void refreshMe() }, [refreshMe])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await api<{ user: ApiAccount }>('/auth/login', json('POST', { email, password }))
      const next = accountFromApi(data.user)
      setUser(next)
      setLoginEvent((event) => event + 1)
      if (next.role === 'admin') await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Tidak dapat masuk.'
    }
  }, [refreshAdmin])

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const data = await api<{ user: ApiAccount }>('/auth/register', json('POST', { name, email, password }))
      const next = accountFromApi(data.user)
      setUser(next)
      setLoginEvent((event) => event + 1)
      if (next.role === 'admin') await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Pendaftaran gagal.'
    }
  }, [refreshAdmin])

  const logout = useCallback(async () => {
    try { await api('/auth/logout', json('POST')) } finally {
      setUser(null)
      setUsers([])
      setAudit([])
      setAdminDataError(null)
    }
  }, [])

  const updateMe = useCallback(async (patch: Partial<Account>) => {
    try {
      const data = await api<{ user: ApiAccount }>('/auth/me', json('PATCH', { name: patch.name }))
      setUser(accountFromApi(data.user))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Profil gagal disimpan.'
    }
  }, [])

  const uploadProfilePhoto = useCallback(async (file: File) => {
    try {
      const body = new FormData()
      body.append('file', file, file.name)
      const data = await api<{ user: ApiAccount }>('/auth/me/avatar', { method: 'POST', body })
      setUser(accountFromApi(data.user))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Foto profil gagal diunggah.'
    }
  }, [])

  const setRole = useCallback(async (id: string, role: Role) => {
    try {
      await api(`/admin/users/${encodeURIComponent(id)}`, json('PATCH', { role }))
      await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Peran gagal diperbarui.'
    }
  }, [refreshAdmin])

  const setPlan = useCallback(async (id: string, plan: 'free' | 'lite' | 'pro') => {
    try {
      await api(`/admin/users/${encodeURIComponent(id)}`, json('PATCH', { plan }))
      await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Paket gagal diperbarui.'
    }
  }, [refreshAdmin])

  const renewPlan = useCallback(async (id: string, plan: 'lite' | 'pro') => {
    try {
      await api(`/admin/users/${encodeURIComponent(id)}`, json('PATCH', { plan, renew: true }))
      await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Perpanjangan paket gagal.'
    }
  }, [refreshAdmin])

  const setActive = useCallback(async (id: string, active: boolean) => {
    try {
      await api(`/admin/users/${encodeURIComponent(id)}`, json('PATCH', { active }))
      await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Status akun gagal diperbarui.'
    }
  }, [refreshAdmin])

  const removeUser = useCallback(async (id: string) => {
    try {
      await api(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
      await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Pengguna gagal dihapus.'
    }
  }, [refreshAdmin])

  const clearAudit = useCallback(async () => {
    try {
      await api('/admin/audit', { method: 'DELETE', credentials: 'same-origin' })
      await refreshAdmin()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Log aktivitas gagal dihapus.'
    }
  }, [refreshAdmin])

  const requestReset = useCallback(async (email: string) => {
    try {
      await api('/auth/reset-request', json('POST', { email }))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Permintaan reset gagal.'
    }
  }, [])

  const confirmReset = useCallback(async (email: string, code: string, password: string) => {
    try {
      await api('/auth/reset-confirm', json('POST', { email, code, password }))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Reset sandi gagal.'
    }
  }, [])

  const value = useMemo<AuthCtx>(() => ({
    ready, loginEvent, user, users, audit, adminDataError, login, register, logout, updateMe, uploadProfilePhoto, refreshUser: refreshMe, setRole, setPlan, renewPlan, setActive,
    clearAudit, removeUser, requestReset, confirmReset, refreshAdmin,
  }), [ready, loginEvent, user, users, audit, adminDataError, login, register, logout, updateMe, uploadProfilePhoto, refreshMe, setRole, setPlan, renewPlan,
    clearAudit, removeUser, requestReset, confirmReset, refreshAdmin, setActive])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useAuth harus digunakan di dalam AuthProvider')
  return value
}
