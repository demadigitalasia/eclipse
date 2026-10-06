export interface HeatmapPoint {
  time: number
  value: number
}

export interface TranscriptLine {
  start: number
  end: number
  text: string
}

export interface ViralClip {
  title: string
  start_time: number
  end_time: number
  hook_time: number
  virality_score: number
  transcript: string
  caption?: string
}

export interface AnalyzeResult {
  video_id: string
  title: string
  duration: number
  source: 'youtube' | 'drive' | 'upload'
  video_url: string
  heatmap: HeatmapPoint[]
  transcript: TranscriptLine[]
  clips: ViralClip[]
  summary: string
  model: string
  analyzed_at: string
}

export interface HistoryEntry {
  video_id: string
  title: string
  duration_pref: string
  clip_count: number
  analyzed_at: string
  thumbnail: string
  url: string
  source: 'youtube' | 'drive' | 'upload'
}

export type DurationPref = '15s' | '30s' | '60s' | 'auto'
export type SourceMode = 'youtube' | 'drive' | 'upload'
export type ViralityFilter = 'all' | 'high' | 'medium' | 'marked'
export type SortBy = 'virality' | 'time' | 'duration'
export type Lang = 'id' | 'en'

export interface StudioSettings {
  aspect: '9:16' | '1:1' | '4:3' | '16:9'
  caption: 'viral_pop' | 'clean_minimal' | 'off'
  title_text: string
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function scoreTier(score: number): 'high' | 'mid' | 'low' {
  if (score >= 90) return 'high'
  if (score >= 70) return 'mid'
  return 'low'
}
