// Menjalankan frontend (Vite) + backend (FastAPI) sekaligus untuk cek lokal.
//   npm run local
// Berhenti dengan Ctrl+C — kedua proses dimatikan bersama.
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB_PORT = process.env.ECLIPSE_WEB_PORT || '5173'
const API_PORT = process.env.ECLIPSE_API_PORT || '8000'

const UVICORN = join(ROOT, '.venv', 'bin', 'uvicorn')
if (!existsSync(UVICORN)) {
  console.error('❌ .venv backend belum ada. Jalankan dulu:')
  console.error('   python3 -m venv .venv && ./.venv/bin/pip install -r backend/requirements.txt')
  process.exit(1)
}

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = []

function start(label, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`))
  child.on('exit', (code) => {
    console.log(`[${label}] berhenti (kode ${code}) — mematikan yang lain…`)
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {
      /* sudah mati */
    }
  }
  setTimeout(() => process.exit(code), 500).unref()
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Backend dulu agar siap saat frontend dibuka.
start('api', UVICORN, ['backend.main:app', '--port', String(API_PORT)], {
  ECLIPSE_DATA_DIR: process.env.ECLIPSE_DATA_DIR || join(ROOT, 'data'),
  ECLIPSE_ENV: process.env.ECLIPSE_ENV || 'development',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? `http://localhost:${WEB_PORT}`,
  ECLIPSE_ALLOW_REGISTRATION: process.env.ECLIPSE_ALLOW_REGISTRATION ||
    (process.env.ECLIPSE_ENV === 'production' || process.env.ECLIPSE_ENV === 'prod' ? 'false' : 'true'),
})
start('web', NPM, ['run', 'dev', '--', '--port', String(WEB_PORT), '--strictPort'])

console.log(`🌑 ECLIPSE lokal: web http://localhost:${WEB_PORT} · api http://localhost:${API_PORT}/api/health`)
console.log('   Berhenti: Ctrl+C');
