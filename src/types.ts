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

export type DurationPref = '15s' | '30s' | '60s'
export type SourceMode = 'youtube' | 'drive' | 'upload'
export type ViralityFilter = 'all' | 'high' | 'medium' | 'marked'
export type SortBy = 'virality' | 'time' | 'duration'
export type Lang = 'id' | 'en'

/* ---------- Kontrak frontend MVP 1 ----------
   Adapter HTTP memakai kontrak ini untuk mengirim dan menerima hasil server. */

/** Batas operasional MVP 1 yang diputuskan (dok 02/03/06). */
export const MVP_LIMITS = {
  /** Media sumber efektif maksimum per video (file lokal maupun remote). */
  maxSourceBytes: 2 * 1024 * 1024 * 1024,
  maxSourceLabel: '2 GB',
  /** Durasi maksimum per video. */
  maxDurationSec: 180 * 60,
  maxDurationLabel: '180 menit',
  /** Retensi file sementara; metadata diatur terpisah (B0). */
  tempFileTtlHours: 24,
  /** Retensi metadata analisis, terpisah dari berkas media sementara. */
  metadataRetentionDays: 90,
  /** Jumlah klip maksimum yang dapat dirender dalam satu batch. */
  maxBatchClips: 5,
  /** Rasio Studio MVP 1. */
  mvpAspect: '9:16' as const,
  /** Ekstensi file lokal yang diterima pada MVP. */
  acceptedExtensions: ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'],
  /** Jumlah klip maksimum per analisis. */
  maxClipsPerAnalyze: 12,
} as const

export type ErrorCode =
  | 'invalid_url'
  | 'drive_not_accessible'
  | 'file_required'
  | 'file_too_large'
  | 'file_type_unsupported'
  | 'invalid_range'
  | 'consent_required'
  | 'quota_exceeded'
  | 'empty_result'
  | 'backend_offline'
  | 'unknown'

export interface AppError {
  code: ErrorCode
  message: string
  /** Tindakan lanjutan yang bisa dilakukan pengguna. */
  hint?: string
  /** Safe structured context for localized messages. */
  limitLabel?: string
}

/** Request analisis dari form Studio (tanpa secret; pool key milik admin). */
export interface AnalyzeRequest {
  source: SourceMode
  url: string
  fileName: string
  fileSizeBytes: number | null
  duration: DurationPref
  prompt: string
  countMode: 'auto' | 'custom'
  count: number
  /** Persetujuan eksplisit pengiriman video/transkrip ke provider (B0). */
  consent: boolean
  subtitleSource: 'youtube' | 'manual' | 'transcribe'
}

/** Respons analisis dari backend. */
export interface AnalyzeResponse {
  data: AnalyzeResult
  warnings: string[]
}

/** Pengaturan render MVP: 9:16 + subtitle/judul dasar, ekspor MP4. */
export interface RenderPreset {
  aspect: StudioAspect
  caption: 'viral_pop' | 'off'
  title_text: string
  format: 'mp4'
  codec: 'h264'
}

export type BatchJobStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

export interface BatchJobItem {
  key: string
  title: string
  progress: number
  status: BatchJobStatus
}

export interface StudioSettings {
  aspect: StudioAspect
  caption: CaptionStyle
  title_text: string
  title_prefix: string
  title_suffix: string
  title_font: 'inter' | 'montserrat'
  title_size: number
  title_case: 'upper' | 'title' | 'lower'
  title_color: string
  title_effect_color: string
  title_x: number
  title_y: number
  title_effect: 'shadow' | 'outline' | 'box' | 'glow'
  title_animation: 'none' | 'fade' | 'slide_up'
  title_animation_duration_ms: number
  caption_size: number
  caption_font: 'inter' | 'montserrat'
  caption_color: string
  caption_effect_color: string
  caption_x: number
  caption_y: number
  caption_effect: 'outline' | 'box' | 'shadow'
  caption_animation: 'none' | 'fade' | 'slide_up' | 'slide_left' | 'slide_right' | 'pop' | 'typewriter' | 'wipe' | 'karaoke'
  caption_animation_duration_ms: number
  caption_karaoke_color: string
  bgm_asset: string
  sfx_asset: string
  source_volume: number
  bgm_volume: number
  sfx_volume: number
  bgm_ducking: boolean
  bgm_fade_in_ms: number
  bgm_fade_out_ms: number
  bgm_start_ms: number
  sfx_offset_ms: number
  watermark_enabled: boolean
  watermark_type: 'logo' | 'text'
  watermark_asset: string
  watermark_text: string
  watermark_size: number
  watermark_opacity: number
  watermark_x: number
  watermark_y: number
  filename_prefix: string
  filename_suffix: string
  encoder: 'auto' | 'nvenc' | 'amf' | 'qsv' | 'cpu'
  focal_x: number
  focal_y: number
  auto_focus: boolean
  focus_overrides: Record<string, { focal_x: number; focal_y: number }>
  focus_modes: Record<string, 'auto' | 'manual'>
  focus_anchors: Record<string, 'left' | 'center' | 'right'>
}

export type StudioAspect = '9:16' | '1:1' | '4:3' | '16:9' | '16:9-landscape'
export type CaptionStyle = 'viral_pop' | 'beast_punch' | 'cyber_violet' | 'fire_crimson' | 'electric_cyan' | 'golden_aura' | 'clean_minimal' | 'off'

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
