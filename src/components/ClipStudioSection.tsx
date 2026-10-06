import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '../locales';
import { resilientFetch } from '../utils/api';
import type {
  ViralClip,
  RenderSettings,
  AspectRatioOption,
  BackgroundStyle,
  CaptionStyle,
  CaptionFont,
  TitlePosition,
  StreamerPreset,
  FacecamPosition,
  FontSizeOption,
  TextCaseOption,
  TitleDurationOption,
  SubtitlePositionMode,
  BatchRenderProgress,
  HardwareAccelOption,
  HardwareAccelInfo,
  TranscriptLine,
} from '../types';

interface ClipStudioSectionProps {
  videoUrl: string;
  videoId: string;
  allClips: ViralClip[];
  transcript?: TranscriptLine[];
  markedClips: ViralClip[];
  activeClip: ViralClip | null;
  onStartRender: (settings: RenderSettings) => void;
  isRendering: boolean;
  onToggleMarkClip?: (clip: ViralClip) => void;
  onToggleAllClips?: (forceSelect?: boolean) => void;
  batchProgress?: BatchRenderProgress | null;
  onDismissProgress?: () => void;
  onRetryClip?: (clipIndex?: number) => void;
  isWorkspaceOpen: boolean;
  onExitWorkspace: () => void;
}

function getFriendlyErrorMessage(rawMsg: string): string {
  if (!rawMsg) return 'Rendering failed unexpectedly.';
  const lower = rawMsg.toLowerCase();
  if (lower.includes("moov atom not found")) {
    return 'Download interrupted by internet lag ("moov atom not found"). The video stream was cut off before finishing. Click " Retry" to re-download.';
  }
  if (lower.includes("bot verification") || lower.includes("sign in") || lower.includes("confirm you're not a bot")) {
    return 'YouTube requires cookies verification. Click the  Cookies Manager button in the top navbar to save your YouTube cookies.';
  }
  if (lower.includes("rendering timed out") || (lower.includes("timed out") && lower.includes("rendering"))) {
    return 'Video rendering timed out due to duration/complexity. Click " Retry" or switch to Universal CPU encoder in Studio Settings.';
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return 'Video download timed out due to slow/laggy internet connection. Click " Retry" to try downloading again.';
  }
  if (lower.includes("hardware encoder") || (lower.includes("ffmpeg") && (lower.includes("nvenc") || lower.includes("amf") || lower.includes("qsv")))) {
    return 'GPU hardware encoder failed. Please switch Video Encoder to "Universal CPU (libx264)" in Studio Settings.';
  }
  if (lower.includes("no space left") || lower.includes("disk full") || lower.includes("out of disk")) {
    return 'Disk storage is full. Please click " Clear Temp" to free up storage space.';
  }
  if (lower.includes("whisper") || lower.includes("transcribe")) {
    return 'Word transcription failed. Check your audio track or switch subtitle style to none.';
  }
  if (lower.includes("ffmpeg") || lower.includes("filter_complex")) {
    return 'FFmpeg video rendering failed during composition. Check error details below.';
  }
  return rawMsg.length > 140 ? rawMsg.slice(0, 140) + '...' : rawMsg;
}

const ClipRenderErrorBox: React.FC<{ errorMessage: string; t: any; onRetry?: () => void }> = ({ errorMessage, t, onRetry }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(errorMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const friendly = getFriendlyErrorMessage(errorMessage);

  return (
    <div
      style={{
        marginTop: '0.4rem',
        padding: '0.55rem 0.75rem',
        background: 'rgba(132, 132, 132, 0.08)',
        border: '1px solid rgba(132, 132, 132, 0.28)',
        borderRadius: '7px',
        fontSize: '0.72rem',
        color: '#bcbcbc',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.9rem', flexShrink: 0 }}></span>
          <span style={{ fontWeight: 600, color: '#bcbcbc' }}>{friendly}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              style={{
                background: 'linear-gradient(135deg, #b1b1b1, #909090)',
                border: '1px solid rgba(177, 177, 177, 0.6)',
                borderRadius: '4px',
                color: '#ffffff',
                fontSize: '0.65rem',
                padding: '2px 8px',
                cursor: 'pointer',
                fontWeight: 700,
                transition: 'all 0.2s ease',
                boxShadow: '0 0 8px rgba(177, 177, 177, 0.35)',
              }}
              title={t.studio.retryClipTooltip}
            >
              {t.studio.retryClipBtn}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            style={{
              background: copied ? 'rgba(163, 163, 163, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${copied ? 'rgba(163, 163, 163, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '4px',
              color: copied ? '#bbbbbb' : '#e7e7e7',
              fontSize: '0.65rem',
              padding: '2px 7px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
            title={t.studio.copyErrorTooltip}
          >
            {copied ? (t.studio.copiedErrorBtn) : (t.studio.copyErrorBtn)}
          </button>
        </div>
      </div>

      <details style={{ fontSize: '0.67rem', color: '#a2a2a2', marginTop: '0.15rem' }}>
        <summary style={{ cursor: 'pointer', color: '#d4d4d4', userSelect: 'none', fontWeight: 500 }}>
          {t.studio.errorDetails}
        </summary>
        <pre
          style={{
            margin: '0.35rem 0 0 0',
            padding: '0.4rem 0.55rem',
            background: 'rgba(0, 0, 0, 0.55)',
            border: '1px solid rgba(132, 132, 132, 0.2)',
            borderRadius: '4px',
            color: '#9b9b9b',
            fontSize: '0.65rem',
            fontFamily: 'Inter',
            whiteSpace: 'pre-wrap',
            maxHeight: '130px',
            overflowY: 'auto',
          }}
        >
          {errorMessage}
        </pre>
      </details>
    </div>
  );
};

export const ClipStudioSection: React.FC<ClipStudioSectionProps> = ({
  videoUrl,
  videoId,
  allClips,
  transcript = [],
  markedClips,
  activeClip,
  onStartRender,
  isRendering,
  onToggleMarkClip,
  onToggleAllClips,
  batchProgress,
  onDismissProgress,
  onRetryClip,
  isWorkspaceOpen,
  onExitWorkspace,
}) => {
  const { t, language } = useLanguage();
  const [activeStudioTab, setActiveStudioTab] = useState<'clips' | 'frame' | 'text' | 'audio' | 'export'>('clips');
  // Directly reflect marked clips (supports selecting 0 clips)
  const [selectedClips, setSelectedClips] = useState<ViralClip[]>(markedClips);
  const [previewClipIndex, setPreviewClipIndex] = useState<number>(0);

  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('9:16');
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('black');
  const [enableFaceTracking, setEnableFaceTracking] = useState<boolean>(true);
  const [streamerPreset, setStreamerPreset] = useState<StreamerPreset>('none');
  const [facecamPosition, setFacecamPosition] = useState<FacecamPosition>('auto');
  const [titlePrefix, setTitlePrefix] = useState<string>('');
  const [titleSuffix, setTitleSuffix] = useState<string>('');
  const [customClipTitles, setCustomClipTitles] = useState<Record<string, string>>({});
  const [titlePosition, setTitlePosition] = useState<TitlePosition>('auto');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('viral_pop');
  const [lastActiveCaptionStyle, setLastActiveCaptionStyle] = useState<CaptionStyle>('viral_pop');
  const [captionFont, setCaptionFont] = useState<CaptionFont>('Inter');
  const [titleFont, setTitleFont] = useState<CaptionFont>('Montserrat');
  const [fontSize, setFontSize] = useState<FontSizeOption>('medium');
  const [fontSizePx, setFontSizePx] = useState<number>(75);
  const [titleFontSize, setTitleFontSize] = useState<FontSizeOption>('medium');
  const [titleFontSizePx, setTitleFontSizePx] = useState<number>(75);
  const [textCase, setTextCase] = useState<TextCaseOption>('uppercase');
  const [titleTextCase, setTitleTextCase] = useState<TextCaseOption>('uppercase');

  const fontOptions: CaptionFont[] = ['Inter', 'Montserrat'];
  const [fileNamePrefix, setFileNamePrefix] = useState<string>('');
  const [fileNameSuffix, setFileNameSuffix] = useState<string>('');

  // Manual Up/Down positioning for All Formats
  const [titleYPercent, setTitleYPercent] = useState<number>(17);
  const [subtitleYPercent, setSubtitleYPercent] = useState<number>(21);
  const [subtitlePositionMode, setSubtitlePositionMode] = useState<SubtitlePositionMode>('bottom');
  const [subtitleCenterYPercent, setSubtitleCenterYPercent] = useState<number>(50);
  const [isCustomTitleY, setIsCustomTitleY] = useState<boolean>(false);
  const [titleDuration, setTitleDuration] = useState<TitleDurationOption>('entire');
  const [isClearingTemp, setIsClearingTemp] = useState<boolean>(false);
  const [tempClearMsg, setTempClearMsg] = useState<string>('');
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  // Original Voice Audio Boost (0% - 200%, default 100%)
  const [originalAudioVolume, setOriginalAudioVolume] = useState<number>(100);

  // Background Music (BGM) state
  const [bgmEnabled, setBgmEnabled] = useState<boolean>(false);
  const [bgmFileName, setBgmFileName] = useState<string>('');
  const [bgmFilePath, setBgmFilePath] = useState<string>('');
  const [bgmAudioUrl, setBgmAudioUrl] = useState<string>('');
  const [bgmVolume, setBgmVolume] = useState<number>(25);
  const [bgmDuration, setBgmDuration] = useState<number>(0);
  const [bgmStartOffset, setBgmStartOffset] = useState<number>(0);
  const [isBgmPlaying, setIsBgmPlaying] = useState<boolean>(false);
  const [isUploadingBgm, setIsUploadingBgm] = useState<boolean>(false);
  const [isBgmDragging, setIsBgmDragging] = useState<boolean>(false);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  // Hook Sound Effect (SFX) state
  const [hookSfxEnabled, setHookSfxEnabled] = useState<boolean>(false);
  const [hookSfxFileName, setHookSfxFileName] = useState<string>('');
  const [hookSfxFilePath, setHookSfxFilePath] = useState<string>('');
  const [hookSfxAudioUrl, setHookSfxAudioUrl] = useState<string>('');
  const [hookSfxVolume, setHookSfxVolume] = useState<number>(100);
  const [isHookSfxPlaying, setIsHookSfxPlaying] = useState<boolean>(false);
  const [isUploadingHookSfx, setIsUploadingHookSfx] = useState<boolean>(false);
  const [isHookSfxDragging, setIsHookSfxDragging] = useState<boolean>(false);
  const hookSfxAudioRef = useRef<HTMLAudioElement | null>(null);

  // Watermark state & default configs
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(false);
  const [watermarkType, setWatermarkType] = useState<'image' | 'text'>('image');
  const [watermarkImageFileName, setWatermarkImageFileName] = useState<string>('');
  const [watermarkImageFilePath, setWatermarkImageFilePath] = useState<string>('');
  const [watermarkImageUrl, setWatermarkImageUrl] = useState<string>('');
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [watermarkSize, setWatermarkSize] = useState<number>(20);
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(80);
  const [watermarkX, setWatermarkX] = useState<number>(88);
  const [watermarkY, setWatermarkY] = useState<number>(8);
  const [isUploadingWatermark, setIsUploadingWatermark] = useState<boolean>(false);
  const [isWatermarkDragging, setIsWatermarkDragging] = useState<boolean>(false);
  const phoneContainerRef = useRef<HTMLDivElement | null>(null);

  // Hardware acceleration / Video Encoder state
  const [hardwareAccel, setHardwareAccel] = useState<HardwareAccelOption>('auto');
  const [hardwareInfo, setHardwareInfo] = useState<HardwareAccelInfo | null>(null);

  useEffect(() => {
    const fetchHardwareSupport = async () => {
      try {
        const res = await resilientFetch('/api/hardware-accel', { maxRetries: 4, retryDelay: 1000, silent: true });
        if (res.ok) {
          const data: HardwareAccelInfo = await res.json();
          setHardwareInfo(data);
        }
      } catch {
        // Backend offline or loading
      }
    };
    fetchHardwareSupport();
  }, []);

  // Playable video player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [playerReady, setPlayerReady] = useState<boolean>(false);

  // Face & object detection tracking state
  const [faceBox, setFaceBox] = useState<{ cx: number; cy: number; w: number; h: number; found: boolean; type?: string }>({
    cx: 0.5,
    cy: 0.35,
    w: 0.25,
    h: 0.25,
    found: false,
  });

  const previewPlayerRef = useRef<any>(null);
  const directVideoRef = useRef<HTMLVideoElement | null>(null);
  const ambientVideoRef = useRef<HTMLVideoElement | null>(null);
  const trackingTimerRef = useRef<number | null>(null);

  // Keep selectedClips in sync if markedClips updates from outside (including 0 clips)
  useEffect(() => {
    setSelectedClips(markedClips);
  }, [markedClips]);

  // Prefer a clip selected for rendering; fall back to the active result clip when none are marked.
  useEffect(() => {
    const preferredClip = markedClips[0] || activeClip;
    if (!preferredClip) return;
    const idx = allClips.findIndex(
      c => c.start_time === preferredClip.start_time && c.end_time === preferredClip.end_time
    );
    if (idx !== -1) setPreviewClipIndex(idx);
  }, [activeClip, markedClips, allClips]);

  const currentPreviewClip = allClips[previewClipIndex] || allClips[0] || null;
  const clipStart = currentPreviewClip ? currentPreviewClip.start_time : 0;
  const clipEnd = currentPreviewClip ? currentPreviewClip.end_time : 60;
  const clipDuration = Math.max(1, clipEnd - clipStart);

  // Mirror the renderer's transcript-to-word timing so the live preview shows
  // the same analyzed dialogue and active-word animation as the exported video.
  const previewCaption = useMemo(() => {
    if (!currentPreviewClip || !transcript.length || captionStyle === 'none') return null;

    const words: Array<{ text: string; start: number; end: number }> = [];
    for (const line of transcript) {
      const rawText = line.text || '';
      const cleaned = rawText
        .replace(/\[.*?\]|\(.*?\)|\*.*?\*/g, ' ')
        .replace(/\b(laughter|applause|music|cheering|snickering|giggle|cough)\b/gi, ' ')
        .replace(/[^\p{L}\p{N}\s.,%&$?]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) continue;

      const lineStart = Number(line.start) || 0;
      const lineEnd = Number(line.end) > lineStart
        ? Number(line.end)
        : lineStart + Math.max(1.8, cleaned.split(/\s+/).length * 0.38);
      if (lineEnd <= clipStart || lineStart >= clipEnd) continue;

      const lineWords = cleaned.split(/\s+/);
      const lineDuration = Math.max(0.2, lineEnd - lineStart);
      const totalChars = Math.max(1, lineWords.reduce((sum, word) => sum + Math.max(1, word.length), 0));
      let cursor = lineStart;
      for (const word of lineWords) {
        const wordDuration = Math.max(0.15, (Math.max(1, word.length) / totalChars) * lineDuration);
        const wordStart = cursor;
        const wordEnd = cursor + wordDuration;
        cursor = wordEnd;
        if (wordEnd <= clipStart || wordStart >= clipEnd) continue;
        words.push({
          text: word,
          start: Math.max(0, wordStart - clipStart),
          end: Math.max(Math.max(0, wordStart - clipStart) + 0.12, Math.min(clipDuration, wordEnd - clipStart)),
        });
      }
    }

    words.sort((a, b) => a.start - b.start);
    const chunks: typeof words[] = [];
    let chunk: typeof words = [];
    let chunkChars = 0;
    for (const word of words) {
      const length = word.text.length;
      if (chunk.length >= 3 || (chunk.length > 0 && chunkChars + length > 16)) {
        chunks.push(chunk);
        chunk = [word];
        chunkChars = length;
      } else {
        chunk.push(word);
        chunkChars += length + 1;
      }
    }
    if (chunk.length) chunks.push(chunk);

    const chunkBounds: Array<[number, number]> = [];
    for (const items of chunks) {
      const start = Math.max(items[0].start, chunkBounds[chunkBounds.length - 1]?.[1] || 0);
      chunkBounds.push([start, Math.max(start + 0.25, items[items.length - 1].end)]);
    }
    for (let index = 0; index < chunkBounds.length - 1; index += 1) {
      if (chunkBounds[index][1] > chunkBounds[index + 1][0]) {
        chunkBounds[index][1] = chunkBounds[index + 1][0];
      }
    }
    for (const bounds of chunkBounds) {
      if (bounds[1] <= bounds[0]) bounds[1] = bounds[0] + 0.2;
    }

    const relativeTime = currentTime - clipStart;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const items = chunks[chunkIndex];
      const [start, end] = chunkBounds[chunkIndex];
      if (relativeTime < start || relativeTime >= end) continue;

      const points = [start];
      for (let wordIndex = 1; wordIndex < items.length; wordIndex += 1) {
        const minimum = points[points.length - 1] + 0.08;
        const maximum = end - 0.08 * (items.length - wordIndex);
        const point = minimum > maximum
          ? points[points.length - 1] + (end - points[points.length - 1]) / (items.length - wordIndex + 1)
          : Math.max(minimum, Math.min(maximum, items[wordIndex].start));
        points.push(point);
      }
      points.push(end);
      const activeIndex = items.findIndex((_, index) => relativeTime >= points[index] && relativeTime < points[index + 1]);
      if (activeIndex !== -1) return { words: items.map(item => item.text), activeIndex };
    }
    return null;
  }, [transcript, currentPreviewClip, clipStart, clipEnd, clipDuration, currentTime, captionStyle]);

  const captionHighlightColor: Record<CaptionStyle, string> = {
    viral_pop: '#ffe600',
    beast_punch: '#00ff66',
    cyber_violet: '#d946ef',
    fire_red: '#ff2e2e',
    electric_cyan: '#00f0ff',
    golden_aura: '#ffb800',
    clean_minimal: '#e0e0e0',
    none: '#ffffff',
  };

  // Fetch face/object detection coordinates
  useEffect(() => {
    if (!videoId) return;
    let isMounted = true;
    const fetchFace = async () => {
      try {
        const res = await fetch(`/api/detect-face?video_id=${encodeURIComponent(videoId)}&timestamp=${clipStart}&video_url=${encodeURIComponent(videoUrl || '')}&facecam_position=${encodeURIComponent(facecamPosition)}&streamer_preset=${encodeURIComponent(streamerPreset)}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data && typeof data.cx === 'number') {
            setFaceBox(data);
          }
        }
      } catch (err) {
        console.warn('Face detection fetch failed:', err);
      }
    };
    fetchFace();
    return () => { isMounted = false; };
  }, [videoId, previewClipIndex, clipStart, videoUrl, facecamPosition, streamerPreset]);

  // Calculate horizontal crop percentage (0 = leftmost edge, 50 = center, 100 = rightmost edge)
  const previewCropPercent = useMemo(() => {
    if (!enableFaceTracking || streamerPreset !== 'none') {
      return 50;
    }
    if (facecamPosition === 'left') return 28;
    if (facecamPosition === 'right') return 72;
    if (facecamPosition === 'center') return 50;
    if (faceBox && faceBox.found && typeof faceBox.cx === 'number') {
      let safeCx = faceBox.cx;
      if (0.46 <= safeCx && safeCx <= 0.54) {
        safeCx = 0.50;
      }
      safeCx = Math.max(0.15, Math.min(0.85, safeCx));
      if (aspectRatio === '9:16') {
        const cropRatio = Math.max(0.0, Math.min(1.0, (safeCx - 0.158) / 0.684));
        return Math.round(cropRatio * 100);
      } else if (aspectRatio === '1:1') {
        const cropRatio = Math.max(0.0, Math.min(1.0, (safeCx - 0.281) / 0.438));
        return Math.round(cropRatio * 100);
      } else if (aspectRatio === '4:3') {
        const cropRatio = Math.max(0.0, Math.min(1.0, (safeCx - 0.375) / 0.25));
        return Math.round(cropRatio * 100);
      } else {
        return Math.round(safeCx * 100);
      }
    }
    return 50;
  }, [enableFaceTracking, aspectRatio, streamerPreset, facecamPosition, faceBox]);

  // Helper duration formatter
  const formatDuration = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${m}:${remS < 10 ? '0' : ''}${remS}`;
  };

  // Initialize YouTube player or HTML5 direct video
  const initPreviewPlayer = () => {
    if (!videoId && !videoUrl) return;

    const isDirect = Boolean(videoUrl && (videoUrl.endsWith('.mp4') || videoUrl.endsWith('.webm') || videoUrl.endsWith('.mov') || videoUrl.endsWith('.mkv') || videoUrl.includes('/api/video') || videoUrl.startsWith('blob:') || videoId?.startsWith('upload_') || videoId?.startsWith('gdrive_')));
    if (isDirect) {
      setPlayerReady(true);
      setCurrentTime(clipStart);
      return;
    }

    if (window.YT && window.YT.Player) {
      const container = document.getElementById('studio-preview-yt-container');
      if (!container) return;

      if (previewPlayerRef.current) {
        try {
          previewPlayerRef.current.destroy();
        } catch (e) {}
        previewPlayerRef.current = null;
      }

      container.innerHTML = '<div id="studio-yt-iframe-slot"></div>';

      try {
        const startSec = Math.floor(clipStart);
        previewPlayerRef.current = new window.YT.Player('studio-yt-iframe-slot', {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            enablejsapi: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            autohide: 1,
            start: startSec,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              setPlayerReady(true);
              try {
                event.target.mute();
                setIsMuted(true);
                if (typeof event.target.unloadModule === 'function') {
                  event.target.unloadModule('captions');
                  event.target.unloadModule('cc');
                }
                event.target.seekTo(clipStart, true);
                setCurrentTime(clipStart);
              } catch (e) {}
            },
            onStateChange: (event: any) => {
              if (event.data === 1) {
                // PLAYING
                setIsPlaying(true);
                startTracking();
              } else {
                setIsPlaying(false);
                stopTracking();
                if (event.data === 0 && isLooping && currentPreviewClip) {
                  try {
                    previewPlayerRef.current.seekTo(clipStart, true);
                    previewPlayerRef.current.playVideo();
                  } catch (e) {}
                }
              }
            },
          },
        });
      } catch (err) {
        console.error('Error instantiating studio player:', err);
      }
    } else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      setTimeout(initPreviewPlayer, 300);
    }
  };

  const startTracking = () => {
    stopTracking();
    trackingTimerRef.current = window.setInterval(() => {
      try {
        if (previewPlayerRef.current && typeof previewPlayerRef.current.getCurrentTime === 'function') {
          const iframe = document.getElementById('studio-yt-iframe-slot');
          if (iframe && iframe.parentElement) {
            const t = previewPlayerRef.current.getCurrentTime();
            if (typeof t === 'number' && !isNaN(t)) {
              setCurrentTime(t);
              if (currentPreviewClip && t >= currentPreviewClip.end_time) {
                if (isLooping) {
                  previewPlayerRef.current.seekTo(currentPreviewClip.start_time, true);
                } else {
                  previewPlayerRef.current.pauseVideo();
                }
              }
            }
          }
        } else if (directVideoRef.current) {
          const t = directVideoRef.current.currentTime;
          if (typeof t === 'number' && !isNaN(t)) {
            setCurrentTime(t);
            if (ambientVideoRef.current && Math.abs(ambientVideoRef.current.currentTime - t) > 0.3) {
              ambientVideoRef.current.currentTime = t;
            }
            if (currentPreviewClip && t >= currentPreviewClip.end_time) {
              if (isLooping) {
                directVideoRef.current.currentTime = currentPreviewClip.start_time;
                if (ambientVideoRef.current) ambientVideoRef.current.currentTime = currentPreviewClip.start_time;
              } else {
                directVideoRef.current.pause();
                if (ambientVideoRef.current) ambientVideoRef.current.pause();
                setIsPlaying(false);
              }
            }
          }
        }
      } catch (e) {}
    }, 150);
  };

  const stopTracking = () => {
    if (trackingTimerRef.current !== null) {
      clearInterval(trackingTimerRef.current);
      trackingTimerRef.current = null;
    }
  };

  useEffect(() => {
    initPreviewPlayer();
    return () => {
      stopTracking();
      if (previewPlayerRef.current) {
        try {
          previewPlayerRef.current.destroy();
        } catch (e) {}
        previewPlayerRef.current = null;
      }
    };
  }, [videoId, previewClipIndex]);

  // When previewClipIndex changes, seek player to new clip start
  useEffect(() => {
    setCurrentTime(clipStart);
    if (previewPlayerRef.current && typeof previewPlayerRef.current.seekTo === 'function') {
      try {
        previewPlayerRef.current.seekTo(clipStart, true);
      } catch (e) {}
    } else if (directVideoRef.current) {
      directVideoRef.current.currentTime = clipStart;
      if (ambientVideoRef.current) ambientVideoRef.current.currentTime = clipStart;
    }
  }, [previewClipIndex, clipStart]);

  const togglePlayPause = () => {
    if (previewPlayerRef.current) {
      try {
        if (isPlaying) {
          previewPlayerRef.current.pauseVideo();
        } else {
          if (currentPreviewClip && (currentTime >= currentPreviewClip.end_time || currentTime < currentPreviewClip.start_time)) {
            previewPlayerRef.current.seekTo(currentPreviewClip.start_time, true);
          }
          previewPlayerRef.current.playVideo();
        }
      } catch (e) {}
    } else if (directVideoRef.current) {
      if (isPlaying) {
        directVideoRef.current.pause();
        if (ambientVideoRef.current) ambientVideoRef.current.pause();
        setIsPlaying(false);
      } else {
        if (currentPreviewClip && (currentTime >= currentPreviewClip.end_time || currentTime < currentPreviewClip.start_time)) {
          directVideoRef.current.currentTime = currentPreviewClip.start_time;
          if (ambientVideoRef.current) ambientVideoRef.current.currentTime = currentPreviewClip.start_time;
        }
        directVideoRef.current.play();
        if (ambientVideoRef.current) ambientVideoRef.current.play().catch(() => {});
        setIsPlaying(true);
        startTracking();
      }
    }
  };

  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    if (previewPlayerRef.current && typeof previewPlayerRef.current.seekTo === 'function') {
      try {
        previewPlayerRef.current.seekTo(newTime, true);
      } catch (e) {}
    } else if (directVideoRef.current) {
      directVideoRef.current.currentTime = newTime;
      if (ambientVideoRef.current) ambientVideoRef.current.currentTime = newTime;
    }
  };

  const handleRestart = () => {
    setCurrentTime(clipStart);
    if (previewPlayerRef.current && typeof previewPlayerRef.current.seekTo === 'function') {
      try {
        previewPlayerRef.current.seekTo(clipStart, true);
        previewPlayerRef.current.playVideo();
      } catch (e) {}
    } else if (directVideoRef.current) {
      directVideoRef.current.currentTime = clipStart;
      directVideoRef.current.play();
      setIsPlaying(true);
      startTracking();
    }
  };

  const toggleMute = () => {
    if (previewPlayerRef.current) {
      try {
        if (isMuted) {
          previewPlayerRef.current.unMute();
          setIsMuted(false);
        } else {
          previewPlayerRef.current.mute();
          setIsMuted(true);
        }
      } catch (e) {}
    } else if (directVideoRef.current) {
      directVideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleClip = (clip: ViralClip) => {
    if (onToggleMarkClip) {
      onToggleMarkClip(clip);
    }
    const exists = selectedClips.some(
      c => c.start_time === clip.start_time && c.end_time === clip.end_time
    );
    if (exists) {
      setSelectedClips(
        selectedClips.filter(c => !(c.start_time === clip.start_time && c.end_time === clip.end_time))
      );
    } else {
      setSelectedClips([...selectedClips, clip]);
    }
  };

  const handleToggleAllClips = () => {
    const isAllSelected = allClips.length > 0 && selectedClips.length === allClips.length;
    if (onToggleAllClips) {
      onToggleAllClips(!isAllSelected);
    } else {
      if (isAllSelected) {
        setSelectedClips([]);
      } else {
        setSelectedClips([...allClips]);
      }
    }
  };

  const handleClearTempClick = () => {
    setShowClearConfirmModal(true);
  };

  const executeClearTemp = async () => {
    if (isClearingTemp) return;
    setIsClearingTemp(true);
    setTempClearMsg('');
    try {
      const resp = await fetch('/api/clear-temp', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        setTempClearMsg(` ${language === 'id' ? t.studio.tempCleared : (data.message || t.studio.tempCleared)}`);
        setTimeout(() => setTempClearMsg(''), 4500);
      } else {
        setTempClearMsg(t.studio.tempClearFailed);
      }
    } catch (e) {
      console.error('Error clearing temp cache:', e);
      setTempClearMsg(t.studio.tempClearFailed);
    } finally {
      setIsClearingTemp(false);
      setShowClearConfirmModal(false);
    }
  };

  // Background Music handlers
  const uploadBgmFile = async (file: File) => {
    if (!file) return;
    setIsUploadingBgm(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-bgm', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to upload background music');
      }
      const data = await res.json();
      setBgmFileName(data.filename || file.name);
      setBgmFilePath(data.file_path);
      setBgmAudioUrl(data.url);
      setBgmEnabled(true);
    } catch (err) {
      console.error('BGM upload error:', err);
      alert(t.studio.uploadMusicFailed);
    } finally {
      setIsUploadingBgm(false);
    }
  };

  const handleBgmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadBgmFile(file);
    e.target.value = '';
  };

  const handleBgmLoadedMetadata = () => {
    if (bgmAudioRef.current) {
      const dur = bgmAudioRef.current.duration;
      if (dur && !isNaN(dur)) {
        setBgmDuration(dur);
      }
    }
  };

  const handleBgmStartOffsetChange = (newOffset: number) => {
    setBgmStartOffset(newOffset);
    if (bgmAudioRef.current) {
      bgmAudioRef.current.currentTime = newOffset;
    }
  };

  const handleRemoveBgm = () => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
    }
    setIsBgmPlaying(false);
    setBgmEnabled(false);
    setBgmFileName('');
    setBgmFilePath('');
    setBgmAudioUrl('');
    setBgmDuration(0);
    setBgmStartOffset(0);
  };

  const toggleBgmPlayback = () => {
    if (!bgmAudioRef.current) return;
    if (isBgmPlaying) {
      bgmAudioRef.current.pause();
      setIsBgmPlaying(false);
    } else {
      bgmAudioRef.current.currentTime = bgmStartOffset;
      bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
      bgmAudioRef.current.play().then(() => setIsBgmPlaying(true)).catch(console.error);
    }
  };

  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
    }
  }, [bgmVolume]);

  // Hook SFX handlers
  const uploadHookSfxFile = async (file: File) => {
    if (!file) return;
    setIsUploadingHookSfx(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-sfx', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to upload hook sound effect');
      }
      const data = await res.json();
      setHookSfxFileName(data.filename || file.name);
      setHookSfxFilePath(data.file_path);
      setHookSfxAudioUrl(data.url);
      setHookSfxEnabled(true);
    } catch (err) {
      console.error('SFX upload error:', err);
      alert(t.studio.uploadSfxFailed);
    } finally {
      setIsUploadingHookSfx(false);
    }
  };

  const handleHookSfxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadHookSfxFile(file);
    e.target.value = '';
  };

  const handleRemoveHookSfx = () => {
    if (hookSfxAudioRef.current) {
      hookSfxAudioRef.current.pause();
    }
    setIsHookSfxPlaying(false);
    setHookSfxEnabled(false);
    setHookSfxFileName('');
    setHookSfxFilePath('');
    setHookSfxAudioUrl('');
  };

  const toggleHookSfxPlayback = () => {
    if (!hookSfxAudioRef.current) return;
    if (isHookSfxPlaying) {
      hookSfxAudioRef.current.pause();
      setIsHookSfxPlaying(false);
    } else {
      hookSfxAudioRef.current.currentTime = 0;
      hookSfxAudioRef.current.volume = Math.max(0, Math.min(1, hookSfxVolume / 100));
      hookSfxAudioRef.current.play().then(() => setIsHookSfxPlaying(true)).catch(console.error);
    }
  };

  useEffect(() => {
    if (hookSfxAudioRef.current) {
      hookSfxAudioRef.current.volume = Math.max(0, Math.min(1, hookSfxVolume / 100));
    }
  }, [hookSfxVolume]);

  // Watermark handlers
  const uploadWatermarkFile = async (file: File) => {
    if (!file) return;
    setIsUploadingWatermark(true);
    try {
      const localUrl = URL.createObjectURL(file);
      setWatermarkImageUrl(localUrl);
      setWatermarkImageFileName(file.name);

      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-watermark', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to upload watermark');
      }
      const data = await res.json();
      setWatermarkImageFilePath(data.file_path);
      setWatermarkImageFileName(data.filename || file.name);
      setWatermarkImageUrl(data.url || localUrl);
      setWatermarkEnabled(true);
    } catch (err) {
      console.error('Watermark upload error:', err);
      alert(t.studio.uploadWatermarkFailed);
    } finally {
      setIsUploadingWatermark(false);
    }
  };

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadWatermarkFile(file);
    e.target.value = '';
  };

  const handleRemoveWatermarkImage = () => {
    setWatermarkImageFileName('');
    setWatermarkImageFilePath('');
    setWatermarkImageUrl('');
  };

  const getDefaultWatermarkConfig = (type: 'image' | 'text') => {
    if (type === 'image') {
      return {
        size: 20,
        opacity: 80,
        x: 88,
        y: 8,
      };
    } else {
      return {
        size: 20,
        opacity: 80,
        x: 50,
        y: 92,
      };
    }
  };

  const handleSelectWatermarkType = (type: 'image' | 'text') => {
    setWatermarkType(type);
    const defaults = getDefaultWatermarkConfig(type);
    setWatermarkSize(defaults.size);
    setWatermarkOpacity(defaults.opacity);
    setWatermarkX(defaults.x);
    setWatermarkY(defaults.y);
    if (type === 'text' && !watermarkText.trim()) {
      setWatermarkText('@channel');
    }
  };

  const handleResetWatermark = () => {
    const defaults = getDefaultWatermarkConfig(watermarkType);
    setWatermarkSize(defaults.size);
    setWatermarkOpacity(defaults.opacity);
    setWatermarkX(defaults.x);
    setWatermarkY(defaults.y);
    if (watermarkType === 'text' && !watermarkText.trim()) {
      setWatermarkText('@channel');
    }
  };

  const applyWatermarkPreset = (preset: 'tl' | 'tc' | 'tr' | 'c' | 'bl' | 'bc' | 'br') => {
    const halfW = Math.round(watermarkSize / 2);
    const leftX = Math.max(4, Math.min(50, halfW + 2));
    const rightX = Math.min(96, Math.max(50, 100 - halfW - 2));
    const topY = 8;
    const bottomY = 92;

    switch (preset) {
      case 'tl':
        setWatermarkX(leftX);
        setWatermarkY(topY);
        break;
      case 'tc':
        setWatermarkX(50);
        setWatermarkY(topY);
        break;
      case 'tr':
        setWatermarkX(rightX);
        setWatermarkY(topY);
        break;
      case 'c':
        setWatermarkX(50);
        setWatermarkY(50);
        break;
      case 'bl':
        setWatermarkX(leftX);
        setWatermarkY(bottomY);
        break;
      case 'bc':
        setWatermarkX(50);
        setWatermarkY(bottomY);
        break;
      case 'br':
        setWatermarkX(rightX);
        setWatermarkY(bottomY);
        break;
    }
  };

  const applyLetterCase = (text: string, style: TextCaseOption): string => {
    if (style === 'uppercase') return text.toUpperCase();
    if (style === 'lowercase') return text.toLowerCase();
    return text.toLowerCase().replace(/(?:^|\s|\b)\w/g, c => c.toUpperCase());
  };

  /**
   * Intelligently wraps title across 1, 2, 3, or up to 4 balanced lines,
   * matching backend video_engine.wrap_title_smart logic.
   */
  const formatTitleSmart = (
    rawText: string,
    style: TextCaseOption,
    sizePreset: FontSizeOption = titleFontSize
  ): { formatted: string; lineCount: number } => {
    const raw = rawText.trim();
    if (!raw) return { formatted: '', lineCount: 1 };

    const cased = applyLetterCase(raw, style);

    // Preserve manual line breaks if user typed them
    if (cased.includes('\n')) {
      const manualLines = cased
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      return {
        formatted: manualLines.join('\n'),
        lineCount: Math.max(1, manualLines.length),
      };
    }

    const words = cased.split(/\s+/).filter(Boolean);
    const maxSingleLen = sizePreset === 'small' ? 24 : sizePreset === 'big' ? 13 : 19;
    if (words.length <= 1 || cased.length <= maxSingleLen) {
      return { formatted: cased, lineCount: 1 };
    }

    const totalLen = cased.length;
    const targetLines = Math.min(4, Math.max(2, Math.ceil(totalLen / maxSingleLen)));

    const targetPerLine = totalLen / targetLines;
    const lines: string[] = [];
    let currentLine: string[] = [];
    let currentLen = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const remainingWords = words.length - i;
      const remainingLines = targetLines - lines.length;

      if (
        remainingLines > 1 &&
        currentLine.length > 0 &&
        (currentLen + w.length > targetPerLine * 1.15 || remainingWords <= remainingLines - 1)
      ) {
        lines.push(currentLine.join(' '));
        currentLine = [w];
        currentLen = w.length;
      } else {
        currentLine.push(w);
        currentLen += w.length + 1;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    return { formatted: lines.join('\n'), lineCount: Math.max(1, lines.length) };
  };

  /**
   * Safe defaults for each aspect ratio and line count:
   * Guarantees title & subtitle NEVER touch or overlap content boxes.
   */
  /**
   * Snug defaults for each aspect ratio, line count, and streamer preset:
   * Keeps title and subtitle CLOSE to the video content without touching.
   */
  const getDefaultPositions = (
    ratio: AspectRatioOption,
    lines: number,
    preset: StreamerPreset = streamerPreset
  ): { titleY: number; subtitleY: number; subCenterY: number } => {
    if (preset === 'split_top_cam') {
      return {
        titleY: lines >= 3 ? 3.5 : 4.5,
        subtitleY: ratio === '4:3' ? 10.0 : 18.0,
        subCenterY: 50,
      };
    }
    if (ratio === '16:9_landscape') {
      return {
        titleY: lines >= 3 ? 5.5 : lines === 2 ? 6.5 : 8.0,
        subtitleY: 10.0,
        subCenterY: 50,
      };
    }
    if (ratio === '1:1') {
      return {
        titleY: lines >= 3 ? 11.5 : lines === 2 ? 13.5 : 17.0,
        subtitleY: 20.0,
        subCenterY: 50,
      };
    }
    if (ratio === '4:3') {
      return {
        titleY: lines >= 3 ? 17.3 : lines === 2 ? 19.3 : 23.6,
        subtitleY: 25.0,
        subCenterY: 50,
      };
    }
    if (ratio === '16:9') {
      return {
        titleY: lines >= 3 ? 22.6 : lines === 2 ? 24.5 : 28.8,
        subtitleY: 30.0,
        subCenterY: 50,
      };
    }
    // 9:16 Fullscreen
    return {
      titleY: lines >= 3 ? 12.0 : lines === 2 ? 14.5 : 17.0,
      subtitleY: 21.0,
      subCenterY: 50,
    };
  };

  /**
   * Hard limits so slider adjustments cannot physically cross into content boxes.
   */
  const getMaxPositions = (
    ratio: AspectRatioOption,
    lines: number,
    preset: StreamerPreset = streamerPreset
  ) => {
    if (preset === 'split_top_cam') {
      return {
        maxTitleY: 35.0,
        maxSubY: 50.0,
      };
    }
    if (ratio === '16:9_landscape') {
      return {
        maxTitleY: 40.0,
        maxSubY: 50.0,
      };
    }
    if (ratio === '1:1') {
      return {
        maxTitleY: lines >= 4 ? 12.5 : lines === 3 ? 13.5 : lines === 2 ? 15.0 : 18.0,
        maxSubY: 50.0,
      };
    }
    if (ratio === '4:3') {
      return {
        maxTitleY: lines >= 4 ? 19.5 : lines === 3 ? 20.5 : lines === 2 ? 22.0 : 25.0,
        maxSubY: 50.0,
      };
    }
    if (ratio === '16:9') {
      return {
        maxTitleY: lines >= 4 ? 24.5 : lines === 3 ? 25.5 : lines === 2 ? 27.0 : 30.0,
        maxSubY: 50.0,
      };
    }
    return {
      maxTitleY: 45.0,
      maxSubY: 50.0,
    };
  };

  const getCenterBounds = (ratio: AspectRatioOption) => {
    if (ratio === '16:9_landscape') return { min: 20, max: 80 };
    if (ratio === '16:9') return { min: 38, max: 62 };
    if (ratio === '4:3') return { min: 34, max: 66 };
    if (ratio === '1:1') return { min: 28, max: 72 };
    return { min: 25, max: 75 };
  };

  // Preview framing dimensions (adapts dynamically for True Landscape vs Vertical)
  const isLandscape = aspectRatio === '16:9_landscape';
  const phoneWidth = 320;
  const phoneHeight = isLandscape ? 180 : 569;

  const currentClipKey = currentPreviewClip ? `${currentPreviewClip.start_time}_${currentPreviewClip.end_time}` : '';
  const currentCustomTitle = currentClipKey ? customClipTitles[currentClipKey] : undefined;

  const baseClipHookTitle = (
    currentCustomTitle !== undefined && currentCustomTitle.trim() !== ''
      ? currentCustomTitle
      : (currentPreviewClip?.title_suggestion || currentPreviewClip?.title || t.studio.previewSampleTitle)
  );

  const activeTitle = `${titlePrefix}${baseClipHookTitle}${titleSuffix}`;

  const sampleRawTitle = baseClipHookTitle;
  const sampleCleanTitle = sampleRawTitle.replace(/[\\/*?:"<>|]/g, '').trim() || 'Viral_Clip_1';

  const { formatted: formattedTitle, lineCount: titleLineCount } = formatTitleSmart(
    activeTitle,
    titleTextCase,
    titleFontSize
  );

  const { maxTitleY, maxSubY } = getMaxPositions(aspectRatio, titleLineCount, streamerPreset);
  const { min: minCenterY, max: maxCenterY } = getCenterBounds(aspectRatio);

  // Safe clamped values for preview rendering
  const safeTitleY = Math.min(titleYPercent, maxTitleY);
  const safeSubtitleY = Math.min(subtitleYPercent, maxSubY);
  const safeSubCenterY = Math.max(minCenterY, Math.min(subtitleCenterYPercent, maxCenterY));

  // If user hasn't explicitly customized positions, auto-keep optimal default for ratio & lines
  useEffect(() => {
    if (!isCustomTitleY) {
      const defaults = getDefaultPositions(aspectRatio, titleLineCount, streamerPreset);
      setTitleYPercent(defaults.titleY);
    }
  }, [aspectRatio, titleLineCount, streamerPreset, isCustomTitleY]);

  const handleSelectAspectRatio = (newRatio: AspectRatioOption) => {
    setAspectRatio(newRatio);
    const defaults = getDefaultPositions(newRatio, titleLineCount, streamerPreset);
    setTitleYPercent(defaults.titleY);
    setSubtitleYPercent(defaults.subtitleY);
    setSubtitleCenterYPercent(defaults.subCenterY);
    setIsCustomTitleY(false);
  };

  const handleResetTitlePosition = () => {
    const defaults = getDefaultPositions(aspectRatio, titleLineCount, streamerPreset);
    setTitleYPercent(defaults.titleY);
    setIsCustomTitleY(false);
  };

  const handleResetSubtitlePosition = () => {
    const defaults = getDefaultPositions(aspectRatio, titleLineCount, streamerPreset);
    setSubtitleYPercent(defaults.subtitleY);
    setSubtitleCenterYPercent(defaults.subCenterY);
  };

  const handleLaunch = () => {
    const enrichedSelectedClips = selectedClips.map(c => {
      const key = `${c.start_time}_${c.end_time}`;
      const custom = customClipTitles[key];
      const effectiveTitle = (custom !== undefined && custom.trim()) ? custom.trim() : (c.title_suggestion || c.title);
      return {
        ...c,
        title: effectiveTitle,
        title_suggestion: effectiveTitle,
        custom_title: effectiveTitle,
      };
    });

    onStartRender({
      aspectRatio,
      backgroundStyle,
      enableFaceTracking,
      streamerPreset,
      facecamPosition,
      titleText: enrichedSelectedClips.length === 1 ? activeTitle : undefined,
      titlePrefix,
      titleSuffix,
      fileNamePrefix,
      fileNameSuffix,
      titlePosition,
      titleDuration,
      titleFont,
      titleFontSize,
      titleFontSizePx,
      titleTextCase,
      subtitlesEnabled: captionStyle !== 'none',
      captionStyle,
      captionFont,
      fontSize,
      fontSizePx,
      textCase,
      titleYPercent: safeTitleY,
      subtitleYPercent: safeSubtitleY,
      subtitlePositionMode,
      subtitleCenterYPercent: safeSubCenterY,
      selectedClips: enrichedSelectedClips,
      // Background Music
      bgmEnabled: bgmEnabled && !!bgmFilePath,
      bgmFilePath,
      bgmFileName,
      bgmVolume,
      bgmStartOffset,
      // Hook SFX
      hookSfxEnabled: hookSfxEnabled && !!hookSfxFilePath,
      hookSfxFilePath,
      hookSfxFileName,
      hookSfxVolume,
      // Watermark
      watermarkEnabled,
      watermarkType,
      watermarkFilePath: watermarkImageFilePath,
      watermarkUrl: watermarkImageUrl,
      watermarkText,
      watermarkSize,
      watermarkOpacity,
      watermarkX,
      watermarkY,
      // Original Voice Audio Boost
      originalAudioVolume,
      // Hardware Acceleration / Video Encoder
      hardwareAccel,
    });
  };

  return (
    <section
      id="clip-studio-section"
      className={`clip-studio-page-section glass-panel${isWorkspaceOpen ? ' studio-workspace-active' : ''}`}
      hidden={!isWorkspaceOpen}
      aria-label={t.studio.heading}
    >
      {/* Fancy Glowing Section Header */}
      <div className="studio-section-header">
        <div className="studio-header-left">
          <img className="studio-section-mark" src="/favicon.png" alt="" aria-hidden="true" />
          <div>
            <div className="studio-title-badge-row">
              <h2 className="studio-main-heading">{t.studio.heading}</h2>
            </div>
            <p className="studio-subtext">
              {t.studio.subtext}
            </p>
          </div>
        </div>

        {/* Clip preview switcher */}
        {allClips.length > 1 && (
          <div className="preview-clip-picker-bar">
            <span className="preview-picker-label">{t.studio.previewClip}</span>
            <select
              className="preview-clip-select"
              aria-label={t.studio.previewClip}
              value={previewClipIndex}
              onChange={e => setPreviewClipIndex(Number(e.target.value))}
            >
              {allClips.map((clip, idx) => {
                const clipKey = `${clip.start_time}_${clip.end_time}`;
                const custom = customClipTitles[clipKey];
                const displayT = (custom !== undefined && custom.trim()) ? custom.trim() : (clip.title_suggestion || clip.title);
                return (
                  <option key={idx} value={idx}>
                    #{idx + 1}: {displayT} ({Math.round(clip.end_time - clip.start_time)}s)
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <button type="button" className="studio-exit-workspace-btn" onClick={onExitWorkspace}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M13 8H3m0 0 4-4m-4 4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.studio.backToResults}
        </button>
      </div>

      <nav className="studio-workspace-tabs" aria-label={t.studio.heading}>
        {([
          ['clips', t.studio.tabClips, selectedClips.length],
          ['frame', t.studio.tabFrame],
          ['text', t.studio.tabText],
          ['audio', t.studio.tabAudio],
          ['export', t.studio.tabExport],
        ] as const).map(([tab, label, count]) => (
          <button
            key={tab}
            type="button"
            className={`studio-workspace-tab${activeStudioTab === tab ? ' active' : ''}`}
            aria-pressed={activeStudioTab === tab}
            onClick={() => setActiveStudioTab(tab)}
          >
            {label}
            {tab === 'clips' && <span className="studio-tab-count">{count}/{allClips.length}</span>}
          </button>
        ))}
      </nav>

      {/* Dedicated editor workspace: preview stays visible while settings change by category. */}
      <div className="studio-workspace-grid">
        {/* Left Column: Interactive Controls */}
        <div className="studio-controls-pane">
          {/* 1. Canvas & Inner Aspect Ratio */}
          <div className="studio-card-group studio-canvas-settings-card" hidden={activeStudioTab !== 'frame'}>
            <div className="group-header">
              <span className="group-title">{t.studio.canvasTitle}</span>
              <span className="group-badge">{t.studio.canvasBadge}</span>
            </div>

            <div className="aspect-options-grid">
              <button
                type="button"
                className={`aspect-card-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
                onClick={() => handleSelectAspectRatio('9:16')}
              >
                <div className="aspect-icon-box ratio-916"></div>
                <span className="aspect-name">{t.studio.ratio916}</span>
                <span className="aspect-sub">{t.studio.ratio916Sub}</span>
              </button>

              <button
                type="button"
                className={`aspect-card-btn ${aspectRatio === '1:1' ? 'active' : ''}`}
                onClick={() => handleSelectAspectRatio('1:1')}
              >
                <div className="aspect-icon-box ratio-11"></div>
                <span className="aspect-name">{t.studio.ratio11}</span>
                <span className="aspect-sub">{t.studio.ratio11Sub}</span>
              </button>

              <button
                type="button"
                className={`aspect-card-btn ${aspectRatio === '4:3' ? 'active' : ''}`}
                onClick={() => handleSelectAspectRatio('4:3')}
              >
                <div className="aspect-icon-box ratio-43"></div>
                <span className="aspect-name">{t.studio.ratio43}</span>
                <span className="aspect-sub">{t.studio.ratio43Sub}</span>
              </button>

              <button
                type="button"
                className={`aspect-card-btn ${aspectRatio === '16:9' ? 'active' : ''}`}
                onClick={() => handleSelectAspectRatio('16:9')}
              >
                <div className="aspect-icon-box ratio-169"></div>
                <span className="aspect-name">{t.studio.ratio169}</span>
                <span className="aspect-sub">{t.studio.ratio169Sub}</span>
              </button>

              <button
                type="button"
                className={`aspect-card-btn ${aspectRatio === '16:9_landscape' ? 'active' : ''}`}
                onClick={() => handleSelectAspectRatio('16:9_landscape')}
              >
                <div className="aspect-icon-box ratio-169landscape"></div>
                <span className="aspect-name">{t.studio.ratio169Landscape}</span>
                <span className="aspect-sub">{t.studio.ratio169LandscapeSub}</span>
              </button>
            </div>

            {/* Background Style when bars are active */}
            {aspectRatio !== '9:16' && aspectRatio !== '16:9_landscape' && (
              <div className="studio-sub-toggle" style={{ marginTop: '0.75rem' }}>
                <span className="sub-toggle-label">{t.studio.marginBackdrop}</span>
                <div className="toggle-pill-group">
                  <button
                    type="button"
                    className={`pill-btn ${backgroundStyle === 'black' ? 'active' : ''}`}
                    onClick={() => setBackgroundStyle('black')}
                  >
                    {t.studio.blackBars}
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${backgroundStyle === 'blurred' ? 'active' : ''}`}
                    onClick={() => setBackgroundStyle('blurred')}
                  >
                    {t.studio.blurredVideo}
                  </button>
                </div>
              </div>
            )}

            {/* AI Active Speaker & Object Centering */}
            <div className="studio-face-tracking-setting">
              <div className="studio-checkbox-row">
                <input
                  type="checkbox"
                  id="faceTrackingSec"
                  checked={enableFaceTracking}
                  onChange={e => setEnableFaceTracking(e.target.checked)}
                />
                <label htmlFor="faceTrackingSec">
                  <strong>{t.studio.faceTracking}</strong> {t.studio.faceTrackingDesc}
                </label>
              </div>

              {enableFaceTracking && streamerPreset === 'none' && (
                <div className="horizontal-framing-selector" style={{ marginTop: '0.65rem', paddingLeft: '1.6rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span>{t.studio.horizontalFramingLabel}</span>
                    {faceBox?.found && facecamPosition === 'auto' && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        background: faceBox.type === 'salient_object' ? 'rgba(177, 177, 177, 0.15)' : 'rgba(172, 172, 172, 0.15)',
                        color: faceBox.type === 'salient_object' ? '#b1b1b1' : '#c4c4c4',
                        border: `1px solid ${faceBox.type === 'salient_object' ? 'rgba(177, 177, 177, 0.3)' : 'rgba(172, 172, 172, 0.3)'}`,
                        fontWeight: 600
                      }}>
                        {faceBox.type === 'salient_object' ? ' AI Object Focus' : ' AI Face Focus'}
                      </span>
                    )}
                  </div>
                  <div className="pill-group framing-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {[
                      { id: 'auto', label: t.studio.framingAuto },
                      { id: 'center', label: t.studio.framingCenter },
                      { id: 'left', label: t.studio.framingLeft },
                      { id: 'right', label: t.studio.framingRight },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`pill-btn ${facecamPosition === opt.id ? 'active' : ''}`}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                        onClick={() => setFacecamPosition(opt.id as FacecamPosition)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Streamer Facecam Presets */}
          <div className="studio-card-group studio-streamer-layout-card" hidden={activeStudioTab !== 'frame'}>
            <div className="group-header">
              <span className="group-title">{t.studio.streamerTitle}</span>
            </div>
            <div className="streamer-presets-row">
              <button
                type="button"
                className={`streamer-btn ${streamerPreset === 'none' ? 'active' : ''}`}
                onClick={() => {
                  setStreamerPreset('none');
                  const defaults = getDefaultPositions(aspectRatio, titleLineCount, 'none');
                  setTitleYPercent(defaults.titleY);
                  setSubtitleYPercent(defaults.subtitleY);
                  setIsCustomTitleY(false);
                }}
              >
                {t.studio.streamerNone}
              </button>
              <button
                type="button"
                className={`streamer-btn ${streamerPreset === 'split_top_cam' ? 'active' : ''}`}
                onClick={() => {
                  setStreamerPreset('split_top_cam');
                  const defaults = getDefaultPositions(aspectRatio, titleLineCount, 'split_top_cam');
                  setTitleYPercent(defaults.titleY);
                  setSubtitleYPercent(defaults.subtitleY);
                  setIsCustomTitleY(false);
                }}
              >
                {t.studio.streamerSplit}
              </button>
              <button
                type="button"
                className={`streamer-btn ${streamerPreset === 'pip_corner' ? 'active' : ''}`}
                onClick={() => {
                  setStreamerPreset('pip_corner');
                  const defaults = getDefaultPositions(aspectRatio, titleLineCount, 'pip_corner');
                  setTitleYPercent(defaults.titleY);
                  setSubtitleYPercent(defaults.subtitleY);
                  setIsCustomTitleY(false);
                }}
              >
                {t.studio.streamerPip}
              </button>
            </div>

            {streamerPreset !== 'none' && (
              <div className="streamer-facecam-position-wrap" style={{ marginTop: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t.studio.facecamPositionLabel}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#b1b1b1', background: 'rgba(177, 177, 177, 0.12)', border: '1px solid rgba(177, 177, 177, 0.25)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                    {facecamPosition === 'auto' ? 'AI AUTO-DETECT' : facecamPosition.toUpperCase().replace('_', '-')}
                  </span>
                </div>
                <div className="toggle-pill-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {[
                    { id: 'auto', label: t.studio.facecamAuto },
                    { id: 'bottom_right', label: t.studio.facecamBottomRight },
                    { id: 'top_right', label: t.studio.facecamTopRight },
                    { id: 'bottom_left', label: t.studio.facecamBottomLeft },
                    { id: 'top_left', label: t.studio.facecamTopLeft },
                    { id: 'center', label: t.studio.facecamCenter },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pill-btn ${facecamPosition === opt.id ? 'active' : ''}`}
                      onClick={() => setFacecamPosition(opt.id as FacecamPosition)}
                      style={{ fontSize: '0.74rem', padding: '0.25rem 0.6rem' }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted, #a2a2a2)', marginTop: '0.35rem', margin: '0.35rem 0 0 0' }}>
                  {t.studio.facecamHint}
                </p>
              </div>
            )}
          </div>

          {/* 4. Title / Hook Banner */}
          <div className="studio-card-group studio-title-banner-card" hidden={activeStudioTab !== 'text'}>
            <div className="group-header">
              <span className="group-title">{t.studio.titleBannerTitle}</span>
              <span className="group-badge title-banner-position-badge">
                {t.studio.customYBadge(safeTitleY)}
              </span>
            </div>

            {/* Visibility Selector */}
            <div className="title-inputs-row title-banner-visibility-row">
              <span className="title-banner-field-label">
                {t.studio.titleVisibilityLabel}
              </span>
              <select
                className="studio-select title-banner-visibility-select"
                aria-label={t.studio.titleVisibilityLabel}
                value={titlePosition}
                onChange={e => setTitlePosition(e.target.value as TitlePosition)}
              >
                <option value="auto">{t.studio.titleVisible}</option>
                <option value="none">{t.studio.titleDisabled}</option>
              </select>
            </div>

            {/* Prefix & Suffix Controls */}
            {titlePosition !== 'none' && (
              <>
                {/* Active Clip Title Customizer */}
                <div className="hook-clip-title-input-wrap">
                  <div className="hook-clip-title-header">
                    <label className="hook-input-label">
                       {t.studio.clipTitleEditLabel}
                    </label>
                    {currentCustomTitle !== undefined && currentCustomTitle.trim() !== '' && currentCustomTitle !== (currentPreviewClip?.title_suggestion || currentPreviewClip?.title) && (
                      <button
                        type="button"
                        className="reset-title-link-btn"
                        aria-label={t.studio.resetToAiTitle}
                        title={t.studio.resetToAiTitle}
                        onClick={() => {
                          setCustomClipTitles(prev => {
                            const next = { ...prev };
                            delete next[currentClipKey];
                            return next;
                          });
                        }}
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M3.2 5.1A5.4 5.4 0 1 1 2.7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M1.8 2.8v3.1h3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{t.studio.resetToAiTitle}</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    className="studio-text-input"
                    placeholder={currentPreviewClip?.title_suggestion || currentPreviewClip?.title || t.studio.titlePlaceholder}
                    value={currentCustomTitle !== undefined ? currentCustomTitle : (currentPreviewClip?.title_suggestion || currentPreviewClip?.title || '')}
                    onChange={e => {
                      const val = e.target.value;
                      setCustomClipTitles(prev => ({
                        ...prev,
                        [currentClipKey]: val
                      }));
                    }}
                  />
                </div>

                <div className="hook-prefix-suffix-grid">
                  <div className="hook-input-col">
                    <label className="hook-input-label">{t.studio.titlePrefixLabel}</label>
                    <input
                      type="text"
                      className="studio-text-input"
                      placeholder={t.studio.titlePrefixPlaceholder}
                      value={titlePrefix}
                      onChange={e => setTitlePrefix(e.target.value)}
                    />
                  </div>
                  <div className="hook-input-col">
                    <label className="hook-input-label">{t.studio.titleSuffixLabel}</label>
                    <input
                      type="text"
                      className="studio-text-input"
                      placeholder={t.studio.titleSuffixPlaceholder}
                      value={titleSuffix}
                      onChange={e => setTitleSuffix(e.target.value)}
                    />
                  </div>
                </div>

                {/* Combined Banner Preview Info */}
                <div className="hook-banner-preview-box">
                  <div className="hook-base-badge">
                    <span className="badge-tag"> {t.studio.titleBaseHookBadge}:</span>
                    <span className="badge-text" title={baseClipHookTitle}>{baseClipHookTitle}</span>
                  </div>
                  <div className="hook-combined-result">
                    <span className="combined-label"> {t.studio.titleFullPreview}</span>
                    <span className="combined-text">
                      {titlePrefix && <span className="pfx-highlight">{titlePrefix}</span>}
                      <span className="base-highlight">{baseClipHookTitle}</span>
                      {titleSuffix && <span className="sfx-highlight">{titleSuffix}</span>}
                    </span>
                  </div>
                </div>

                {/* Batch Helper Note */}
                <div className="hook-batch-helper-note">
                  {t.studio.batchTitleNote}
                </div>

                {/* Title Duration Option */}
                <div className="studio-sub-toggle title-banner-control title-banner-duration-control">
                  <span className="sub-toggle-label">{t.studio.titleDurationLabel}</span>
                  <div className="toggle-pill-group">
                    <button
                      type="button"
                      className={`pill-btn ${titleDuration === 'entire' ? 'active' : ''}`}
                      onClick={() => setTitleDuration('entire')}
                    >
                      {t.studio.durationEntire}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${titleDuration === '5s' ? 'active' : ''}`}
                      onClick={() => setTitleDuration('5s')}
                    >
                      {t.studio.duration5s}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${titleDuration === '10s' ? 'active' : ''}`}
                      onClick={() => setTitleDuration('10s')}
                    >
                      {t.studio.duration10s}
                    </button>
                  </div>
                </div>

                {/* Title Font Family */}
                <div className="studio-font-section title-banner-font-section">
                  <div className="font-section-header">
                    <div className="title-banner-font-name-row">
                      <span className="sub-toggle-label title-banner-sub-toggle-label">
                         {t.studio.titleFontFamily}
                      </span>
                      <span className="badge title-banner-font-badge">
                        {titleFont}
                      </span>
                    </div>
                  </div>

                  {/* Title font options are limited to the ECLIPSE type system. */}
                  <div className="toggle-pill-group title-banner-font-options">
                    {fontOptions.map(font => (
                      <button
                        key={`title-font-${font}`}
                        type="button"
                        className={`pill-btn ${titleFont === font ? 'active' : ''}`}
                        onClick={() => setTitleFont(font)}
                        style={{ fontFamily: font, fontSize: '0.78rem' }}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title Text Size Option with Uncapped Manual Pixel Input */}
                <div className="studio-sub-toggle title-banner-control title-banner-font-size-control">
                  <span className="sub-toggle-label">{t.studio.titleFontSize}</span>
                  <div className="title-banner-size-options">
                    <div className="toggle-pill-group">
                      <button
                        type="button"
                        className={`pill-btn ${titleFontSize === 'small' ? 'active' : ''}`}
                        onClick={() => {
                          setTitleFontSize('small');
                          setTitleFontSizePx(50);
                        }}
                      >
                        {t.studio.sizeSmall} (50px)
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${titleFontSize === 'medium' ? 'active' : ''}`}
                        onClick={() => {
                          setTitleFontSize('medium');
                          setTitleFontSizePx(75);
                        }}
                      >
                        {t.studio.sizeMedium} (75px)
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${titleFontSize === 'big' ? 'active' : ''}`}
                        onClick={() => {
                          setTitleFontSize('big');
                          setTitleFontSizePx(100);
                        }}
                      >
                        {t.studio.sizeBig} (100px)
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${titleFontSize === 'custom' ? 'active' : ''}`}
                        onClick={() => setTitleFontSize('custom')}
                      >
                        {t.studio.sizeCustom}
                      </button>
                    </div>
                    {/* Manual Numeric PX Input (Unlimited, 1 - 1000px) */}
                    <div className="title-banner-custom-size-input">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={titleFontSizePx || ''}
                        placeholder="px"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setTitleFontSizePx(0);
                            setTitleFontSize('custom');
                            return;
                          }
                          const num = parseInt(raw, 10);
                          const val = isNaN(num) ? 0 : Math.max(1, Math.min(1000, num));
                          setTitleFontSizePx(val);
                          setTitleFontSize('custom');
                        }}
                        className="studio-text-input title-banner-custom-size-field"
                        title={t.studio.fontSizeTooltip}
                      />
                      <span className="title-banner-px-unit">px</span>
                    </div>
                  </div>
                </div>

                {/* Title Letter Style Option */}
                <div className="studio-sub-toggle title-banner-control title-banner-letter-style-control">
                  <span className="sub-toggle-label">{t.studio.titleLetterStyle}</span>
                  <div className="toggle-pill-group">
                    <button
                      type="button"
                      className={`pill-btn ${titleTextCase === 'uppercase' ? 'active' : ''}`}
                      onClick={() => setTitleTextCase('uppercase')}
                    >
                      {t.studio.letterCaps}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${titleTextCase === 'capitalize' ? 'active' : ''}`}
                      onClick={() => setTitleTextCase('capitalize')}
                    >
                      {t.studio.letterTitle}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${titleTextCase === 'lowercase' ? 'active' : ''}`}
                      onClick={() => setTitleTextCase('lowercase')}
                    >
                      {t.studio.letterLower}
                    </button>
                  </div>
                </div>

                {/* Title Vertical Position Controls */}
                <div className="studio-sub-toggle title-banner-control title-banner-position-control">
                  <div className="title-banner-position-header">
                    <span className="sub-toggle-label">
                      {t.studio.titleYLabel}
                    </span>
                    <div className="title-banner-position-actions">
                      <span className="badge title-banner-y-value-badge">
                        {t.studio.titleYVal(safeTitleY, titleLineCount >= 3)}
                      </span>
                      <button
                        type="button"
                        className="reset-btn title-banner-reset-position-btn"
                        aria-label={t.studio.resetPosition}
                        onClick={handleResetTitlePosition}
                        title={t.studio.resetPositionTooltip}
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none">
                          <path d="M3.2 5.1A5.4 5.4 0 1 1 2.7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M1.8 2.8v3.1h3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {t.studio.resetPosition}
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max={maxTitleY}
                    step="1"
                    value={safeTitleY}
                    onChange={(e) => {
                      setTitleYPercent(Number(e.target.value));
                      setIsCustomTitleY(true);
                    }}
                    className="position-slider title-banner-position-slider"
                  />
                  <div className="quick-presets-row title-banner-quick-presets">
                    <button
                      type="button"
                      className={`pill-btn title-banner-quick-preset ${safeTitleY === 8 ? 'active' : ''}`}
                      onClick={() => {
                        setTitleYPercent(8);
                        setIsCustomTitleY(true);
                      }}
                    >
                      {t.studio.quickHigh(8)}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn title-banner-quick-preset ${safeTitleY === getDefaultPositions(aspectRatio, titleLineCount, streamerPreset).titleY ? 'active' : ''}`}
                      onClick={handleResetTitlePosition}
                    >
                      {t.studio.quickDefault(`${getDefaultPositions(aspectRatio, titleLineCount, streamerPreset).titleY}%`)}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn title-banner-quick-preset ${safeTitleY === Math.min(22, maxTitleY) ? 'active' : ''}`}
                      onClick={() => {
                        setTitleYPercent(Math.min(22, maxTitleY));
                        setIsCustomTitleY(true);
                      }}
                    >
                      {t.studio.quickLower(Math.min(22, maxTitleY))}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 5. Subtitle Style & Font */}
          <div className="studio-card-group studio-subtitle-card" hidden={activeStudioTab !== 'text'}>
            <div className="group-header">
              <span className="group-title">{t.studio.subtitlesTitle}</span>
              <span className="group-badge success-badge">{t.studio.strictlyOneLine}</span>
            </div>

            {/* Subtitle Visibility Selector */}
            <div className="title-inputs-row subtitle-visibility-row">
              <span className="subtitle-field-label">
                {t.studio.subtitlesVisibilityLabel}
              </span>
              <select
                className="studio-select subtitle-visibility-select"
                aria-label={t.studio.subtitlesVisibilityLabel}
                value={captionStyle !== 'none' ? 'visible' : 'disabled'}
                onChange={e => {
                  const isVis = e.target.value === 'visible';
                  if (isVis) {
                    setCaptionStyle(lastActiveCaptionStyle !== 'none' ? lastActiveCaptionStyle : 'viral_pop');
                  } else {
                    if (captionStyle !== 'none') {
                      setLastActiveCaptionStyle(captionStyle);
                    }
                    setCaptionStyle('none');
                  }
                }}
              >
                <option value="visible">{t.studio.subtitlesVisible}</option>
                <option value="disabled">{t.studio.subtitlesDisabled}</option>
              </select>
            </div>

            {captionStyle === 'none' && (
              <div className="subtitles-disabled-notice-box" style={{ marginBottom: '0.75rem' }}>
                <span> {t.studio.subtitlesDisabledNotice}</span>
              </div>
            )}

            <div className={`caption-styles-grid subtitle-styles-grid ${captionStyle === 'none' ? 'subtitles-dimmed' : ''}`}>
              <button
                type="button"
                className={`caption-style-card subtitle-style-card viral-pop ${captionStyle === 'viral_pop' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('viral_pop');
                  setLastActiveCaptionStyle('viral_pop');
                }}
              >
                <div className="caption-preview-text">
                  VIRAL <span className="pop-yellow">POP</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleViralPopSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card beast-punch ${captionStyle === 'beast_punch' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('beast_punch');
                  setLastActiveCaptionStyle('beast_punch');
                }}
              >
                <div className="caption-preview-text">
                  BEAST <span className="pop-green">PUNCH</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleBeastPunchSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card cyber-violet ${captionStyle === 'cyber_violet' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('cyber_violet');
                  setLastActiveCaptionStyle('cyber_violet');
                }}
              >
                <div className="caption-preview-text">
                  CYBER <span className="pop-violet">VIOLET</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleCyberVioletSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card fire-red ${captionStyle === 'fire_red' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('fire_red');
                  setLastActiveCaptionStyle('fire_red');
                }}
              >
                <div className="caption-preview-text">
                  FIRE <span className="pop-red">CRIMSON</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleFireRedSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card electric-cyan ${captionStyle === 'electric_cyan' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('electric_cyan');
                  setLastActiveCaptionStyle('electric_cyan');
                }}
              >
                <div className="caption-preview-text">
                  ELECTRIC <span className="pop-cyan">CYAN</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleElectricCyanSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card golden-aura ${captionStyle === 'golden_aura' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('golden_aura');
                  setLastActiveCaptionStyle('golden_aura');
                }}
              >
                <div className="caption-preview-text">
                  GOLDEN <span className="pop-gold">AURA</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleGoldenAuraSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card clean-minimal ${captionStyle === 'clean_minimal' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionStyle('clean_minimal');
                  setLastActiveCaptionStyle('clean_minimal');
                }}
              >
                <div className="caption-preview-text">
                  <span className="minimal-pill">{t.studio.styleCleanMinimal}</span>
                </div>
                <span className="caption-style-sub">{t.studio.styleCleanMinimalSub}</span>
              </button>

              <button
                type="button"
                className={`caption-style-card subtitle-style-card none ${captionStyle === 'none' ? 'active' : ''}`}
                onClick={() => setCaptionStyle('none')}
              >
                <div className="caption-preview-text">{t.studio.styleNone}</div>
                <span className="caption-style-sub">{t.studio.styleNoneSub}</span>
              </button>
            </div>

            {captionStyle !== 'none' && (
              <>
                {/* Subtitle Font Family */}
                <div className="studio-font-section">
                  <div className="font-section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="sub-toggle-label subtitle-control-label">
                         {t.studio.fontFamily}
                      </span>
                      <span className="badge subtitle-font-badge">
                        {captionFont}
                      </span>
                    </div>
                  </div>

                  {/* Subtitle font options are limited to the ECLIPSE type system. */}
                  <div className="toggle-pill-group subtitle-font-options">
                    {fontOptions.map(font => (
                      <button
                        key={`sub-font-${font}`}
                        type="button"
                        className={`pill-btn ${captionFont === font ? 'active' : ''}`}
                        onClick={() => setCaptionFont(font)}
                        style={{ fontFamily: font, fontSize: '0.78rem' }}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtitle Font Size Presets & Uncapped Manual PX Input */}
                <div className="studio-sub-toggle subtitle-control subtitle-size-control">
                  <span className="sub-toggle-label">{t.studio.fontSize}</span>
                  <div className="subtitle-size-options">
                    <div className="toggle-pill-group">
                      <button
                        type="button"
                        className={`pill-btn ${fontSize === 'small' ? 'active' : ''}`}
                        onClick={() => {
                          setFontSize('small');
                          setFontSizePx(55);
                        }}
                      >
                        {t.studio.sizeSmall} (55px)
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${fontSize === 'medium' ? 'active' : ''}`}
                        onClick={() => {
                          setFontSize('medium');
                          setFontSizePx(75);
                        }}
                      >
                        {t.studio.sizeMedium} (75px)
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${fontSize === 'big' ? 'active' : ''}`}
                        onClick={() => {
                          setFontSize('big');
                          setFontSizePx(95);
                        }}
                      >
                        {t.studio.sizeBig} (95px)
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${fontSize === 'custom' ? 'active' : ''}`}
                        onClick={() => setFontSize('custom')}
                      >
                        {t.studio.sizeCustom}
                      </button>
                    </div>
                    {/* Manual Numeric PX Input (Unlimited, 1 - 1000px) */}
                    <div className="subtitle-custom-size-input">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={fontSizePx || ''}
                        placeholder="px"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setFontSizePx(0);
                            setFontSize('custom');
                            return;
                          }
                          const num = parseInt(raw, 10);
                          const val = isNaN(num) ? 0 : Math.max(1, Math.min(1000, num));
                          setFontSizePx(val);
                          setFontSize('custom');
                        }}
                        className="studio-text-input subtitle-custom-size-field"
                        title={t.studio.fontSizeTooltip}
                      />
                      <span className="subtitle-px-unit">px</span>
                    </div>
                  </div>
                </div>

                {/* Text Letter Style Presets */}
                <div className="studio-sub-toggle subtitle-control subtitle-case-control">
                  <span className="sub-toggle-label">{t.studio.letterStyle}</span>
                  <div className="toggle-pill-group">
                    <button
                      type="button"
                      className={`pill-btn ${textCase === 'uppercase' ? 'active' : ''}`}
                      onClick={() => setTextCase('uppercase')}
                    >
                      {t.studio.letterCaps}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${textCase === 'capitalize' ? 'active' : ''}`}
                      onClick={() => setTextCase('capitalize')}
                    >
                      {t.studio.letterTitle}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${textCase === 'lowercase' ? 'active' : ''}`}
                      onClick={() => setTextCase('lowercase')}
                    >
                      {t.studio.letterLower}
                    </button>
                  </div>
                </div>

                {/* Subtitle Placement & Vertical Position */}
                <div className="studio-sub-toggle subtitle-control subtitle-placement-control">
                  <span className="sub-toggle-label">{t.studio.subPlacement}</span>
                  <div className="toggle-pill-group">
                    <button
                      type="button"
                      className={`pill-btn ${subtitlePositionMode === 'bottom' ? 'active' : ''}`}
                      onClick={() => setSubtitlePositionMode('bottom')}
                    >
                      {t.studio.subBottom}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${subtitlePositionMode === 'center' ? 'active' : ''}`}
                      onClick={() => setSubtitlePositionMode('center')}
                    >
                      {t.studio.subCenter}
                    </button>
                  </div>
                </div>

                {subtitlePositionMode === 'bottom' ? (
                  <div className="studio-sub-toggle subtitle-control subtitle-position-control">
                    <div className="subtitle-position-header">
                      <span className="sub-toggle-label">
                        {t.studio.subYBottomLabel}
                      </span>
                      <div className="subtitle-position-actions">
                        <span className="badge subtitle-position-badge">
                          {t.studio.subYBottomVal(safeSubtitleY)}
                        </span>
                        <button
                          type="button"
                          aria-label={t.studio.resetPosition}
                          onClick={handleResetSubtitlePosition}
                          title={t.studio.resetPositionTooltip}
                          className="reset-btn subtitle-reset-position-btn"
                        >
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none">
                            <path d="M3.2 5.1A5.4 5.4 0 1 1 2.7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M1.8 2.8v3.1h3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {t.studio.resetPosition}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max={maxSubY}
                      step="1"
                      value={safeSubtitleY}
                      onChange={(e) => setSubtitleYPercent(Number(e.target.value))}
                      className="position-slider"
                    />
                    <div className="quick-presets-row subtitle-quick-presets">
                      <button
                        type="button"
                        className={`pill-btn ${safeSubtitleY === 12 ? 'active' : ''}`}
                        onClick={() => setSubtitleYPercent(12)}
                      >
                        {t.studio.quickLow(12)}
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${safeSubtitleY === getDefaultPositions(aspectRatio, titleLineCount, streamerPreset).subtitleY ? 'active' : ''}`}
                        onClick={handleResetSubtitlePosition}
                      >
                        {t.studio.quickSnugDefault(`${getDefaultPositions(aspectRatio, titleLineCount, streamerPreset).subtitleY}%`)}
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${safeSubtitleY === 32 ? 'active' : ''}`}
                        onClick={() => setSubtitleYPercent(32)}
                      >
                        {t.studio.quickMid(32)}
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${safeSubtitleY === 42 ? 'active' : ''}`}
                        onClick={() => setSubtitleYPercent(42)}
                      >
                        {t.studio.quickHigh ? t.studio.quickHigh(42) : `High (42%)`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="studio-sub-toggle subtitle-control subtitle-position-control">
                    <div className="subtitle-position-header">
                      <span className="sub-toggle-label">
                        {t.studio.subYCenterLabel}
                      </span>
                      <div className="subtitle-position-actions">
                        <span className="badge subtitle-position-badge">
                          {t.studio.subYCenterVal(
                            safeSubCenterY,
                            safeSubCenterY === 50
                              ? t.studio.posDeadCenter
                              : safeSubCenterY < 50
                              ? t.studio.posUpper
                              : t.studio.posLower
                          )}
                        </span>
                        <button
                          type="button"
                          aria-label={t.studio.resetPosition}
                          onClick={handleResetSubtitlePosition}
                          title={t.studio.resetPositionTooltip}
                          className="reset-btn subtitle-reset-position-btn"
                        >
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none">
                            <path d="M3.2 5.1A5.4 5.4 0 1 1 2.7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M1.8 2.8v3.1h3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {t.studio.resetPosition}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={minCenterY}
                      max={maxCenterY}
                      step="1"
                      value={safeSubCenterY}
                      onChange={(e) => setSubtitleCenterYPercent(Number(e.target.value))}
                      className="position-slider"
                    />
                    <div className="quick-presets-row subtitle-quick-presets">
                      <button
                        type="button"
                        className={`pill-btn ${safeSubCenterY === Math.max(minCenterY, 40) ? 'active' : ''}`}
                        onClick={() => setSubtitleCenterYPercent(Math.max(minCenterY, 40))}
                      >
                        {t.studio.quickUpper(Math.max(minCenterY, 40))}
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${safeSubCenterY === 50 ? 'active' : ''}`}
                        onClick={() => setSubtitleCenterYPercent(50)}
                      >
                        {t.studio.quickDeadCenter(50)}
                      </button>
                      <button
                        type="button"
                        className={`pill-btn ${safeSubCenterY === Math.min(maxCenterY, 60) ? 'active' : ''}`}
                        onClick={() => setSubtitleCenterYPercent(Math.min(maxCenterY, 60))}
                      >
                        {t.studio.quickLower(Math.min(maxCenterY, 60))}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 6. Background Music (BGM) */}
          <div className="studio-card-group studio-audio-setting-card audio-bgm-card" hidden={activeStudioTab !== 'audio'}>
            <div className="group-header audio-card-header">
              <div className="audio-card-title-row">
                <span className="group-title">{t.studio.bgmTitle}</span>
                {bgmFilePath && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bgmEnabled}
                      onChange={e => setBgmEnabled(e.target.checked)}
                      style={{ accentColor: 'var(--primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </label>
                )}
              </div>
              <span className="group-badge" style={{ color: bgmEnabled && bgmFilePath ? '#a3a3a3' : 'var(--text-muted)' }}>
                {bgmEnabled && bgmFilePath ? t.studio.bgmActiveBadge : t.studio.bgmOptionalBadge}
              </span>
            </div>

            <div className="bgm-control-card">
              {!bgmFilePath ? (
                <label
                  className={`bgm-dropzone ${isBgmDragging ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsBgmDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsBgmDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsBgmDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) uploadBgmFile(file);
                  }}
                >
                  <input
                    type="file"
                    accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*"
                    onChange={handleBgmUpload}
                    style={{ display: 'none' }}
                    disabled={isUploadingBgm}
                  />
                  <div className="dropzone-icon">{isUploadingBgm ? 'UPLOADING' : ''}</div>
                  <div className="dropzone-text">
                    <span className="dropzone-main-text">
                      {isUploadingBgm ? 'Uploading Audio...' : isBgmDragging ? t.studio.bgmDropActive : t.studio.bgmUploadMain}
                    </span>
                    <span className="dropzone-sub-text">{t.studio.bgmUploadSub}</span>
                  </div>
                </label>
              ) : (
                <div className="bgm-active-file-row">
                  <div className="bgm-info">
                    <span className="bgm-icon"></span>
                    <div className="bgm-details">
                      <span className="bgm-filename" title={bgmFileName}>{bgmFileName}</span>
                      <span className="bgm-status-tag">{t.studio.bgmReadyTag}</span>
                    </div>
                  </div>
                  <div className="bgm-actions">
                    {bgmAudioUrl && (
                      <button
                        type="button"
                        className="bgm-preview-btn"
                        onClick={toggleBgmPlayback}
                        title={isBgmPlaying ? t.studio.bgmPause : t.studio.bgmPlay}
                      >
                        {isBgmPlaying ? 'PAUSE' : 'PLAY'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="bgm-remove-btn"
                      onClick={handleRemoveBgm}
                      title={t.studio.bgmRemoveTooltip}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              )}

              {/* Volume Slider & Quick Presets */}
              {bgmFilePath && (
                <div className="slider-control-item" style={{ marginTop: '0.9rem' }}>
                  <div className="slider-label-row">
                    <span className="slider-label">{t.studio.bgmVolumeLabel}</span>
                    <div className="slider-input-badge-wrap">
                      <input
                        type="number"
                        className="slider-number-input"
                        min={0}
                        max={100}
                        value={bgmVolume}
                        onChange={e => setBgmVolume(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      />
                      <span className="slider-input-unit">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    className="studio-slider"
                    min="0"
                    max="100"
                    step="1"
                    value={bgmVolume}
                    onChange={e => setBgmVolume(Number(e.target.value))}
                  />
                  <div className="slider-quick-buttons">
                    <button type="button" onClick={() => setBgmVolume(10)}>10%</button>
                    <button type="button" onClick={() => setBgmVolume(20)}>20% (Default)</button>
                    <button type="button" onClick={() => setBgmVolume(35)}>35%</button>
                    <button type="button" onClick={() => setBgmVolume(50)}>50%</button>
                    <button type="button" onClick={() => setBgmVolume(80)}>80%</button>
                  </div>
                  {/* BGM Start Offset Selector */}
                  <div className="slider-control-item" style={{ marginTop: '0.85rem' }}>
                    <div className="slider-label-row">
                      <span className="slider-label">{t.studio.bgmStartOffsetLabel}</span>
                      <span className="slider-val-badge">
                        {formatDuration(bgmStartOffset)} {bgmDuration > 0 ? `/ ${formatDuration(bgmDuration)}` : ''}
                      </span>
                    </div>
                    <input
                      type="range"
                      className="studio-slider"
                      min="0"
                      max={bgmDuration > 0 ? Math.floor(bgmDuration) : 180}
                      step="0.5"
                      value={bgmStartOffset}
                      onChange={e => handleBgmStartOffsetChange(Number(e.target.value))}
                    />
                    <div className="slider-quick-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <button type="button" onClick={() => handleBgmStartOffsetChange(0)}>{t.studio.bgmStartFromBeginning}</button>
                      {bgmDuration > 0 ? (
                        <>
                          {bgmDuration > 15 && <button type="button" onClick={() => handleBgmStartOffsetChange(15)}>0:15</button>}
                          {bgmDuration > 30 && <button type="button" onClick={() => handleBgmStartOffsetChange(30)}>0:30</button>}
                          {bgmDuration > 45 && <button type="button" onClick={() => handleBgmStartOffsetChange(45)}>0:45</button>}
                          {bgmDuration > 60 && <button type="button" onClick={() => handleBgmStartOffsetChange(60)}>1:00</button>}
                          {bgmDuration > 90 && <button type="button" onClick={() => handleBgmStartOffsetChange(90)}>1:30</button>}
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => handleBgmStartOffsetChange(15)}>0:15</button>
                          <button type="button" onClick={() => handleBgmStartOffsetChange(30)}>0:30</button>
                          <button type="button" onClick={() => handleBgmStartOffsetChange(60)}>1:00</button>
                        </>
                      )}
                    </div>
                    <p className="bgm-hint-text" style={{ marginTop: '0.35rem' }}>
                      {t.studio.bgmStartOffsetHint}
                    </p>
                  </div>

                  <p className="bgm-hint-text">{t.studio.bgmHint}</p>
                </div>
              )}
            </div>
          </div>

          {/* 6. Hook Sound Effect (SFX) */}
          <div className="studio-card-group studio-audio-setting-card audio-sfx-card" hidden={activeStudioTab !== 'audio'}>
            <div className="group-header audio-card-header">
              <div className="audio-card-title-row">
                <span className="group-title">{t.studio.hookSfxTitle}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hookSfxEnabled}
                    onChange={e => setHookSfxEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </label>
              </div>
              <span className={`group-badge ${hookSfxEnabled && hookSfxFilePath ? 'accent-badge' : ''}`}>
                {hookSfxEnabled && hookSfxFilePath ? t.studio.hookSfxActiveBadge : t.studio.bgmOptionalBadge}
              </span>
            </div>

            <div className="group-content audio-card-content">
              {!hookSfxFilePath ? (
                <label
                  className={`bgm-dropzone ${isHookSfxDragging ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsHookSfxDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsHookSfxDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsHookSfxDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) uploadHookSfxFile(file);
                  }}
                >
                  <input
                    type="file"
                    accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg,audio/flac,audio/mpeg,audio/*"
                    onChange={handleHookSfxUpload}
                    style={{ display: 'none' }}
                    disabled={isUploadingHookSfx}
                  />
                  <div className="dropzone-icon">{isUploadingHookSfx ? 'UPLOADING' : ''}</div>
                  <div className="dropzone-text">
                    <span className="dropzone-main-text">
                      {isUploadingHookSfx ? 'Uploading SFX...' : isHookSfxDragging ? t.studio.hookSfxDropActive : t.studio.hookSfxUploadMain}
                    </span>
                    <span className="dropzone-sub-text">{t.studio.hookSfxUploadSub}</span>
                  </div>
                </label>
              ) : (
                <div className="bgm-active-file-row">
                  <div className="bgm-info">
                    <span className="bgm-icon"></span>
                    <div className="bgm-details">
                      <span className="bgm-filename" title={hookSfxFileName}>{hookSfxFileName}</span>
                      <span className="bgm-status-tag" style={{ background: 'rgba(187, 187, 187, 0.15)', color: '#d1d1d1', borderColor: 'rgba(187, 187, 187, 0.3)' }}>
                        {t.studio.hookSfxFirstFrameBadge}
                      </span>
                    </div>
                  </div>
                  <div className="bgm-actions">
                    {hookSfxAudioUrl && (
                      <button
                        type="button"
                        className="bgm-preview-btn"
                        onClick={toggleHookSfxPlayback}
                        title={isHookSfxPlaying ? t.studio.hookSfxPause : t.studio.hookSfxPlay}
                      >
                        {isHookSfxPlaying ? 'PAUSE' : 'PLAY'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="bgm-remove-btn"
                      onClick={handleRemoveHookSfx}
                      title={t.studio.hookSfxRemoveTooltip}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              )}

              {/* Volume Slider & Presets for SFX */}
              {hookSfxFilePath && (
                <div className="slider-control-item" style={{ marginTop: '0.9rem' }}>
                  <div className="slider-label-row">
                    <span className="slider-label">{t.studio.hookSfxVolumeLabel}</span>
                    <div className="slider-input-badge-wrap">
                      <input
                        type="number"
                        className="slider-number-input"
                        min={0}
                        max={150}
                        value={hookSfxVolume}
                        onChange={e => setHookSfxVolume(Math.max(0, Math.min(150, Number(e.target.value) || 0)))}
                      />
                      <span className="slider-input-unit">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    className="studio-slider"
                    min="0"
                    max="150"
                    step="5"
                    value={hookSfxVolume}
                    onChange={e => setHookSfxVolume(Number(e.target.value))}
                  />
                  <div className="slider-quick-buttons">
                    <button type="button" onClick={() => setHookSfxVolume(50)}>50%</button>
                    <button type="button" onClick={() => setHookSfxVolume(80)}>80%</button>
                    <button type="button" onClick={() => setHookSfxVolume(100)}>100% (Default)</button>
                    <button type="button" onClick={() => setHookSfxVolume(125)}>125% (Punchy)</button>
                  </div>
                  <p className="bgm-hint-text">{t.studio.hookSfxHint}</p>
                </div>
              )}
            </div>
          </div>

          {/* 7. Original Clip Voice Audio Boost */}
          <div className="studio-card-group studio-audio-setting-card audio-voice-card" hidden={activeStudioTab !== 'audio'}>
            <div className="group-header audio-card-header">
              <div className="audio-card-title-row">
                <span className="group-title">{t.studio.rawAudioTitle}</span>
              </div>
              <span className={`group-badge ${originalAudioVolume > 100 ? 'accent-badge' : ''}`}>
                {originalAudioVolume > 100 ? `Boosted · ${originalAudioVolume}%` : `${originalAudioVolume}% Volume`}
              </span>
            </div>

            <div className="group-content audio-card-content">
              <div className="slider-control-item">
                <div className="slider-label-row">
                  <span className="slider-label">{t.studio.rawAudioVolumeLabel}</span>
                  <div className="slider-input-badge-wrap">
                    <input
                      type="number"
                      className="slider-number-input"
                      min={0}
                      max={200}
                      step={5}
                      value={originalAudioVolume}
                      onChange={e => setOriginalAudioVolume(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                    />
                    <span className="slider-input-unit">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  className="studio-slider"
                  min="0"
                  max="200"
                  step="5"
                  value={originalAudioVolume}
                  onChange={e => setOriginalAudioVolume(Number(e.target.value))}
                />
                <div className="slider-quick-buttons">
                  <button type="button" onClick={() => setOriginalAudioVolume(50)}>50%</button>
                  <button type="button" onClick={() => setOriginalAudioVolume(80)}>80%</button>
                  <button type="button" onClick={() => setOriginalAudioVolume(100)}>100% (Normal)</button>
                  <button type="button" onClick={() => setOriginalAudioVolume(125)}>125%</button>
                  <button type="button" onClick={() => setOriginalAudioVolume(150)}>150% (Punchy)</button>
                  <button type="button" onClick={() => setOriginalAudioVolume(200)}>200% (Max Boost)</button>
                </div>
                <p className="bgm-hint-text">{t.studio.rawAudioVolumeHint}</p>
              </div>
            </div>
          </div>

          {/* 8. Video Watermark Branding */}
          <div className="studio-card-group studio-audio-setting-card audio-watermark-card" hidden={activeStudioTab !== 'audio'}>
            <div className="group-header audio-card-header">
              <div className="audio-card-title-row">
                <span className="group-title">{t.studio.watermarkTitle}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={watermarkEnabled}
                    onChange={e => setWatermarkEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </label>
              </div>
              <span className={`group-badge ${watermarkEnabled ? 'accent-badge' : ''}`}>
                {watermarkEnabled ? t.studio.watermarkBadgeEnabled : t.studio.watermarkBadgeDisabled}
              </span>
            </div>

            {watermarkEnabled && (
              <div className="group-content audio-card-content">
                {/* Type Selection */}
                <div className="watermark-type-toggle" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t.studio.watermarkTypeLabel}</span>
                  <div className="toggle-pill-group">
                    <button
                      type="button"
                      className={`pill-btn ${watermarkType === 'image' ? 'active' : ''}`}
                      onClick={() => handleSelectWatermarkType('image')}
                    >
                      {t.studio.watermarkTypeImage}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${watermarkType === 'text' ? 'active' : ''}`}
                      onClick={() => handleSelectWatermarkType('text')}
                    >
                      {t.studio.watermarkTypeText}
                    </button>
                  </div>
                </div>

                {watermarkType === 'image' ? (
                  <div className="watermark-upload-area">
                    {!watermarkImageUrl ? (
                      <label
                        className={`bgm-dropzone ${isWatermarkDragging ? 'drag-over' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsWatermarkDragging(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsWatermarkDragging(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsWatermarkDragging(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) uploadWatermarkFile(file);
                        }}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*"
                          onChange={handleWatermarkUpload}
                          style={{ display: 'none' }}
                          disabled={isUploadingWatermark}
                        />
                        <div className="dropzone-icon">{isUploadingWatermark ? 'UPLOADING' : ''}</div>
                        <div className="dropzone-text">
                          <span className="dropzone-main-text">
                            {isUploadingWatermark ? 'Uploading Watermark...' : isWatermarkDragging ? t.studio.watermarkDropActive : t.studio.watermarkUploadMain}
                          </span>
                          <span className="dropzone-sub-text">{t.studio.watermarkUploadSub}</span>
                        </div>
                      </label>
                    ) : (
                      <div className="bgm-active-file-row">
                        <div className="bgm-info">
                          <img
                            src={watermarkImageUrl}
                            alt="Logo"
                            style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)' }}
                          />
                          <div className="bgm-details">
                            <span className="bgm-filename" title={watermarkImageFileName}>{watermarkImageFileName}</span>
                            <span className="bgm-status-tag">{t.studio.watermarkActiveTag}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="bgm-remove-btn"
                          onClick={handleRemoveWatermarkImage}
                          title={t.studio.watermarkRemoveTooltip}
                        >
                          REMOVE
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="watermark-text-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <input
                      type="text"
                      className="studio-title-input"
                      placeholder={t.studio.watermarkTextPlaceholder}
                      value={watermarkText}
                      onChange={e => setWatermarkText(e.target.value)}
                      style={{ fontSize: '0.85rem', padding: '0.55rem 0.8rem' }}
                    />
                  </div>
                )}

                {/* Sliders: Size (up to 500%), Opacity, Horizontal X, Vertical Y */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.4rem' }}>
                  {/* Size (0% - 500%) */}
                  <div className="slider-control-item">
                    <div className="slider-label-row">
                      <span className="slider-label">{t.studio.watermarkSizeLabel}</span>
                      <div className="slider-input-badge-wrap">
                        <input
                          type="number"
                          className="slider-number-input"
                          min={0}
                          max={500}
                          value={watermarkSize}
                          onChange={e => setWatermarkSize(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                        />
                        <span className="slider-input-unit">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="studio-slider"
                      min="0"
                      max="500"
                      step="1"
                      value={watermarkSize}
                      onChange={e => setWatermarkSize(Number(e.target.value))}
                    />
                    <div className="slider-quick-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                      {[10, 25, 50, 100, 200, 350, 500].map(sz => (
                        <button
                          key={sz}
                          type="button"
                          className={`quick-sz-btn ${watermarkSize === sz ? 'active' : ''}`}
                          onClick={() => setWatermarkSize(sz)}
                        >
                          {sz}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opacity */}
                  <div className="slider-control-item">
                    <div className="slider-label-row">
                      <span className="slider-label">{t.studio.watermarkOpacityLabel}</span>
                      <div className="slider-input-badge-wrap">
                        <input
                          type="number"
                          className="slider-number-input"
                          min={10}
                          max={100}
                          value={watermarkOpacity}
                          onChange={e => setWatermarkOpacity(Math.max(10, Math.min(100, Number(e.target.value) || 10)))}
                        />
                        <span className="slider-input-unit">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="studio-slider"
                      min="10"
                      max="100"
                      step="5"
                      value={watermarkOpacity}
                      onChange={e => setWatermarkOpacity(Number(e.target.value))}
                    />
                  </div>

                  {/* Horizontal Position X */}
                  <div className="slider-control-item">
                    <div className="slider-label-row">
                      <span className="slider-label">{t.studio.watermarkXLabel}</span>
                      <div className="slider-input-badge-wrap">
                        <input
                          type="number"
                          className="slider-number-input"
                          min={0}
                          max={100}
                          value={watermarkX}
                          onChange={e => setWatermarkX(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        />
                        <span className="slider-input-unit">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="studio-slider"
                      min="0"
                      max="100"
                      step="1"
                      value={watermarkX}
                      onChange={e => setWatermarkX(Number(e.target.value))}
                    />
                  </div>

                  {/* Vertical Position Y */}
                  <div className="slider-control-item">
                    <div className="slider-label-row">
                      <span className="slider-label">{t.studio.watermarkYLabel}</span>
                      <div className="slider-input-badge-wrap">
                        <input
                          type="number"
                          className="slider-number-input"
                          min={0}
                          max={100}
                          value={watermarkY}
                          onChange={e => setWatermarkY(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        />
                        <span className="slider-input-unit">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      className="studio-slider"
                      min="0"
                      max="100"
                      step="1"
                      value={watermarkY}
                      onChange={e => setWatermarkY(Number(e.target.value))}
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="slider-quick-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                    <button type="button" onClick={() => applyWatermarkPreset('tl')}>{t.studio.watermarkPresetTopLeft}</button>
                    <button type="button" onClick={() => applyWatermarkPreset('tc')}>{t.studio.watermarkPresetTopCenter}</button>
                    <button type="button" onClick={() => applyWatermarkPreset('tr')}>{t.studio.watermarkPresetTopRight}</button>
                    <button type="button" onClick={() => applyWatermarkPreset('c')}>{t.studio.watermarkPresetCenter}</button>
                    <button type="button" onClick={() => applyWatermarkPreset('bl')}>{t.studio.watermarkPresetBottomLeft}</button>
                    <button type="button" onClick={() => applyWatermarkPreset('bc')}>{t.studio.watermarkPresetBottomCenter}</button>
                    <button type="button" onClick={() => applyWatermarkPreset('br')}>{t.studio.watermarkPresetBottomRight}</button>
                  </div>

                  {/* Reset Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      onClick={handleResetWatermark}
                      style={{
                        background: 'rgba(132, 132, 132, 0.15)',
                        color: '#9b9b9b',
                        border: '1px solid rgba(132, 132, 132, 0.3)',
                        fontSize: '0.72rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {t.studio.watermarkResetBtn}
                    </button>
                  </div>

                  <p className="bgm-hint-text">{t.studio.watermarkDragHint}</p>
                </div>
              </div>
            )}
          </div>

          {/* 8. Hardware Acceleration & Video Encoder */}
          <div className="studio-card-group" hidden={activeStudioTab !== 'export'}>
            <div className="group-header">
              <span className="group-title"> {t.studio.hwTitle}</span>
              <span className="group-badge">{t.studio.hwBadge}</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem 0', lineHeight: 1.4 }}>
              {t.studio.hwSubtitle}
            </p>

            <div className="hardware-options-grid">
              {/* Auto Option */}
              <button
                type="button"
                className={`hardware-option-card ${hardwareAccel === 'auto' ? 'active' : ''}`}
                onClick={() => setHardwareAccel('auto')}
              >
                <div className="hw-card-top">
                  <div className="hw-radio-dot"></div>
                  <span className="hw-card-name">{t.studio.hwAuto}</span>
                  <span className="hw-status-pill active">{t.studio.hwDetectedPill}</span>
                </div>
                <span className="hw-card-sub">
                  {hardwareInfo?.recommended
                    ? `${t.studio.hwAutoDesc} · (${hardwareInfo.recommended.toUpperCase()})`
                    : t.studio.hwAutoDesc}
                </span>
              </button>

              {/* NVIDIA NVENC */}
              <button
                type="button"
                className={`hardware-option-card ${hardwareAccel === 'nvenc' ? 'active' : ''}`}
                onClick={() => setHardwareAccel('nvenc')}
              >
                <div className="hw-card-top">
                  <div className="hw-radio-dot"></div>
                  <span className="hw-card-name">{t.studio.hwNvenc}</span>
                  <span className={`hw-status-pill ${hardwareInfo?.support?.nvenc ? 'active' : 'inactive'}`}>
                    {hardwareInfo?.support?.nvenc ? t.studio.hwSupportedPill : t.studio.hwUnavailablePill}
                  </span>
                </div>
                <span className="hw-card-sub">{t.studio.hwNvencDesc}</span>
              </button>

              {/* AMD AMF */}
              <button
                type="button"
                className={`hardware-option-card ${hardwareAccel === 'amf' ? 'active' : ''}`}
                onClick={() => setHardwareAccel('amf')}
              >
                <div className="hw-card-top">
                  <div className="hw-radio-dot"></div>
                  <span className="hw-card-name">{t.studio.hwAmf}</span>
                  <span className={`hw-status-pill ${hardwareInfo?.support?.amf ? 'active' : 'inactive'}`}>
                    {hardwareInfo?.support?.amf ? t.studio.hwSupportedPill : t.studio.hwUnavailablePill}
                  </span>
                </div>
                <span className="hw-card-sub">{t.studio.hwAmfDesc}</span>
              </button>

              {/* Intel QuickSync */}
              <button
                type="button"
                className={`hardware-option-card ${hardwareAccel === 'qsv' ? 'active' : ''}`}
                onClick={() => setHardwareAccel('qsv')}
              >
                <div className="hw-card-top">
                  <div className="hw-radio-dot"></div>
                  <span className="hw-card-name">{t.studio.hwQsv}</span>
                  <span className={`hw-status-pill ${hardwareInfo?.support?.qsv ? 'active' : 'inactive'}`}>
                    {hardwareInfo?.support?.qsv ? t.studio.hwSupportedPill : t.studio.hwUnavailablePill}
                  </span>
                </div>
                <span className="hw-card-sub">{t.studio.hwQsvDesc}</span>
              </button>

              {/* CPU Software libx264 */}
              <button
                type="button"
                className={`hardware-option-card ${hardwareAccel === 'cpu' ? 'active' : ''}`}
                onClick={() => setHardwareAccel('cpu')}
              >
                <div className="hw-card-top">
                  <div className="hw-radio-dot"></div>
                  <span className="hw-card-name">{t.studio.hwCpu}</span>
                  <span className="hw-status-pill active">{t.studio.hwSupportedPill}</span>
                </div>
                <span className="hw-card-sub">{t.studio.hwCpuDesc}</span>
              </button>
            </div>
          </div>

          {/* Video File Name Option */}
          <div className="studio-card-group" hidden={activeStudioTab !== 'export'}>
            <div className="group-header">
              <span className="group-title">{t.studio.fileNameTitle}</span>
              <span className="group-badge">{t.studio.fileNameBadge}</span>
            </div>

            <div className="hook-prefix-suffix-grid">
              <div className="hook-input-col">
                <label className="hook-input-label">{t.studio.fileNamePrefixLabel}</label>
                <input
                  type="text"
                  className="studio-text-input"
                  placeholder={t.studio.fileNamePrefixPlaceholder}
                  value={fileNamePrefix}
                  onChange={e => setFileNamePrefix(e.target.value)}
                />
              </div>
              <div className="hook-input-col">
                <label className="hook-input-label">{t.studio.fileNameSuffixLabel}</label>
                <input
                  type="text"
                  className="studio-text-input"
                  placeholder={t.studio.fileNameSuffixPlaceholder}
                  value={fileNameSuffix}
                  onChange={e => setFileNameSuffix(e.target.value)}
                />
              </div>
            </div>

            {/* Filename Output Example Preview Box */}
            <div className="filename-preview-box">
              <div className="filename-preview-header">
                <span className="filename-preview-label">{t.studio.fileNameExampleLabel}</span>
                <span className="filename-preview-tag">.mp4</span>
              </div>
              <div className="filename-preview-display">
                <span className="fn-icon"></span>
                <span className="fn-text">
                  {fileNamePrefix && <span className="pfx-highlight">{fileNamePrefix.replace(/[\\/*?:"<>|]/g, '')}</span>}
                  <span className="base-highlight">{sampleCleanTitle}</span>
                  {fileNameSuffix && <span className="sfx-highlight">{fileNameSuffix.replace(/[\\/*?:"<>|]/g, '')}</span>}
                  <span className="ext-highlight">.mp4</span>
                </span>
              </div>
              <p className="filename-preview-tip">{t.studio.fileNameTip}</p>
            </div>
          </div>

          {/* Batch Clip Hook / Title Customizer for All Selected Clips */}
          <div className="studio-card-group" data-studio-order="2" hidden={activeStudioTab !== 'clips'}>
            <div className="group-header">
              <span className="group-title">{t.studio.batchClipTitlesTitle}</span>
              <span className="group-badge">
                {selectedClips.length} {selectedClips.length === 1 ? t.studio.clipSelectedSingle : t.studio.clipSelectedPlural}
              </span>
            </div>

            <p className="batch-clip-titles-desc">
              {t.studio.batchClipTitlesDesc}
            </p>

            {selectedClips.length === 0 ? (
              <div className="batch-titles-empty-box">
                <span></span>
                <span>{t.studio.batchClipTitlesEmpty}</span>
              </div>
            ) : (
              <div className="batch-titles-list">
                {selectedClips.map((clip, i) => {
                  const clipKey = `${clip.start_time}_${clip.end_time}`;
                  const custom = customClipTitles[clipKey];
                  const originalSuggestion = (clip.title_suggestion || clip.title || '').trim();
                  const baseTitle = (custom !== undefined && custom.trim() !== '') ? custom : originalSuggestion;
                  const hasCustomTitle = custom !== undefined && custom.trim() !== '' && custom.trim() !== originalSuggestion;
                  const isCurrentActivePreview = currentPreviewClip && currentPreviewClip.start_time === clip.start_time && currentPreviewClip.end_time === clip.end_time;
                  const originalIndex = allClips.findIndex(c => c.start_time === clip.start_time && c.end_time === clip.end_time);
                  const clipDisplayNum = originalIndex !== -1 ? originalIndex + 1 : i + 1;

                  return (
                    <div
                      key={clipKey}
                      className={`batch-title-card-item ${isCurrentActivePreview ? 'active-preview-border' : ''}`}
                    >
                      <div className="batch-title-card-header">
                        <div className="batch-title-card-left">
                          <span className="batch-title-clip-badge">#{clipDisplayNum}</span>
                          <span className="batch-title-ts">
                             {Math.floor(clip.start_time / 60)}:{(clip.start_time % 60).toFixed(0).padStart(2, '0')} - {Math.floor(clip.end_time / 60)}:{(clip.end_time % 60).toFixed(0).padStart(2, '0')} ({(clip.end_time - clip.start_time).toFixed(0)}s)
                          </span>
                          {typeof clip.virality_score === 'number' && (
                            <span className="batch-title-score-pill"> {clip.virality_score}%</span>
                          )}
                        </div>

                        <div className="batch-title-card-right">
                          {hasCustomTitle && (
                            <button
                              type="button"
                              className="batch-title-reset-btn"
                              onClick={() => {
                                setCustomClipTitles(prev => {
                                  const next = { ...prev };
                                  delete next[clipKey];
                                  return next;
                                });
                              }}
                              title={t.studio.resetToAiTitle}
                            >
                              <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none">
                                <path d="M3.2 5.1A5.4 5.4 0 1 1 2.7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                <path d="M1.8 2.8v3.1h3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span>{t.studio.resetToAiTitle}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className={`batch-title-preview-btn ${isCurrentActivePreview ? 'is-active' : ''}`}
                            onClick={() => {
                              if (originalIndex !== -1) {
                                setPreviewClipIndex(originalIndex);
                              }
                            }}
                            title={isCurrentActivePreview ? t.studio.batchClipTitlesActivePreview : t.studio.batchClipTitlesPreviewBtn}
                          >
                            {isCurrentActivePreview ? `● ${t.studio.batchClipTitlesActivePreview}` : t.studio.batchClipTitlesPreviewBtn}
                          </button>
                        </div>
                      </div>

                      <div className="batch-title-input-wrapper">
                        <input
                          type="text"
                          className="batch-title-input"
                          placeholder={originalSuggestion || t.studio.titlePlaceholder}
                          value={custom !== undefined ? custom : (originalSuggestion || '')}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomClipTitles(prev => ({
                              ...prev,
                              [clipKey]: val,
                            }));
                          }}
                        />
                      </div>

                      {(titlePrefix || titleSuffix) && (
                        <div className="batch-title-combined-preview">
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{t.studio.batchClipTitlesCombinedPreview}</span>
                          <span>
                            {titlePrefix && <span className="pfx-highlight">{titlePrefix}</span>}
                            <span className="base-highlight">{baseTitle || t.studio.previewSampleTitle}</span>
                            {titleSuffix && <span className="sfx-highlight">{titleSuffix}</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 9. Selected Clips Checklist */}
          <div className="studio-card-group" data-studio-order="1" hidden={activeStudioTab !== 'clips'}>
            <div className="group-header batch-checklist-header">
              <span className="group-title">
                {t.studio.batchChecklist(selectedClips.length, allClips.length)}
              </span>
              {allClips.length > 0 && (
                <button
                  type="button"
                  className={`studio-checklist-toggle-btn ${selectedClips.length === allClips.length ? 'all-selected' : ''}`}
                  onClick={handleToggleAllClips}
                  title={selectedClips.length === allClips.length ? t.studio.unmarkAllClips : t.studio.markAllClips}
                >
                  {selectedClips.length === allClips.length ? t.studio.unmarkAllClips : t.studio.markAllClips}
                </button>
              )}
            </div>
            <div className="batch-clips-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {allClips.map((clip, i) => {
                const isSelected = selectedClips.some(
                  c => c.start_time === clip.start_time && c.end_time === clip.end_time
                );
                return (
                  <div
                    key={i}
                    className={`batch-clip-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleClip(clip)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent onClick
                    />
                    <div className="batch-clip-info">
                      <span className="batch-clip-title">
                        {(() => {
                          const clipKey = `${clip.start_time}_${clip.end_time}`;
                          const custom = customClipTitles[clipKey];
                          return (custom !== undefined && custom.trim()) ? custom.trim() : (clip.title_suggestion || clip.title);
                        })()}
                      </span>
                      <span className="batch-clip-ts">
                         {Math.floor(clip.start_time / 60)}:{(clip.start_time % 60).toFixed(0).padStart(2, '0')} -{' '}
                        {Math.floor(clip.end_time / 60)}:{(clip.end_time % 60).toFixed(0).padStart(2, '0')} (
                        {(clip.end_time - clip.start_time).toFixed(0)}s) · Score: {clip.virality_score}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Real Video Live Preview */}
        <div className="studio-preview-pane">
          <div className="preview-sticky-wrap">
            <div className="preview-header-bar">
              <span className="preview-title">{t.studio.livePreview}</span>
              <span
                className={`preview-indicator ${!playerReady ? 'is-loading' : isPlaying ? 'is-playing' : 'is-ready'}`}
              >
                {!playerReady ? t.studio.previewLoading : isPlaying ? t.studio.previewPlaying : t.studio.previewReady}
              </span>
            </div>

            <div
              ref={phoneContainerRef}
              className={`phone-wireframe-container real-preview-container ${isLandscape ? 'is-landscape' : ''}`}
              style={{ width: `${phoneWidth}px`, height: `${phoneHeight}px` }}
            >
              {/* Background Backdrop (Black or Ambient Blurred) */}
              <div
                className="real-frame-bg-layer"
                style={{ backgroundColor: '#000000' }}
              >
                {backgroundStyle === 'blurred' && aspectRatio !== '9:16' && aspectRatio !== '16:9_landscape' && (
                  <div className="ambient-blur-backdrop" style={{ overflow: 'hidden' }}>
                    {videoUrl && (videoUrl.endsWith('.mp4') || videoUrl.endsWith('.webm') || videoUrl.endsWith('.mov') || videoUrl.endsWith('.mkv') || videoUrl.includes('/api/video') || videoUrl.startsWith('blob:') || videoId?.startsWith('upload_') || videoId?.startsWith('gdrive_')) ? (
                      <video
                        ref={ambientVideoRef}
                        src={videoUrl}
                        playsInline
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          filter: 'blur(20px) brightness(0.8) saturate(1.35)',
                          transform: 'scale(1.2)',
                          pointerEvents: 'none',
                        }}
                      />
                    ) : (
                      <img
                        src={videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined}
                        alt="Ambient Blurred"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          filter: 'blur(20px) brightness(0.8) saturate(1.35)',
                          transform: 'scale(1.2)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Content Box with Live Video Player */}
                <div className={`wireframe-single-layout ${streamerPreset === 'split_top_cam' ? 'split-active' : ''}`}>
                  {/* Top Facecam Box if split_top_cam */}
                  {streamerPreset === 'split_top_cam' && (
                    <>
                      <div className={`wireframe-split-cam-box aspect-${aspectRatio.replace(':', '').replace('_', '')}`}>
                        <div className="wireframe-facecam-skeleton">
                          <div className="skeleton-grid-mesh"></div>
                          <div className="skeleton-reticle">
                            <span className="reticle-bracket top-left"></span>
                            <span className="reticle-bracket top-right"></span>
                            <span className="reticle-bracket bottom-left"></span>
                            <span className="reticle-bracket bottom-right"></span>
                            <div className="skeleton-avatar">
                              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                            </div>
                          </div>
                          <div className="skeleton-label-wrap">
                            <span className="skeleton-main-label">STREAMER CAM</span>
                            <span className="skeleton-sub-label">
                              {facecamPosition === 'auto' ? `AUTO FACE-CROP (${aspectRatio})` : `${facecamPosition.toUpperCase().replace('_', '-')} CROP (${aspectRatio})`}
                            </span>
                          </div>
                        </div>
                        <div className="wireframe-cam-badge">
                          <span className="live-dot"></span> FACECAM ({facecamPosition === 'auto' ? 'AI AUTO' : facecamPosition.toUpperCase().replace('_', '-')})
                        </div>
                      </div>
                      <div className="wireframe-split-divider"></div>
                    </>
                  )}

                  {/* Content scaled by aspect ratio with real playable video */}
                  <div className={`wireframe-content-box aspect-${aspectRatio.replace(':', '').replace('_', '')} ${streamerPreset === 'split_top_cam' ? 'split-mode' : ''}`}>
                    <div className="wireframe-content-inner">
                      {/* HTML5 or YouTube Player slot - ALWAYS STABLY MOUNTED */}
                      {videoUrl && (videoUrl.endsWith('.mp4') || videoUrl.endsWith('.webm') || videoUrl.endsWith('.mov') || videoUrl.endsWith('.mkv') || videoUrl.includes('/api/video') || videoUrl.startsWith('blob:') || videoId?.startsWith('upload_') || videoId?.startsWith('gdrive_')) ? (
                        <video
                          ref={directVideoRef}
                          src={videoUrl}
                          playsInline
                          muted={isMuted}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: `${previewCropPercent}% 50%`,
                            transition: 'object-position 0.3s ease-out'
                          }}
                          onPlay={() => {
                            setIsPlaying(true);
                            startTracking();
                            if (ambientVideoRef.current) ambientVideoRef.current.play().catch(() => {});
                          }}
                          onPause={() => {
                            setIsPlaying(false);
                            stopTracking();
                            if (ambientVideoRef.current) ambientVideoRef.current.pause();
                          }}
                          onEnded={() => {
                            if (isLooping && currentPreviewClip) {
                              if (directVideoRef.current) {
                                directVideoRef.current.currentTime = currentPreviewClip.start_time;
                                directVideoRef.current.play();
                              }
                              if (ambientVideoRef.current) {
                                ambientVideoRef.current.currentTime = currentPreviewClip.start_time;
                                ambientVideoRef.current.play().catch(() => {});
                              }
                            }
                          }}
                        />
                      ) : (
                        <div
                          id="studio-preview-yt-container"
                          className="studio-yt-embed-slot"
                          style={{
                            opacity: playerReady ? 1 : 0,
                            transition: 'opacity 0.25s ease',
                            ['--preview-crop-pct' as any]: previewCropPercent,
                          }}
                        >
                          <div id="studio-yt-iframe-slot"></div>
                        </div>
                      )}

                      {/* Click overlay to toggle play/pause */}
                      <div
                        className="studio-preview-click-overlay"
                        onClick={togglePlayPause}
                        title={isPlaying ? t.studio.clickToPause : t.studio.clickToPlay}
                      >
                        {!isPlaying && (
                          <div className="preview-play-icon-bubble">

                          </div>
                        )}
                      </div>

                      {/* PIP Corner Box */}
                      {streamerPreset === 'pip_corner' && (
                        <div className="wireframe-pip-box" style={{ zIndex: 12 }}>
                          <div className="wireframe-pip-skeleton">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span className="pip-skeleton-text">CAM</span>
                          </div>
                          <div className="wireframe-pip-badge"> CAM</div>
                        </div>
                      )}

                      {/* Badge for Split Mode Bottom Feed */}
                      {streamerPreset === 'split_top_cam' && (
                        <div className="wireframe-gameplay-badge">
                           GAMEPLAY ({aspectRatio})
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Title Overlay with Real-time Up/Down Position & Scaled Font */}
                {titlePosition !== 'none' && (
                  <div
                    className="wireframe-title-overlay"
                    style={{
                      top: `${safeTitleY}%`,
                      zIndex: 22,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      className="wireframe-title-text"
                      style={{
                        fontFamily: titleFont,
                        fontSize: (() => {
                          const scale = isLandscape ? (320 / 1920) : (320 / 1080);
                          const px = Math.round(titleFontSizePx * scale);
                          const minPx = 4;
                          return `${Math.max(minPx, px)}px`;
                        })(),
                        lineHeight: titleLineCount >= 3 ? 1.10 : 1.08,
                        letterSpacing: '0.02em',
                        whiteSpace: 'pre-line',
                        textAlign: 'center',
                        color: '#ffffff',
                        fontWeight: 800,
                        textShadow: '0 0 2px #000000, 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 5px rgba(0, 0, 0, 0.8)',
                        background: 'transparent',
                        padding: '0 8px',
                        boxSizing: 'border-box',
                        borderRadius: '0',
                        border: 'none',
                        boxShadow: 'none',
                        display: 'inline-block',
                        maxWidth: '96%',
                        wordBreak: 'break-word',
                      }}
                    >
                      {formattedTitle}
                    </span>
                  </div>
                )}

                {/* Subtitle Overlay with Real-time Up/Down Position & Scaled Font */}
                {captionStyle !== 'none' && previewCaption && (
                  <div
                    className={`wireframe-caption-overlay style-${captionStyle}${subtitlePositionMode === 'center' ? ' mode-center' : ''}`}
                    style={{
                      ...(subtitlePositionMode === 'center'
                        ? {
                            top: `${safeSubCenterY}%`,
                            bottom: 'auto',
                            transform: 'translateY(-50%)',
                          }
                        : {
                            bottom: `${safeSubtitleY}%`,
                            top: 'auto',
                            transform: 'none',
                          }),
                      zIndex: 22,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      className="wireframe-caption-text"
                      style={{
                        fontFamily: captionFont,
                        fontSize: (() => {
                          const scale = isLandscape ? (320 / 1920) : (320 / 1080);
                          const px = Math.round(fontSizePx * scale);
                          const minPx = 4;
                          return `${Math.max(minPx, px)}px`;
                        })(),
                        fontWeight: 800,
                        letterSpacing: '0.03em',
                        textAlign: 'center',
                        textShadow: '0 0 2px #000000, 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 5px rgba(0, 0, 0, 0.8)',
                        display: 'inline-block',
                      }}
                    >
                      {previewCaption.words.map((word, index) => (
                        <React.Fragment key={`${index}-${word}`}>
                          {index > 0 ? ' ' : ''}
                          <span style={{ color: index === previewCaption.activeIndex ? captionHighlightColor[captionStyle] : '#ffffff' }}>
                            {applyLetterCase(word, textCase)}
                          </span>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                )}

                {/* Real-time Watermark Overlay */}
                {watermarkEnabled && (
                  <div
                    className="wireframe-watermark-overlay"
                    style={{
                      left: `${watermarkX}%`,
                      top: `${watermarkY}%`,
                      transform: 'translate(-50%, -50%)',
                      opacity: watermarkOpacity / 100,
                      zIndex: 25,
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  >
                    {watermarkType === 'image' && watermarkImageUrl ? (
                      <img
                        src={watermarkImageUrl}
                        alt="Watermark"
                        draggable={false}
                        style={{
                          width: watermarkSize === 0 ? '0px' : `${Math.round((phoneWidth * watermarkSize) / 100)}px`,
                          height: 'auto',
                          objectFit: 'contain',
                          display: watermarkSize === 0 ? 'none' : 'block',
                          pointerEvents: 'none',
                        }}
                      />
                    ) : watermarkText.trim() ? (
                      <span
                        className="wm-text-badge"
                        style={{
                          fontSize: watermarkSize === 0 ? '0px' : `${Math.max(8, Math.round((watermarkSize / 100) * 56))}px`,
                          display: watermarkSize === 0 ? 'none' : 'inline-block',
                          pointerEvents: 'none',
                        }}
                      >
                        {watermarkText}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Hidden Audio element for background music preview */}
            <audio
              ref={bgmAudioRef}
              src={bgmAudioUrl}
              onEnded={() => setIsBgmPlaying(false)}
              onLoadedMetadata={handleBgmLoadedMetadata}
              style={{ display: 'none' }}
            />

            {/* Hidden Audio element for hook sound effect preview */}
            <audio
              ref={hookSfxAudioRef}
              src={hookSfxAudioUrl}
              onEnded={() => setIsHookSfxPlaying(false)}
              style={{ display: 'none' }}
            />

            {/* External Video Player Controls (Outside preview clip, YouTube-like) */}
            <div className="studio-player-controls-card">
              {/* Timeline scrollbar like YouTube */}
              <div className="player-timeline-row">
                <input
                  type="range"
                  className="player-timeline-slider"
                  min={clipStart}
                  max={clipEnd}
                  step="0.1"
                  value={Math.min(Math.max(currentTime, clipStart), clipEnd)}
                  onChange={e => handleSeek(Number(e.target.value))}
                  title={t.studio.seekTimeline}
                />
              </div>

              {/* Player actions row */}
              <div className="player-controls-bottom-row">
                <div className="player-controls-left">
                  <button
                    type="button"
                    className="player-ctrl-btn"
                    onClick={togglePlayPause}
                    title={isPlaying ? t.studio.pause : t.studio.play}
                  >
                    {isPlaying ? 'PAUSE' : 'PLAY'}
                  </button>

                  <button
                    type="button"
                    className="player-ctrl-btn player-restart-btn"
                    onClick={handleRestart}
                    title={t.studio.restart}
                    aria-label={t.studio.restart}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 2v6h6" />
                      <path d="M3.6 8A9 9 0 1 1 5.2 17" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="player-ctrl-btn"
                    onClick={toggleMute}
                    title={isMuted ? t.studio.unmute : t.studio.mute}
                  >
                    {isMuted ? 'UNMUTE' : 'MUTE'}
                  </button>

                  <span className="player-time-badge">
                    {formatDuration(currentTime - clipStart)} / {formatDuration(clipDuration)}
                  </span>
                </div>

                <div className="player-controls-right">
                  <button
                    type="button"
                    className={`player-loop-toggle ${isLooping ? 'active' : ''}`}
                    onClick={() => setIsLooping(!isLooping)}
                    title={isLooping ? t.studio.loopEnabled : t.studio.loopDisabled}
                  >
                    {t.studio.loop}
                  </button>
                </div>
              </div>
            </div>
            {/* Studio Render History & Specs Card (under player controls so it won't be empty) */}
            <div className="studio-render-history-card">
              <div className="history-card-header">
                <span className="history-card-title">{t.studio.renderSpecsTitle}</span>
                <span className="history-badge-pill">
                  {aspectRatio === '16:9' ? '1920×1080' : aspectRatio === '1:1' ? '1080×1080' : aspectRatio === '4:3' ? '1440×1080' : '1080×1920'}
                </span>
              </div>

              <div className="history-info-grid">
                <div className="history-info-item">
                  <span className="info-key">{t.studio.specResolution}</span>
                  <span className="info-val">
                    {aspectRatio === '16:9' ? '1920×1080 (16:9 Landscape)' : aspectRatio === '1:1' ? '1080×1080 (1:1 Square)' : aspectRatio === '4:3' ? '1440×1080 (4:3 Classic)' : '1080×1920 (9:16 Portrait)'}
                  </span>
                </div>
                <div className="history-info-item history-hardware-item">
                  <span className="info-key">{t.studio.specHardware}</span>
                  <div className="history-hw-select-wrapper">
                    <select
                      className="history-hw-select"
                      aria-label={t.studio.specHardware}
                      value={hardwareAccel}
                      onChange={(e) => setHardwareAccel(e.target.value as HardwareAccelOption)}
                      title={t.studio.hwChangeHint}
                    >
                      <option value="auto">
                         Auto ({hardwareInfo?.recommended ? hardwareInfo.recommended.toUpperCase() : 'NVENC'})
                      </option>
                      <option value="nvenc">
                         NVENC {hardwareInfo?.support?.nvenc ? '· available' : '· unavailable'}
                      </option>
                      <option value="amf">
                         AMD AMF {hardwareInfo?.support?.amf ? '· available' : '· unavailable'}
                      </option>
                      <option value="qsv">
                         Intel QSV {hardwareInfo?.support?.qsv ? '· available' : '· unavailable'}
                      </option>
                      <option value="cpu">
                         CPU (libx264)
                      </option>
                    </select>
                  </div>
                </div>
                <div className="history-info-item">
                  <span className="info-key">{t.studio.specAspect}</span>
                  <span className="info-val">{aspectRatio} ({backgroundStyle})</span>
                </div>
                <div className="history-info-item">
                  <span className="info-key">{t.studio.specCaption}</span>
                  <span className="info-val">{captionStyle} · {captionFont} ({fontSizePx}px)</span>
                </div>
                {titlePosition !== 'none' && (
                  <div className="history-info-item">
                    <span className="info-key">{t.studio.titleFontFamily}:</span>
                    <span className="info-val">{titleFont} ({titleFontSizePx}px)</span>
                  </div>
                )}
                <div className="history-info-item">
                  <span className="info-key">{t.studio.specQueue}</span>
                  <span className="info-val">{t.studio.specQueueVal(selectedClips.length, allClips.length)}</span>
                </div>
                <div className="history-info-item">
                  <span className="info-key">{t.studio.specStatus}</span>
                  <span className="info-val">
                    {batchProgress?.overall_status === 'completed'
                      ? t.studio.statusCompleted(batchProgress.clips.filter(c => c.status === 'completed').length)
                      : isRendering
                      ? t.studio.statusRendering
                      : t.studio.statusReady}
                  </span>
                </div>
              </div>

              {/* Mini session output files list */}
              {batchProgress && batchProgress.clips.some(c => c.status === 'completed') && (
                <div className="history-recent-list">
                  <span className="recent-list-title">{t.studio.recentFilesTitle}</span>
                  <div className="recent-items-scroll">
                    {batchProgress.clips.filter(c => c.status === 'completed').map((c, i) => {
                      let rawBaseTitle = (c.base_title || '').trim();
                      if (!rawBaseTitle) {
                        let t = (c.title || `clip_${i + 1}`).trim();
                        if (titlePrefix && t.startsWith(titlePrefix)) {
                          t = t.slice(titlePrefix.length);
                        }
                        if (titleSuffix && t.endsWith(titleSuffix)) {
                          t = t.slice(0, t.length - titleSuffix.length);
                        }
                        rawBaseTitle = t.trim() || `clip_${i + 1}`;
                      }
                      rawBaseTitle = rawBaseTitle.replace(/[\\/*?:"<>|]/g, '').trim() || `clip_${i + 1}`;
                      const fnPfx = (fileNamePrefix || '').replace(/[\\/*?:"<>|]/g, '');
                      const fnSfx = (fileNameSuffix || '').replace(/[\\/*?:"<>|]/g, '');
                      const cleanTitle = `${fnPfx}${rawBaseTitle}${fnSfx}`.trim() || rawBaseTitle;
                      let dupCount = 0;
                      const completedClips = batchProgress.clips.filter(x => x.status === 'completed');
                      for (let k = 0; k < i; k++) {
                        let priorBase = (completedClips[k].base_title || '').trim();
                        if (!priorBase) {
                          let pt = (completedClips[k].title || `clip_${k + 1}`).trim();
                          if (titlePrefix && pt.startsWith(titlePrefix)) {
                            pt = pt.slice(titlePrefix.length);
                          }
                          if (titleSuffix && pt.endsWith(titleSuffix)) {
                            pt = pt.slice(0, pt.length - titleSuffix.length);
                          }
                          priorBase = pt.trim() || `clip_${k + 1}`;
                        }
                        priorBase = priorBase.replace(/[\\/*?:"<>|]/g, '').trim() || `clip_${k + 1}`;
                        const priorTitle = `${fnPfx}${priorBase}${fnSfx}`.trim() || priorBase;
                        if (priorTitle.toLowerCase() === cleanTitle.toLowerCase()) {
                          dupCount++;
                        }
                      }
                      const finalClipName = dupCount > 0 ? `${cleanTitle} (${dupCount})` : cleanTitle;
                      const dlUrlWithTitle = c.download_url
                        ? `${c.download_url}${c.download_url.includes('?') ? '&' : '?'}title=${encodeURIComponent(finalClipName)}`
                        : '';

                      return (
                        <div key={i} className="recent-file-row">
                          <span className="file-idx">#{i + 1}</span>
                          <span className="file-name" title={c.title}>{c.title}</span>
                          {c.download_url && (
                            <a
                              href={dlUrlWithTitle}
                              download={`${finalClipName}.mp4`}
                              className="quick-dl-btn"
                              title={`Download ${finalClipName}.mp4`}
                            >
                               MP4
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Batch Render Queue Card - Fancy glowing when generating */}
            {batchProgress && (
              <div id="studio-batch-queue" className={`studio-batch-queue-card is-${batchProgress.overall_status}`}>
                <div className="batch-progress-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h4 className="batch-queue-title">{t.studio.batchQueueTitle}</h4>
                      {batchProgress.overall_status === 'running' && (
                        <span className="queue-generating-pill">
                          <span className="queue-pulse-dot"></span>  GENERATING VIDEO...
                        </span>
                      )}
                    </div>
                    <p className="batch-subtitle">
                      {batchProgress.overall_status === 'completed'
                        ? (batchProgress.clips.some(c => c.status === 'error')
                            ? t.studio.someClipsFailed(batchProgress.clips.filter(c => c.status === 'error').length, batchProgress.total_clips)
                            : t.studio.allClipsRendered(batchProgress.total_clips))
                        : batchProgress.overall_status === 'error'
                        ? (language === 'id' ? t.studio.allClipsFailed : (batchProgress.error_message || t.studio.allClipsFailed))
                        : t.studio.processingClip((batchProgress.current_clip_index || 0) + 1, batchProgress.total_clips)}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    {batchProgress.clips.some(c => c.status === 'error') && batchProgress.overall_status !== 'running' && onRetryClip && (
                      <button
                        type="button"
                        onClick={() => onRetryClip()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: 'linear-gradient(135deg, #b1b1b1 0%, #909090 100%)',
                          border: '1px solid rgba(177, 177, 177, 0.7)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 0 10px rgba(177, 177, 177, 0.35)',
                          transition: 'all 0.2s ease',
                        }}
                        title={t.studio.retryAllFailedTooltip}
                      >
                        {t.studio.retryAllFailedBtn
                          ? t.studio.retryAllFailedBtn(batchProgress.clips.filter(c => c.status === 'error').length)
                          : ` Retry Failed (${batchProgress.clips.filter(c => c.status === 'error').length})`}
                      </button>
                    )}

                    {(batchProgress.overall_status === 'completed' || batchProgress.clips.some(c => c.status === 'completed')) && (
                      <a
                        href={batchProgress.zip_url || `/api/download-batch-zip/${batchProgress.batch_id}`}
                        download={`eclipse_${batchProgress.batch_id}.zip`}
                        className="glowing-btn batch-zip-download-btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: 'linear-gradient(135deg, #a3a3a3 0%, #838383 100%)',
                          border: '1px solid rgba(163, 163, 163, 0.6)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          boxShadow: '0 0 12px rgba(163, 163, 163, 0.35)',
                          cursor: 'pointer',
                        }}
                      >
                         ZIP
                      </a>
                    )}

                    {(batchProgress.overall_status === 'completed' || batchProgress.overall_status === 'error') && onDismissProgress && (
                      <button
                        type="button"
                        className="studio-close-btn"
                        onClick={onDismissProgress}
                        aria-label={t.studio.dismissQueue}
                        style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem 0.3rem' }}
                        title={t.studio.dismissQueue}
                      >

                      </button>
                    )}
                  </div>
                </div>

                {/* Overall Batch Error Notice if all clips failed */}
                {batchProgress.overall_status === 'error' && (
                  <div style={{
                    margin: '0.5rem 0 0.2rem',
                    padding: '0.55rem 0.75rem',
                    background: 'rgba(132, 132, 132, 0.12)',
                    border: '1px solid rgba(132, 132, 132, 0.35)',
                    borderRadius: '7px',
                    color: '#bcbcbc',
                    fontSize: '0.74rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.45rem',
                    fontWeight: 600
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span></span>
                      <span title={batchProgress.error_message || t.studio.allClipsFailed}>
                        {language === 'id' ? t.studio.allClipsFailed : (batchProgress.error_message || t.studio.allClipsFailed)}
                      </span>
                    </div>
                    {onRetryClip && (
                      <button
                        type="button"
                        onClick={() => onRetryClip()}
                        style={{
                          background: 'linear-gradient(135deg, #b1b1b1, #909090)',
                          border: '1px solid rgba(177, 177, 177, 0.6)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          padding: '3px 9px',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          boxShadow: '0 0 8px rgba(177, 177, 177, 0.35)',
                          flexShrink: 0
                        }}
                      >
                        {t.studio.retryClipBtn}
                      </button>
                    )}
                  </div>
                )}

                {/* Overall Progress Bar */}
                <div className="batch-overall-bar-wrap">
                  <div className="batch-overall-bar">
                    <div
                      className="batch-overall-fill"
                      style={{
                        height: '100%',
                        width: `${Math.round((batchProgress.clips.filter(c => c.status === 'completed').length / (batchProgress.total_clips || 1)) * 100)}%`,
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    <span>{t.batchProgress.completedMeta(batchProgress.clips.filter(c => c.status === 'completed').length, batchProgress.total_clips)}</span>
                    <span>{Math.round((batchProgress.clips.filter(c => c.status === 'completed').length / (batchProgress.total_clips || 1)) * 100)}%</span>
                  </div>
                </div>

                {/* Render Items List */}
                <div className="batch-render-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.6rem' }}>
                  {batchProgress.clips.map((clip, idx) => {
                    let rawBaseTitle = (clip.base_title || '').trim();
                    if (!rawBaseTitle) {
                      let t = (clip.title || `clip_${idx + 1}`).trim();
                      if (titlePrefix && t.startsWith(titlePrefix)) {
                        t = t.slice(titlePrefix.length);
                      }
                      if (titleSuffix && t.endsWith(titleSuffix)) {
                        t = t.slice(0, t.length - titleSuffix.length);
                      }
                      rawBaseTitle = t.trim() || `clip_${idx + 1}`;
                    }
                    rawBaseTitle = rawBaseTitle.replace(/[\\/*?:"<>|]/g, '').trim() || `clip_${idx + 1}`;
                    const fnPfx = (fileNamePrefix || '').replace(/[\\/*?:"<>|]/g, '');
                    const fnSfx = (fileNameSuffix || '').replace(/[\\/*?:"<>|]/g, '');
                    const cleanTitle = `${fnPfx}${rawBaseTitle}${fnSfx}`.trim() || rawBaseTitle;
                    let dupCount = 0;
                    for (let i = 0; i < idx; i++) {
                      let priorBase = (batchProgress.clips[i].base_title || '').trim();
                      if (!priorBase) {
                        let pt = (batchProgress.clips[i].title || `clip_${i + 1}`).trim();
                        if (titlePrefix && pt.startsWith(titlePrefix)) {
                          pt = pt.slice(titlePrefix.length);
                        }
                        if (titleSuffix && pt.endsWith(titleSuffix)) {
                          pt = pt.slice(0, pt.length - titleSuffix.length);
                        }
                        priorBase = pt.trim() || `clip_${i + 1}`;
                      }
                      priorBase = priorBase.replace(/[\\/*?:"<>|]/g, '').trim() || `clip_${i + 1}`;
                      const priorTitle = `${fnPfx}${priorBase}${fnSfx}`.trim() || priorBase;
                      if (priorTitle.toLowerCase() === cleanTitle.toLowerCase()) {
                        dupCount++;
                      }
                    }
                    const finalClipName = dupCount > 0 ? `${cleanTitle} (${dupCount})` : cleanTitle;
                    const dlUrlWithTitle = clip.download_url
                      ? `${clip.download_url}${clip.download_url.includes('?') ? '&' : '?'}title=${encodeURIComponent(finalClipName)}`
                      : '';

                    const isError = clip.status === 'error';
                    const rawError = clip.error_message || clip.error || '';

                    return (
                      <div
                        key={idx}
                        className={`batch-item-row status-${clip.status}`}
                        style={{
                          padding: '0.5rem 0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', maxWidth: '65%' }}>
                            <span style={{ fontSize: '0.7rem', color: isError ? '#737373' : '#5f6368', fontWeight: 600 }}>#{idx + 1}</span>
                            <span style={{ fontSize: '0.75rem', color: '#252525', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.title}</span>
                          </div>
                          <div>
                            {clip.status === 'pending' && <span style={{ fontSize: '0.68rem', color: '#62666d' }}>{t.studio.statusWaitingShort}</span>}
                            {clip.status === 'downloading' && <span style={{ fontSize: '0.68rem', color: '#4b5563' }}>{t.studio.statusSlicingShort}</span>}
                            {clip.status === 'transcribing' && <span style={{ fontSize: '0.68rem', color: '#4b5563' }}>{t.studio.statusCaptionsShort}</span>}
                            {clip.status === 'rendering' && <span style={{ fontSize: '0.68rem', color: '#4b5563' }}>{t.studio.statusRenderingShort}</span>}
                            {clip.status === 'completed' && (
                              clip.download_url ? (
                                <a
                                  href={dlUrlWithTitle}
                                  download={`${finalClipName}.mp4`}
                                  className="quick-dl-btn"
                                  title={`Download ${finalClipName}.mp4`}
                                >
                                   MP4
                                </a>
                              ) : (
                                <span className="quick-dl-btn" style={{ background: 'rgba(163, 163, 163, 0.15)', color: '#a3a3a3' }}>
                                   Done
                                </span>
                              )
                            )}
                            {isError && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    color: '#9b9b9b',
                                    background: 'rgba(132, 132, 132, 0.18)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(132, 132, 132, 0.35)',
                                  }}
                                >
                                   {t.studio.statusFailedShort}
                                </span>
                                {onRetryClip && batchProgress.overall_status !== 'running' && (
                                  <button
                                    type="button"
                                    onClick={() => onRetryClip(idx)}
                                    style={{
                                      background: 'rgba(177, 177, 177, 0.18)',
                                      border: '1px solid rgba(177, 177, 177, 0.5)',
                                      borderRadius: '4px',
                                      color: '#c8c8c8',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                    }}
                                    title={t.studio.retryClipTooltip}
                                  >
                                    {t.studio.retryClipBtn}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Visible Error Box when clip fails */}
                        {isError && rawError && (
                          <ClipRenderErrorBox
                            errorMessage={rawError}
                            t={t}
                            onRetry={onRetryClip && batchProgress.overall_status !== 'running' ? () => onRetryClip(idx) : undefined}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`studio-batch-live-status${batchProgress ? ` is-${batchProgress.overall_status}` : ' is-empty'}`}
        role={batchProgress ? 'status' : undefined}
        aria-live={batchProgress ? 'polite' : undefined}
        aria-hidden={!batchProgress}
      >
        {batchProgress && (() => {
          const completedCount = batchProgress.clips.filter(clip => clip.status === 'completed').length;
          const failedCount = batchProgress.clips.filter(clip => clip.status === 'error').length;
          const total = Math.max(1, batchProgress.total_clips);
          const activeClip = batchProgress.clips[batchProgress.current_clip_index];
          const activeProgress = activeClip && ['downloading', 'transcribing', 'rendering'].includes(activeClip.status)
            ? Math.max(0, Math.min(100, activeClip.progress_percent || 0))
            : 0;
          const progressPercent = batchProgress.overall_status === 'completed'
            ? 100
            : Math.round(((completedCount + activeProgress / 100) / total) * 100);
          const statusText = batchProgress.overall_status === 'completed'
            ? (failedCount > 0
                ? t.studio.someClipsFailed(failedCount, batchProgress.total_clips)
                : t.studio.allClipsRendered(batchProgress.total_clips))
            : batchProgress.overall_status === 'error'
              ? (language === 'id' ? t.studio.allClipsFailed : (batchProgress.error_message || t.studio.allClipsFailed))
              : t.studio.processingClip(
                  Math.min(batchProgress.current_clip_index + 1, batchProgress.total_clips),
                  batchProgress.total_clips
                );

          return (
            <>
              <div className="studio-batch-live-copy">
                <strong>{statusText}</strong>
                <span>{t.batchProgress.completedMeta(completedCount, batchProgress.total_clips)}</span>
                <div
                  className="studio-batch-live-track"
                  role="progressbar"
                  aria-label={t.studio.batchQueueTitle}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
              <div className="studio-batch-live-actions">
                <button
                  type="button"
                  className="studio-batch-secondary-action"
                  onClick={() => document.getElementById('studio-batch-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {t.studio.viewRenderDetails}
                </button>
                {failedCount > 0 && batchProgress.overall_status !== 'running' && onRetryClip && (
                  <button type="button" className="studio-batch-secondary-action" onClick={() => onRetryClip()}>
                    {t.studio.retryAllFailedBtn(failedCount)}
                  </button>
                )}
                {batchProgress.overall_status === 'completed' && completedCount > 0 && (
                  <a
                    className="studio-batch-download-action"
                    href={batchProgress.zip_url || `/api/download-batch-zip/${batchProgress.batch_id}`}
                    download={`eclipse_${batchProgress.batch_id}.zip`}
                  >
                    {t.batchProgress.downloadZip}
                  </a>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* Bottom Sticky Action Footer */}
      <div className="studio-bottom-action-bar">
        <div className="action-bar-meta">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="meta-badge">
              {t.studio.readyToRenderMeta(selectedClips.length)}
            </span>
            <button
              type="button"
              className="studio-clear-temp-btn"
              title={t.studio.clearTempTooltip}
              onClick={handleClearTempClick}
              disabled={isClearingTemp}
            >
              {isClearingTemp ? t.studio.clearingTempBtn : t.studio.clearTempBtn}
            </button>
            {tempClearMsg && (
              <span style={{ fontSize: '0.72rem', color: '#c4c4c4', fontWeight: 600 }}>
                {tempClearMsg}
              </span>
            )}
          </div>
          <span className="meta-sub">
            {t.studio.outputMetaSub}
          </span>
        </div>

        <button
          className="studio-btn-render glowing-btn big-render-cta"
          onClick={handleLaunch}
          disabled={isRendering || batchProgress?.overall_status === 'running' || selectedClips.length === 0}
        >
          {batchProgress?.overall_status === 'running' ? (
            <>{t.studio.renderingInProgressBadge}</>
          ) : isRendering ? (
            <>{t.studio.launchingRenderBtn}</>
          ) : selectedClips.length === 0 ? (
            <>{t.studio.selectClipWarning}</>
          ) : (
            <>
              {t.studio.batchRenderCta(selectedClips.length)}
            </>
          )}
        </button>
      </div>

      {/* Custom Clear Temp Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="custom-confirm-modal-overlay">
          <div className="custom-confirm-modal-card">
            <div className="confirm-modal-icon-wrap cache-confirm-mark">

            </div>
            <h3 className="confirm-modal-title">{t.studio.confirmModalTitle}</h3>
            <p className="confirm-modal-desc" style={{ marginBottom: '1rem' }}>
              {t.studio.confirmModalDesc}
            </p>
            <div className="confirm-modal-notices">
              <div className="confirm-modal-notice">
                <span className="confirm-modal-notice-dot"></span>
                <strong>{t.studio.confirmModalNotice}</strong>
              </div>
              <div className="confirm-modal-notice">
                <span className="confirm-modal-notice-dot"></span>
                <strong>{t.studio.confirmModalCookieNotice}</strong>
              </div>
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-confirm-cancel"
                onClick={() => setShowClearConfirmModal(false)}
                disabled={isClearingTemp}
              >
                {t.studio.cancelBtn}
              </button>
              <button
                type="button"
                className="btn-confirm-purge"
                onClick={executeClearTemp}
                disabled={isClearingTemp}
              >
                {isClearingTemp ? t.studio.purgingBtn : t.studio.purgeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
