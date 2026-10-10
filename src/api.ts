import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeResult,
  AppError,
  HistoryEntry,
  StudioSettings,
  TranscriptLine,
} from './types'
import { MVP_LIMITS } from './types'

export function getHistory() {
  return apiRequest<{ entries: HistoryEntry[] }>('/jobs').then((body) => body.entries)
}

export function getRegistrationStatus() {
  return apiRequest<{ enabled: boolean }>('/auth/registration-status')
}

export function getPasswordResetStatus() {
  return apiRequest<{ enabled: boolean }>('/auth/reset-status')
}

export function deleteHistoryEntry(jobId: string) {
  return apiRequest<{ ok: boolean }>(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
}

export function clearHistory() {
  return apiRequest<{ ok: boolean; removed: number }>('/jobs', { method: 'DELETE' })
}

export function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch|shorts|embed|live)|youtu\.be\/)/i.test(url.trim())
}

export function isDriveUrl(url: string): boolean {
  return /^(https?:\/\/)?(drive\.google\.com\/|docs\.google\.com\/)/i.test(url.trim())
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function getFileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

export function validateAnalyzeRequest(req: AnalyzeRequest): AppError | null {
  if (!req.consent) return { code: 'consent_required', message: 'Persetujuan pemrosesan diperlukan.' }
  if (req.source !== 'upload' && !isHttpUrl(req.url)) {
    return { code: 'invalid_url', message: 'Tautan sumber tidak valid.' }
  }
  if (req.source === 'youtube' && !isYouTubeUrl(req.url)) {
    return { code: 'invalid_url', message: 'URL YouTube tidak valid.' }
  }
  if (req.source === 'drive' && !isDriveUrl(req.url)) {
    return { code: 'invalid_url', message: 'URL Google Drive tidak valid.' }
  }
  if (req.source === 'upload') {
    if (!req.fileName.trim()) return { code: 'file_required', message: 'Pilih file video dulu.' }
    const accepted = MVP_LIMITS.acceptedExtensions as readonly string[]
    if (!(accepted as readonly string[]).includes(getFileExtension(req.fileName))) {
      return { code: 'file_type_unsupported', message: 'Format video belum didukung.' }
    }
    if ((req.fileSizeBytes || 0) > MVP_LIMITS.maxSourceBytes) {
      return { code: 'file_too_large', message: 'File melebihi batas 2 GB.' }
    }
  }
  if (req.countMode === 'custom' && (req.count < 1 || req.count > MVP_LIMITS.maxClipsPerAnalyze)) {
    return { code: 'invalid_range', message: `Jumlah klip harus 1–${MVP_LIMITS.maxClipsPerAnalyze}.` }
  }
  return null
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin' })
  } catch {
    throw { code: 'backend_offline', message: 'Backend tidak dapat dihubungi.', hint: 'Pastikan server ECLIPSE API berjalan.' } satisfies AppError
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.error || {}
    throw {
      code: detail.code || (response.status === 401 ? 'backend_offline' : 'unknown'),
      message: detail.message || `Permintaan gagal (HTTP ${response.status}).`,
      hint: detail.hint,
    } satisfies AppError
  }
  return payload as T
}

type IngestResponse = { job: { id: string }; metadata: { title?: string; duration?: number } }

export interface JobProgress {
  status: string
  progress: number
  error: string
  outputs?: RenderOutput[]
}

export function getJobProgress(jobId: string) {
  return apiRequest<JobProgress>(`/jobs/${encodeURIComponent(jobId)}/status`)
}

export async function downloadRawYouTube(jobId: string, onProgress?: (progress: number) => void) {
  const started = await apiRequest<{ status: 'running' | 'done'; download_job_id?: string; download_url?: string }>(
    `/jobs/${encodeURIComponent(jobId)}/download-source`, { method: 'POST' },
  )
  if (started.status === 'done') {
    window.location.assign(`/api/jobs/${encodeURIComponent(jobId)}/download-source`)
    return
  }
  if (!started.download_job_id) throw new Error('Job unduhan tidak terbentuk.')
  while (true) {
    await new Promise((resolve) => window.setTimeout(resolve, 1200))
    const status = await getJobProgress(started.download_job_id)
    onProgress?.(status.progress)
    if (status.status === 'done') break
    if (status.status === 'error') throw new Error(status.error || 'Unduhan video YouTube gagal.')
  }
  window.location.assign(`/api/jobs/${encodeURIComponent(jobId)}/download-source`)
}

export async function analyzeVideo(
  req: AnalyzeRequest,
  file: File | null,
  options: { onJobCreated?: (jobId: string) => void; manualSubtitleFile?: File | null } = {},
): Promise<AnalyzeResponse> {
  const validation = validateAnalyzeRequest(req)
  if (validation) throw validation

  let manualSubtitleText: string | undefined
  if (req.subtitleSource === 'manual') {
    const subtitleFile = options.manualSubtitleFile
    if (!subtitleFile) throw { code: 'file_required', message: 'Pilih berkas subtitle terlebih dahulu.' } satisfies AppError
    if (subtitleFile.size > 512_000) throw { code: 'file_too_large', message: 'Berkas subtitle maksimal 500 KB.' } satisfies AppError
    if (!/\.(srt|txt)$/i.test(subtitleFile.name)) throw { code: 'file_type_unsupported', message: 'Gunakan berkas .srt atau .txt.' } satisfies AppError
    manualSubtitleText = await subtitleFile.text()
    if (!manualSubtitleText.trim()) throw { code: 'file_required', message: 'Berkas subtitle kosong.' } satisfies AppError
  }

  let ingest: IngestResponse
  if (req.source === 'upload') {
    if (!file) throw { code: 'file_required', message: 'Pilih file video yang akan diunggah.' } satisfies AppError
    const form = new FormData()
    form.append('file', file, file.name)
    ingest = await apiRequest<IngestResponse>('/upload-video', { method: 'POST', body: form })
  } else if (req.source === 'youtube') {
    ingest = await apiRequest<IngestResponse>('/ingest-youtube', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: req.url }),
    })
  } else {
    ingest = await apiRequest<IngestResponse>('/ingest-drive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: req.url }),
    })
  }

  options.onJobCreated?.(ingest.job.id)

  const count = req.countMode === 'auto' ? 6 : req.count
  const analyzed = await apiRequest<AnalyzeResponse>(`/jobs/${encodeURIComponent(ingest.job.id)}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consent: req.consent,
      duration: req.duration,
      countMode: req.countMode,
      count,
      prompt: req.prompt,
      subtitleSource: req.subtitleSource,
      manualSubtitleText,
    }),
  })
  if (ingest.metadata.title) analyzed.data.title = ingest.metadata.title
  return analyzed
}

export function getAnalysis(jobId: string) {
  return apiRequest<AnalyzeResponse>(`/jobs/${encodeURIComponent(jobId)}/analysis`)
}

export interface RenderOutput {
  key: string
  title: string
  file: string
  size_bytes: number
  download_url: string
  subtitles: number
  subtitle_mode: 'none' | 'track' | 'burned'
  title_applied: boolean
  title_metadata: boolean
  focus_detection?: { found: boolean; mode: string; focal_x?: number; focal_y?: number; sampled_frames?: number; matching_samples?: number; confidence?: number; target_anchor?: string; keyframes?: Array<{ time: number; focal_x: number; focal_y: number }> }
}

export function uploadStudioAsset(jobId: string, kind: 'bgm' | 'sfx' | 'watermark', file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  return apiRequest<{ asset: string; size_bytes: number; kind: string }>(
    `/jobs/${encodeURIComponent(jobId)}/studio-assets/${kind}`, { method: 'POST', body: form },
  )
}

export interface RenderCapabilities {
  encoders: Record<'nvenc' | 'amf' | 'qsv' | 'cpu', boolean>
  recommended: 'nvenc' | 'amf' | 'qsv' | 'cpu'
  face_detection: boolean
  person_detection: boolean
  ai_focus: boolean
  auto_focus: boolean
}

export function getRenderCapabilities() {
  return apiRequest<RenderCapabilities>('/render-capabilities')
}

export interface ServerLimits {
  maxSourceLabel: string
  maxSourceBytes: number
  maxDurationSec: number
  tempFileTtlHours: number
  metadataRetentionDays: number
  mvpAspect: string
  exportFormat: string
  exportCodec: string
  maxBatchClips: number
  freeDailyAnalyze: number
  freeDailyRender: number
  freeRenderTrialDays: number
  liteDailyRender: number
  liteTermMonths: number
  liteMonthlyPriceIdr: number
  liteDiscountPercent: number
  liteDiscountStart: string
  liteDiscountEnd: string
  liteDiscountAmountIdr: number
  proDailyRender: number
  proTermMonths: number
  proMonthlyPriceIdr: number
  proDiscountPercent: number
  proDiscountStart: string
  proDiscountEnd: string
  proDiscountAmountIdr: number
}

export type SubscriptionSettings = Pick<ServerLimits,
  'freeDailyAnalyze' | 'freeDailyRender' | 'freeRenderTrialDays' |
  'liteDailyRender' | 'liteMonthlyPriceIdr' | 'liteTermMonths' | 'liteDiscountPercent' | 'liteDiscountStart' | 'liteDiscountEnd' |
  'proDailyRender' | 'proMonthlyPriceIdr' | 'proTermMonths' | 'proDiscountPercent' | 'proDiscountStart' | 'proDiscountEnd'
>

export function getAdminSubscriptionSettings() {
  return apiRequest<{ settings: SubscriptionSettings }>('/admin/subscription-settings')
}

export function saveAdminSubscriptionSettings(settings: SubscriptionSettings) {
  return apiRequest<{ settings: SubscriptionSettings }>('/admin/subscription-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

export interface SubscriptionPayment {
  id: string
  account_id: string
  account_name?: string
  account_email?: string
  plan: 'lite' | 'pro'
  base_amount: number
  unique_code: number
  total_amount: number
  discount_amount: number
  campaign_discount: number
  promo_code: string
  status: 'awaiting_payment' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'expired'
  proof_mime?: string
  proof_filename?: string
  submitted_at?: string
  decided_at?: string
  decided_by?: string
  decision_note?: string
  created_at: string
  expires_at: string
}

export function getMySubscriptionPayments() {
  return apiRequest<{ payments: SubscriptionPayment[] }>('/subscription/payments')
}

export function createSubscriptionPayment(plan: 'lite' | 'pro') {
  return apiRequest<{ payment: SubscriptionPayment }>('/subscription/payments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
  })
}

export function applySubscriptionPromo(paymentId: string, code: string) {
  return apiRequest<{ payment: SubscriptionPayment }>('/subscription/payments/' + encodeURIComponent(paymentId) + '/promo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  })
}

export function removeSubscriptionPromo(paymentId: string) {
  return apiRequest<{ payment: SubscriptionPayment }>('/subscription/payments/' + encodeURIComponent(paymentId) + '/promo', { method: 'DELETE' })
}

export function submitSubscriptionPaymentProof(paymentId: string, file: File) {
  const body = new FormData()
  body.append('file', file, file.name)
  return apiRequest<{ payment: SubscriptionPayment }>(`/subscription/payments/${encodeURIComponent(paymentId)}/proof`, { method: 'POST', body })
}

export function cancelSubscriptionPayment(paymentId: string) {
  return apiRequest<{ ok: boolean }>(`/subscription/payments/${encodeURIComponent(paymentId)}/cancel`, { method: 'POST' })
}

export function getAdminSubscriptionPayments() {
  return apiRequest<{ payments: SubscriptionPayment[] }>('/admin/subscription-payments')
}

export function decideAdminSubscriptionPayment(paymentId: string, decision: 'approve' | 'reject', note = '') {
  return apiRequest<{ payment: SubscriptionPayment }>(`/admin/subscription-payments/${encodeURIComponent(paymentId)}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }),
  })
}

export function uploadAdminSubscriptionQr(file: File) {
  const body = new FormData()
  body.append('file', file, file.name)
  return apiRequest<{ ok: boolean; updatedAt: string }>('/admin/subscription-payment-qr', { method: 'POST', body })
}

export interface SubscriptionPromo {
  id: string
  code: string
  applies_to: 'all' | 'lite' | 'pro'
  discount_type: 'percent' | 'fixed'
  discount_value: number
  starts_at: string
  ends_at: string
  max_uses: number
  active: number
  created_at: string
  use_count: number
}

export function getAdminSubscriptionPromos() {
  return apiRequest<{ promos: SubscriptionPromo[] }>('/admin/subscription-promos')
}

export function createAdminSubscriptionPromo(promo: {
  code: string; appliesTo: SubscriptionPromo['applies_to']; discountType: SubscriptionPromo['discount_type']
  discountValue: number; startsAt: string; endsAt: string; maxUses: number
}) {
  return apiRequest<{ promo: SubscriptionPromo }>('/admin/subscription-promos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promo),
  })
}

export function setAdminSubscriptionPromoActive(id: string, active: boolean) {
  return apiRequest<{ ok: boolean }>('/admin/subscription-promos/' + encodeURIComponent(id), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
  })
}

export function deleteAdminSubscriptionPromo(id: string) {
  return apiRequest<{ ok: boolean }>('/admin/subscription-promos/' + encodeURIComponent(id), { method: 'DELETE' })
}

export interface AppNotification {
  id: string
  kind: string
  payload: Record<string, string | number>
  created_at: string
  read_at: string
}

export function getNotifications() {
  return apiRequest<{ notifications: AppNotification[]; unreadCount: number }>('/notifications')
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ ok: boolean; changed: number }>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' })
}

export function markAllNotificationsRead() {
  return apiRequest<{ ok: boolean; changed: number }>('/notifications/read-all', { method: 'POST' })
}

export interface ServerHealth {
  status: string
  version: string
  time: number
}

export function getServerLimits() {
  return apiRequest<ServerLimits>('/limits')
}

export function getServerHealth() {
  return apiRequest<ServerHealth>('/health')
}

export function getFocusPreview(jobId: string, clipStart: number, clipEnd: number, aspect: StudioSettings['aspect'], focusAnchor: 'left' | 'center' | 'right' = 'center') {
  return apiRequest<{ found: boolean; mode: string; focal_x: number; focal_y: number; sampled_frames?: number; matching_samples?: number; confidence?: number; target_anchor?: string; keyframes?: Array<{ time: number; focal_x: number; focal_y: number }> }>(
    `/jobs/${encodeURIComponent(jobId)}/focus-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipStart, clipEnd, aspect, focusAnchor }),
    },
  )
}

export function renderBatch(jobId: string, clientJobId: string, clips: AnalyzeResult['clips'], titles: Record<string, string>, subtitles: Record<string, TranscriptLine[]>, settings: StudioSettings) {
  return apiRequest<{ render_job_id: string; outputs: RenderOutput[] }>(`/jobs/${encodeURIComponent(jobId)}/render-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientJobId,
      clips: clips.map((clip) => {
        const key = `${clip.start_time}_${clip.end_time}`
        const editedSegments = subtitles[key]
        return {
          clipKey: key,
          clipStart: clip.start_time,
          clipEnd: clip.end_time,
          hookTime: clip.hook_time,
          title: `${settings.title_prefix}${titles[key] ?? clip.title}${settings.title_suffix}`.slice(0, 160),
          focalX: settings.focus_overrides?.[`${key}:${settings.aspect}`]?.focal_x ?? settings.focal_x,
          focalY: settings.focus_overrides?.[`${key}:${settings.aspect}`]?.focal_y ?? settings.focal_y,
          autoFocus: settings.focus_modes?.[`${key}:${settings.aspect}`] ?? settings.auto_focus,
          focusAnchor: settings.focus_anchors?.[`${key}:${settings.aspect}`] ?? 'center',
          ...(editedSegments ? { segments: editedSegments } : {}),
        }
      }),
      titleText: settings.title_text,
      aspect: settings.aspect,
      caption: settings.caption,
      titleFont: settings.title_font,
      titleSize: settings.title_size,
      titleCase: settings.title_case,
      titleColor: settings.title_color,
      titleEffectColor: settings.title_effect_color,
      titleY: settings.title_y,
      titleX: settings.title_x,
      titleEffect: settings.title_effect,
      titleAnimation: settings.title_animation,
      titleAnimationDurationMs: settings.title_animation_duration_ms,
      captionSize: settings.caption_size,
      captionFont: settings.caption_font,
      captionColor: settings.caption_color,
      captionEffectColor: settings.caption_effect_color,
      captionY: settings.caption_y,
      captionX: settings.caption_x,
      captionEffect: settings.caption_effect,
      captionAnimation: settings.caption_animation,
      captionAnimationDurationMs: settings.caption_animation_duration_ms,
      captionKaraokeColor: settings.caption_karaoke_color,
      bgmAsset: settings.bgm_asset || null,
      sfxAsset: settings.sfx_asset || null,
      sourceVolume: settings.source_volume,
      bgmVolume: settings.bgm_volume,
      sfxVolume: settings.sfx_volume,
      bgmDucking: settings.bgm_ducking,
      bgmFadeInMs: settings.bgm_fade_in_ms,
      bgmFadeOutMs: settings.bgm_fade_out_ms,
      bgmStartMs: settings.bgm_start_ms,
      sfxOffsetMs: settings.sfx_offset_ms,
      watermarkText: settings.watermark_enabled && settings.watermark_type === 'text' ? settings.watermark_text : null,
      watermarkAsset: settings.watermark_enabled && settings.watermark_type === 'logo' ? settings.watermark_asset || null : null,
      watermarkSize: settings.watermark_size,
      watermarkOpacity: settings.watermark_opacity,
      watermarkX: settings.watermark_x,
      watermarkY: settings.watermark_y,
      filenamePrefix: settings.filename_prefix,
      filenameSuffix: settings.filename_suffix,
      encoder: settings.encoder,
      focalX: settings.focal_x,
      focalY: settings.focal_y,
      autoFocus: settings.auto_focus,
      focusAnchor: settings.focus_anchors?.default ?? 'center',
      withSubtitles: settings.caption !== 'off',
    }),
  })
}
