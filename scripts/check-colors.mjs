// Penjaga konsistensi warna: warna global dan preset harus terpusat di modul tema.
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED_FILES = new Set(['src/theme/tokens.css', 'src/theme/studio-title-colors.ts'])
const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/gi
// Nama warna lolos dari regex di atas; yang diizinkan hanya keyword non-warna.
// `var(--…)` dan properti seperti `white-space` dikecualikan agar tidak positif palsu.
const NAMED_COLOR_RE = /(?<![\w-])(?:red|white|black|silver|gray|grey|maroon|yellow|olive|lime|green|aqua|teal|blue|navy|fuchsia|purple|orange|pink|brown|cyan|magenta|violet|gold)(?![\w-])/gi

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules' || e === 'dist') continue
      yield* walk(p)
    } else if (/\.(css|tsx|ts)$/.test(p)) {
      yield p
    }
  }
}

let violations = []

for (const file of walk(join(ROOT, 'src'))) {
  const rel = file.replace(ROOT + '/', '')
  if (ALLOWED_FILES.has(rel)) continue
  const src = readFileSync(file, 'utf8')
  // Singkirkan var(--token-…) agar nama token tak dikira warna mentah.
  const scrubbed = src.replace(/var\([^)]*\)/g, 'var()')
  for (const m of src.matchAll(RAW_COLOR_RE)) {
    const line = src.slice(0, m.index).split('\n').length
    violations.push(`${rel}:${line} → ${m[0]}`)
  }
  for (const m of scrubbed.matchAll(NAMED_COLOR_RE)) {
    const line = scrubbed.slice(0, m.index).split('\n').length
    violations.push(`${rel}:${line} → nama warna "${m[0]}" (pakai token var(--…))`)
  }
}

if (violations.length > 0) {
  console.error('❌ Warna mentah di luar tokens.css:\n' + violations.join('\n'))
  console.error('Aturan: gunakan token var(--…) dari src/theme/tokens.css.')
  process.exit(1)
}
console.log('✅ Konsistensi warna OK')
