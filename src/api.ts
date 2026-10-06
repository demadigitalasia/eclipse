import type {
  AnalyzeResult,
  DurationPref,
  HistoryEntry,
  SourceMode,
  TranscriptLine,
  ViralClip,
} from './types'

const API_BASE = ''

/* ---------- localStorage history ---------- */
const HISTORY_KEY = 'eclipse_history_v1'

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)))
  } catch {
    /* quota — abaikan */
  }
}

/* ---------- mock data (mode demo lokal) ---------- */
const MOCK_TITLES = [
  'Momen paling lucu di episode ini',
  'Penjelasan yang bikin tercengang',
  'Quote emas yang wajib dipotong',
  'Perdebatan panas bagian ini',
  'Cerita tak terduga dari tamu',
  'Tips praktis dalam 30 detik',
]

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export function mockAnalyze(
  source: SourceMode,
  url: string,
  durationPref: DurationPref,
  count: number,
): AnalyzeResult {
  const seed = url.split('').reduce((a, c) => a + c.charCodeAt(0), 7)
  const rnd = seededRandom(seed)
  const duration = 600 + Math.floor(rnd() * 2400)
  const targetLen = durationPref === '15s' ? 15 : durationPref === '30s' ? 30 : durationPref === '60s' ? 60 : 30

  const transcript: TranscriptLine[] = []
  let t = 0
  let i = 0
  while (t < duration) {
    const len = 4 + rnd() * 6
    transcript.push({
      start: t,
      end: Math.min(duration, t + len),
      text: `Kalimat transkrip contoh nomor ${++i} yang diucapkan pembicara dalam video ini.`,
    })
    t += len
  }

  const clips: ViralClip[] = []
  const n = Math.min(count, MOCK_TITLES.length * 2)
  for (let k = 0; k < n; k++) {
    const start = Math.floor(rnd() * Math.max(1, duration - targetLen - 5))
    const score = 62 + Math.floor(rnd() * 38)
    clips.push({
      title: MOCK_TITLES[k % MOCK_TITLES.length] + (k >= MOCK_TITLES.length ? ` (bagian ${k + 1})` : ''),
      start_time: start,
      end_time: start + targetLen,
      hook_time: start + 2,
      virality_score: Math.min(99, score),
      transcript: transcript
        .filter((l) => l.start >= start && l.start < start + targetLen)
        .map((l) => l.text)
        .join(' '),
      caption: 'Tonton sampai habis!',
    })
  }
  clips.sort((a, b) => b.virality_score - a.virality_score)

  const heatmap = Array.from({ length: 100 }, (_, k) => ({
    time: (k / 99) * duration,
    value: 0.15 + rnd() * 0.85,
  }))

  return {
    video_id: `demo_${seed.toString(36)}`,
    title: source === 'youtube' ? 'Video Demo — ECLIPSE' : source === 'drive' ? 'File Drive Demo' : 'Video Unggahan Demo',
    duration,
    source,
    video_url: url,
    heatmap,
    transcript,
    clips,
    summary: 'Video ini berisi diskusi menarik dengan beberapa momen puncak yang cocok dijadikan klip pendek. Skor dihitung dari energi pembicaraan, hook pembuka, dan kepadatan informasi.',
    model: 'demo-lokal',
    analyzed_at: new Date().toISOString(),
  }
}

/* ---------- backend API (dengan fallback demo) ---------- */
export async function tryAnalyzeBackend(
  payload: Record<string, unknown>,
  onDemo: () => void,
): Promise<AnalyzeResult | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) {
      onDemo()
      return null
    }
    void payload
    // Endpoint analisis penuh (SSE) disambungkan saat backend tersedia.
    onDemo()
    return null
  } catch {
    onDemo()
    return null
  }
}

export function toHistoryEntry(r: AnalyzeResult, durationPref: string): HistoryEntry {
  return {
    video_id: r.video_id,
    title: r.title,
    duration_pref: durationPref,
    clip_count: r.clips.length,
    analyzed_at: r.analyzed_at,
    thumbnail: '',
    url: r.video_url,
    source: r.source,
  }
}
