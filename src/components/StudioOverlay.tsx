import { useEffect, useRef, useState, type CSSProperties as ReactCSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useFocusReturn } from '../hooks'
import { formatTime } from '../types'
import type { Lang, StudioSettings, TranscriptLine, ViralClip } from '../types'
import { clipKey } from './ClipsPanel'
import { getFocusPreview, getJobProgress, getRenderCapabilities, renderBatch, uploadStudioAsset, type RenderOutput } from '../api'
import type { Strings } from '../localization'
import { getCaughtErrorMessage } from '../localization'
import Icon from './Icon'
import ThemedSelect from './ThemedSelect'
import { studioSubtitleDefaults, studioSubtitlePalette, studioSubtitlePresets, studioTitleDefaults, studioTitlePalette, studioTitlePresets } from '../theme/studio-title-colors'

type BatchStatus = 'queued' | 'running' | 'done' | 'error'
interface BatchItem { key: string; title: string; status: BatchStatus; downloadUrl?: string; focusDetection?: RenderOutput['focus_detection'] }
interface FocusKeyframe { time: number; focal_x: number; focal_y: number }
interface FocusPreview { found: boolean; mode: string; focal_x: number; focal_y: number; sampled_frames?: number; matching_samples?: number; keyframes?: FocusKeyframe[] }
type FocusPreviewStatus = { state: 'not-found' | 'error'; message?: string }
type StudioDraft = { settings: StudioSettings; titles: Record<string, string>; subtitleEdits: Record<string, TranscriptLine[]> }
type EditorSnapshot = StudioDraft
const initialSettings: StudioSettings = {
  aspect: '9:16', caption: 'viral_pop', title_text: '', title_prefix: '', title_suffix: '',
  title_font: 'inter', title_size: 75, title_case: 'upper', title_color: studioTitleDefaults.text, title_effect_color: studioTitleDefaults.effect, title_x: 50, title_y: 12, title_effect: 'shadow', title_animation: 'none', title_animation_duration_ms: 360, caption_size: 75, caption_font: studioSubtitleDefaults.font, caption_color: studioSubtitleDefaults.text, caption_effect_color: studioSubtitleDefaults.effect, caption_x: 50, caption_y: 21, caption_effect: 'outline', caption_animation: 'none', caption_animation_duration_ms: studioSubtitleDefaults.animationDurationMs, caption_karaoke_color: studioSubtitleDefaults.karaoke,
  bgm_asset: '', sfx_asset: '', source_volume: 100, bgm_volume: 25, sfx_volume: 80, bgm_ducking: true, bgm_fade_in_ms: 400, bgm_fade_out_ms: 700, bgm_start_ms: 0, sfx_offset_ms: 0,
  watermark_enabled: false, watermark_type: 'logo', watermark_asset: '', watermark_text: '', watermark_size: 20, watermark_opacity: 80, watermark_x: 88, watermark_y: 8, filename_prefix: '', filename_suffix: '', encoder: 'auto', focal_x: 50, focal_y: 50, auto_focus: true, focus_overrides: {}, focus_modes: {}, focus_anchors: {},
}
function parseHexColor(value: string): { r: number; g: number; b: number } {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value)
  return match ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) } : { r: 255, g: 244, b: 230 }
}
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`
}
function readStudioDraft(jobId: string): StudioDraft | null {
  try {
    const raw = localStorage.getItem(`eclipse-studio-draft-v1:${jobId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StudioDraft>
    if (!parsed.settings || !parsed.titles || !parsed.subtitleEdits) return null
    const legacyWatermark = !('watermark_type' in parsed.settings)
    return {
      settings: {
        ...initialSettings,
        ...parsed.settings,
        focus_overrides: parsed.settings.focus_overrides ?? {},
        focus_modes: parsed.settings.focus_modes ?? {},
        focus_anchors: parsed.settings.focus_anchors ?? {},
        watermark_size: Math.min(40, Math.max(5, Number(parsed.settings.watermark_size ?? initialSettings.watermark_size))),
        ...(legacyWatermark && parsed.settings.watermark_enabled && parsed.settings.watermark_text
          ? { watermark_type: 'text' as const }
          : {}),
      },
      titles: parsed.titles,
      subtitleEdits: parsed.subtitleEdits,
    }
  } catch { return null }
}
function formatClipSeconds(value: number): string { return Math.max(0, value).toFixed(2) }
function focusModeLabel(mode: string): string {
  if (mode === 'face' || mode === 'face-legacy') return mode === 'face' ? 'wajah AI' : 'wajah klasik'
  if (mode === 'person') return 'orang AI'
  if (mode === 'motion') return 'gerakan'
  return 'titik tengah'
}
function focusResultLabel(result: NonNullable<RenderOutput['focus_detection']>): string {
  if (result.mode === 'not-applicable') return 'Letterbox · tanpa crop'
  if (result.mode === 'manual-fallback') return 'manual · fallback otomatis'
  if (result.mode === 'unavailable') return 'manual · auto tidak tersedia'
  if (result.mode === 'face' || result.mode === 'person' || result.mode === 'face-legacy') {
    const label = result.mode === 'face' ? 'wajah AI' : result.mode === 'person' ? 'orang AI' : 'wajah klasik'
    const track = (result.keyframes?.length ?? 0) > 1 ? 'tracking' : 'deteksi'
    return `otomatis · ${track} ${label} ${result.matching_samples ?? 0}/${result.sampled_frames ?? 0} sampel`
  }
  if (result.mode === 'motion') return `${(result.keyframes?.length ?? 0) > 1 ? 'tracking' : 'otomatis'} · gerakan`
  return 'manual'
}
function interpolateFocusTrack(track: FocusKeyframe[], time: number, axis: 'focal_x' | 'focal_y'): number | null {
  if (!track.length) return null
  const points = [...track].sort((a, b) => a.time - b.time)
  if (time <= points[0].time) return points[0][axis]
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const next = points[index]
    if (time <= next.time) {
      const fraction = next.time === previous.time ? 1 : (time - previous.time) / (next.time - previous.time)
      return previous[axis] + (next[axis] - previous[axis]) * fraction
    }
  }
  return points.at(-1)?.[axis] ?? null
}
function clipSubtitleLines(lines: TranscriptLine[], start: number, end: number): TranscriptLine[] {
  const clipped = lines
    .filter((line) => line.end > start && line.start < end)
    .map((line) => ({ ...line, start: Math.max(line.start, start), end: Math.min(line.end, end) }))
    .filter((line) => line.end > line.start)
    .sort((a, b) => a.start - b.start)
  const merged: TranscriptLine[] = []
  for (const line of clipped) {
    const previous = merged.at(-1)
    const isTiny = line.end - line.start < 0.35
    const previousIsTiny = previous && previous.end - previous.start < 0.35
    const combinedEnd = Math.max(previous?.end ?? line.end, line.end)
    if (previous && line.start - previous.end <= 0.3 && combinedEnd - previous.start <= 4.5 && (isTiny || previousIsTiny) && `${previous.text} ${line.text}`.length <= 2000) {
      previous.end = Math.max(previous.end, line.end)
      const nextText = line.text.trim()
      if (nextText && !previous.text.includes(nextText)) previous.text = `${previous.text.trim()} ${nextText}`.trim()
    } else merged.push({ ...line })
  }
  return merged
}

interface Props {
  t: Strings
  lang: Lang
  jobId: string
  videoUrl: string
  source: 'youtube' | 'drive' | 'upload'
  clips: ViralClip[]
  transcript: TranscriptLine[]
  marked: Record<string, boolean>
  onToggleMark: (key: string) => void
  onExit: () => void
}

export default function StudioOverlay({ t, lang, jobId, videoUrl, source, clips, transcript, marked, onToggleMark, onExit }: Props) {
  useFocusReturn()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const selected = clips.filter((clip) => marked[clipKey(clip)])
  const [settings, setSettings] = useState<StudioSettings>(() => readStudioDraft(jobId)?.settings ?? initialSettings)
  const [titles, setTitles] = useState<Record<string, string>>(() => readStudioDraft(jobId)?.titles ?? {})
  const [subtitleEdits, setSubtitleEdits] = useState<Record<string, TranscriptLine[]>>(() => readStudioDraft(jobId)?.subtitleEdits ?? {})
  const historyRef = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[]; current: EditorSnapshot | null; lastCommitAt: number }>({ past: [], future: [], current: null, lastCommitAt: 0 })
  const [historyRevision, setHistoryRevision] = useState(0)
  const [draftSaved, setDraftSaved] = useState(true)
  const [mobileView, setMobileView] = useState<'preview' | 'controls'>('preview')
  const [safe, setSafe] = useState(true)
  const [items, setItems] = useState<BatchItem[]>([])
  const [running, setRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [focusRequests, setFocusRequests] = useState<Record<string, boolean>>({})
  const focusRequestsRef = useRef(new Set<string>())
  const [cropAdjusting, setCropAdjusting] = useState(false)
  const [focusPreviews, setFocusPreviews] = useState<Record<string, FocusPreview>>({})
  const [focusPreviewStatuses, setFocusPreviewStatuses] = useState<Record<string, FocusPreviewStatus>>({})
  const [previewSelectionKey, setPreviewSelectionKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [assetBusy, setAssetBusy] = useState<'bgm' | 'sfx' | 'watermark' | null>(null)
  const [audioPreviewUrls, setAudioPreviewUrls] = useState<Partial<Record<'bgm' | 'sfx', string>>>({})
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string>()
  const [encoderCaps, setEncoderCaps] = useState<Record<'nvenc' | 'amf' | 'qsv' | 'cpu', boolean> | null>(null)
  const [aiFocusAvailable, setAiFocusAvailable] = useState(false)
  const [autoFocusAvailable, setAutoFocusAvailable] = useState(false)
  const [safePreset, setSafePreset] = useState<'general' | 'tiktok' | 'reels' | 'shorts'>('general')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewFrameRef = useRef<HTMLDivElement | null>(null)
  const layerDragRef = useRef<{ layer: 'title' | 'subtitle' | 'watermark'; pointerId: number; startX: number; startY: number; frameWidth: number; frameHeight: number; elementHeight: number; startSettings: StudioSettings; startSnapshot: EditorSnapshot } | null>(null)
  const focusDragRef = useRef<{ pointerId: number; startX: number; startY: number; startFocalX: number; startFocalY: number; overflowX: number; overflowY: number; startSnapshot: EditorSnapshot } | null>(null)
  const audioTimelineDragRef = useRef<{ kind: 'bgm' | 'sfx'; pointerId: number; left: number; width: number; duration: number; hookOffset: number; startSnapshot: EditorSnapshot } | null>(null)
  const [selectedLayer, setSelectedLayer] = useState<'title' | 'subtitle' | 'watermark' | null>(null)
  const audioObjectUrlsRef = useRef<string[]>([])
  const [previewTime, setPreviewTime] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [sourceVideoError, setSourceVideoError] = useState(false)
  const [previewLoop, setPreviewLoop] = useState(false)
  const [previewRate, setPreviewRate] = useState(1)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const previewLoopRef = useRef(previewLoop)
  const previewRateRef = useRef(previewRate)
  previewLoopRef.current = previewLoop
  previewRateRef.current = previewRate
  const [previewWidth, setPreviewWidth] = useState(0)
  const [previewHeight, setPreviewHeight] = useState(0)
  const [textLayersOverlap, setTextLayersOverlap] = useState(false)
  const [titleHexDraft, setTitleHexDraft] = useState(initialSettings.title_color)
  const [captionHexDraft, setCaptionHexDraft] = useState(initialSettings.caption_color)
  const [activeSubtitleEditIndex, setActiveSubtitleEditIndex] = useState<number | null>(null)
  const subtitleTimelineRef = useRef<HTMLDivElement>(null)
  const subtitleTimelineDragRef = useRef<{ index: number; mode: 'move' | 'start' | 'end'; x: number; start: number; end: number; moved: boolean; pointerId: number; snapshot: EditorSnapshot } | null>(null)
  const subtitleTimelineWasDraggedRef = useRef(false)
  const titleLayerRef = useRef<HTMLSpanElement | null>(null)
  const subtitleLayerRef = useRef<HTMLSpanElement | null>(null)
  const preview = selected.find((clip) => clipKey(clip) === previewSelectionKey) || selected[0]
  const currentSnapshot: EditorSnapshot = { settings, titles, subtitleEdits }
  if (!historyRef.current.current) historyRef.current.current = currentSnapshot
  const previewIdx = Math.max(0, selected.findIndex((clip) => clip === preview))
  const previewKey = preview ? clipKey(preview) : ''
  const firstPreviewSubtitle = preview
    ? subtitleEdits[previewKey]?.[0] ?? transcript.find((line) => line.end > preview.start_time && line.start < preview.end_time)
    : undefined
  // Start just inside the first caption so paused previews don't land in a tiny gap before its timestamp.
  const previewStartAt = preview
    ? Math.min(preview.end_time - 0.01, Math.max(preview.start_time, firstPreviewSubtitle?.start ?? preview.start_time) + 0.05)
    : 0
  const focusPreviewKey = preview ? `${clipKey(preview)}:${settings.aspect}` : ''
  const focusAnchor = settings.focus_anchors?.[focusPreviewKey] ?? 'center'
  const focusAnalysisKey = `${focusPreviewKey}:${focusAnchor}`
  const focusBusy = Object.keys(focusRequests).length > 0
  const focusBusyKey = focusRequests[focusAnalysisKey] ? focusAnalysisKey : ''
  const activeFocusKeyRef = useRef(focusAnalysisKey)
  activeFocusKeyRef.current = focusAnalysisKey
  const focusMode = settings.focus_modes?.[focusPreviewKey] ?? (settings.auto_focus ? 'auto' : 'manual')
  const manualFocus = settings.focus_overrides?.[focusPreviewKey] ?? { focal_x: settings.focal_x, focal_y: settings.focal_y }
  const focusPreview = focusMode === 'auto' ? focusPreviews[focusAnalysisKey] : undefined
  const trackTime = preview ? Math.max(0, previewTime - preview.start_time) : 0
  const trackedFocalX = focusPreview?.found && focusPreview.keyframes?.length ? interpolateFocusTrack(focusPreview.keyframes, trackTime, 'focal_x') : null
  const trackedFocalY = focusPreview?.found && focusPreview.keyframes?.length ? interpolateFocusTrack(focusPreview.keyframes, trackTime, 'focal_y') : null
  const previewFocalX = trackedFocalX ?? (focusPreview?.found ? focusPreview.focal_x : manualFocus.focal_x)
  const previewFocalY = trackedFocalY ?? (focusPreview?.found ? focusPreview.focal_y : manualFocus.focal_y)
  const focusPreviewStatus = focusPreviewStatuses[focusAnalysisKey]
  const isLetterbox = settings.aspect === '16:9'
  const isAutoFocusActive = focusMode === 'auto' && autoFocusAvailable && !isLetterbox
  const previewFocusLabel = isLetterbox
    ? 'Letterbox · tanpa crop'
    : focusMode === 'manual' || !autoFocusAvailable
      ? 'Crop manual'
      : focusBusyKey === focusAnalysisKey
      ? 'Menganalisis crop'
      : focusPreview?.found
        ? `${focusPreview.keyframes && focusPreview.keyframes.length > 1 ? 'Tracking' : 'Auto'} · ${focusModeLabel(focusPreview.mode)}`
        : focusPreviewStatus?.state === 'error'
          ? 'Analisis gagal · crop manual'
          : focusPreviewStatus?.state === 'not-found'
            ? 'Fokus tidak ditemukan · crop manual'
            : 'Auto · menunggu analisis'
  const previewMediaUrl = source === 'youtube'
    ? `/api/media/${encodeURIComponent(jobId)}/source`
    : videoUrl

  useEffect(() => {
    const video = videoRef.current
    const keyframes = focusPreview?.keyframes
    if (!video || !isAutoFocusActive || !focusPreview?.found || !keyframes?.length) return

    let animationFrame = 0
    let active = true
    const syncCropToVideo = () => {
      if (!active) return
      const clipTime = Math.max(0, video.currentTime - (preview?.start_time ?? 0))
      const focalX = interpolateFocusTrack(keyframes, clipTime, 'focal_x') ?? focusPreview.focal_x
      const focalY = interpolateFocusTrack(keyframes, clipTime, 'focal_y') ?? focusPreview.focal_y
      video.style.objectPosition = `${focalX}% ${focalY}%`
    }
    const stopAnimation = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      syncCropToVideo()
    }
    const animateCrop = () => {
      syncCropToVideo()
      if (!video.paused && !video.ended) animationFrame = window.requestAnimationFrame(animateCrop)
    }
    const startAnimation = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      syncCropToVideo()
      animationFrame = window.requestAnimationFrame(animateCrop)
    }

    video.addEventListener('play', startAnimation)
    video.addEventListener('pause', stopAnimation)
    video.addEventListener('seeked', syncCropToVideo)
    syncCropToVideo()
    if (!video.paused && !video.ended) startAnimation()

    return () => {
      active = false
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      video.removeEventListener('play', startAnimation)
      video.removeEventListener('pause', stopAnimation)
      video.removeEventListener('seeked', syncCropToVideo)
    }
  }, [focusMode, focusPreview, isAutoFocusActive, preview?.start_time])

  useEffect(() => {
    const root = dialogRef.current
    root?.focus()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = oldOverflow
    }
  }, [])

  const saveDraftNow = () => {
    try {
      localStorage.setItem(`eclipse-studio-draft-v1:${jobId}`, JSON.stringify({ settings, titles, subtitleEdits } satisfies StudioDraft))
      setDraftSaved(true)
      return true
    } catch {
      setDraftSaved(false)
      setError(t.studioDraftFailed)
      return false
    }
  }
  const requestExit = () => {
    if (running || assetBusy || focusBusy) {
      setNotice(t.studioBusyExit)
      return
    }
    if (saveDraftNow()) onExit()
  }

  useEffect(() => {
    const history = historyRef.current
    const previous = history.current
    if (!previous || (previous.settings === settings && previous.titles === titles && previous.subtitleEdits === subtitleEdits)) return
    const next = { settings, titles, subtitleEdits }
    if (layerDragRef.current || audioTimelineDragRef.current || subtitleTimelineDragRef.current) {
      history.current = next
      return
    }
    const now = performance.now()
    if (history.lastCommitAt === 0 || now - history.lastCommitAt > 450) {
      history.past.push(previous)
      if (history.past.length > 50) history.past.shift()
      setHistoryRevision((revision) => revision + 1)
    }
    history.future = []
    history.current = next
    history.lastCommitAt = now
  }, [settings, titles, subtitleEdits])

  const undoEdit = () => {
    const history = historyRef.current
    const previous = history.past.pop()
    if (!previous || !history.current) return
    history.future.push(history.current)
    history.current = previous
    history.lastCommitAt = 0
    setSettings(previous.settings)
    setTitles(previous.titles)
    setSubtitleEdits(previous.subtitleEdits)
    setHistoryRevision((revision) => revision + 1)
  }
  const redoEdit = () => {
    const history = historyRef.current
    const next = history.future.pop()
    if (!next || !history.current) return
    history.past.push(history.current)
    history.current = next
    history.lastCommitAt = 0
    setSettings(next.settings)
    setTitles(next.titles)
    setSubtitleEdits(next.subtitleEdits)
    setHistoryRevision((revision) => revision + 1)
  }
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      event.preventDefault()
      if (event.shiftKey) redoEdit()
      else undoEdit()
    }
    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [undoEdit, redoEdit])

  useEffect(() => {
    setDraftSaved(false)
    const timer = window.setTimeout(() => {
      saveDraftNow()
    }, 450)
    return () => window.clearTimeout(timer)
  }, [jobId, settings, titles, subtitleEdits])
  useEffect(() => () => { audioObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)) }, [])

  useEffect(() => {
    let active = true
    const restore = async (kind: 'bgm' | 'sfx', asset: string) => {
      if (!asset) { setAudioPreviewUrls((current) => ({ ...current, [kind]: undefined })); return }
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/studio-assets/${kind}/${encodeURIComponent(asset)}`, { credentials: 'include' })
        if (!response.ok) throw new Error('Aset audio tidak tersedia untuk pratinjau.')
        const url = URL.createObjectURL(await response.blob())
        if (!active) { URL.revokeObjectURL(url); return }
        audioObjectUrlsRef.current.push(url)
        setAudioPreviewUrls((current) => {
          if (current[kind]) URL.revokeObjectURL(current[kind]!)
          return { ...current, [kind]: url }
        })
      } catch {
        if (active) setAudioPreviewUrls((current) => ({ ...current, [kind]: undefined }))
      }
    }
    void restore('bgm', settings.bgm_asset)
    void restore('sfx', settings.sfx_asset)
    return () => { active = false }
  }, [jobId, settings.bgm_asset, settings.sfx_asset])

  useEffect(() => {
    videoRef.current?.pause()
    setPreviewPlaying(false)
    setPreviewTime(previewStartAt)
    if (videoRef.current && preview) videoRef.current.currentTime = previewStartAt
    if (preview) {
      const key = clipKey(preview)
      setSubtitleEdits((current) => current[key] ? current : {
        ...current,
        [key]: clipSubtitleLines(transcript, preview.start_time, preview.end_time),
      })
    }
  }, [previewKey, preview?.start_time, preview?.end_time, transcript])

  useEffect(() => {
    const updateFullscreen = () => setPreviewFullscreen(document.fullscreenElement === previewFrameRef.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (!preview) return
    const key = clipKey(preview)
    const existing = subtitleEdits[key]
    if (!existing) return
    const cleaned = clipSubtitleLines(existing, preview.start_time, preview.end_time)
    if (cleaned.length !== existing.length || cleaned.some((line, index) => line.start !== existing[index]?.start || line.end !== existing[index]?.end || line.text !== existing[index]?.text)) {
      setSubtitleEdits((current) => ({ ...current, [key]: cleaned }))
    }
  }, [preview?.start_time, preview?.end_time, previewKey, subtitleEdits])

  useEffect(() => {
    const element = previewFrameRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setPreviewWidth(entry.contentRect.width)
      setPreviewHeight(entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = previewRate
  }, [previewRate])

  useEffect(() => {
    setSourceVideoError(false)
  }, [previewMediaUrl])

  useEffect(() => {
    if (!settings.watermark_asset || settings.watermark_type !== 'logo') {
      setWatermarkPreviewUrl(undefined)
      return
    }
    let active = true
    void fetch(`/api/jobs/${encodeURIComponent(jobId)}/studio-assets/watermark/${encodeURIComponent(settings.watermark_asset)}`, { credentials: 'include' })
      .then((response) => { if (!response.ok) throw new Error('Logo watermark tidak tersedia untuk pratinjau.'); return response.blob() })
      .then((blob) => {
        if (!active) return
        const url = URL.createObjectURL(blob)
        audioObjectUrlsRef.current.push(url)
        setWatermarkPreviewUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url })
      })
      .catch(() => { if (active) setWatermarkPreviewUrl(undefined) })
    return () => { active = false }
  }, [jobId, settings.watermark_asset, settings.watermark_type])

  useEffect(() => {
    let active = true
    void getRenderCapabilities().then((result) => {
      if (active) setEncoderCaps(result.encoders)
      if (active) setAiFocusAvailable(result.ai_focus)
      if (active) setAutoFocusAvailable(result.auto_focus)
    }).catch(() => {
      if (active) setEncoderCaps({ nvenc: false, amf: false, qsv: false, cpu: true })
      if (active) setAiFocusAvailable(false)
      if (active) setAutoFocusAvailable(false)
    })
    return () => { active = false }
  }, [])

  const startBatch = async () => {
    if (running || selected.length === 0) return
    if (subtitleValidationError) {
      setError('Periksa subtitle: waktu harus berada di dalam klip, waktu mulai sebelum selesai, dan teks tidak boleh kosong.')
      return
    }
    if (settings.watermark_enabled && settings.watermark_type === 'text' && !settings.watermark_text.trim()) {
      setError('Isi teks/handle watermark atau nonaktifkan watermark sebelum mengekspor.')
      return
    }
    if (settings.watermark_enabled && settings.watermark_type === 'logo' && !settings.watermark_asset) {
      setError('Unggah logo watermark atau nonaktifkan watermark sebelum mengekspor.')
      return
    }
    if (selected.length > 5) {
      setError('Maksimal 5 klip untuk satu batch ekspor.')
      return
    }
    setError(null)
    setNotice(null)
    setRunning(true)
    setBatchProgress(0)
    setItems(selected.map((clip, index) => ({ key: clipKey(clip), title: clip.title, status: index === 0 ? 'running' : 'queued' })))
    try {
      const clientJobId = `render-${crypto.randomUUID().replaceAll('-', '')}`
      let requestFinished = false
      let requestError: unknown = null
      const request = renderBatch(jobId, clientJobId, selected, titles, subtitleEdits, settings).catch((cause) => {
        requestError = cause
        throw cause
      }).finally(() => { requestFinished = true })
      let response: Awaited<typeof request> | null = null
      while (!response) {
        let progress: Awaited<ReturnType<typeof getJobProgress>>
        try {
          progress = await getJobProgress(clientJobId)
        } catch (cause) {
          if (requestFinished && requestError) throw requestError
          const detail = cause as { code?: string }
          if (detail.code !== 'unknown' && detail.code !== 'backend_offline') throw cause
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          continue
        }
        setBatchProgress(progress.progress)
        const completed = new Map((progress.outputs || []).map((output) => [output.key, output]))
        const currentIndex = Math.min(selected.length - 1, Math.floor(Math.max(0, progress.progress - 10) / 90 * selected.length))
        setItems((current) => current.map((item, index) => {
          const output = completed.get(item.key)
          if (output) return { ...item, status: 'done', downloadUrl: output.download_url, focusDetection: output.focus_detection }
          if (progress.status === 'error') return { ...item, status: 'error' }
          return { ...item, status: progress.status === 'done' ? 'done' : index === currentIndex ? 'running' : index < currentIndex ? 'done' : 'queued' }
        }))
        if (progress.status === 'error') throw new Error(progress.error || 'Render batch gagal.')
        if (progress.status === 'done') response = await request
        else if (requestFinished && requestError) throw requestError
        else await new Promise((resolve) => window.setTimeout(resolve, 700))
      }
      const outputs = new Map<string, RenderOutput>(response.outputs.map((output) => [output.key, output]))
      setBatchProgress(100)
      const notes: string[] = []
      if (response.outputs.some((output) => output.subtitle_mode === 'track')) {
        notes.push(t.renderSoftSubNote)
      }
      const fallbackCount = response.outputs.filter((output) => output.focus_detection?.mode === 'manual-fallback' || output.focus_detection?.mode === 'unavailable').length
      const motionCount = response.outputs.filter((output) => output.focus_detection?.mode === 'motion').length
      const personCount = response.outputs.filter((output) => output.focus_detection?.mode === 'person').length
      if (fallbackCount) notes.push(`${fallbackCount} klip memakai crop manual karena deteksi otomatis tidak menemukan fokus.`)
      if (personCount) notes.push(`${personCount} klip memakai deteksi AI orang karena wajah tidak terdeteksi stabil.`)
      if (motionCount) notes.push(`${motionCount} klip memakai fallback gerakan karena target wajah/orang tidak terdeteksi stabil.`)
      setNotice(notes.join(' '))
      setItems((current) => current.map((item) => {
        const output = outputs.get(item.key)
        return output
          ? { ...item, status: 'done', downloadUrl: output.download_url, focusDetection: output.focus_detection }
          : { ...item, status: 'error' }
      }))
    } catch (cause) {
      setError(getCaughtErrorMessage(cause, lang))
      setItems((current) => current.map((item) => item.status === 'done' ? item : ({ ...item, status: 'error' })))
    } finally {
      setRunning(false)
    }
  }

  const detectPreviewFocus = async () => {
    if (!preview || !autoFocusAvailable || settings.aspect === '16:9') return
    const key = focusAnalysisKey
    if (focusRequestsRef.current.has(key)) return
    const clipNumber = previewIdx + 1
    focusRequestsRef.current.add(key)
    setFocusRequests((current) => ({ ...current, [key]: true }))
    setFocusPreviewStatuses((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setError(null)
    setNotice(source === 'youtube'
      ? 'Menyiapkan video lokal untuk mencocokkan crop preview.'
      : 'Menghitung crop fokus untuk klip ini…')
    try {
      const focus = await getFocusPreview(jobId, preview.start_time, preview.end_time, settings.aspect, focusAnchor)
      setFocusPreviews((current) => ({ ...current, [key]: focus }))
      if (!focus.found) {
        setFocusPreviewStatuses((current) => ({ ...current, [key]: { state: 'not-found' } }))
      }
      if (activeFocusKeyRef.current === key) {
        if (focus.found) {
          setNotice(`Crop otomatis klip ${clipNumber} siap (${focusModeLabel(focus.mode)}). Anda dapat mengunci posisi ini dengan mode manual.`)
        } else {
          setNotice('Fokus visual tidak ditemukan di preview. Posisi manual tetap dipakai; ekspor akan mencoba analisis ulang.')
        }
      }
    } catch (cause) {
      const message = getCaughtErrorMessage(cause, lang)
      setFocusPreviewStatuses((current) => ({ ...current, [key]: { state: 'error', message } }))
      if (activeFocusKeyRef.current === key) {
        setNotice(null)
        setError(message)
      }
    } finally {
      focusRequestsRef.current.delete(key)
      setFocusRequests((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }

  useEffect(() => {
    if (settings.aspect !== '16:9' && focusMode === 'auto' && autoFocusAvailable && preview && !focusPreviews[focusAnalysisKey]) void detectPreviewFocus()
  }, [focusMode, autoFocusAvailable, focusAnalysisKey, settings.aspect])

  useEffect(() => {
    if (settings.aspect === '16:9') setCropAdjusting(false)
  }, [settings.aspect])

  const setManualFocus = (focalX: number, focalY = settings.focal_y) => {
    if (!focusPreviewKey) return
    setSettings((current) => ({
      ...current,
      focus_modes: { ...current.focus_modes, [focusPreviewKey]: 'manual' },
      focus_overrides: { ...current.focus_overrides, [focusPreviewKey]: { focal_x: focalX, focal_y: focalY } },
    }))
  }

  const setFocusAnchor = (anchor: 'left' | 'center' | 'right') => {
    if (!focusPreviewKey) return
    setSettings((current) => ({
      ...current,
      focus_anchors: { ...current.focus_anchors, [focusPreviewKey]: anchor },
    }))
  }

  const setCurrentFocusMode = (mode: 'auto' | 'manual') => {
    if (!focusPreviewKey) return
    setSettings((current) => {
      const focus_overrides = { ...current.focus_overrides }
      if (mode === 'manual' && focusMode === 'auto' && focusPreview?.found) {
        focus_overrides[focusPreviewKey] = { focal_x: Math.round(previewFocalX), focal_y: Math.round(previewFocalY) }
      }
      return { ...current, focus_modes: { ...current.focus_modes, [focusPreviewKey]: mode }, focus_overrides }
    })
  }

  const resetCurrentFocus = () => setManualFocus(50, 50)

  const applyFocusToSelected = () => {
    if (!preview || !focusPreviewKey) return
    const crop = { focal_x: previewFocalX, focal_y: previewFocalY }
    setSettings((current) => {
      const focus_overrides = { ...current.focus_overrides }
      const focus_modes = { ...current.focus_modes }
      for (const clip of selected) {
        const key = `${clipKey(clip)}:${current.aspect}`
        focus_overrides[key] = crop
        focus_modes[key] = 'manual'
      }
      return { ...current, focus_overrides, focus_modes }
    })
    setNotice(`Posisi crop diterapkan ke ${selected.length} klip terpilih.`)
  }

  const startFocusDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropAdjusting || event.button !== 0 || !previewFrameRef.current) return
    const frame = previewFrameRef.current.getBoundingClientRect()
    const frameRatio = frame.width / frame.height
    const sourceRatio = source === 'youtube'
      ? 16 / 9
      : (videoRef.current?.videoWidth && videoRef.current?.videoHeight ? videoRef.current.videoWidth / videoRef.current.videoHeight : 16 / 9)
    const renderedWidth = sourceRatio > frameRatio ? frame.height * sourceRatio : frame.width
    const renderedHeight = sourceRatio > frameRatio ? frame.height : frame.width / sourceRatio
    const overflowX = source === 'youtube' ? Math.max(0, frame.width * (youtubeFrameWidth / 100 - 1)) : Math.max(0, renderedWidth - frame.width)
    const overflowY = source === 'youtube' ? 0 : Math.max(0, renderedHeight - frame.height)
    focusDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startFocalX: previewFocalX, startFocalY: previewFocalY, overflowX, overflowY, startSnapshot: historyRef.current.current ?? currentSnapshot }
    event.currentTarget.setPointerCapture(event.pointerId)
    setCurrentFocusMode('manual')
    event.preventDefault()
  }

  const moveFocusDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = focusDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const focalX = drag.overflowX > 0 ? drag.startFocalX - (event.clientX - drag.startX) / drag.overflowX * 100 : drag.startFocalX
    const focalY = drag.overflowY > 0 ? drag.startFocalY - (event.clientY - drag.startY) / drag.overflowY * 100 : drag.startFocalY
    setManualFocus(Math.round(Math.max(0, Math.min(100, focalX))), Math.round(Math.max(0, Math.min(100, focalY))))
    event.preventDefault()
  }

  const endFocusDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = focusDragRef.current
    if (drag?.pointerId !== event.pointerId) return
    focusDragRef.current = null
    commitHistoryDrag(drag.startSnapshot)
  }

  const currentTitle = preview ? titles[clipKey(preview)] ?? preview.title : ''
  const setCurrentTitle = (value: string) => {
    if (!preview) return
    setTitles((current) => ({ ...current, [clipKey(preview)]: value }))
  }
  const currentKey = preview ? clipKey(preview) : ''
  const currentSegments = preview
    ? subtitleEdits[currentKey] ?? clipSubtitleLines(transcript, preview.start_time, preview.end_time)
    : []
  const invalidSubtitleKeys = selected.filter((clip) => {
    const key = clipKey(clip)
    const segments = subtitleEdits[key] ?? clipSubtitleLines(transcript, clip.start_time, clip.end_time)
    const invalid = segments.some((line) =>
      !Number.isFinite(line.start) || !Number.isFinite(line.end) ||
      line.start < clip.start_time || line.end > clip.end_time ||
      line.end <= line.start || !line.text.trim(),
    )
    const ordered = [...segments].sort((a, b) => a.start - b.start)
    return invalid || ordered.some((line, index) => index > 0 && line.start < ordered[index - 1].end - 0.01)
  }).map(clipKey)
  const subtitleValidationError = invalidSubtitleKeys.length > 0
  const watermarkValidationError = settings.watermark_enabled && (settings.watermark_type === 'text' ? !settings.watermark_text.trim() : !settings.watermark_asset)
  const selectPreviewClip = (key: string) => {
    setPreviewSelectionKey(key)
    setMobileView('controls')
  }
  const currentSubtitleLine = settings.caption !== 'off' ? currentSegments.find((line) => previewTime >= line.start && previewTime < line.end) : undefined
  const canAnimateSubtitleOut = ['fade', 'slide_up', 'slide_left', 'slide_right'].includes(settings.caption_animation)
  const outgoingSubtitleLine = !currentSubtitleLine && canAnimateSubtitleOut
    ? [...currentSegments].reverse().find((line) => previewTime >= line.end && previewTime - line.end < settings.caption_animation_duration_ms / 1000)
    : undefined
  const activeSubtitleLine = currentSubtitleLine ?? outgoingSubtitleLine
  const activeSubtitle = activeSubtitleLine?.text ?? ''
  const activeSubtitleAnimationDurationMs = activeSubtitleLine ? Math.min(settings.caption_animation_duration_ms, Math.max(100, Math.round((activeSubtitleLine.end - activeSubtitleLine.start) * 500))) : settings.caption_animation_duration_ms
  const subtitleElapsed = activeSubtitleLine ? Math.max(0, previewTime - activeSubtitleLine.start) : 0
  const subtitleRevealProgress = activeSubtitleLine ? Math.max(0, Math.min(1, subtitleElapsed / Math.max(0.1, settings.caption_animation_duration_ms / 1000))) : 1
  const displayedSubtitle = settings.caption_animation === 'typewriter'
    ? Array.from(activeSubtitle).slice(0, Math.ceil(Array.from(activeSubtitle).length * subtitleRevealProgress)).join('')
    : activeSubtitle
  const karaokeTokens = settings.caption_animation === 'karaoke' ? (activeSubtitle.match(/\s+|\S+/gu) ?? []) : []
  const karaokeTotalWeight = karaokeTokens.reduce((sum, token) => sum + (token.trim() ? Array.from(token).length : 0), 0)
  const karaokeProgress = activeSubtitleLine ? Math.max(0, Math.min(1, subtitleElapsed / Math.max(0.01, activeSubtitleLine.end - activeSubtitleLine.start))) : 0
  let karaokeWeightPassed = 0
  const renderedSubtitle = settings.caption_animation === 'karaoke'
    ? karaokeTokens.map((token, index) => {
      const wordWeight = token.trim() ? Array.from(token).length : 0
      karaokeWeightPassed += wordWeight
      return <span key={`${index}-${token}`} className={wordWeight && karaokeTotalWeight > 0 && karaokeWeightPassed / karaokeTotalWeight <= karaokeProgress ? 'studio-subtitle-karaoke-word--active' : undefined} style={{ '--studio-caption-karaoke-color': settings.caption_karaoke_color } as ReactCSSProperties}>{token}</span>
    })
    : displayedSubtitle
  const titleAnimationWindow = settings.title_animation_duration_ms / 1000
  const titleAnimationClass = settings.title_animation === 'none' || !preview ? ''
    : previewTime < preview.start_time + titleAnimationWindow ? `studio-preview-anim--${settings.title_animation === 'fade' ? 'fade-in' : 'slide-in'}`
      : previewTime > preview.end_time - titleAnimationWindow ? `studio-preview-anim--${settings.title_animation === 'fade' ? 'fade-out' : 'slide-out'}` : ''
  const captionAnimationClass = !activeSubtitleLine || ['none', 'typewriter', 'wipe', 'karaoke'].includes(settings.caption_animation) ? ''
    : outgoingSubtitleLine ? `studio-preview-anim--${settings.caption_animation === 'fade' ? 'fade-out' : settings.caption_animation === 'slide_left' ? 'slide-left-out' : settings.caption_animation === 'slide_right' ? 'slide-right-out' : 'slide-out'}`
      : subtitleElapsed < activeSubtitleAnimationDurationMs / 1000 ? `studio-preview-anim--${settings.caption_animation === 'fade' ? 'fade-in' : settings.caption_animation === 'pop' ? 'pop-in' : settings.caption_animation === 'slide_left' ? 'slide-left-in' : settings.caption_animation === 'slide_right' ? 'slide-right-in' : 'slide-in'}`
        : activeSubtitleLine.end - previewTime < activeSubtitleAnimationDurationMs / 1000 && ['fade', 'slide_up', 'slide_left', 'slide_right'].includes(settings.caption_animation) ? `studio-preview-anim--${settings.caption_animation === 'fade' ? 'fade-out' : settings.caption_animation === 'slide_left' ? 'slide-left-out' : settings.caption_animation === 'slide_right' ? 'slide-right-out' : 'slide-out'}` : ''
  const activeSubtitleIndex = activeSubtitleLine ? currentSegments.indexOf(activeSubtitleLine) : -1
  const selectedSubtitleTimelineIndex = activeSubtitleIndex >= 0 ? activeSubtitleIndex : activeSubtitleEditIndex
  const updateSegment = (index: number, changes: Partial<TranscriptLine>) => {
    if (!preview) return
    setSubtitleEdits((current) => ({
      ...current,
      [currentKey]: currentSegments.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line),
    }))
  }
  const startSubtitleTimelineDrag = (index: number, mode: 'move' | 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement | HTMLSpanElement | HTMLDivElement>) => {
    if (!preview || event.button !== 0) return
    const line = currentSegments[index]
    if (!line) return
    subtitleTimelineDragRef.current = { index, mode, x: event.clientX, start: line.start, end: line.end, moved: false, pointerId: event.pointerId, snapshot: historyRef.current.current ?? currentSnapshot }
    subtitleTimelineWasDraggedRef.current = false
    setActiveSubtitleEditIndex(index)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveSubtitleTimeline = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = subtitleTimelineDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !preview) return
    const rect = subtitleTimelineRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    const delta = (event.clientX - drag.x) / rect.width * (preview.end_time - preview.start_time)
    if (Math.abs(event.clientX - drag.x) > 3) {
      drag.moved = true
      subtitleTimelineWasDraggedRef.current = true
    }
    if (!drag.moved) return
    const minLength = 0.12
    const clipStart = preview.start_time
    const clipEnd = preview.end_time
    let start = drag.start
    let end = drag.end
    if (drag.mode === 'move') {
      const boundedDelta = Math.max(clipStart - drag.start, Math.min(clipEnd - drag.end, delta))
      start += boundedDelta
      end += boundedDelta
    } else if (drag.mode === 'start') start = Math.max(clipStart, Math.min(drag.end - minLength, drag.start + delta))
    else end = Math.min(clipEnd, Math.max(drag.start + minLength, drag.end + delta))
    start = Number(start.toFixed(2))
    end = Number(end.toFixed(2))
    setSubtitleEdits((current) => ({ ...current, [currentKey]: currentSegments.map((line, lineIndex) => lineIndex === drag.index ? { ...line, start, end } : line) }))
  }
  const endSubtitleTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = subtitleTimelineDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    subtitleTimelineDragRef.current = null
    if (drag.moved) commitHistoryDrag(drag.snapshot)
  }
  const nudgeSubtitleTimelineBoundary = (index: number, boundary: 'start' | 'end', delta: number) => {
    if (!preview) return
    const line = currentSegments[index]
    if (!line) return
    const minLength = 0.12
    if (boundary === 'start') updateSegment(index, { start: Math.max(preview.start_time, Math.min(line.end - minLength, line.start + delta)) })
    else updateSegment(index, { end: Math.min(preview.end_time, Math.max(line.start + minLength, line.end + delta)) })
  }
  const resetSegments = () => {
    if (!preview) return
    setSubtitleEdits((current) => ({
      ...current,
      [currentKey]: clipSubtitleLines(transcript, preview.start_time, preview.end_time),
    }))
    setActiveSubtitleEditIndex(null)
  }
  const addSegment = () => {
    if (!preview) return
    const ordered = [...currentSegments].sort((a, b) => a.start - b.start)
    let cursor = preview.start_time
    let start: number | null = null
    for (const line of ordered) {
      if (line.start - cursor >= 0.3) { start = cursor; break }
      cursor = Math.max(cursor, line.end)
    }
    if (start === null && preview.end_time - cursor >= 0.3) start = cursor
    if (start === null) return
    const end = Math.min(preview.end_time, start + 2)
    const newLine = { start, end, text: 'Teks subtitle baru' }
    const insertedAt = currentSegments.filter((line) => line.start <= start).length
    setSubtitleEdits((current) => ({ ...current, [currentKey]: [...currentSegments, newLine].sort((a, b) => a.start - b.start) }))
    setActiveSubtitleEditIndex(insertedAt)
    seekPreview(start)
  }
  const removeSegment = (index: number) => {
    if (!preview) return
    setSubtitleEdits((current) => ({ ...current, [currentKey]: currentSegments.filter((_, lineIndex) => lineIndex !== index) }))
    setActiveSubtitleEditIndex((current) => current === index ? null : current !== null && current > index ? current - 1 : current)
  }
  const seekPreview = (time: number) => {
    if (!preview) return
    const target = Math.max(preview.start_time, Math.min(preview.end_time - 0.04, time))
    setPreviewTime(target)
    if (videoRef.current) videoRef.current.currentTime = target
  }
  const seekPreviewBy = (seconds: number) => seekPreview(previewTime + seconds)
  const togglePreviewPlayback = () => {
    if (!preview) return
    const video = videoRef.current
    if (!video) return
    if (!video.paused) video.pause()
    else {
      if (previewTime >= preview.end_time - 0.08) seekPreview(preview.start_time)
      void video.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false))
    }
  }
  const selectAdjacentPreview = (delta: number) => {
    const target = selected[previewIdx + delta]
    if (!target) return
    setPreviewSelectionKey(clipKey(target))
  }
  const openStudioStep = (index: number) => {
    setMobileView('controls')
    const step = dialogRef.current?.querySelectorAll<HTMLDetailsElement>('.studio-step')[index]
    if (step) {
      step.open = true
      window.requestAnimationFrame(() => step.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }
  const previewAtEnd = Boolean(preview && previewTime >= preview.end_time - 0.08 && !previewPlaying)
  const togglePreviewFullscreen = () => {
    const frame = previewFrameRef.current
    if (!frame) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else if (frame.requestFullscreen) void frame.requestFullscreen().catch(() => undefined)
  }
  const handleAsset = async (kind: 'bgm' | 'sfx' | 'watermark', file?: File) => {
    if (!file) return
    setAssetBusy(kind)
    setError(null)
    try {
      const result = await uploadStudioAsset(jobId, kind, file)
      setSettings((current) => ({ ...current, [kind === 'bgm' ? 'bgm_asset' : kind === 'sfx' ? 'sfx_asset' : 'watermark_asset']: result.asset }))
      if (kind === 'watermark') {
        const localUrl = URL.createObjectURL(file)
        audioObjectUrlsRef.current.push(localUrl)
        setWatermarkPreviewUrl(localUrl)
        setNotice('Logo watermark tersimpan untuk render klip ini.')
        return
      }
      const localUrl = URL.createObjectURL(file)
      audioObjectUrlsRef.current.push(localUrl)
      setAudioPreviewUrls((current) => ({ ...current, [kind]: localUrl }))
      setNotice(`${kind === 'bgm' ? 'Musik latar' : 'Efek suara'} tersimpan untuk render klip ini.`)
    } catch (cause) {
      setError(getCaughtErrorMessage(cause, lang))
    } finally {
      setAssetBusy(null)
    }
  }
  const outputAspect = settings.aspect === '16:9-landscape' ? '16 / 9' : settings.aspect === '1:1' ? '1 / 1' : settings.aspect === '4:3' ? '4 / 3' : '9 / 16'
  const outputResolution = settings.aspect === '16:9-landscape' ? [1920, 1080] : settings.aspect === '1:1' ? [1080, 1080] : settings.aspect === '4:3' ? [1440, 1080] : [1080, 1920]
  const previewDuration = preview ? Math.max(0.01, preview.end_time - preview.start_time) : 0
  const bgmStartPercent = previewDuration ? Math.min(100, settings.bgm_start_ms / (previewDuration * 10)) : 0
  const sfxAtPercent = previewDuration && preview ? Math.max(0, Math.min(100, (preview.hook_time - preview.start_time + settings.sfx_offset_ms / 1000) / previewDuration * 100)) : 0
  const audioPlayheadPercent = previewDuration && preview ? Math.max(0, Math.min(100, (previewTime - preview.start_time) / previewDuration * 100)) : 0
  const watermarkPreviewFontSize = Math.max(16, 1080 * 0.035 * settings.watermark_size / 20) * Math.min(previewWidth / outputResolution[0], previewHeight / outputResolution[1])
  const previewAspectValue = settings.aspect === '16:9-landscape' ? 16 / 9 : settings.aspect === '1:1' ? 1 : settings.aspect === '4:3' ? 4 / 3 : 9 / 16
  const youtubeLetterbox = settings.aspect === '16:9'
  const youtubeFrameWidth = youtubeLetterbox ? 100 : Math.max(100, (16 / 9 / previewAspectValue) * 100)
  const youtubeFrameHeight = youtubeLetterbox ? (previewAspectValue / (16 / 9)) * 100 : 100
  const youtubeFrameLeft = youtubeLetterbox ? 0 : -(youtubeFrameWidth - 100) * previewFocalX / 100
  const youtubeFrameTop = youtubeLetterbox ? 50 : 0
  const aspectDisplayName = settings.aspect === '16:9' ? `16:9 ${t.studioAspectLetterbox}` : settings.aspect === '16:9-landscape' ? `16:9 ${t.studioAspectLandscape}` : settings.aspect
  const aspectHelp = settings.aspect === '16:9'
    ? t.studioAspectLetterboxHelp(outputResolution[0], outputResolution[1])
    : settings.aspect === '16:9-landscape'
      ? t.studioAspectLandscapeHelp(outputResolution[0], outputResolution[1])
      : t.studioAspectCropHelp(settings.aspect, outputResolution[0], outputResolution[1])
  const previewScale = previewWidth / 1080
  const titleFontSize = Math.max(36, Math.min(120, settings.title_size)) * previewScale
  const subtitleFontSize = Math.max(18, settings.caption_size * 0.75) * previewScale
  const titlePreview = `${settings.title_prefix}${currentTitle}${settings.title_suffix}`.trim()
  const titleRgb = parseHexColor(settings.title_color)
  const titleEffectStyle: ReactCSSProperties & { '--studio-title-effect-color': string } = { '--studio-title-effect-color': settings.title_effect_color }
  const captionRgb = parseHexColor(settings.caption_color)
  const captionEffectStyle: ReactCSSProperties & { '--studio-caption-effect-color': string } = { '--studio-caption-effect-color': settings.caption_effect_color }
  const selectedCaptionPreset = studioSubtitlePresets.find((preset) => preset.id === settings.caption)
  const captionValidationMessages = currentSegments.map((line, index) => {
    if (!Number.isFinite(line.start) || !Number.isFinite(line.end)) return 'Waktu harus berupa angka.'
    if (line.start < (preview?.start_time ?? 0) || line.end > (preview?.end_time ?? 0) || line.end <= line.start) return 'Rentang waktu berada di luar klip atau tidak valid.'
    if (!line.text.trim()) return 'Teks subtitle tidak boleh kosong.'
    if (currentSegments.some((other, otherIndex) => otherIndex !== index && line.start < other.end - 0.01 && line.end > other.start + 0.01)) return 'Rentang waktunya bertumpuk dengan baris subtitle lain.'
    return ''
  })
  const subtitleAddAvailable = Boolean(preview && currentSegments.length < 300 && (() => {
    const ordered = [...currentSegments].sort((a, b) => a.start - b.start)
    let cursor = preview.start_time
    for (const line of ordered) {
      if (line.start - cursor >= 0.3) return true
      cursor = Math.max(cursor, line.end)
    }
    return preview.end_time - cursor >= 0.3
  })())

  useEffect(() => {
    const title = titleLayerRef.current
    const subtitle = subtitleLayerRef.current
    if (!title || !subtitle || !activeSubtitle || !titlePreview.trim()) {
      setTextLayersOverlap(false)
      return
    }
    const titleRect = title.getBoundingClientRect()
    const subtitleRect = subtitle.getBoundingClientRect()
    const overlaps = titleRect.left < subtitleRect.right && titleRect.right > subtitleRect.left && titleRect.top < subtitleRect.bottom && titleRect.bottom > subtitleRect.top
    setTextLayersOverlap(overlaps)
  }, [activeSubtitle, currentTitle, titlePreview, previewWidth, previewHeight, settings.aspect, settings.title_x, settings.title_y, settings.title_size, settings.caption_x, settings.caption_y, settings.caption_size])
  useEffect(() => setTitleHexDraft(settings.title_color.toUpperCase()), [settings.title_color])
  useEffect(() => setCaptionHexDraft(settings.caption_color.toUpperCase()), [settings.caption_color])
  useEffect(() => setActiveSubtitleEditIndex(null), [previewKey])
  const filenamePreview = [settings.filename_prefix, titlePreview || currentTitle, settings.filename_suffix].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^[-._]+|[-._]+$/g, '') || 'clip'
  const startLayerDrag = (layer: 'title' | 'subtitle' | 'watermark', event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !previewFrameRef.current) return
    const frame = previewFrameRef.current.getBoundingClientRect()
    const element = event.currentTarget.getBoundingClientRect()
    layerDragRef.current = { layer, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, frameWidth: frame.width, frameHeight: frame.height, elementHeight: element.height, startSettings: settings, startSnapshot: historyRef.current.current ?? currentSnapshot }
    setSelectedLayer(layer)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }
  const commitHistoryDrag = (startSnapshot: EditorSnapshot) => {
    const history = historyRef.current
    const current = history.current
    if (!current || (current.settings === startSnapshot.settings && current.titles === startSnapshot.titles && current.subtitleEdits === startSnapshot.subtitleEdits)) return
    history.past.push(startSnapshot)
    if (history.past.length > 50) history.past.shift()
    history.future = []
    history.lastCommitAt = 0
    setHistoryRevision((revision) => revision + 1)
  }
  const startAudioTimelineDrag = (kind: 'bgm' | 'sfx', event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !preview) return
    const rect = event.currentTarget.getBoundingClientRect()
    audioTimelineDragRef.current = { kind, pointerId: event.pointerId, left: rect.left, width: rect.width, duration: previewDuration, hookOffset: preview.hook_time - preview.start_time, startSnapshot: historyRef.current.current ?? currentSnapshot }
    event.currentTarget.setPointerCapture(event.pointerId)
    moveAudioTimeline(event)
    event.preventDefault()
  }
  const moveAudioTimeline = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = audioTimelineDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const fraction = Math.max(0, Math.min(1, (event.clientX - drag.left) / drag.width))
    if (drag.kind === 'bgm') setSettings((current) => ({ ...current, bgm_start_ms: Math.round(Math.min(15_000, drag.duration * fraction * 1000) / 100) * 100 }))
    else setSettings((current) => ({ ...current, sfx_offset_ms: Math.max(-5000, Math.min(5000, Math.round((drag.duration * fraction - drag.hookOffset) * 1000 / 100) * 100)) }))
    event.preventDefault()
  }
  const endAudioTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = audioTimelineDragRef.current
    if (drag?.pointerId !== event.pointerId) return
    audioTimelineDragRef.current = null
    commitHistoryDrag(drag.startSnapshot)
  }
  const moveLayer = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = layerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.startX) / drag.frameWidth * 100
    const dy = (event.clientY - drag.startY) / drag.frameHeight * 100
    const origin = drag.startSettings
    const snap = (value: number, target = 50) => Math.abs(value - target) <= 2 ? target : value
    const centeredTop = (drag.frameHeight - drag.elementHeight) / 2 / drag.frameHeight * 100
    const centeredBottom = 50 - drag.elementHeight / 2 / drag.frameHeight * 100
    if (drag.layer === 'title') setSettings({ ...origin, title_x: Math.round(Math.max(8, Math.min(92, snap(origin.title_x + dx)))), title_y: Math.round(Math.max(0, Math.min(76, snap(origin.title_y + dy, centeredTop)))) })
    else if (drag.layer === 'subtitle') setSettings({ ...origin, caption_x: Math.round(Math.max(8, Math.min(92, snap(origin.caption_x + dx)))), caption_y: Math.round(Math.max(0, Math.min(60, snap(origin.caption_y - dy, centeredBottom)))) })
    else setSettings({ ...origin, watermark_x: Math.round(Math.max(0, Math.min(100, origin.watermark_x + dx))), watermark_y: Math.round(Math.max(0, Math.min(100, origin.watermark_y + dy))) })
    event.preventDefault()
  }
  const endLayerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = layerDragRef.current
    if (drag?.pointerId !== event.pointerId) return
    layerDragRef.current = null
    commitHistoryDrag(drag.startSnapshot)
  }
  const nudgeLayer = (layer: 'title' | 'subtitle' | 'watermark', event: ReactKeyboardEvent<HTMLElement>) => {
    const amount = event.shiftKey ? 5 : 1
    const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0
    const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0
    if (!dx && !dy) return
    event.preventDefault()
    setSelectedLayer(layer)
    if (layer === 'title') setSettings((current) => ({ ...current, title_x: Math.max(8, Math.min(92, current.title_x + dx)), title_y: Math.max(0, Math.min(76, current.title_y + dy)) }))
    else if (layer === 'subtitle') setSettings((current) => ({ ...current, caption_x: Math.max(8, Math.min(92, current.caption_x + dx)), caption_y: Math.max(0, Math.min(60, current.caption_y - dy)) }))
    else setSettings((current) => ({ ...current, watermark_x: Math.max(0, Math.min(100, current.watermark_x + dx)), watermark_y: Math.max(0, Math.min(100, current.watermark_y + dy)) }))
  }
  const aspectCards = [
    { value: '9:16' as const, slug: 'portrait', name: t.studioAspectFull, detail: t.studioAspectFullDetail },
    { value: '1:1' as const, slug: 'square', name: t.studioAspectSquare, detail: t.studioAspectSquareDetail },
    { value: '4:3' as const, slug: 'four-three', name: t.studioAspectStandard, detail: t.studioAspectStandardDetail },
    { value: '16:9' as const, slug: 'letterbox', name: t.studioAspectLetterbox, detail: t.studioAspectLetterboxDetail },
    { value: '16:9-landscape' as const, slug: 'landscape', name: t.studioAspectLandscape, detail: t.studioAspectLandscapeDetail },
  ]
  return (
    <div ref={dialogRef} className="studio-overlay" role="dialog" aria-modal="true" aria-label={t.studioTitle} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); requestExit() }
      if (event.key === 'Tab') {
        const root = dialogRef.current
        if (!root) return
        const focusable = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null)
        if (!focusable.length) { event.preventDefault(); root.focus(); return }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}>
      <div className="studio-head">
        <button type="button" className="btn-secondary studio-head__back" onClick={requestExit} disabled={running || Boolean(assetBusy) || focusBusy}><span aria-hidden="true">←</span> Input</button>
        <div className="studio-head__copy">
          <span className="studio-head__eyebrow">ECLIPSE <i /> STUDIO</span>
          <h2>{t.studioTitle}</h2>
          <p>{t.studioSub}</p>
        </div>
        <div className="studio-head__format" aria-label={`Format ekspor: MP4, H.264, ${aspectDisplayName}`}>
          <span className="studio-head__format-label">FORMAT EKSPOR</span>
          <div>
            <span>MP4</span><span>H.264</span><span>{aspectDisplayName}</span>
          </div>
        </div>
      </div>

      <div className={`studio-grid studio-grid--${mobileView}`}>
        <div className="studio-mobile-tabs" role="group" aria-label="Tampilan Studio">
          <button type="button" className={`chip ${mobileView === 'preview' ? 'is-on' : ''}`} onClick={() => setMobileView('preview')}>Pratinjau</button>
          <button type="button" className={`chip ${mobileView === 'controls' ? 'is-on' : ''}`} onClick={() => setMobileView('controls')}>Pengaturan</button>
        </div>
        <div className="panel studio-preview-panel">
          <div className="studio-preview-heading">
            <div><span className="studio-preview-live-dot" /><strong>{t.studioPreview}</strong><span>{preview ? `Klip ${previewIdx + 1} dari ${selected.length}` : t.studioSelectClip}</span>{selected.length <= 1 && <span className="studio-preview-focus-status">{previewFocusLabel}</span>}</div>
            <span className="studio-preview-ratio">{aspectDisplayName}</span>
          </div>
          <div ref={previewFrameRef} className="studio-preview" data-output-shape={settings.aspect === '16:9-landscape' ? 'landscape' : settings.aspect === '1:1' ? 'square' : settings.aspect === '4:3' ? 'four-three' : 'portrait'} style={{ position: 'relative', overflow: 'hidden', aspectRatio: outputAspect }}>
            <div
              className={source === 'youtube' ? `studio-youtube-stage${youtubeLetterbox ? ' is-letterbox' : ''}` : undefined}
              style={source === 'youtube'
                ? { position: 'absolute', width: `${youtubeFrameWidth}%`, height: `${youtubeFrameHeight}%`, left: `${youtubeFrameLeft}%`, top: `${youtubeFrameTop}%`, overflow: 'hidden', background: 'var(--video-bg)', ...(youtubeLetterbox ? { aspectRatio: '16 / 9', transform: 'translateY(-50%)' } : {}) }
                : { position: 'absolute', inset: 0 }}
            >
              <video ref={videoRef} src={previewMediaUrl} playsInline preload="metadata" onError={() => setSourceVideoError(true)} onLoadedMetadata={(event) => {
                setSourceVideoError(false)
                if (preview) event.currentTarget.currentTime = previewStartAt
              }} onPlay={() => setPreviewPlaying(true)} onPause={() => setPreviewPlaying(false)} onTimeUpdate={(event) => {
                const video = event.currentTarget
                if (preview && video.currentTime >= preview.end_time) {
                  if (previewLoopRef.current) video.currentTime = preview.start_time
                  else {
                    video.pause()
                    video.currentTime = Math.max(preview.start_time, preview.end_time - 0.04)
                  }
                }
                setPreviewTime(Math.max(preview?.start_time ?? 0, Math.min(video.currentTime, (preview?.end_time ?? Infinity) - 0.04)))
              }} onSeeking={(event) => {
                const video = event.currentTarget
                if (preview && (video.currentTime < preview.start_time || video.currentTime >= preview.end_time)) video.currentTime = Math.max(preview.start_time, Math.min(preview.end_time - 0.04, video.currentTime))
              }} onEnded={() => {
                if (preview && previewLoopRef.current) {
                  seekPreview(preview.start_time)
                  void videoRef.current?.play()
                } else setPreviewPlaying(false)
              }} style={{ width: '100%', height: '100%', objectFit: settings.aspect === '16:9' ? 'contain' : 'cover', objectPosition: isAutoFocusActive && focusPreview?.found && focusPreview.keyframes?.length ? undefined : `${previewFocalX}% ${previewFocalY}%` }} />
            </div>
            {cropAdjusting && settings.aspect !== '16:9' && <div
              className="studio-crop-adjust-surface"
              role="group"
              aria-label="Seret video untuk menggeser crop. Tekan Escape untuk keluar dari mode atur crop."
              onPointerDown={startFocusDrag}
              onPointerMove={moveFocusDrag}
              onPointerUp={endFocusDrag}
              onPointerCancel={endFocusDrag}
              onLostPointerCapture={endFocusDrag}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { setCropAdjusting(false); event.preventDefault(); event.stopPropagation() }
                else if (event.key.startsWith('Arrow')) {
                  const amount = event.shiftKey ? 5 : 1
                  const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0
                  const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0
                  if (dx || dy) { setManualFocus(Math.max(0, Math.min(100, previewFocalX + dx)), Math.max(0, Math.min(100, previewFocalY + dy))); event.preventDefault() }
                }
              }}
              tabIndex={0}
            >
              <span>Seret untuk mengatur crop · X {previewFocalX}% · Y {previewFocalY}%</span>
              <i /><i /><i /><i />
            </div>}
            {safe && <div className={`safe-overlay safe-overlay--${safePreset}`} aria-hidden="true"><span>Panduan aman · {safePreset === 'general' ? 'umum' : safePreset}</span></div>}
            {selectedLayer && <div className="studio-center-guides" aria-hidden="true"><span>50%</span></div>}
            <span ref={titleLayerRef} className={`studio-preview-title studio-preview-title--${settings.title_effect} studio-preview-layer${selectedLayer === 'title' ? ' is-selected' : ''}${titleAnimationClass ? ` ${titleAnimationClass}` : ''}`} data-layer-label="Judul" role="button" tabIndex={0} aria-pressed={selectedLayer === 'title'} aria-label="Geser judul pada pratinjau. Gunakan tombol panah untuk mengatur posisi." onPointerDown={(event) => startLayerDrag('title', event)} onPointerMove={moveLayer} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag} onLostPointerCapture={endLayerDrag} onKeyDown={(event) => nudgeLayer('title', event)} onClick={() => setSelectedLayer('title')} style={{ ...titleEffectStyle, top: `${settings.title_y}%`, bottom: 'auto', left: `${settings.title_x}%`, right: 'auto', width: '84%', transform: 'translateX(-50%)', fontSize: `${titleFontSize}px`, fontFamily: settings.title_font === 'montserrat' ? "'Montserrat', Arial, sans-serif" : "'Inter', Arial, sans-serif", textTransform: settings.title_case === 'upper' ? 'uppercase' : settings.title_case === 'lower' ? 'lowercase' : 'capitalize', color: settings.title_color, animationDuration: `${settings.title_animation_duration_ms}ms` }}>{titlePreview || currentTitle}</span>
            {displayedSubtitle && <span key={activeSubtitleLine?.start ?? 'subtitle'} ref={subtitleLayerRef} className={`studio-preview-caption studio-preview-caption--${settings.caption} studio-preview-caption-effect--${settings.caption_effect} studio-preview-layer${selectedLayer === 'subtitle' ? ' is-selected' : ''}${captionAnimationClass ? ` ${captionAnimationClass}` : ''}`} data-layer-label="Subtitle" role="button" tabIndex={0} aria-pressed={selectedLayer === 'subtitle'} aria-label="Geser subtitle aktif pada pratinjau. Gunakan tombol panah untuk mengatur posisi." onPointerDown={(event) => startLayerDrag('subtitle', event)} onPointerMove={moveLayer} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag} onLostPointerCapture={endLayerDrag} onKeyDown={(event) => nudgeLayer('subtitle', event)} onClick={() => setSelectedLayer('subtitle')} style={{ ...captionEffectStyle, bottom: `${settings.caption_y}%`, left: `${settings.caption_x}%`, right: 'auto', width: '92%', transform: 'translateX(-50%)', fontSize: `${subtitleFontSize}px`, fontFamily: settings.caption_font === 'montserrat' ? "'Montserrat', Arial, sans-serif" : "'Inter', Arial, sans-serif", fontWeight: selectedCaptionPreset?.weight ?? 800, color: settings.caption_color, animationDuration: `${activeSubtitleAnimationDurationMs}ms`, clipPath: settings.caption_animation === 'wipe' ? `inset(0 ${(1 - subtitleRevealProgress) * 100}% 0 0)` : undefined, transition: settings.caption_animation === 'wipe' ? 'clip-path 25ms linear' : undefined }}>{renderedSubtitle}</span>}
            {settings.watermark_enabled && settings.watermark_type === 'logo' && watermarkPreviewUrl && <img className={`studio-preview-watermark-logo studio-preview-layer${selectedLayer === 'watermark' ? ' is-selected' : ''}`} src={watermarkPreviewUrl} alt="Pratinjau watermark; dapat digeser" role="button" tabIndex={0} onPointerDown={(event) => startLayerDrag('watermark', event)} onPointerMove={moveLayer} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag} onKeyDown={(event) => nudgeLayer('watermark', event)} onClick={() => setSelectedLayer('watermark')} style={{ width: `${settings.watermark_size}%`, opacity: settings.watermark_opacity / 100, left: `${settings.watermark_x}%`, top: `${settings.watermark_y}%`, transform: `translate(-${settings.watermark_x}%, -${settings.watermark_y}%)`, pointerEvents: 'auto' }} />}
            {settings.watermark_enabled && settings.watermark_type === 'text' && settings.watermark_text.trim() && <span className={`studio-preview-watermark studio-preview-layer${selectedLayer === 'watermark' ? ' is-selected' : ''}`} role="button" tabIndex={0} aria-label="Geser watermark pada pratinjau" onPointerDown={(event) => startLayerDrag('watermark', event)} onPointerMove={moveLayer} onPointerUp={endLayerDrag} onPointerCancel={endLayerDrag} onKeyDown={(event) => nudgeLayer('watermark', event)} onClick={() => setSelectedLayer('watermark')} style={{ opacity: settings.watermark_opacity / 100, left: `${settings.watermark_x}%`, right: 'auto', top: `${settings.watermark_y}%`, transform: `translate(-${settings.watermark_x}%, -${settings.watermark_y}%)`, fontSize: `${watermarkPreviewFontSize}px` }}>{settings.watermark_text}</span>}
          </div>
          {preview && <div className="studio-playback" role="group" aria-label="Kontrol pemutaran preview">
            <div className="studio-playback__timeline">
              <span>{formatTime(Math.max(0, previewTime - preview.start_time))}</span>
              <input
                className="studio-playback__seek"
                type="range"
                min="0"
                max={Math.max(0.01, preview.end_time - preview.start_time)}
                step="0.04"
                value={Math.max(0, Math.min(previewTime - preview.start_time, preview.end_time - preview.start_time))}
                aria-label="Posisi pemutaran preview"
                aria-valuetext={`${formatTime(Math.max(0, previewTime - preview.start_time))} dari ${formatTime(preview.end_time - preview.start_time)}`}
                onChange={(event) => seekPreview(preview.start_time + Number(event.target.value))}
              />
              <span>{formatTime(preview.end_time - preview.start_time)}</span>
            </div>
            <div className="studio-playback__actions">
              <div className="studio-playback__transport">
                <button type="button" className="btn-ghost btn-sm" onClick={() => selectAdjacentPreview(-1)} disabled={previewIdx <= 0} aria-label="Klip sebelumnya" title="Klip sebelumnya"><Icon name="skipBack" size={16} /></button>
                <button type="button" className="btn-ghost btn-sm studio-playback__seek-step" onClick={() => seekPreviewBy(-5)} aria-label="Mundur 5 detik" title="Mundur 5 detik">−5</button>
                <button type="button" className="btn-secondary btn-sm studio-playback__play" onClick={togglePreviewPlayback} aria-label={previewPlaying ? 'Jeda preview' : previewAtEnd ? 'Putar ulang preview dari awal' : 'Putar preview'} title={previewPlaying ? 'Jeda' : previewAtEnd ? 'Putar ulang dari awal' : 'Putar'}><Icon name={previewPlaying ? 'pause' : 'play'} size={17} /><span>{previewPlaying ? 'Jeda' : previewAtEnd ? 'Putar ulang' : 'Putar'}</span></button>
                <button type="button" className="btn-ghost btn-sm studio-playback__seek-step" onClick={() => seekPreviewBy(5)} aria-label="Maju 5 detik" title="Maju 5 detik">+5</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => selectAdjacentPreview(1)} disabled={previewIdx >= selected.length - 1} aria-label="Klip berikutnya" title="Klip berikutnya"><Icon name="skipForward" size={16} /></button>
              </div>
              <div className="studio-playback__options">
                <button type="button" className={`btn-ghost btn-sm ${previewLoop ? 'is-active' : ''}`} aria-pressed={previewLoop} onClick={() => setPreviewLoop((value) => !value)} aria-label={previewLoop ? 'Matikan ulangi klip' : 'Ulangi klip'} title={previewLoop ? 'Ulangi klip aktif' : 'Ulangi klip'}><Icon name="repeat" size={16} /><span>Ulangi</span></button>
                <label className="studio-playback__speed"><span>Kecepatan</span><select className="input" aria-label="Kecepatan preview" value={previewRate} onChange={(event) => setPreviewRate(Number(event.target.value))}><option value="0.5">0,5×</option><option value="0.75">0,75×</option><option value="1">1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="2">2×</option></select></label>
                <button type="button" className="btn-ghost btn-sm" onClick={togglePreviewFullscreen} aria-label={previewFullscreen ? 'Keluar layar penuh' : 'Layar penuh'} title={previewFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}><Icon name={previewFullscreen ? 'fullscreenExit' : 'fullscreen'} size={16} /></button>
              </div>
            </div>
          </div>}
          {sourceVideoError && <p className="error-box" role="alert">{t.studioMediaPreviewError}</p>}
          {textLayersOverlap && <p className="studio-text-overlap-warning" role="status">{t.studioTextOverlapWarning}</p>}
          <div className="studio-preview-tools" data-history-revision={historyRevision}>
            <div className="studio-preview-guide">
              <label className="studio-caption"><input type="checkbox" checked={safe} onChange={(event) => setSafe(event.target.checked)} /> {t.studioPreviewGuide}</label>
              {safe && <select className="input studio-safe-preset" aria-label="Preset area aman" value={safePreset} onChange={(event) => setSafePreset(event.target.value as typeof safePreset)}><option value="general">Umum</option><option value="tiktok">TikTok</option><option value="reels">Reels</option><option value="shorts">Shorts</option></select>}
            </div>
            {settings.aspect !== '16:9' && <div className="studio-focus-tools" role="group" aria-label="Kontrol crop video">
              <button type="button" className={`btn-secondary btn-sm ${cropAdjusting ? 'is-active' : ''}`} aria-pressed={cropAdjusting} onClick={() => { setCropAdjusting((active) => !active); setSelectedLayer(null) }}>{cropAdjusting ? 'Selesai atur crop' : 'Atur crop di preview'}</button>
              <button type="button" className="btn-secondary btn-sm" onClick={resetCurrentFocus} disabled={!preview}>Reset tengah</button>
              {selected.length > 1 && <button type="button" className="btn-secondary btn-sm" onClick={applyFocusToSelected} disabled={!preview || (focusMode === 'auto' && autoFocusAvailable && focusBusyKey === focusAnalysisKey)}>Terapkan ke {selected.length} klip</button>}
            </div>}
            <div className="studio-history-controls" role="group" aria-label="Riwayat perubahan">
              <button type="button" className="btn-secondary btn-sm" onClick={undoEdit} disabled={!historyRef.current.past.length} title="Urungkan (⌘/Ctrl+Z)" aria-label="Undo · Urungkan perubahan (⌘/Ctrl+Z)"><Icon name="undo2" size={16} /><span>Undo</span></button>
              <button type="button" className="btn-secondary btn-sm" onClick={redoEdit} disabled={!historyRef.current.future.length} title="Ulangi (⌘/Ctrl+Shift+Z)" aria-label="Redo · Ulangi perubahan (⌘/Ctrl+Shift+Z)"><Icon name="redo2" size={16} /><span>Redo</span></button>
            </div>
            <span className="studio-layer-hint">Seret judul/subtitle · snap ke garis tengah · batas aman · Ctrl/Cmd+Z untuk undo</span>
            <span className={`studio-draft-status ${draftSaved ? 'is-saved' : 'is-saving'}`} role="status">{draftSaved ? t.studioDraftSaved : t.studioDraftSaving}</span>
          </div>
          {selected.length > 1 && (
            <div className="studio-preview-clip-picker" role="group" aria-label="Pilih klip untuk pratinjau">
              <span>Pilih klip</span>
              {selected.map((clip, index) => {
                const key = `${clipKey(clip)}:${settings.aspect}`
                const anchor = settings.focus_anchors?.[key] ?? 'center'
                const analysisKey = `${key}:${anchor}`
                const mode = settings.focus_modes?.[key] ?? (settings.auto_focus ? 'auto' : 'manual')
                const detection = focusPreviews[analysisKey]
                const tracked = (detection?.keyframes?.length ?? 0) > 1
                const statusInfo = focusPreviewStatuses[analysisKey]
                const status = settings.aspect === '16:9' ? 'Tanpa crop' : mode === 'manual' ? 'Manual' : !autoFocusAvailable ? 'Manual · fallback' : detection?.found ? `AI · ${tracked ? 'tracking' : focusModeLabel(detection.mode)}` : focusRequests[analysisKey] ? 'Menganalisis AI' : statusInfo?.state === 'error' ? 'Gagal · manual' : statusInfo?.state === 'not-found' ? 'Tidak ditemukan · manual' : 'AI · belum dicek'
                return <button key={clipKey(clip)} type="button" className={`chip ${index === previewIdx ? 'is-on' : ''}`} onClick={() => selectPreviewClip(clipKey(clip))}>
                  <span>Klip {index + 1}</span><small>{status}</small>
                </button>
              })}
            </div>
          )}
        </div>

        <div className="studio-controls">
          <div className="panel studio-editor">
            <p className="studio-steps-hint">{t.studioStepsHint}</p>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>01</span><h3>{t.studioStepAspect}</h3></summary>
              <div className="row">
              <div className="studio-aspect-config">
                <div className="studio-aspect-config__heading">
                  <div><strong>{t.studioAspectCanvasHeading}</strong><span>{t.aspectLabel}</span></div>
                  <span className="studio-aspect-resolution">{t.studioAspectCanvasSize(outputResolution[0], outputResolution[1])}</span>
                </div>
                <div className="studio-aspect-grid" role="group" aria-label={t.aspectLabel}>
                  {aspectCards.map((card) => <button key={card.value} type="button" className={`studio-aspect-card${settings.aspect === card.value ? ' is-selected' : ''}`} aria-pressed={settings.aspect === card.value} onClick={() => setSettings({ ...settings, aspect: card.value })}>
                    <span className={`studio-aspect-visual studio-aspect-visual--${card.slug}`} aria-hidden="true"><i /></span>
                    <span className="studio-aspect-card__copy"><strong><span>{card.value === '16:9-landscape' ? '16:9' : card.value}</span> {card.name}</strong><small>{card.detail}</small></span>
                  </button>)}
                </div>
                <p className="helper studio-aspect-help" aria-live="polite">{aspectHelp}</p>
              </div>
              </div>
            </details>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>02</span><h3>{t.studioStepFocus}</h3></summary>
              {settings.aspect !== '16:9' ? <div className="row">
              <span className="field-label">Fokus framing · {focusMode === 'auto' && autoFocusAvailable ? 'AI Auto' : 'Manual'}{preview ? ` · Klip ${previewIdx + 1}` : ''}</span>
                <div className="studio-focus-mode" role="group" aria-label="Mode fokus crop">
                  <label className="studio-ai-toggle">
                    <input type="checkbox" checked={focusMode === 'auto'} disabled={!autoFocusAvailable || (!aiFocusAvailable && focusMode !== 'auto')} onChange={(event) => setCurrentFocusMode(event.target.checked ? 'auto' : 'manual')} />
                    <span><strong>AI pelacakan wajah & orang <small className={`studio-focus-mode-badge${isAutoFocusActive ? ' is-active' : ''}`}>{!autoFocusAvailable && focusMode === 'auto' ? 'TIDAK TERSEDIA' : isAutoFocusActive ? aiFocusAvailable ? 'AI AKTIF' : 'AUTO AKTIF' : 'MANUAL'}</small></strong><small>{aiFocusAvailable ? 'AI menjaga subjek tetap pada posisi target sepanjang klip.' : autoFocusAvailable ? 'Model AI belum tersedia; Auto memakai deteksi klasik atau gerakan.' : 'Model fokus otomatis belum tersedia di server; gunakan posisi Manual.'}</small></span>
                  </label>
                </div>
                {focusMode === 'auto' && autoFocusAvailable && <div className="studio-focus-active-position" role="status">
                  <span className={`studio-focus-active-dot${focusPreview?.found ? ' is-found' : focusBusyKey === focusAnalysisKey ? ' is-loading' : ' is-fallback'}`} aria-hidden="true" />
                  <div className="studio-focus-active-copy">
                    <strong>{focusPreview?.found ? `AI aktif · ${focusModeLabel(focusPreview.mode)}` : focusPreviewStatus?.state === 'error' || focusPreviewStatus?.state === 'not-found' ? 'Crop manual cadangan aktif' : focusBusyKey === focusAnalysisKey ? 'Menganalisis target…' : 'Menunggu analisis AI'}</strong>
                    <span>{focusPreview?.found ? `Crop X ${Math.round(previewFocalX)}% · Y ${Math.round(previewFocalY)}% · target ${focusAnchor === 'left' ? 'kiri (35%)' : focusAnchor === 'right' ? 'kanan (65%)' : 'tengah (50%)'}${focusPreview.mode === 'face' ? ` · wajah ${focusPreview.matching_samples ?? 0}/${focusPreview.sampled_frames ?? 0}` : focusPreview.mode === 'person' ? ` · orang ${focusPreview.matching_samples ?? 0}/${focusPreview.sampled_frames ?? 0}` : ''}` : focusPreviewStatus?.state === 'error' ? 'Preview gagal dianalisis. Ekspor akan mencoba lagi, lalu memakai posisi manual bila perlu.' : focusPreviewStatus?.state === 'not-found' ? 'Wajah atau orang belum ditemukan. Ekspor akan mencoba lagi dan memakai posisi manual bila perlu.' : 'AI mencari wajah terlebih dahulu, lalu orang. Posisi manual tersedia sebagai cadangan.'}</span>
                  </div>
                  {focusPreview?.found && <button type="button" className="btn-secondary btn-sm" onClick={() => setCurrentFocusMode('manual')}>Kunci sebagai manual</button>}
                </div>}
                {focusMode === 'auto' && aiFocusAvailable && <div className="studio-focus-anchor" role="group" aria-label="Posisi target AI pada frame hasil">
                    <span>Posisi target pada frame</span>
                    <button type="button" className={`chip ${focusAnchor === 'center' ? 'is-on' : ''}`} aria-pressed={focusAnchor === 'center'} onClick={() => setFocusAnchor('center')}>Tengah · 50%</button>
                    <button type="button" className={`chip ${focusAnchor === 'left' ? 'is-on' : ''}`} aria-pressed={focusAnchor === 'left'} onClick={() => setFocusAnchor('left')}>Fokus kiri · 35%</button>
                    <button type="button" className={`chip ${focusAnchor === 'right' ? 'is-on' : ''}`} aria-pressed={focusAnchor === 'right'} onClick={() => setFocusAnchor('right')}>Fokus kanan · 65%</button>
                </div>}
                <div className={`studio-focus-manual${isAutoFocusActive ? ' is-backup' : ' is-active'}`}>
                  <div className="studio-focus-manual__heading">
                    <strong>{isAutoFocusActive ? 'Posisi manual cadangan' : 'Posisi crop manual'}</strong>
                    {isAutoFocusActive && <span>Dipakai jika AI tidak menemukan target</span>}
                  </div>
                  <div className="studio-option-grid studio-focus-presets">
                    {[
                      ['Kiri atas', 0, 0], ['Atas tengah', 50, 0], ['Kanan atas', 100, 0],
                      ['Kiri tengah', 0, 50], ['Tengah', 50, 50], ['Kanan tengah', 100, 50],
                      ['Kiri bawah', 0, 100], ['Bawah tengah', 50, 100], ['Kanan bawah', 100, 100],
                    ].map(([label, x, y]) => <button key={label} type="button" className={`chip ${manualFocus.focal_x === x && manualFocus.focal_y === y ? 'is-on' : ''}`} disabled={isAutoFocusActive} onClick={() => setManualFocus(Number(x), Number(y))}>{label}</button>)}
                  </div>
                  <label className="row">Horizontal: {manualFocus.focal_x}%<input className="studio-range" type="range" min="0" max="100" value={manualFocus.focal_x} disabled={isAutoFocusActive} onChange={(event) => setManualFocus(Number(event.target.value), manualFocus.focal_y)} /></label>
                  <label className="row">Vertikal: {manualFocus.focal_y}%<input className="studio-range" type="range" min="0" max="100" value={manualFocus.focal_y} disabled={isAutoFocusActive} onChange={(event) => setManualFocus(manualFocus.focal_x, Number(event.target.value))} /></label>
                </div>
                <p className="helper studio-focus-help">{focusMode === 'manual' ? 'Posisi manual berlaku untuk klip dan rasio ini. Geser video pada preview atau gunakan kontrol di atas.' : !autoFocusAvailable ? 'Auto focus tidak tersedia; ekspor memakai posisi Manual.' : !aiFocusAvailable ? 'Model AI belum tersedia; gunakan posisi manual untuk hasil yang dapat diprediksi.' : focusPreview?.found ? `${(focusPreview.keyframes?.length ?? 0) > 1 ? 'Tracking' : 'Deteksi'} ${focusModeLabel(focusPreview.mode)} aktif. Target mengikuti pilihan posisi; pengaturan manual menjadi cadangan.` : focusPreviewStatus?.state === 'error' ? `Analisis preview gagal${focusPreviewStatus.message ? `: ${focusPreviewStatus.message}` : ''}. Ekspor mencoba ulang, lalu memakai posisi manual bila perlu.` : focusPreviewStatus?.state === 'not-found' ? 'Target tidak ditemukan di preview. Ekspor mencoba ulang, lalu memakai posisi manual bila perlu.' : focusBusyKey === focusAnalysisKey ? 'Menganalisis klip aktif…' : 'AI memprioritaskan wajah, lalu orang yang paling konsisten; gerakan menjadi fallback.'} Crop diterapkan pada tiap klip dan rasio.</p>
                {focusMode === 'auto' && autoFocusAvailable && <div className="row">
                  <button type="button" className="btn-secondary btn-sm studio-focus-recalculate" onClick={() => void detectPreviewFocus()} disabled={!preview || Boolean(focusBusyKey) || running}>
                    {focusBusyKey === focusAnalysisKey ? 'Menganalisis klip…' : `Hitung ulang deteksi · Klip ${previewIdx + 1}`}
                  </button>
                </div>}
              </div> : <p className="helper">Letterbox menjaga seluruh gambar tanpa crop. Pilih 9:16, 1:1, 4:3, atau 16:9 Lanskap untuk mengatur posisi crop.</p>}
            </details>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>03</span><h3>{t.studioStepTitle}</h3></summary>
              <div className="row">
              <span className="field-label">Judul hook · {preview ? `Klip ${previewIdx + 1}` : 'pilih klip'}</span>
              <input className="input" value={currentTitle} onChange={(event) => setCurrentTitle(event.target.value)} placeholder="Judul khusus klip ini" maxLength={160} disabled={!preview} />
              <div className="studio-option-grid">
                <input className="input" value={settings.title_prefix} onChange={(event) => setSettings({ ...settings, title_prefix: event.target.value })} placeholder="Awalan untuk semua judul" maxLength={40} />
                <input className="input" value={settings.title_suffix} onChange={(event) => setSettings({ ...settings, title_suffix: event.target.value })} placeholder="Akhiran untuk semua judul" maxLength={40} />
              </div>
              <div className="studio-title-presets">
                <span className="field-label">Preset gaya</span>
                <div className="studio-title-preset-grid" role="group" aria-label="Preset gaya judul">
                {studioTitlePresets.map((preset) => {
                    const selectedPreset = settings.title_font === preset.font && settings.title_case === preset.casing && settings.title_color.toLowerCase() === preset.color.toLowerCase() && settings.title_effect === preset.effect && settings.title_effect_color.toLowerCase() === preset.effectColor.toLowerCase()
                    return <button key={preset.id} type="button" className={`studio-title-preset${selectedPreset ? ' is-selected' : ''}`} aria-pressed={selectedPreset} onClick={() => setSettings({ ...settings, title_font: preset.font, title_case: preset.casing, title_color: preset.color, title_effect: preset.effect, title_effect_color: preset.effectColor })}>
                      <span className={`studio-title-preset__sample studio-title-preset__sample--${preset.effect}`} style={{ fontFamily: preset.font === 'montserrat' ? "'Montserrat', Arial, sans-serif" : "'Inter', Arial, sans-serif", textTransform: preset.casing === 'upper' ? 'uppercase' : 'capitalize', color: preset.color, '--studio-title-effect-color': preset.effectColor } as ReactCSSProperties}>{preset.sample}</span>
                      <strong>{preset.label}</strong>
                    </button>
                  })}
                </div>
              </div>
              <div className="studio-option-grid">
                <div className="row"><span className="field-label">Font judul</span><ThemedSelect label="Font judul" value={settings.title_font} options={[{ value: 'inter', label: 'Inter' }, { value: 'montserrat', label: 'Montserrat' }]} onChange={(value) => setSettings({ ...settings, title_font: value as StudioSettings['title_font'] })} /></div>
                <div className="row"><span className="field-label">Kapitalisasi</span><ThemedSelect label="Kapitalisasi judul" value={settings.title_case} options={[{ value: 'upper', label: 'KAPITAL' }, { value: 'title', label: 'Judul' }, { value: 'lower', label: 'huruf kecil' }]} onChange={(value) => setSettings({ ...settings, title_case: value as StudioSettings['title_case'] })} /></div>
              </div>
              <div className="studio-title-color-box">
                <div className="studio-title-color-box__heading"><div><strong>Warna teks</strong><small>HEX dan RGB diterapkan ke preview dan ekspor.</small></div><label className="studio-title-color-swatch" style={{ '--swatch-color': settings.title_color } as ReactCSSProperties} title="Pilih warna judul"><input type="color" aria-label="Pilih warna judul" value={settings.title_color} onChange={(event) => setSettings({ ...settings, title_color: event.target.value })} /></label></div>
                <div className="studio-title-color-fields">
                  <label><span>HEX</span><input className="input studio-title-hex" value={titleHexDraft} maxLength={7} spellCheck={false} onChange={(event) => { const value = event.target.value; setTitleHexDraft(value); if (/^#[0-9a-fA-F]{6}$/.test(value)) setSettings({ ...settings, title_color: value }) }} onBlur={() => { if (!/^#[0-9a-fA-F]{6}$/.test(titleHexDraft)) setTitleHexDraft(settings.title_color.toUpperCase()) }} aria-label="Kode warna HEX judul" /></label>
                  {(['r', 'g', 'b'] as const).map((channel) => <label key={channel}><span>{channel.toUpperCase()}</span><input className="input" type="number" min="0" max="255" step="1" value={titleRgb[channel]} aria-label={`Kanal ${channel.toUpperCase()} warna judul`} onChange={(event) => { const next = { ...titleRgb, [channel]: Number(event.target.value) }; setSettings({ ...settings, title_color: rgbToHex(next.r, next.g, next.b) }) }} /></label>)}
                </div>
                <div className="studio-title-palette" role="group" aria-label="Warna cepat judul">
                  {studioTitlePalette.map((color) => <button key={color} type="button" className={`studio-title-palette__swatch${settings.title_color.toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}`} style={{ '--swatch-color': color } as ReactCSSProperties} aria-label={`Pilih warna ${color}`} aria-pressed={settings.title_color.toLowerCase() === color.toLowerCase()} onClick={() => setSettings({ ...settings, title_color: color })} />)}
                </div>
                <label className="studio-title-effect-color"><span>Warna efek</span><input type="color" aria-label="Warna outline, bayangan, glow, atau latar" value={settings.title_effect_color} onChange={(event) => setSettings({ ...settings, title_effect_color: event.target.value })} /><code>{settings.title_effect_color.toUpperCase()}</code></label>
              </div>
              <div className="studio-option-grid">
                <div className="row"><span className="field-label">Efek judul</span><ThemedSelect label="Efek judul" value={settings.title_effect} options={[{ value: 'shadow', label: 'Bayangan' }, { value: 'outline', label: 'Outline' }, { value: 'box', label: 'Latar teks' }, { value: 'glow', label: 'Glow' }]} onChange={(value) => setSettings({ ...settings, title_effect: value as StudioSettings['title_effect'] })} /></div>
                <div className="row"><span className="field-label">Animasi masuk/keluar</span><ThemedSelect label="Animasi judul" value={settings.title_animation} options={[{ value: 'none', label: 'Tanpa animasi' }, { value: 'fade', label: 'Fade' }, { value: 'slide_up', label: 'Geser ke atas' }]} onChange={(value) => setSettings({ ...settings, title_animation: value as StudioSettings['title_animation'] })} /></div>
              </div>
              <label className="row studio-title-animation-duration">Durasi animasi: {settings.title_animation_duration_ms} ms<input className="studio-range" type="range" min="100" max="1500" step="10" disabled={settings.title_animation === 'none'} value={settings.title_animation_duration_ms} onChange={(event) => setSettings({ ...settings, title_animation_duration_ms: Number(event.target.value) })} /></label>
              <div className="studio-title-size-row"><label className="row" htmlFor="studio-title-size">Ukuran judul</label><div><input className="studio-range" type="range" min="36" max="120" step="1" value={settings.title_size} onChange={(event) => setSettings({ ...settings, title_size: Number(event.target.value) })} aria-label="Ukuran judul" /><input id="studio-title-size" className="input studio-number-input" type="number" min="36" max="120" step="1" value={settings.title_size} onChange={(event) => setSettings({ ...settings, title_size: Math.max(36, Math.min(120, Number(event.target.value) || 36)) })} /><span>px</span></div></div>
              <div className="studio-title-position-box">
                <div className="studio-title-position-box__heading"><strong>Posisi judul</strong><small>Seret teks di preview untuk penyesuaian bebas.</small></div>
                <div className="studio-title-position-grid" role="group" aria-label="Preset posisi judul">
                  {[
                    ['↖', 'Atas kiri', 18, 8], ['↑', 'Atas tengah', 50, 8], ['↗', 'Atas kanan', 82, 8],
                    ['←', 'Tengah kiri', 18, 40], ['·', 'Tengah', 50, 40], ['→', 'Tengah kanan', 82, 40],
                    ['↙', 'Bawah kiri', 18, 70], ['↓', 'Bawah tengah', 50, 70], ['↘', 'Bawah kanan', 82, 70],
                  ].map(([icon, label, x, y]) => <button key={label} type="button" className={`studio-title-position-button${settings.title_x === x && settings.title_y === y ? ' is-selected' : ''}`} aria-label={String(label)} aria-pressed={settings.title_x === x && settings.title_y === y} title={String(label)} onClick={() => setSettings({ ...settings, title_x: Number(x), title_y: Number(y) })}>{icon}</button>)}
                </div>
                <div className="studio-title-position-fields"><label><span>X · horizontal</span><div><input className="studio-range" type="range" min="8" max="92" step="1" value={settings.title_x} onChange={(event) => setSettings({ ...settings, title_x: Number(event.target.value) })} /><input className="input studio-number-input" type="number" min="8" max="92" value={settings.title_x} onChange={(event) => setSettings({ ...settings, title_x: Math.max(8, Math.min(92, Number(event.target.value) || 8)) })} /><small>%</small></div></label><label><span>Y · dari atas</span><div><input className="studio-range" type="range" min="0" max="76" step="1" value={settings.title_y} onChange={(event) => setSettings({ ...settings, title_y: Number(event.target.value) })} /><input className="input studio-number-input" type="number" min="0" max="76" value={settings.title_y} onChange={(event) => setSettings({ ...settings, title_y: Math.max(0, Math.min(76, Number(event.target.value) || 0)) })} /><small>%</small></div></label></div>
              </div>
              </div>
            </details>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>04</span><h3>{t.studioStepSubtitle}</h3></summary>
              <div className="row">
              <span className="field-label">Gaya subtitle</span>
              <div className="studio-subtitle-preset-grid" role="group" aria-label="Preset gaya subtitle">
                {studioSubtitlePresets.map((preset) => {
                  const isSelected = settings.caption === preset.id && settings.caption_color.toLowerCase() === preset.color.toLowerCase() && settings.caption_effect_color.toLowerCase() === preset.effectColor.toLowerCase() && settings.caption_font === preset.font && settings.caption_effect === preset.effect
                  return <button key={preset.id} type="button" className={`studio-subtitle-preset${isSelected ? ' is-selected' : ''}`} aria-pressed={isSelected} onClick={() => setSettings({ ...settings, caption: preset.id, caption_color: preset.color, caption_effect_color: preset.effectColor, caption_font: preset.font, caption_effect: preset.effect })}>
                  <span className={`studio-subtitle-preset__sample studio-preview-caption-effect--${preset.effect}`} style={{ color: preset.color, fontFamily: preset.font === 'montserrat' ? "'Montserrat', Arial, sans-serif" : "'Inter', Arial, sans-serif", fontWeight: preset.weight, '--studio-caption-effect-color': preset.effectColor } as ReactCSSProperties}>Aa 123</span><strong>{preset.label}</strong>
                  </button>
                })}
                <button type="button" className={`studio-subtitle-preset studio-subtitle-preset--off${settings.caption === 'off' ? ' is-selected' : ''}`} aria-pressed={settings.caption === 'off'} onClick={() => setSettings({ ...settings, caption: 'off' })}><span className="studio-subtitle-preset__sample">Teks mati</span><strong>{t.captionOff}</strong></button>
              </div>
              {settings.caption !== 'off' && <>
                <div className="studio-option-grid">
                  <div className="row"><span className="field-label">Font subtitle</span><ThemedSelect label="Font subtitle" value={settings.caption_font} options={[{ value: 'inter', label: 'Inter' }, { value: 'montserrat', label: 'Montserrat' }]} onChange={(value) => setSettings({ ...settings, caption_font: value as StudioSettings['caption_font'] })} /></div>
                  <div className="row"><span className="field-label">Efek subtitle</span><ThemedSelect label="Efek subtitle" value={settings.caption_effect} options={[{ value: 'outline', label: 'Outline' }, { value: 'shadow', label: 'Bayangan' }, { value: 'box', label: 'Latar teks' }]} onChange={(value) => setSettings({ ...settings, caption_effect: value as StudioSettings['caption_effect'] })} /></div>
                  <div className="row"><span className="field-label">Animasi subtitle</span><ThemedSelect label="Animasi subtitle" value={settings.caption_animation} options={[{ value: 'none', label: 'Tanpa animasi' }, { value: 'fade', label: 'Fade' }, { value: 'slide_up', label: 'Geser ke atas' }, { value: 'slide_left', label: 'Geser dari kiri' }, { value: 'slide_right', label: 'Geser dari kanan' }, { value: 'pop', label: 'Pop' }, { value: 'typewriter', label: 'Mesin tik (Typewriter)' }, { value: 'wipe', label: 'Wipe' }, { value: 'karaoke', label: 'Karaoke per kata' }]} onChange={(value) => setSettings({ ...settings, caption_animation: value as StudioSettings['caption_animation'] })} /></div>
                </div>
                <div className="studio-subtitle-color-box">
                  <div className="studio-subtitle-color-box__heading"><div><strong>Warna dan kontras</strong><small>Warna teks dan outline ikut diterapkan saat ekspor.</small></div><label className="studio-title-color-swatch" style={{ '--swatch-color': settings.caption_color } as ReactCSSProperties} title="Pilih warna subtitle"><input type="color" aria-label="Pilih warna subtitle" value={settings.caption_color} onChange={(event) => setSettings({ ...settings, caption_color: event.target.value })} /></label></div>
                  <div className="studio-title-color-fields">
                    <label><span>HEX</span><input className="input studio-title-hex" value={captionHexDraft} maxLength={7} spellCheck={false} onChange={(event) => { const value = event.target.value; setCaptionHexDraft(value); if (/^#[0-9a-fA-F]{6}$/.test(value)) setSettings({ ...settings, caption_color: value }) }} onBlur={() => { if (!/^#[0-9a-fA-F]{6}$/.test(captionHexDraft)) setCaptionHexDraft(settings.caption_color.toUpperCase()) }} aria-label="Kode warna HEX subtitle" /></label>
                    {(['r', 'g', 'b'] as const).map((channel) => <label key={channel}><span>{channel.toUpperCase()}</span><input className="input" type="number" min="0" max="255" step="1" value={captionRgb[channel]} aria-label={`Kanal ${channel.toUpperCase()} warna subtitle`} onChange={(event) => { const next = { ...captionRgb, [channel]: Number(event.target.value) }; setSettings({ ...settings, caption_color: rgbToHex(next.r, next.g, next.b) }) }} /></label>)}
                  </div>
                  <div className="studio-title-palette" role="group" aria-label="Warna cepat subtitle">{studioSubtitlePalette.map((color) => <button key={color} type="button" className={`studio-title-palette__swatch${settings.caption_color.toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}`} style={{ '--swatch-color': color } as ReactCSSProperties} aria-label={`Pilih warna ${color}`} aria-pressed={settings.caption_color.toLowerCase() === color.toLowerCase()} onClick={() => setSettings({ ...settings, caption_color: color })} />)}</div>
                  <label className="studio-title-effect-color"><span>Warna outline / latar</span><input type="color" aria-label="Warna outline atau latar subtitle" value={settings.caption_effect_color} onChange={(event) => setSettings({ ...settings, caption_effect_color: event.target.value })} /><code>{settings.caption_effect_color.toUpperCase()}</code></label>
                </div>
                {settings.caption_animation === 'karaoke' && <div className="studio-title-effect-color studio-subtitle-karaoke-color"><span>Warna sorotan Karaoke</span><input type="color" aria-label="Warna sorotan Karaoke" value={settings.caption_karaoke_color} onChange={(event) => setSettings({ ...settings, caption_karaoke_color: event.target.value })} /><code>{settings.caption_karaoke_color.toUpperCase()}</code></div>}
                {settings.caption_animation === 'karaoke' && <small className="studio-subtitle-animation-hint">Sorotan kata mengikuti durasi baris dan dibagi otomatis berdasarkan panjang kata.</small>}
                <label className="row studio-title-animation-duration">Durasi animasi: {settings.caption_animation_duration_ms} ms<input className="studio-range" type="range" min="100" max="1500" step="10" disabled={['none', 'karaoke'].includes(settings.caption_animation)} value={settings.caption_animation_duration_ms} onChange={(event) => setSettings({ ...settings, caption_animation_duration_ms: Number(event.target.value) })} /></label>
                <div className="studio-title-size-row"><label className="row" htmlFor="studio-caption-size">Ukuran subtitle</label><div><input className="studio-range" type="range" min="36" max="120" step="1" value={settings.caption_size} onChange={(event) => setSettings({ ...settings, caption_size: Number(event.target.value) })} aria-label="Ukuran subtitle" /><input id="studio-caption-size" className="input studio-number-input" type="number" min="36" max="120" step="1" value={settings.caption_size} onChange={(event) => setSettings({ ...settings, caption_size: Math.max(36, Math.min(120, Number(event.target.value) || 36)) })} /><span>px</span></div></div>
                <div className="studio-title-position-box studio-subtitle-position-box">
                  <div className="studio-title-position-box__heading"><strong>Posisi subtitle</strong><small>Seret subtitle di preview untuk mengatur posisi secara bebas.</small></div>
                  <div className="studio-title-position-grid" role="group" aria-label="Preset posisi subtitle">{[
                    ['↖', 'Atas kiri', 18, 82], ['↑', 'Atas tengah', 50, 82], ['↗', 'Atas kanan', 82, 82],
                    ['←', 'Tengah kiri', 18, 50], ['·', 'Tengah', 50, 50], ['→', 'Tengah kanan', 82, 50],
                    ['↙', 'Bawah kiri', 18, 10], ['↓', 'Bawah tengah', 50, 10], ['↘', 'Bawah kanan', 82, 10],
                  ].map(([icon, label, x, y]) => <button key={label} type="button" className={`studio-title-position-button${settings.caption_x === x && settings.caption_y === y ? ' is-selected' : ''}`} aria-label={String(label)} aria-pressed={settings.caption_x === x && settings.caption_y === y} title={String(label)} onClick={() => setSettings({ ...settings, caption_x: Number(x), caption_y: Number(y) })}>{icon}</button>)}</div>
                  <div className="studio-title-position-fields"><label><span>X · horizontal</span><div><input className="studio-range" type="range" min="8" max="92" step="1" value={settings.caption_x} onChange={(event) => setSettings({ ...settings, caption_x: Number(event.target.value) })} /><input className="input studio-number-input" type="number" min="8" max="92" value={settings.caption_x} onChange={(event) => setSettings({ ...settings, caption_x: Math.max(8, Math.min(92, Number(event.target.value) || 8)) })} /><small>%</small></div></label><label><span>Y · dari bawah</span><div><input className="studio-range" type="range" min="0" max="88" step="1" value={settings.caption_y} onChange={(event) => setSettings({ ...settings, caption_y: Number(event.target.value) })} /><input className="input studio-number-input" type="number" min="0" max="88" value={settings.caption_y} onChange={(event) => setSettings({ ...settings, caption_y: Math.max(0, Math.min(88, Number(event.target.value) || 0)) })} /><small>%</small></div></label></div>
                </div>
                <div className="subtitle-editor">
                  <div className="row-inline"><div className="subtitle-editor__title"><strong>Editor subtitle</strong><span>{currentSegments.length} baris{activeSubtitleIndex >= 0 ? ` · baris ${activeSubtitleIndex + 1} aktif` : ''}</span></div><div className="row-inline"><button type="button" className="btn-secondary btn-sm" onClick={addSegment} disabled={!subtitleAddAvailable}>+ Tambah baris</button><button type="button" className="btn-secondary btn-sm" onClick={resetSegments} disabled={!preview || currentSegments.length === 0}>Pulihkan transkrip</button></div></div>
                  {preview && currentSegments.length > 0 && <div className="subtitle-timeline" ref={subtitleTimelineRef} aria-label="Timeline subtitle klip" onPointerMove={moveSubtitleTimeline} onPointerUp={endSubtitleTimelineDrag} onPointerCancel={endSubtitleTimelineDrag}>
                    {currentSegments.map((line, index) => {
                      const duration = Math.max(0.01, preview.end_time - preview.start_time)
                      const isSelected = selectedSubtitleTimelineIndex === index
                      return <div key={`timeline-${index}`} className={`subtitle-timeline-segment${isSelected ? ' is-selected' : ''}${captionValidationMessages[index] ? ' is-invalid' : ''}`} aria-label={`Baris subtitle ${index + 1}`} style={{ left: `${Math.max(0, (line.start - preview.start_time) / duration * 100)}%`, width: `${Math.max(1.5, (line.end - line.start) / duration * 100)}%` }} onPointerDown={(event) => startSubtitleTimelineDrag(index, 'move', event)}>
                        <button type="button" className="subtitle-timeline-segment__seek" title={`${formatClipSeconds(line.start - preview.start_time)}–${formatClipSeconds(line.end - preview.start_time)} dtk · klik untuk preview, geser untuk memindah`} aria-label={`Pilih baris subtitle ${index + 1} dan lompat ke ${formatClipSeconds(line.start - preview.start_time)} detik`} onClick={() => { setActiveSubtitleEditIndex(index); if (!subtitleTimelineWasDraggedRef.current) seekPreview(line.start); subtitleTimelineWasDraggedRef.current = false }}><span className="subtitle-timeline-segment__label">{index + 1}</span></button>
                        <span className="subtitle-timeline-handle subtitle-timeline-handle--start" role="slider" tabIndex={0} aria-label={`Atur waktu mulai baris ${index + 1}`} aria-valuemin={0} aria-valuemax={Math.round((line.end - preview.start_time) * 100)} aria-valuenow={Math.round((line.start - preview.start_time) * 100)} onPointerDown={(event) => { event.stopPropagation(); startSubtitleTimelineDrag(index, 'start', event) }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nudgeSubtitleTimelineBoundary(index, 'start', (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.25 : 0.05)) } }} /><span className="subtitle-timeline-handle subtitle-timeline-handle--end" role="slider" tabIndex={0} aria-label={`Atur waktu selesai baris ${index + 1}`} aria-valuemin={Math.round((line.start - preview.start_time) * 100)} aria-valuemax={Math.round((preview.end_time - preview.start_time) * 100)} aria-valuenow={Math.round((line.end - preview.start_time) * 100)} onPointerDown={(event) => { event.stopPropagation(); startSubtitleTimelineDrag(index, 'end', event) }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nudgeSubtitleTimelineBoundary(index, 'end', (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.25 : 0.05)) } }} />
                      </div>
                    })}
                    <span className="subtitle-playhead" style={{ left: `${Math.max(0, Math.min(100, (previewTime - preview.start_time) / Math.max(0.01, preview.end_time - preview.start_time) * 100))}%` }} />
                  </div>}
                  {currentSegments.length === 0 ? <p className="helper">Tidak ada segmen transkrip pada rentang klip ini.</p> : currentSegments.map((line, index) => (
                    <div className={`subtitle-edit-line${activeSubtitleIndex === index || activeSubtitleEditIndex === index ? ' is-active' : ''}${captionValidationMessages[index] ? ' is-invalid' : ''}`} key={index} onFocusCapture={() => setActiveSubtitleEditIndex(index)}>
                      <div className="subtitle-edit-line__index"><strong>{String(index + 1).padStart(2, '0')}</strong><span>{activeSubtitleIndex === index ? 'Aktif' : `${formatClipSeconds(line.end - line.start)} dtk`}</span></div>
                      <label>Mulai (dtk)<input className="input" type="number" min="0" max={preview ? preview.end_time - preview.start_time : 0} step="0.01" value={formatClipSeconds(line.start - (preview?.start_time ?? 0))} onChange={(event) => updateSegment(index, { start: (preview?.start_time ?? 0) + Number(event.target.value) })} /></label>
                      <label>Selesai (dtk)<input className="input" type="number" min="0" max={preview ? preview.end_time - preview.start_time : 0} step="0.01" value={formatClipSeconds(line.end - (preview?.start_time ?? 0))} onChange={(event) => updateSegment(index, { end: (preview?.start_time ?? 0) + Number(event.target.value) })} /></label>
                      <label className="subtitle-text-field">Teks subtitle<textarea className="input" rows={2} value={line.text} maxLength={2000} onChange={(event) => updateSegment(index, { text: event.target.value })} /></label><button type="button" className="btn-secondary btn-sm subtitle-delete" onClick={() => removeSegment(index)} aria-label={`Hapus baris subtitle ${index + 1}`}>×</button>
                      {captionValidationMessages[index] && <p className="subtitle-edit-line__error" role="alert">{captionValidationMessages[index]}</p>}
                      <button type="button" className="btn-secondary btn-sm subtitle-jump" onClick={() => seekPreview(line.start)} aria-label={`Pratinjau subtitle ${index + 1}`}>▶ {formatClipSeconds(line.start - (preview?.start_time ?? 0))}s</button>
                    </div>
                ))}
                </div>
              </>}
              </div>
            </details>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>05</span><h3>{t.studioStepAudio}</h3></summary>
            <div className="studio-option-grid">
              <div className="row">
                <label className="field-label" htmlFor="studio-bgm">Musik latar (opsional)</label>
                <input id="studio-bgm" className="input" type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" disabled={assetBusy !== null} onChange={(event) => void handleAsset('bgm', event.target.files?.[0])} />
                <span className="helper">{assetBusy === 'bgm' ? 'Mengunggah…' : settings.bgm_asset ? 'Berkas siap untuk batch ini.' : 'MP3, WAV, M4A, AAC, OGG · maks. 50 MB'}</span>
                {settings.bgm_asset && <div className="studio-audio-preview"><audio controls preload="metadata" src={audioPreviewUrls.bgm} aria-label="Pratinjau musik latar" /><button type="button" className="btn-secondary btn-sm" onClick={() => { setSettings((current) => ({ ...current, bgm_asset: '' })); setAudioPreviewUrls((current) => ({ ...current, bgm: undefined })) }}>Hapus musik</button></div>}
                {settings.bgm_asset && <label className="row">Volume musik: {settings.bgm_volume}%<input className="studio-range" type="range" min="0" max="100" value={settings.bgm_volume} onChange={(event) => setSettings({ ...settings, bgm_volume: Number(event.target.value) })} /></label>}
                {settings.bgm_asset && <label className="row-inline"><input type="checkbox" checked={settings.bgm_ducking} onChange={(event) => setSettings({ ...settings, bgm_ducking: event.target.checked })} /> Turunkan musik saat ada dialog (ducking)</label>}
                {settings.bgm_asset && <>
                  <label className="row">Fade in musik: {(settings.bgm_fade_in_ms / 1000).toFixed(1)} dtk<input className="studio-range" type="range" min="0" max="5000" step="100" value={settings.bgm_fade_in_ms} onChange={(event) => setSettings({ ...settings, bgm_fade_in_ms: Number(event.target.value) })} /></label>
                  <label className="row">Fade out musik: {(settings.bgm_fade_out_ms / 1000).toFixed(1)} dtk<input className="studio-range" type="range" min="0" max="5000" step="100" value={settings.bgm_fade_out_ms} onChange={(event) => setSettings({ ...settings, bgm_fade_out_ms: Number(event.target.value) })} /></label>
                  <label className="row">Mulai musik: {(settings.bgm_start_ms / 1000).toFixed(1)} dtk<input className="studio-range" type="range" min="0" max={Math.max(0, Math.min(15000, Math.round(previewDuration * 1000)))} step="100" value={settings.bgm_start_ms} onChange={(event) => setSettings({ ...settings, bgm_start_ms: Number(event.target.value) })} disabled={!preview} /></label>
                </>}
              </div>
              <div className="row">
                <label className="field-label" htmlFor="studio-sfx">SFX hook (opsional)</label>
                <input id="studio-sfx" className="input" type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" disabled={assetBusy !== null} onChange={(event) => void handleAsset('sfx', event.target.files?.[0])} />
                <span className="helper">{assetBusy === 'sfx' ? 'Mengunggah…' : settings.sfx_asset ? 'SFX diputar dekat waktu hook tiap klip.' : 'MP3, WAV, M4A, AAC, OGG · maks. 50 MB'}</span>
                {settings.sfx_asset && <div className="studio-audio-preview"><audio controls preload="metadata" src={audioPreviewUrls.sfx} aria-label="Pratinjau efek suara" /><button type="button" className="btn-secondary btn-sm" onClick={() => { setSettings((current) => ({ ...current, sfx_asset: '' })); setAudioPreviewUrls((current) => ({ ...current, sfx: undefined })) }}>Hapus SFX</button></div>}
                {settings.sfx_asset && <>
                  <label className="row">Volume SFX: {settings.sfx_volume}%<input className="studio-range" type="range" min="0" max="200" value={settings.sfx_volume} onChange={(event) => setSettings({ ...settings, sfx_volume: Number(event.target.value) })} /></label>
                  <label className="row">Posisi SFX dari hook: {settings.sfx_offset_ms > 0 ? '+' : ''}{(settings.sfx_offset_ms / 1000).toFixed(1)} dtk<input className="studio-range" type="range" min="-5000" max="5000" step="100" value={settings.sfx_offset_ms} onChange={(event) => setSettings({ ...settings, sfx_offset_ms: Number(event.target.value) })} /></label>
                </>}
              </div>
            </div>
            {preview && <div className="studio-audio-timeline" aria-label={`Timeline audio klip ${previewIdx + 1}`}>
              <div className="studio-audio-timeline__heading"><strong>Timeline audio · Klip {previewIdx + 1}</strong><span>{previewDuration.toFixed(1)} dtk</span></div>
              <div className="studio-audio-timeline__track studio-audio-timeline__track--source"><span>Audio asli</span><i /></div>
              {settings.bgm_asset && <div className="studio-audio-timeline__track studio-audio-timeline__track--music" role="slider" tabIndex={0} aria-label="Posisi mulai musik pada timeline" aria-valuemin={0} aria-valuemax={Math.min(15000, Math.round(previewDuration * 1000))} aria-valuenow={settings.bgm_start_ms} onPointerDown={(event) => startAudioTimelineDrag('bgm', event)} onPointerMove={moveAudioTimeline} onPointerUp={endAudioTimelineDrag} onPointerCancel={endAudioTimelineDrag} onLostPointerCapture={endAudioTimelineDrag} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setSettings((current) => ({ ...current, bgm_start_ms: Math.max(0, Math.min(15000, current.bgm_start_ms + (event.key === 'ArrowRight' ? 100 : -100))) })) }}><span>Musik</span><i style={{ left: `${bgmStartPercent}%`, width: `${Math.max(0, 100 - bgmStartPercent)}%` }} /></div>}
              {settings.sfx_asset && <div className="studio-audio-timeline__track studio-audio-timeline__track--sfx" role="slider" tabIndex={0} aria-label="Posisi SFX relatif terhadap hook" aria-valuemin={-5000} aria-valuemax={5000} aria-valuenow={settings.sfx_offset_ms} onPointerDown={(event) => startAudioTimelineDrag('sfx', event)} onPointerMove={moveAudioTimeline} onPointerUp={endAudioTimelineDrag} onPointerCancel={endAudioTimelineDrag} onLostPointerCapture={endAudioTimelineDrag} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setSettings((current) => ({ ...current, sfx_offset_ms: Math.max(-5000, Math.min(5000, current.sfx_offset_ms + (event.key === 'ArrowRight' ? 100 : -100))) })) }}><span>SFX</span><i style={{ left: `${sfxAtPercent}%` }} /></div>}
              <span className="studio-audio-timeline__playhead" style={{ left: `${audioPlayheadPercent}%` }} aria-hidden="true" />
              <p className="helper">Musik mulai sesuai slider; SFX mengikuti titik hook dan dapat digeser beberapa detik.</p>
            </div>}
            <div className="row">
              <label className="row">Volume audio asli: {settings.source_volume}%<input className="studio-range" type="range" min="0" max="200" step="1" value={settings.source_volume} onChange={(event) => setSettings({ ...settings, source_volume: Number(event.target.value) })} /></label>
            </div>
            </details>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>06</span><h3>{t.studioStepWatermark}</h3></summary>
              <section className="studio-watermark-settings">
                <div className="watermark-switch">
                  <div><strong>Watermark video</strong><span className="helper">Tambahkan logo atau identitas brand pada klip.</span></div>
                  <label className="row-inline watermark-switch__toggle"><input type="checkbox" checked={settings.watermark_enabled} onChange={(event) => setSettings({ ...settings, watermark_enabled: event.target.checked })} /> Aktif</label>
                </div>
                {settings.watermark_enabled && <div className="watermark-options">
                  <div className="watermark-subsection">
                    <span className="field-label">Jenis watermark</span>
                    <div className="watermark-type-options" role="group" aria-label="Jenis watermark">
                      <button type="button" className={`chip ${settings.watermark_type === 'logo' ? 'is-on' : ''}`} aria-pressed={settings.watermark_type === 'logo'} onClick={() => setSettings({ ...settings, watermark_type: 'logo' })}>Logo / Gambar</button>
                      <button type="button" className={`chip ${settings.watermark_type === 'text' ? 'is-on' : ''}`} aria-pressed={settings.watermark_type === 'text'} onClick={() => setSettings({ ...settings, watermark_type: 'text' })}>Teks / Handle</button>
                    </div>
                  </div>
                  <div className="watermark-subsection watermark-upload">
                    {settings.watermark_type === 'logo' ? <>
                      <label className="field-label" htmlFor="studio-watermark">Unggah logo</label>
                      <input id="studio-watermark" className="input" type="file" accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg" disabled={assetBusy !== null} onChange={(event) => void handleAsset('watermark', event.target.files?.[0])} />
                      <span className="helper">{assetBusy === 'watermark' ? 'Mengunggah…' : settings.watermark_asset ? 'Logo siap untuk render batch.' : 'PNG transparan disarankan · PNG, WebP, JPG · maks. 10 MB'}</span>
                      {settings.watermark_asset && <button type="button" className="btn-secondary btn-sm" onClick={() => { setSettings((current) => ({ ...current, watermark_asset: '' })); setWatermarkPreviewUrl(undefined) }}>Hapus logo</button>}
                    </> : <label className="row">Teks / Handle<input className="input" maxLength={60} value={settings.watermark_text} onChange={(event) => setSettings({ ...settings, watermark_text: event.target.value })} placeholder="@namabrand" /></label>}
                  </div>
                  <div className="watermark-control-grid">
                    <div className="watermark-subsection watermark-size">
                      <label className="row">{settings.watermark_type === 'logo' ? `Ukuran logo: ${settings.watermark_size}%` : `Ukuran teks: ${settings.watermark_size}%`}<input className="studio-range" type="range" min="5" max="40" step="1" value={Math.min(40, Math.max(5, settings.watermark_size))} onChange={(event) => setSettings({ ...settings, watermark_size: Number(event.target.value) })} /></label>
                      <div className="watermark-size-presets">{[10, 15, 20, 25, 30, 40].map((size) => <button type="button" key={size} className={`chip ${settings.watermark_size === size ? 'is-on' : ''}`} aria-pressed={settings.watermark_size === size} onClick={() => setSettings({ ...settings, watermark_size: size })}>{size}%</button>)}</div>
                    </div>
                    <div className="watermark-subsection watermark-opacity">
                      <label className="row">Opasitas · {settings.watermark_opacity}%<input className="studio-range" type="range" min="0" max="100" value={settings.watermark_opacity} onChange={(event) => setSettings({ ...settings, watermark_opacity: Number(event.target.value) })} /></label>
                    </div>
                  </div>
                  <div className="watermark-subsection watermark-position">
                    <div className="watermark-position__heading"><div><strong>Posisi watermark</strong><span className="helper">Atur titik penempatan pada video.</span></div><button type="button" className="btn-secondary btn-sm" onClick={() => setSettings({ ...settings, watermark_size: 20, watermark_opacity: 80, watermark_x: 88, watermark_y: 8 })}>Reset</button></div>
                    <div className="watermark-position-grid">
                      <label className="row">Horizontal · {settings.watermark_x}%<input className="studio-range" type="range" min="0" max="100" value={settings.watermark_x} onChange={(event) => setSettings({ ...settings, watermark_x: Number(event.target.value) })} /></label>
                      <label className="row">Vertikal · {settings.watermark_y}%<input className="studio-range" type="range" min="0" max="100" value={settings.watermark_y} onChange={(event) => setSettings({ ...settings, watermark_y: Number(event.target.value) })} /></label>
                    </div>
                    <div className="watermark-position-presets">{[['Kiri Atas', 4, 4], ['Atas Tengah', 40, 4], ['Kanan Atas', 80, 4], ['Tengah', 40, 45], ['Kiri Bawah', 4, 88], ['Bawah Tengah', 40, 88], ['Kanan Bawah', 80, 88]].map(([label, x, y]) => <button type="button" key={label} className={`chip ${settings.watermark_x === x && settings.watermark_y === y ? 'is-on' : ''}`} aria-pressed={settings.watermark_x === x && settings.watermark_y === y} onClick={() => setSettings({ ...settings, watermark_x: Number(x), watermark_y: Number(y) })}>{label}</button>)}</div>
                  </div>
                </div>}
              </section>
            </details>
            <details className="studio-step">
              <summary className="studio-step-heading"><span>07</span><h3>{t.studioStepRender}</h3></summary>
            <div className="studio-option-grid">
              <label className="row">Awalan nama file<input className="input" maxLength={40} value={settings.filename_prefix} onChange={(event) => setSettings({ ...settings, filename_prefix: event.target.value })} placeholder="Contoh: Shorts" /></label>
              <label className="row">Akhiran nama file<input className="input" maxLength={40} value={settings.filename_suffix} onChange={(event) => setSettings({ ...settings, filename_suffix: event.target.value })} placeholder="Contoh: 1080p" /></label>
            </div>
            <p className="helper">Nama berkas contoh: {filenamePreview}.mp4 · ID unik ditambahkan otomatis.</p>
            <div className="row">
              <span className="field-label">Akselerasi render</span>
              <ThemedSelect
                label="Akselerasi render"
                value={settings.encoder}
                options={[
                  { value: 'auto', label: 'Deteksi otomatis (direkomendasikan)' },
                  { value: 'nvenc', label: `NVIDIA NVENC${encoderCaps && !encoderCaps.nvenc ? ' · tidak tersedia' : ''}`, disabled: !encoderCaps?.nvenc },
                  { value: 'amf', label: `AMD AMF${encoderCaps && !encoderCaps.amf ? ' · tidak tersedia' : ''}`, disabled: !encoderCaps?.amf },
                  { value: 'qsv', label: `Intel QuickSync${encoderCaps && !encoderCaps.qsv ? ' · tidak tersedia' : ''}`, disabled: !encoderCaps?.qsv },
                  { value: 'cpu', label: `Software CPU (libx264)${encoderCaps && !encoderCaps.cpu ? ' · tidak tersedia' : ''}`, disabled: encoderCaps ? !encoderCaps.cpu : false },
                ]}
                onChange={(value) => setSettings({ ...settings, encoder: value as StudioSettings['encoder'] })}
              />
            </div>
            <p className="helper">Pilihan dikunci ke kemampuan encoder FFmpeg server, bukan GPU di browser Anda.</p>
            </details>
          </div>

          <details className="panel studio-batch-details">
            <summary className="studio-batch-summary" onClick={(event) => {
              const batch = event.currentTarget.parentElement as HTMLDetailsElement | null
              if (batch?.open) return
              if (subtitleValidationError) openStudioStep(3)
              else if (watermarkValidationError) openStudioStep(5)
            }}><strong>{t.studioBatch} ({selected.length}/5)</strong><span>{selected.length === 0 ? t.studioPickAtLeastOne : subtitleValidationError ? t.studioSubtitleFixNeeded : watermarkValidationError ? t.studioWatermarkFixNeeded : t.studioBatchSummary}</span></summary>
            <div className="studio-batch-content">
              <section className="studio-batch-selection" aria-labelledby="studio-batch-selection-title">
                <div className="studio-batch-selection__heading">
                  <strong id="studio-batch-selection-title">{t.studioPickClips}</strong>
                  <span>{selected.length} {t.studioMaxSelected}</span>
                </div>
                {selected.length === 0 && <p className="helper">{t.studioPickAtLeastOne}</p>}
                <div className="studio-batch-selection__list">
                  {clips.map((clip, index) => {
                    const key = clipKey(clip)
                    const isSelected = Boolean(marked[key])
                    const atLimit = selected.length >= 5 && !isSelected
                    return <label key={key} className="studio-batch-selection__item">
                      <input type="checkbox" checked={isSelected} disabled={atLimit || running} onChange={() => onToggleMark(key)} />
                      <span>Klip {index + 1}</span>
                      <span className="studio-batch-selection__title">{clip.title}</span>
                      <span className="studio-batch-selection__duration">{formatClipSeconds(clip.end_time - clip.start_time)} dtk</span>
                    </label>
                  })}
                </div>
              </section>
              <div className="studio-export-summary">
                <strong>{t.studioExportSummary}</strong>
                <span>{aspectDisplayName} · {outputResolution[0]}×{outputResolution[1]} · MP4 / H.264</span>
                <span>{selected.length} klip · {Math.round(selected.reduce((sum, clip) => sum + clip.end_time - clip.start_time, 0))} detik total · Subtitle {settings.caption === 'off' ? 'nonaktif' : `aktif (${selected.reduce((sum, clip) => sum + (subtitleEdits[clipKey(clip)] ?? clipSubtitleLines(transcript, clip.start_time, clip.end_time)).length, 0)} baris)`}</span>
                <span>Audio: sumber {settings.source_volume}%{settings.bgm_asset ? ` · musik ${settings.bgm_volume}% mulai ${(settings.bgm_start_ms / 1000).toFixed(1)} dtk${settings.bgm_ducking ? ' · ducking aktif' : ''}` : ''}{settings.sfx_asset ? ` · SFX ${settings.sfx_volume}% · offset ${(settings.sfx_offset_ms / 1000).toFixed(1)} dtk dari hook` : ''}</span>
                <span>Watermark: {settings.watermark_enabled ? `${settings.watermark_type === 'logo' ? 'logo' : 'teks'} · ukuran ${settings.watermark_size}% · opasitas ${settings.watermark_opacity}%` : 'nonaktif'} · Encoder: {settings.encoder === 'auto' ? 'otomatis' : settings.encoder.toUpperCase()}</span>
                <span>Nama file: {filenamePreview}.mp4 · ID unik ditambahkan saat ekspor</span>
              </div>
              {subtitleValidationError && <div className="error-box" role="alert">
                <p>{t.studioSubtitleInvalid}</p>
                <div className="studio-batch-invalid-list">{invalidSubtitleKeys.map((key) => {
                  const index = clips.findIndex((clip) => clipKey(clip) === key)
                  return <button key={key} type="button" className="btn-secondary btn-sm" onClick={() => {
                    if (!marked[key]) onToggleMark(key)
                    setPreviewSelectionKey(key)
                    openStudioStep(3)
                  }}>{t.studioFixSubtitle(index + 1)}</button>
                })}</div>
              </div>}
              {watermarkValidationError && <div className="error-box" role="alert">
                <p>{t.studioWatermarkIncomplete}</p>
                <button type="button" className="btn-secondary btn-sm" onClick={() => {
                  openStudioStep(5)
                }}>{t.studioFixWatermark}</button>
              </div>}
              {error && <p className="error-box" role="alert">{error}</p>}
              {notice && <p className="notice" role="status">{notice}</p>}
              {running && <div className="batch-progress" role="status" aria-live="polite">
                <div className="batch-progress-label">
                  <span>{batchProgress < 10 ? 'Menyiapkan sumber video…' : `Merender klip ${Math.min(selected.length, Math.floor(Math.max(0, batchProgress - 10) / 90 * selected.length) + 1)} dari ${selected.length}`}</span>
                  <strong>{Math.round(batchProgress)}%</strong>
                </div>
                <div className="progress"><div style={{ width: `${Math.max(2, batchProgress)}%` }} /></div>
              </div>}
              {items.length === 0 && <p className="helper">Pilih klip, lalu mulai ekspor.</p>}
              {items.map((item) => (
                <div key={item.key} className="batch-item">
                  <div className="studio-batch-item__copy"><span>{item.title}</span>{item.focusDetection && <small>Framing: {focusResultLabel(item.focusDetection)}{item.focusDetection.mode !== 'not-applicable' ? ` · X ${item.focusDetection.focal_x ?? 50}% / Y ${item.focusDetection.focal_y ?? 50}%` : ''}</small>}</div>
                  {item.status === 'done' && item.downloadUrl ? (
                    <a className="btn-secondary btn-sm" href={item.downloadUrl} download>{t.downloadClip}</a>
                  ) : (
                    <span className={`status status--${item.status === 'error' ? 'err' : item.status === 'done' ? 'done' : 'run'}`}>
                      {item.status === 'error' ? 'Gagal' : item.status === 'done' ? 'Selesai' : item.status === 'queued' ? 'Menunggu' : t.rendering}
                    </span>
                  )}
                </div>
              ))}
              <button type="button" className="btn-primary" onClick={() => void startBatch()} disabled={running || subtitleValidationError || watermarkValidationError || selected.length === 0 || selected.length > 5}>
                {running ? t.rendering : t.batchRender}
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
