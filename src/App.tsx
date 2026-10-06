import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { HeatmapTimeline } from './components/HeatmapTimeline';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { ClipStudioSection } from './components/ClipStudioSection';
import { CookiesModal } from './components/CookiesModal';
import { SettingsModal } from './components/SettingsModal';
import { ClipTrimmerModal } from './components/ClipTrimmerModal';
import { AppUpdateModal } from './components/AppUpdateModal';
import { UserGuideModal } from './components/UserGuideModal';
import { resilientFetch } from './utils/api';
import { getAdminHeaders } from './utils/admin';
import { useLanguage } from './locales';
import type { AnalyzeResponse, ViralClip, RenderSettings, BatchRenderProgress } from './types';

// Declare YT global variables for TypeScript
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export default function App() {
  const { t, language } = useLanguage();
  const [url, setUrl] = useState('');
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [sourceMode, setSourceMode] = useState<'youtube' | 'gdrive' | 'upload'>('youtube');
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null);
  const [uploadedVideoInfo, setUploadedVideoInfo] = useState<{
    videoId: string;
    filename: string;
    savedName: string;
    duration: number;
    videoUrl: string;
    filePath: string;
    width: number;
    height: number;
  } | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isDragOverVideo, setIsDragOverVideo] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [durationPref, setDurationPref] = useState<'15s' | '30s' | '60s' | 'auto'>(() => {
    const saved = localStorage.getItem('cheat_clip_duration_pref');
    if (saved === '15s' || saved === '30s' || saved === '60s' || saved === 'auto') return saved;
    return '30s';
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('cheat_clip_gemini_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCookiesModalOpen, setIsCookiesModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [isHeaderMoreOpen, setIsHeaderMoreOpen] = useState(false);
  const headerMoreRef = useRef<HTMLDivElement | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [hasCookies, setHasCookies] = useState(false);
  const [isDownloadingRaw, setIsDownloadingRaw] = useState(false);
  const [rawDownloadProgress, setRawDownloadProgress] = useState<{
    jobId: string;
    status: string;
    percent: number;
    downloaded: string;
    total: string;
    speed: string;
    eta: string;
    downloadUrl?: string;
    filename?: string;
    error?: string;
  } | null>(null);
  const [clipDownloadStates, setClipDownloadStates] = useState<Record<string, {
    status: 'idle' | 'downloading' | 'ready' | 'error';
    error?: string;
  }>>({});
  const [trimmerClip, setTrimmerClip] = useState<ViralClip | null>(null);
  const [isStudioWorkspaceOpen, setIsStudioWorkspaceOpen] = useState(false);

  // AI model selection and custom focus prompt states
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem('cheat_clip_selected_model');
    // Auto-migrate outdated 1.0 models to gemini-2.5-flash
    if (saved && (saved.includes('1.0') || saved.includes('vision'))) {
      localStorage.setItem('cheat_clip_selected_model', 'gemini-2.5-flash');
      return 'gemini-2.5-flash';
    }
    return saved || 'gemini-2.5-flash';
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [targetClipCount, setTargetClipCount] = useState<number>(() => {
    const val = localStorage.getItem('cheat_clip_target_clip_count');
    return val ? Number(val) : 10;
  });
  const [clipCountMode, setClipCountMode] = useState<'auto' | 'custom'>(() => {
    const saved = localStorage.getItem('cheat_clip_clip_count_mode');
    return (saved === 'auto' || saved === 'custom') ? saved : 'auto';
  });

  // Custom range selection states
  const [rangeType, setRangeType] = useState<'entire' | 'custom'>('entire');
  const [customRangeStart, setCustomRangeStart] = useState<string>('');
  const [customRangeEnd, setCustomRangeEnd] = useState<string>('');

  // Manual subtitles states
  const [subtitlesSource, setSubtitlesSource] = useState<'youtube' | 'manual'>('youtube');
  const [manualSubtitlesContent, setManualSubtitlesContent] = useState<string>('');
  const [manualSubtitlesFileName, setManualSubtitlesFileName] = useState<string>('');

  const parseTimeToSeconds = (val: string): number | null => {
    const clean = val.trim();
    if (!clean) return null;

    // Check if it's just raw number of seconds
    if (/^\d+(\.\d+)?$/.test(clean)) {
      return parseFloat(clean);
    }

    const parts = clean.split(':').map(Number);
    if (parts.some(isNaN)) return null;

    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
  };

  // Loading & process states
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Real-time progress and cognitive stage tracking
  const [stepProgress, setStepProgress] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [aiStage, setAiStage] = useState<string>('');
  const [aiDetail, setAiDetail] = useState<string>('');
  const [activeProcessingModel, setActiveProcessingModel] = useState<string>('');
  const [loadingElapsedTime, setLoadingElapsedTime] = useState<number>(0);

  useEffect(() => {
    if (!isStudioWorkspaceOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsStudioWorkspaceOpen(false);
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isStudioWorkspaceOpen]);

  useEffect(() => {
    if (!isHeaderMoreOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerMoreRef.current?.contains(event.target)) {
        setIsHeaderMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHeaderMoreOpen(false);
        headerMoreRef.current?.querySelector('button')?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isHeaderMoreOpen]);

  // Active timer during loading so the user always sees live activity
  useEffect(() => {
    let interval: number | null = null;
    if (loading) {
      setLoadingElapsedTime(0);
      interval = window.setInterval(() => {
        setLoadingElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setLoadingElapsedTime(0);
    }
    return () => {
      if (interval !== null) clearInterval(interval);
    };
  }, [loading]);

  // Check YouTube cookies configuration on mount with resilient retry
  useEffect(() => {
    let isMounted = true;
    const checkCookies = async () => {
      try {
        const res = await resilientFetch('/api/cookies', { maxRetries: 5, retryDelay: 1000, silent: true });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data && typeof data.exists === 'boolean') {
            setHasCookies(data.exists);
          }
        }
      } catch {
        // Backend still booting or offline
      }
    };

    checkCookies();

    // Recheck when user returns to window (e.g., after modifying cookies.txt)
    const onFocus = () => {
      checkCookies();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Results
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [activeClip, setActiveClip] = useState<ViralClip | null>(null);
  const [expandedClipIndex, setExpandedClipIndex] = useState<number | null>(null);
  const [selectedClipDetailKey, setSelectedClipDetailKey] = useState<string | null>(null);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [leftPanelHeight, setLeftPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!result) return;
    const updateHeight = () => {
      if (leftPanelRef.current) {
        setLeftPanelHeight(leftPanelRef.current.clientHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);

    const observer = new ResizeObserver(updateHeight);
    if (leftPanelRef.current) {
      observer.observe(leftPanelRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      observer.disconnect();
    };
  }, [result, activeClip, expandedClipIndex]);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [viralityFilter, setViralityFilter] = useState<'all' | 'high' | 'medium' | 'marked'>('all');
  const [sortBy, setSortBy] = useState<'virality' | 'time' | 'duration' | 'marked'>('virality');

  // Assistance feature: Checklist for marked clips
  const [markedClips, setMarkedClips] = useState<Record<string, boolean>>({});
  const [loadingDetails, setLoadingDetails] = useState('');

  // Clip Studio & Auto-Clipper states
  const [batchProgress, setBatchProgress] = useState<BatchRenderProgress | null>(null);
  const [isLaunchingRender, setIsLaunchingRender] = useState(false);
  const batchEventSourceRef = useRef<EventSource | null>(null);

  // Close SSE connection on unmount
  useEffect(() => {
    return () => {
      if (batchEventSourceRef.current) {
        batchEventSourceRef.current.close();
        batchEventSourceRef.current = null;
      }
    };
  }, []);

  const listenToBatchProgress = useCallback((batchId: string) => {
    if (batchEventSourceRef.current) {
      batchEventSourceRef.current.close();
      batchEventSourceRef.current = null;
    }
    const eventSource = new EventSource(`/api/render-progress/${batchId}`);
    batchEventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const progressData: BatchRenderProgress = JSON.parse(event.data);
        setBatchProgress(progressData);
        if (progressData.overall_status === 'completed' || progressData.overall_status === 'error') {
          eventSource.close();
          if (batchEventSourceRef.current === eventSource) {
            batchEventSourceRef.current = null;
          }
        }
      } catch (err) {
        console.error('Failed to parse progress SSE:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      eventSource.close();
      if (batchEventSourceRef.current === eventSource) {
        batchEventSourceRef.current = null;
      }
    };
  }, []);

  const markedClipsList = useMemo(() => {
    if (!result?.clips) return [];
    return result.clips.filter(c => !!markedClips[`${c.start_time}_${c.end_time}`]);
  }, [result?.clips, markedClips]);

  const currentResultVideoUrl = result
    ? result.video_url || (
        result.source_type === 'upload' || result.source_type === 'gdrive' ||
        result.video_id?.startsWith('upload_') || result.video_id?.startsWith('gdrive_')
          ? `/api/video/${encodeURIComponent(result.video_id)}`
          : `https://www.youtube.com/watch?v=${encodeURIComponent(result.video_id)}`
      )
    : '';
  const canAnalyzeCurrentSource = sourceMode === 'upload'
    ? Boolean(uploadedVideoFile || uploadedVideoInfo)
    : sourceMode === 'gdrive'
      ? Boolean(gdriveUrl.trim())
      : Boolean(url.trim());

  const handleStartBatchRender = async (settings: RenderSettings) => {
    if (!result) return;
    setIsLaunchingRender(true);
    try {
      const resp = await fetch('/api/render-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: currentResultVideoUrl,
          video_id: result.video_id,
          clips: settings.selectedClips,
          settings: {
            aspect_ratio: settings.aspectRatio,
            background_style: settings.backgroundStyle,
            enable_face_tracking: settings.enableFaceTracking,
            streamer_preset: settings.streamerPreset,
            facecam_position: settings.facecamPosition || 'auto',
            title_text: settings.titleText,
            title_prefix: settings.titlePrefix || '',
            title_suffix: settings.titleSuffix || '',
            file_name_prefix: settings.fileNamePrefix || '',
            file_name_suffix: settings.fileNameSuffix || '',
            title_position: settings.titlePosition,
            title_duration: settings.titleDuration || 'entire',
            subtitles_enabled: settings.captionStyle !== 'none',
            caption_style: settings.captionStyle,
            caption_font: settings.captionFont,
            title_font: settings.titleFont || settings.captionFont || 'Montserrat',
            font_size: settings.fontSize,
            title_font_size: settings.titleFontSize || settings.fontSize || 'medium',
            font_size_px: settings.fontSizePx,
            title_font_size_px: settings.titleFontSizePx,
            text_case: settings.textCase,
            title_text_case: settings.titleTextCase || settings.textCase,
            title_y_percent: settings.titleYPercent,
            subtitle_y_percent: settings.subtitleYPercent,
            subtitle_position_mode: settings.subtitlePositionMode || 'bottom',
            subtitle_center_y_percent: settings.subtitleCenterYPercent !== undefined ? settings.subtitleCenterYPercent : 50.0,
            // Background Music
            bgm_enabled: settings.bgmEnabled || false,
            bgm_file_path: settings.bgmFilePath || null,
            bgm_volume: settings.bgmVolume !== undefined ? settings.bgmVolume : 25.0,
            bgm_start_offset: settings.bgmStartOffset || 0.0,
            // Hook SFX
            hook_sfx_enabled: settings.hookSfxEnabled || false,
            hook_sfx_file_path: settings.hookSfxFilePath || null,
            hook_sfx_volume: settings.hookSfxVolume !== undefined ? settings.hookSfxVolume : 100.0,
            // Raw Voice Audio Boost
            original_audio_volume: settings.originalAudioVolume !== undefined ? settings.originalAudioVolume : 100.0,
            // Watermark
            watermark_enabled: settings.watermarkEnabled || false,
            watermark_type: settings.watermarkType || 'image',
            watermark_file_path: settings.watermarkFilePath || null,
            watermark_text: settings.watermarkText || null,
            watermark_size: settings.watermarkSize !== undefined ? settings.watermarkSize : 20.0,
            watermark_opacity: settings.watermarkOpacity !== undefined ? settings.watermarkOpacity : 80.0,
            watermark_x: settings.watermarkX !== undefined ? settings.watermarkX : 90.0,
            watermark_y: settings.watermarkY !== undefined ? settings.watermarkY : 8.0,
            // Hardware Acceleration / Encoder
            hardware_accel: settings.hardwareAccel || 'auto',
          },
          transcript: result.transcript,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to start batch render job');
      }

      const data = await resp.json();
      const batchId = data.batch_id;

      // Initialize inline batch progress on the side under live preview (no modal)
      setBatchProgress({
        batch_id: batchId,
        total_clips: settings.selectedClips.length,
        current_clip_index: 0,
        overall_status: 'running',
        clips: settings.selectedClips.map((c, i) => {
          const base = (c.title_suggestion || c.title || `Clip #${i + 1}`).trim();
          const pfx = settings.titlePrefix || '';
          const sfx = settings.titleSuffix || '';
          const fullTitle = (pfx || sfx) ? `${pfx}${base}${sfx}`.trim() : base;
          return {
            clip_index: i,
            title: fullTitle,
            status: 'pending',
            progress_percent: 0,
          };
        })
      });

      // Listen to SSE progress
      listenToBatchProgress(batchId);
    } catch (err: any) {
      alert(language === 'id' ? t.errors.batchRenderStartFailed : (err.message || t.errors.batchRenderStartFailed));
    } finally {
      setIsLaunchingRender(false);
    }
  };

  const handleRetryBatchClip = async (clipIndex?: number) => {
    if (!batchProgress?.batch_id) return;
    const batchId = batchProgress.batch_id;
    try {
      // Optimistically update the UI to show 'pending' / retrying state for selected clip(s)
      setBatchProgress(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          overall_status: 'running',
          clips: prev.clips.map(c => {
            if (clipIndex === undefined || c.clip_index === clipIndex) {
              if (c.status === 'error' || c.status === 'pending') {
                return { ...c, status: 'pending', progress_percent: 0, error: undefined };
              }
            }
            return c;
          })
        };
      });

      const resp = await fetch(`/api/render-batch/${batchId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_indices: clipIndex !== undefined ? [clipIndex] : undefined,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to retry rendering');
      }

      // Reconnect SSE to track retry progress
      listenToBatchProgress(batchId);
    } catch (err: any) {
      alert(language === 'id' ? t.errors.batchRetryFailed : (err.message || t.errors.batchRetryFailed));
    }
  };

  // History feature: previously analyzed videos from localStorage
  interface HistoryEntry {
    video_id: string;
    title: string;
    duration_pref: string;
    clip_count: number;
    analyzed_at: string;
    thumbnail: string;
    url: string;
    source_type?: 'youtube' | 'upload' | 'gdrive';
    video_url?: string;
    range_suffix?: string;
    summary?: string;
    clip_titles?: string[];
    key_quotes?: string[];
  }
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Audio/video playback state tracking
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<any>(null);
  const directVideoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const trackingInterval = useRef<number | null>(null);
  const clipEndIntervalRef = useRef<number | null>(null);
  const loadingSectionRef = useRef<HTMLElement | null>(null);
  const [toastMessage, setToastMessageState] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const setToastMessage = useCallback((msg: string | null, durationMs = 4000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToastMessageState(msg);
    if (msg && durationMs > 0) {
      toastTimeoutRef.current = window.setTimeout(() => {
        setToastMessageState(null);
        toastTimeoutRef.current = null;
      }, durationMs);
    }
  }, []);
  const [isClearingGlobalTemp, setIsClearingGlobalTemp] = useState<boolean>(false);
  const [showGlobalClearModal, setShowGlobalClearModal] = useState<boolean>(false);

  const executeGlobalClearTemp = async () => {
    if (isClearingGlobalTemp) return;
    setIsClearingGlobalTemp(true);
    try {
      const resp = await fetch('/api/clear-temp', { method: 'POST', headers: getAdminHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setToastMessage(data.message || t.header.clearedTempSuccess);
        setTimeout(() => setToastMessage(null), 3500);
      } else {
        setToastMessage(t.header.clearedTempFailed);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (e) {
      console.error('Failed to clear temp folder:', e);
      setToastMessage(t.header.clearedTempError);
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsClearingGlobalTemp(false);
      setShowGlobalClearModal(false);
    }
  };
  const [copyTimestampMenuTarget, setCopyTimestampMenuTarget] = useState<'toolbar' | 'overview' | null>(null);
  const [copyTimestampScope, setCopyTimestampScope] = useState<'all' | 'marked'>('all');

  // Close timestamp format menu on click outside or escape
  useEffect(() => {
    if (!copyTimestampMenuTarget) return;
    const handleClickOutside = () => setCopyTimestampMenuTarget(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopyTimestampMenuTarget(null);
    };
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [copyTimestampMenuTarget]);

  // Automatically scroll down to the loading progress section when analysis starts
  useEffect(() => {
    if (loading) {
      const scrollTimer = setTimeout(() => {
        if (loadingSectionRef.current) {
          loadingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          const el = document.getElementById('loading-progress-section');
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(scrollTimer);
    }
  }, [loading]);

  // Initialize YouTube IFrame API
  useEffect(() => {
    // Check if script is already injected
    const existingScript = document.getElementById('youtube-iframe-api-script');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Set global callback
    window.onYouTubeIframeAPIReady = () => {
      // Re-trigger player init if a result is already loaded
      if (result) {
        initPlayer(result.video_id);
      }
    };

    return () => {
      stopTracking();
      if (clipEndIntervalRef.current !== null) {
        clearInterval(clipEndIntervalRef.current);
      }
    };
  }, [result]);

  // Fetch available AI models when API key is detected/entered
  useEffect(() => {
    const fetchModels = async () => {
      const cleanKey = apiKey.trim();
      if (!cleanKey || cleanKey.length < 20 || cleanKey.toLowerCase() === 'mock') {
        setAvailableModels([]);
        return;
      }
      setLoadingModels(true);
      try {
        const res = await resilientFetch('/api/models', {
          headers: { 'X-Gemini-API-Key': cleanKey },
          maxRetries: 3,
          retryDelay: 800,
          silent: true
        });
        if (res.ok) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models);
            if (!data.models.includes(selectedModel) || selectedModel.includes('1.5') || selectedModel.includes('1.0')) {
              const fallback = data.models.find((m: string) => m.includes('flash')) || data.models[0] || 'gemini-2.5-flash';
              setSelectedModel(fallback);
              localStorage.setItem('cheat_clip_selected_model', fallback);
            }
          }
        }
      } catch (err) {
        console.error('Failed to retrieve available models:', err);
      } finally {
        setLoadingModels(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchModels();
    }, 600);

    return () => clearTimeout(delayDebounce);
  }, [apiKey]);

  // Sync marked clips with local storage based on active video ID
  useEffect(() => {
    if (result?.video_id) {
      const saved = localStorage.getItem(`marked_clips_${result.video_id}`);
      if (saved) {
        try {
          setMarkedClips(JSON.parse(saved));
        } catch (_) {
          setMarkedClips({});
        }
      } else {
        setMarkedClips({});
      }
    } else {
      setMarkedClips({});
    }
  }, [result]);

  // Clear expanded clip index when filters or sorting change
  useEffect(() => {
    setExpandedClipIndex(null);
    setSelectedClipDetailKey(null);
  }, [sortBy, viralityFilter, searchQuery]);

  useEffect(() => {
    setSelectedClipDetailKey(null);
    setExpandedClipIndex(null);
  }, [result?.video_id]);

  const toggleMarkedClip = (clipId: string) => {
    if (!result?.video_id) return;
    const updated = {
      ...markedClips,
      [clipId]: !markedClips[clipId]
    };
    setMarkedClips(updated);
    localStorage.setItem(`marked_clips_${result.video_id}`, JSON.stringify(updated));
  };

  const toggleAllMarkedClips = (forceSelect?: boolean) => {
    if (!result?.video_id || !result.clips || result.clips.length === 0) return;
    const allCurrentlyMarked = result.clips.every(c => !!markedClips[`${c.start_time}_${c.end_time}`]);
    const shouldSelect = forceSelect !== undefined ? forceSelect : !allCurrentlyMarked;

    const updated: Record<string, boolean> = { ...markedClips };
    if (shouldSelect) {
      result.clips.forEach(clip => {
        updated[`${clip.start_time}_${clip.end_time}`] = true;
      });
    } else {
      result.clips.forEach(clip => {
        delete updated[`${clip.start_time}_${clip.end_time}`];
      });
    }
    setMarkedClips(updated);
    localStorage.setItem(`marked_clips_${result.video_id}`, JSON.stringify(updated));
  };

  // Scan localStorage and build the history list from cache keys
  const refreshHistory = () => {
    const entries: HistoryEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cheat_clip_cache_')) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const data: AnalyzeResponse = JSON.parse(raw);

          if (!data || !data.video_id) continue;

          const video_id = data.video_id;
          const rest = key.substring('cheat_clip_cache_'.length);
          const suffix = rest.substring(video_id.length + 1); // skip video_id and trailing '_'
          const duration_pref = suffix.split('_')[0];
          const range_suffix = suffix.substring(duration_pref.length);

          // Try reading cached timestamp stored separately
          const tsKey = `cheat_clip_ts_${video_id}_${duration_pref}${range_suffix}`;
          const analyzed_at = localStorage.getItem(tsKey) || new Date().toISOString();
          const clip_titles = (data.clips || []).map((c: any) => c.title || '').filter(Boolean);
          const key_quotes = (data.clips || []).flatMap((c: any) => c.key_quotes || []).filter(Boolean);

          const isGDrive = data.source_type === 'gdrive' || video_id.startsWith('gdrive_');
          const isUpload = data.source_type === 'upload' || video_id.startsWith('upload_');
          const sourceType: 'youtube' | 'upload' | 'gdrive' = isGDrive ? 'gdrive' : (isUpload ? 'upload' : 'youtube');

          // Determine appropriate link and thumbnail
          let itemUrl = `https://www.youtube.com/watch?v=${video_id}`;
          if (isGDrive) {
            const gdriveIdMatch = video_id.match(/gdrive_([a-zA-Z0-9_-]+)/);
            const gdriveId = gdriveIdMatch ? gdriveIdMatch[1] : '';
            itemUrl = gdriveId ? `https://drive.google.com/file/d/${gdriveId}/view` : (data.video_url || '');
          } else if (isUpload) {
            itemUrl = data.video_url || `/api/video/${video_id}`;
          }

          const thumb = (isGDrive || isUpload)
            ? `/api/frame/${encodeURIComponent(video_id)}?t=2`
            : `https://img.youtube.com/vi/${video_id}/mqdefault.jpg`;

          entries.push({
            video_id,
            title: data.title,
            duration_pref,
            clip_count: data.clips?.length || 0,
            analyzed_at,
            thumbnail: thumb,
            url: itemUrl,
            source_type: sourceType,
            video_url: data.video_url,
            range_suffix,
            summary: data.summary || '',
            clip_titles,
            key_quotes
          });
        } catch (_) {
          // Skip malformed entries
        }
      }
    }
    // Sort by most recent first
    entries.sort((a, b) => new Date(b.analyzed_at).getTime() - new Date(a.analyzed_at).getTime());
    setHistory(entries);
  };

  // Load history on mount
  useEffect(() => {
    refreshHistory();
  }, []);

  const loadFromHistory = (entry: HistoryEntry) => {
    const rangeSuffix = entry.range_suffix || '';
    const cacheKey = `cheat_clip_cache_${entry.video_id}_${entry.duration_pref}${rangeSuffix}`;
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return;
    try {
      const data: AnalyzeResponse = JSON.parse(raw);

      const isGDrive = data.source_type === 'gdrive' || entry.source_type === 'gdrive' || entry.video_id.startsWith('gdrive_');
      const isUpload = data.source_type === 'upload' || entry.source_type === 'upload' || entry.video_id.startsWith('upload_');

      if (isGDrive) {
        setSourceMode('gdrive');
        setUrl('');
        const gdriveIdMatch = entry.video_id.match(/gdrive_([a-zA-Z0-9_-]+)/);
        const gdriveId = gdriveIdMatch ? gdriveIdMatch[1] : '';
        const targetGDriveUrl = (entry.url && entry.url.includes('drive.google.com'))
          ? entry.url
          : (gdriveId ? `https://drive.google.com/file/d/${gdriveId}/view` : entry.video_id);
        setGdriveUrl(targetGDriveUrl);
        setUploadedVideoInfo(null);
        setUploadedVideoFile(null);
      } else if (isUpload) {
        setSourceMode('upload');
        setUrl('');
        setGdriveUrl('');
        setUploadedVideoInfo({
          videoId: data.video_id,
          filename: data.title || data.video_id,
          savedName: data.video_url?.replace('/api/video/', '') || data.video_id,
          duration: data.duration,
          videoUrl: data.video_url || `/api/video/${data.video_id}`,
          filePath: '',
          width: 1080,
          height: 1920
        });
        setUploadedVideoFile(null);
      } else {
        setSourceMode('youtube');
        setUrl(entry.url || `https://www.youtube.com/watch?v=${entry.video_id}`);
        setGdriveUrl('');
        setUploadedVideoInfo(null);
        setUploadedVideoFile(null);
      }

      setDurationPref((entry.duration_pref as '15s' | '30s' | '60s' | 'auto') || '30s');

      // Restore clip count mode
      if (entry.range_suffix?.includes('_clips_auto')) {
        setClipCountMode('auto');
      } else {
        const clipMatch = entry.range_suffix?.match(/_clips_(\d+)/);
        if (clipMatch) {
          setClipCountMode('custom');
          setTargetClipCount(Number(clipMatch[1]));
        }
      }

      // Restore subtitle source state
      if (entry.range_suffix?.includes('_manual')) {
        setSubtitlesSource('manual');
      } else {
        setSubtitlesSource('youtube');
      }

      // Restore range inputs if they were custom
      if (entry.range_suffix) {
        const cleanRangeSuffix = entry.range_suffix.replace('_manual', '');
        const rangeMatch = cleanRangeSuffix.match(/_range_([^_]+)_([^_]+)/);
        if (rangeMatch) {
          setRangeType('custom');
          const startVal = rangeMatch[1];
          const endVal = rangeMatch[2];

          setCustomRangeStart(startVal !== '0' ? formatSeconds(Number(startVal)) : '');
          setCustomRangeEnd(endVal !== 'end' ? formatSeconds(Number(endVal)) : '');
        } else {
          setRangeType('entire');
          setCustomRangeStart('');
          setCustomRangeEnd('');
        }
      } else {
        setRangeType('entire');
        setCustomRangeStart('');
        setCustomRangeEnd('');
      }

      // Destroy any existing player immediately before state resets
      destroyPlayer();
      setLoading(true);
      setError(null);
      setResult(null);
      setActiveClip(null);
      setCurrentStep(1);
      setStepProgress({ 1: 100, 2: 0, 3: 0, 4: 0 });
      setOverallProgress(25);
      setLoadingDetails(t.loading.loadingFromHistory);
      setTimeout(() => {
        setCurrentStep(4);
        setStepProgress({ 1: 100, 2: 100, 3: 100, 4: 85 });
        setOverallProgress(90);
        setAiStage(t.loading.restoringHotspots);
        setAiDetail(t.loading.reconstructingTimestamps);
        setLoadingDetails(t.loading.reconstructingTimestamps);
        setTimeout(() => {
          setStepProgress({ 1: 100, 2: 100, 3: 100, 4: 100 });
          setOverallProgress(100);
          setResult(data);
          setLoading(false);
          setShowHistory(false);
          if (data.clips?.length > 0) setActiveClip(data.clips[0]);
          // Force recreate the player since we destroyed it
          setTimeout(() => initPlayer(data.video_id, true), 150);
        }, 500);
      }, 600);
    } catch (_) {
      setToastMessage(t.form.historyLoadFailed);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const deleteHistoryEntry = (entry: HistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const rangeSuffix = entry.range_suffix || '';
    const cacheKey = `cheat_clip_cache_${entry.video_id}_${entry.duration_pref}${rangeSuffix}`;
    const tsKey = `cheat_clip_ts_${entry.video_id}_${entry.duration_pref}${rangeSuffix}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(tsKey);
    refreshHistory();
    setToastMessage(t.form.removedFromHistory(entry.title));
    setTimeout(() => setToastMessage(null), 3000);
  };

  const clearAllHistory = () => {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('cheat_clip_cache_') || key.startsWith('cheat_clip_ts_'))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    setHistory([]);
    setToastMessage(t.form.allHistoryCleared);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const formatRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.relativeTime.justNow;
    if (mins < 60) return t.relativeTime.minsAgo(mins);
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t.relativeTime.hrsAgo(hrs);
    const days = Math.floor(hrs / 24);
    return t.relativeTime.daysAgo(days);
  };


  const destroyPlayer = () => {
    stopTracking();
    if (playerRef.current) {
      try {
        if (typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch (e) {
        console.warn('Error destroying player:', e);
      }
      playerRef.current = null;
    }
    const container = document.getElementById('youtube-player-container');
    if (container) {
      container.innerHTML = '<div id="youtube-player"></div>';
    }
  };

  const initPlayer = (videoId: string, forceRecreate = false) => {
    if (!videoId || videoId.startsWith('upload_') || videoId.startsWith('gdrive_')) {
      return;
    }
    // If player already exists and we're not forcing recreate, try to load new video
    if (!forceRecreate && playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      try {
        playerRef.current.loadVideoById(videoId);
        return;
      } catch (e) {
        console.error('Failed to load video on existing player, will recreate...', e);
      }
    }

    // Ensure target container is rendered in the DOM before instantiating the player.
    // If React hasn't completed mounting the dashboard yet, wait and retry.
    const container = document.getElementById('youtube-player-container');
    if (!container) {
      setTimeout(() => initPlayer(videoId, forceRecreate), 100);
      return;
    }

    // Destroy any stale player first
    if (playerRef.current) {
      destroyPlayer();
    }

    // Create player if YT API is loaded
    if (window.YT && window.YT.Player) {
      if (!document.getElementById('youtube-player')) {
        container.innerHTML = '<div id="youtube-player"></div>';
      }
      try {
        playerRef.current = new window.YT.Player('youtube-player', {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            controls: 1,
            fs: 1,
          },
          events: {
            onReady: () => {
              console.log('YouTube Player Ready');
            },
            onStateChange: (event: any) => {
              // YT.PlayerState.PLAYING = 1
              if (event.data === 1) {
                startTracking();
              } else {
                stopTracking();
                // Update currentTime on pause/stop to sync cursor
                if (playerRef.current && playerRef.current.getCurrentTime) {
                  setCurrentTime(playerRef.current.getCurrentTime());
                }
              }
            },
          },
        });
      } catch (err) {
        console.error('Error instantiating YouTube Player:', err);
        // Fallback retry in case of transient iframe injection issues
        setTimeout(() => initPlayer(videoId, forceRecreate), 300);
      }
    } else {
      // Try again in 200ms if global window.YT is not ready yet
      setTimeout(() => initPlayer(videoId, forceRecreate), 200);
    }
  };

  const startTracking = () => {
    stopTracking();
    trackingInterval.current = window.setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 200);
  };

  const stopTracking = () => {
    if (trackingInterval.current !== null) {
      clearInterval(trackingInterval.current);
      trackingInterval.current = null;
    }
  };

  const handleSeek = (seconds: number) => {
    if (directVideoPlayerRef.current) {
      directVideoPlayerRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      directVideoPlayerRef.current.play().catch(() => {});
      return;
    }
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seconds, true);
      setCurrentTime(seconds);
      // If paused, play it
      if (playerRef.current.getPlayerState() !== 1) {
        playerRef.current.playVideo();
      }
    }
  };

  const playClip = (clip: ViralClip) => {
    setActiveClip(clip);
    handleSeek(clip.start_time);

    if (clipEndIntervalRef.current !== null) {
      clearInterval(clipEndIntervalRef.current);
    }

    // Automatically stop video at end time (optional user experience feature)
    // We can monitor playback and pause if it goes past end_time
    const intervalId = window.setInterval(() => {
      let curr = 0;
      if (directVideoPlayerRef.current) {
        curr = directVideoPlayerRef.current.currentTime;
        if (curr >= clip.end_time) {
          directVideoPlayerRef.current.pause();
          clearInterval(intervalId);
          if (clipEndIntervalRef.current === intervalId) {
            clipEndIntervalRef.current = null;
          }
        }
      } else if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        curr = playerRef.current.getCurrentTime();
        if (curr >= clip.end_time) {
          playerRef.current.pauseVideo();
          clearInterval(intervalId);
          if (clipEndIntervalRef.current === intervalId) {
            clipEndIntervalRef.current = null;
          }
        }
      } else {
        clearInterval(intervalId);
        if (clipEndIntervalRef.current === intervalId) {
          clipEndIntervalRef.current = null;
        }
      }
    }, 300);

    clipEndIntervalRef.current = intervalId;
  };

  const isGoogleDriveUrl = (urlStr: string): boolean => {
    if (!urlStr) return false;
    return /(?:drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com)/i.test(urlStr.trim());
  };

  const extractGoogleDriveId = (urlStr: string): string | null => {
    if (!urlStr) return null;
    const trimmed = urlStr.trim();
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]{20,})/,
      /[?&]id=([a-zA-Z0-9_-]{20,})/,
      /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]{20,})/,
      /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{20,})/,
    ];
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) return match[1];
    }
    if (/^[a-zA-Z0-9_-]{25,45}$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  };

  const extractVideoId = (urlStr: string): string | null => {
    if (!urlStr) return null;
    const trimmed = urlStr.trim();
    if (isGoogleDriveUrl(trimmed)) {
      const gId = extractGoogleDriveId(trimmed);
      return gId ? `gdrive_${gId}` : null;
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/|(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:embed|v|shorts|live)\/)([a-zA-Z0-9_-]{11})/,
      /(?:v=|\/v\/|embed\/|shorts\/|live\/|youtu\.be\/|\/embed\/|\/watch\?v=|\/watch\?.+&v=)([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (sourceMode === 'upload') {
      if (!uploadedVideoFile && !uploadedVideoInfo) {
        setError(t.errors.chooseVideoFilePrompt);
        return;
      }
    } else if (sourceMode === 'gdrive') {
      if (!gdriveUrl.trim()) return;
      if (!isGoogleDriveUrl(gdriveUrl)) {
        setError(t.errors.googleDriveUrlInvalid);
        return;
      }
    } else {
      if (!url.trim()) return;
    }

    // Require an API key before making any request
    if (!apiKey.trim()) {
      setError(t.errors.apiKeyRequired);
      requestAnimationFrame(() => {
        const apiKeyInput = document.getElementById('gemini-key-input') as HTMLInputElement | null;
        apiKeyInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        apiKeyInput?.focus();
      });
      return;
    }

    let rangeStartSecs: number | undefined = undefined;
    let rangeEndSecs: number | undefined = undefined;

    if (rangeType === 'custom') {
      const parsedStart = parseTimeToSeconds(customRangeStart);
      const parsedEnd = parseTimeToSeconds(customRangeEnd);

      if (customRangeStart.trim() && parsedStart === null) {
        setError(t.errors.invalidStart);
        return;
      }
      if (customRangeEnd.trim() && parsedEnd === null) {
        setError(t.errors.invalidEnd);
        return;
      }

      if (parsedStart !== null) rangeStartSecs = parsedStart;
      if (parsedEnd !== null) rangeEndSecs = parsedEnd;

      if (rangeStartSecs !== undefined && rangeEndSecs !== undefined && rangeStartSecs >= rangeEndSecs) {
        setError(t.errors.startLessThanEnd);
        return;
      }
    }

    if (subtitlesSource === 'manual' && !manualSubtitlesContent.trim()) {
      setError(t.errors.chooseSubtitleFile);
      return;
    }

    const rangeSuffix = (rangeStartSecs !== undefined || rangeEndSecs !== undefined)
      ? `_range_${rangeStartSecs ?? 0}_${rangeEndSecs ?? 'end'}`
      : '';
    const manualSuffix = subtitlesSource === 'manual' ? '_manual' : '';

    // Determine target video identifier
    let targetAnalyzeUrl = sourceMode === 'gdrive' ? gdriveUrl.trim() : url.trim();
    let videoId = extractVideoId(targetAnalyzeUrl);

    if (sourceMode === 'upload') {
      setLoading(true);
      setError(null);
      setResult(null);
      setActiveClip(null);
      setCurrentStep(1);
      setStepProgress({ 1: 20, 2: 0, 3: 0, 4: 0 });
      setOverallProgress(5);
      setActiveProcessingModel(selectedModel);

      let currentVideoInfo = uploadedVideoInfo;
      if (!currentVideoInfo && uploadedVideoFile) {
        setIsUploadingVideo(true);
        setLoadingDetails(t.form.uploadingVideo);
        setAiStage(t.form.uploadingVideo);
        setAiDetail(t.loading.uploadingFile(uploadedVideoFile.name, (uploadedVideoFile.size / (1024 * 1024)).toFixed(1)));

        try {
          const formData = new FormData();
          formData.append('file', uploadedVideoFile);
          const upRes = await fetch('/api/upload-video', {
            method: 'POST',
            body: formData,
          });
          if (!upRes.ok) {
            const errJson = await upRes.json().catch(() => ({}));
            throw new Error(errJson.detail || t.errors.uploadVideoFailed);
          }
          const upData = await upRes.json();
          currentVideoInfo = {
            videoId: upData.video_id,
            filename: upData.filename,
            savedName: upData.saved_name,
            duration: upData.duration,
            videoUrl: upData.video_url,
            filePath: upData.file_path,
            width: upData.width,
            height: upData.height,
          };
          setUploadedVideoInfo(currentVideoInfo);
          setIsUploadingVideo(false);
        } catch (uploadErr: any) {
          setIsUploadingVideo(false);
          setLoading(false);
          setError(language === 'id' ? t.errors.uploadVideoFailed : (uploadErr.message || t.errors.uploadVideoFailed));
          return;
        }
      }

      if (currentVideoInfo) {
        targetAnalyzeUrl = currentVideoInfo.savedName || currentVideoInfo.videoId;
        videoId = currentVideoInfo.videoId;
      }
    }

    // Check localStorage cache first to avoid redundant API/Gemini processing (for YouTube URLs)
    if (sourceMode === 'youtube' && videoId) {
      const promptSuffix = customPrompt.trim() ? `_prompt_${customPrompt.trim().replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const modelSuffix = `_model_${selectedModel}`;
      const clipsSuffix = clipCountMode === 'auto' ? '_clips_auto' : `_clips_${targetClipCount}`;
      const cacheKey = `cheat_clip_cache_${videoId}_${durationPref}${modelSuffix}${clipsSuffix}${promptSuffix}${rangeSuffix}${manualSuffix}`;

      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        try {
          const parsedData: AnalyzeResponse = JSON.parse(cachedData);

          setLoading(true);
          setError(null);
          setResult(null);
          setActiveClip(null);
          setCurrentStep(1);
          setStepProgress({ 1: 100, 2: 0, 3: 0, 4: 0 });
          setOverallProgress(25);
          setLoadingDetails(t.loading.cachedStep1);

          await new Promise(r => setTimeout(r, 300));
          setCurrentStep(2);
          setStepProgress({ 1: 100, 2: 100, 3: 0, 4: 0 });
          setOverallProgress(50);
          setLoadingDetails(t.loading.cachedStep2);
          await new Promise(r => setTimeout(r, 300));
          setCurrentStep(3);
          setStepProgress({ 1: 100, 2: 100, 3: 100, 4: 0 });
          setOverallProgress(75);
          setLoadingDetails(t.loading.cachedStep3);
          await new Promise(r => setTimeout(r, 300));
          setCurrentStep(4);
          setStepProgress({ 1: 100, 2: 100, 3: 100, 4: 100 });
          setOverallProgress(100);
          setAiStage(t.loading.step4Label);
          setAiDetail(t.loading.cachedStep4);
          setLoadingDetails(t.loading.cachedStep4);
          await new Promise(r => setTimeout(r, 250));

          setResult(parsedData);
          setLoading(false);

          if (parsedData.clips && parsedData.clips.length > 0) {
            setActiveClip(parsedData.clips[0]);
          }

          setTimeout(() => {
            initPlayer(parsedData.video_id);
          }, 100);

          return;
        } catch (e) {
          console.warn('Failed to parse cached clip data, requesting fresh analysis:', e);
        }
      }
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setActiveClip(null);
    setCurrentStep(1);
    setStepProgress({ 1: 20, 2: 0, 3: 0, 4: 0 });
    setOverallProgress(5);
    setAiStage(t.loading.step1Label);
    setAiDetail(t.loading.step1Subtext);
    setActiveProcessingModel(selectedModel);
    setLoadingDetails(t.loading.step1Subtext);

    let resultData: AnalyzeResponse | null = null;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetAnalyzeUrl,
          duration: durationPref,
          api_key: apiKey.trim() || undefined,
          model: selectedModel,
          custom_prompt: customPrompt.trim() || undefined,
          range_start: rangeStartSecs,
          range_end: rangeEndSecs,
          subtitles: subtitlesSource === 'manual' ? manualSubtitlesContent : undefined,
          subtitles_filename: subtitlesSource === 'manual' ? manualSubtitlesFileName : undefined,
          target_clip_count: clipCountMode === 'auto' ? 'auto' : targetClipCount,
        }),
      });

      if (!response.body) throw new Error(t.errors.noResponseStream);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            let event: any;
            try { event = JSON.parse(line.slice(6)); } catch { continue; }

            if (event.error) {
              throw new Error(event.error);
            } else if (event.done) {
              resultData = event.result as AnalyzeResponse;
              setStepProgress({ 1: 100, 2: 100, 3: 100, 4: 100 });
              setOverallProgress(100);
              streamDone = true;
              break;
            } else {
              if (event.step !== undefined) {
                const s = Number(event.step);
                setCurrentStep(s);
                setStepProgress(prev => {
                  const updated = { ...prev };
                  for (let prevStep = 1; prevStep < s; prevStep++) {
                    updated[prevStep] = 100;
                  }
                  if (event.step_progress !== undefined) {
                    updated[s] = Math.max(updated[s] || 0, Number(event.step_progress));
                  }
                  return updated;
                });
              }
              if (event.overall_progress !== undefined) {
                setOverallProgress(Number(event.overall_progress));
              }
              const progressStep = Math.min(4, Math.max(1, Number(event.step) || 1));
              const localizedStages = [t.loading.step1Label, t.loading.step2Label, t.loading.step3Label, t.loading.step4Label];
              const localizedDetails = [t.loading.step1Subtext, t.loading.step2Subtext, t.loading.step3Subtext, t.loading.step4Subtext];
              if (event.stage || event.step !== undefined) {
                setAiStage(language === 'id' ? localizedStages[progressStep - 1] : (event.stage || localizedStages[progressStep - 1]));
              }
              if (event.detail || event.step !== undefined) {
                setAiDetail(language === 'id' ? localizedDetails[progressStep - 1] : (event.detail || localizedDetails[progressStep - 1]));
              }
              if (event.model) {
                setActiveProcessingModel(event.model);
              }
              if (event.message || event.step !== undefined) {
                setLoadingDetails(language === 'id' ? localizedDetails[progressStep - 1] : (event.message || localizedDetails[progressStep - 1]));
              }
            }
          }
          if (streamDone) break;
        }
      }

      // Flush remaining data in decoder and parse trailing buffer
      buffer += decoder.decode();
      if (!resultData && buffer.trim()) {
        const parts = buffer.split('\n\n');
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.error) throw new Error(event.error);
              if (event.done && event.result) {
                resultData = event.result as AnalyzeResponse;
                setStepProgress({ 1: 100, 2: 100, 3: 100, 4: 100 });
                setOverallProgress(100);
                break;
              }
            } catch (err: any) {
              if (err.message && !err.message.includes('JSON')) throw err;
            }
          }
          if (resultData) break;
        }
      }

      if (!resultData) {
        throw new Error(t.errors.analysisConnectionLost);
      }

      // Cache the successful response safely (handling mobile Safari quota limits)
      if (resultData.video_id) {
        try {
          const promptSuffix = customPrompt.trim() ? `_prompt_${customPrompt.trim().replace(/[^a-zA-Z0-9]/g, '_')}` : '';
          const modelSuffix = `_model_${selectedModel}`;
          const clipsSuffix = clipCountMode === 'auto' ? '_clips_auto' : `_clips_${targetClipCount}`;
          const targetCacheKey = `cheat_clip_cache_${resultData.video_id}_${durationPref}${modelSuffix}${clipsSuffix}${promptSuffix}${rangeSuffix}${manualSuffix}`;
          const tsKey = `cheat_clip_ts_${resultData.video_id}_${durationPref}${modelSuffix}${clipsSuffix}${promptSuffix}${rangeSuffix}${manualSuffix}`;
          localStorage.setItem(targetCacheKey, JSON.stringify(resultData));
          localStorage.setItem(tsKey, new Date().toISOString());
          refreshHistory();
        } catch (storageErr) {
          console.warn('Could not cache analysis to localStorage (likely quota limit on mobile device):', storageErr);
        }
      }

      setResult(resultData);
      setLoading(false);

      if (resultData.clips?.length > 0) setActiveClip(resultData.clips[0]);
      setTimeout(() => initPlayer(resultData!.video_id), 100);

      // Scroll smoothly to the dashboard so results are immediately visible
      setTimeout(() => {
        const dashboard = document.querySelector('.dashboard-grid');
        if (dashboard) {
          dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 250);

    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('503') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('server on port 8000') ||
        msg.includes('not running')
      ) {
        setError(t.errors.backendUnavailable);
      } else {
        const knownLocalizedErrors = [t.errors.noResponseStream, t.errors.analysisConnectionLost];
        setError(language === 'id' && msg && !knownLocalizedErrors.includes(msg)
          ? t.errors.unexpectedAnalysisError
          : (msg || t.errors.unexpectedAnalysisError));
      }
      setLoading(false);
    }
  };

  const formatSeconds = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const extractHashtagsAndText = (summary: string) => {
    if (!summary) return { text: '', hashtags: [] as string[] };
    const hashtagRegex = /#\w+/g;
    const hashtags = (summary.match(hashtagRegex) || []).map(tag => tag.toLowerCase());
    const text = summary.replace(hashtagRegex, '').replace(/\s+/g, ' ').trim();
    return { text, hashtags };
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setToastMessage(t.results.copiedGeneralToast(label));
      setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    });
  };

  const handleRefreshPlayer = () => {
    if (!result) return;
    const isDirect = Boolean(
      result.video_url ||
      result.source_type === 'upload' ||
      result.source_type === 'gdrive' ||
      result.video_id?.startsWith('upload_') ||
      result.video_id?.startsWith('gdrive_')
    );
    if (isDirect) {
      if (directVideoPlayerRef.current) {
        directVideoPlayerRef.current.load();
        directVideoPlayerRef.current.currentTime = currentTime;
        directVideoPlayerRef.current.play().catch(() => {});
      }
    } else {
      initPlayer(result.video_id, true);
    }
  };

  const handleDownloadRawVideo = async () => {
    if (!result || !result.video_id) return;
    const targetUrl = currentResultVideoUrl;
    setIsDownloadingRaw(true);
    setRawDownloadProgress({
      jobId: '',
      status: 'starting',
      percent: 0,
      downloaded: '',
      total: '',
      speed: '',
      eta: ''
    });
    setToastMessage(t.rawDownload.initiatingToast);

    try {
      const res = await fetch("/api/download-raw-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: targetUrl,
          video_id: result.video_id,
          title: result.title
        })
      });
      const startData = await res.json();
      if (!res.ok || !startData.job_id) {
        throw new Error(startData.detail || t.rawDownload.failedToast);
      }

      const jobId = startData.job_id;
      setRawDownloadProgress({
        jobId,
        status: 'downloading',
        percent: 0,
        downloaded: '',
        total: '',
        speed: '',
        eta: ''
      });

      // Poll download progress every 750ms
      await new Promise<void>((resolve, reject) => {
        const intervalId = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/download-raw-status/${jobId}`);
            if (!statusRes.ok) {
              clearInterval(intervalId);
              reject(new Error(t.rawDownload.failedToast));
              return;
            }
            const statusData = await statusRes.json();
            setRawDownloadProgress({
              jobId,
              status: statusData.status,
              percent: statusData.progress_percent || 0,
              downloaded: statusData.downloaded || '',
              total: statusData.total || '',
              speed: statusData.speed || '',
              eta: statusData.eta || '',
              downloadUrl: statusData.download_url,
              filename: statusData.filename,
              error: statusData.error
            });

            if (statusData.status === 'ready') {
              clearInterval(intervalId);
              setToastMessage(t.rawDownload.completedToast);
              const a = document.createElement("a");
              a.href = statusData.download_url || `/api/download-rendered/${statusData.filename}`;
              a.download = statusData.filename || `${result.title || result.video_id} (Full Video).mp4`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => {
                setIsDownloadingRaw(false);
                setRawDownloadProgress(null);
              }, 4000);
              resolve();
            } else if (statusData.status === 'failed') {
              clearInterval(intervalId);
              setIsDownloadingRaw(false);
              reject(new Error(statusData.error || t.rawDownload.failedToast));
            }
          } catch (pollErr) {
            clearInterval(intervalId);
            setIsDownloadingRaw(false);
            reject(pollErr);
          }
        }, 750);
      });
    } catch (err: any) {
      setError(err.message || t.rawDownload.failedToast);
      setIsDownloadingRaw(false);
      setRawDownloadProgress(null);
    }
  };

  const handleApplyAdjustedClipToResults = (adjustedClip: ViralClip) => {
    if (result && result.clips && trimmerClip) {
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          clips: prev.clips.map(c =>
            (c.start_time === trimmerClip.start_time && c.end_time === trimmerClip.end_time)
              ? adjustedClip
              : c
          )
        };
      });
    }
  };

  const handleDownloadRawClip = async (clip: ViralClip, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!result || !result.video_id) return;
    const clipKey = `${clip.start_time}_${clip.end_time}`;
    if (clipDownloadStates[clipKey]?.status === 'downloading') return;

    setClipDownloadStates(prev => ({
      ...prev,
      [clipKey]: { status: 'downloading' }
    }));
    setToastMessage(`${t.results.downloadingRawClip} "${clip.title}"`);

    const targetUrl = result.video_url || (url.trim() ? url.trim() : (result.video_id?.startsWith('gdrive_') || result.video_id?.startsWith('upload_') ? `/api/video/${result.video_id}` : `https://www.youtube.com/watch?v=${result.video_id}`));

    try {
      const res = await fetch("/api/download-raw-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: targetUrl,
          video_id: result.video_id,
          start_time: clip.start_time,
          end_time: clip.end_time,
          title: clip.title
        })
      });

      const startData = await res.json();
      if (!res.ok || !startData.job_id) {
        throw new Error(startData.detail || "Failed to start clip download");
      }

      const jobId = startData.job_id;

      await new Promise<void>((resolve, reject) => {
        const intervalId = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/download-raw-clip-status/${jobId}`);
            if (!statusRes.ok) {
              clearInterval(intervalId);
              reject(new Error("Failed to get clip download status"));
              return;
            }
            const statusData = await statusRes.json();
            if (statusData.status === 'ready') {
              clearInterval(intervalId);
              setClipDownloadStates(prev => ({
                ...prev,
                [clipKey]: { status: 'ready' }
              }));
              setToastMessage(` ${clip.title} (raw)`);
              const a = document.createElement("a");
              a.href = statusData.download_url;
              a.download = statusData.filename || `${clip.title} (raw).mp4`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => {
                setClipDownloadStates(prev => ({
                  ...prev,
                  [clipKey]: { status: 'idle' }
                }));
              }, 4000);
              resolve();
            } else if (statusData.status === 'failed') {
              clearInterval(intervalId);
              setClipDownloadStates(prev => ({
                ...prev,
                [clipKey]: { status: 'error', error: statusData.error }
              }));
              reject(new Error(statusData.error || "Clip download failed"));
            }
          } catch (pollErr) {
            clearInterval(intervalId);
            reject(pollErr);
          }
        }, 750);
      });
    } catch (err: any) {
      setClipDownloadStates(prev => ({
        ...prev,
        [clipKey]: { status: 'error', error: err.message }
      }));
      setError(language === 'id' ? t.errors.clipDownloadFailed : (err.message || t.errors.clipDownloadFailed));
    }
  };

  const handleCopyClip = (clip: ViralClip, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card trigger
    let copyText = `CLIP: ${clip.title}
Timestamp: ${formatSeconds(clip.start_time)} - ${formatSeconds(clip.end_time)}
Virality Score: ${clip.virality_score}%

Transcript:
"${clip.transcript}"`;

    if (clip.key_quotes && clip.key_quotes.length > 0) {
      copyText += `\n\nKey Quotes:\n` + clip.key_quotes.map(q => `“${q}”`).join('\n');
    }
    if (clip.title_suggestion) {
      copyText += `\n\nTitle Suggestion: ${clip.title_suggestion}`;
    }
    if (clip.caption_suggestion) {
      const captionText = (() => {
        const lowercaseHashtags = (clip.hashtag_suggestion || '').toLowerCase();
        if (!lowercaseHashtags) return clip.caption_suggestion;
        if (clip.caption_suggestion.toLowerCase().includes(lowercaseHashtags)) return clip.caption_suggestion;
        return `${clip.caption_suggestion} ${lowercaseHashtags}`;
      })();
      copyText += `\n\nCaption Suggestion: ${captionText}`;
    }

    navigator.clipboard.writeText(copyText).then(() => {
      setToastMessage(t.results.copiedDetailsToast(clip.title));
      setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    });
  };

  const handleCopyTimestamp = (clip: ViralClip, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ts = `${formatSeconds(clip.start_time)} - ${formatSeconds(clip.end_time)}`;
    navigator.clipboard.writeText(ts).then(() => {
      setToastMessage(t.results.copiedTimestampToast(ts));
      setTimeout(() => setToastMessage(null), 3000);
    });
  };

  const handleCopyTimestampsFormat = (format: 'only' | 'with_title' | 'youtube', scope: 'all' | 'marked' = copyTimestampScope, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCopyTimestampMenuTarget(null);
    if (!result || !result.clips || result.clips.length === 0) return;

    const targetClips = scope === 'marked'
      ? result.clips.filter(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`])
      : result.clips;

    if (targetClips.length === 0) {
      if (scope === 'marked') {
        setToastMessage(t.results.noMarkedClipsToCopyToast);
      }
      return;
    }

    let text = '';
    if (format === 'only') {
      text = targetClips
        .map(clip => `${formatSeconds(clip.start_time)} - ${formatSeconds(clip.end_time)}`)
        .join('\n');
      if (scope === 'marked') {
        setToastMessage(t.results.copiedMarkedTimestampsOnlyToast(targetClips.length));
      } else {
        setToastMessage(t.results.copiedTimestampsOnlyToast(targetClips.length));
      }
    } else if (format === 'with_title') {
      text = targetClips
        .map(clip => `${formatSeconds(clip.start_time)} - ${formatSeconds(clip.end_time)} | ${clip.title}`)
        .join('\n');
      if (scope === 'marked') {
        setToastMessage(t.results.copiedMarkedTimestampsWithTitlesToast(targetClips.length));
      } else {
        setToastMessage(t.results.copiedTimestampsWithTitlesToast(targetClips.length));
      }
    } else if (format === 'youtube') {
      text = targetClips
        .map(clip => `${formatSeconds(clip.start_time)} ${clip.title}`)
        .join('\n');
      if (scope === 'marked') {
        setToastMessage(t.results.copiedMarkedTimestampsYoutubeToast(targetClips.length));
      } else {
        setToastMessage(t.results.copiedTimestampsYoutubeToast(targetClips.length));
      }
    }

    navigator.clipboard.writeText(text).then(() => {
      setTimeout(() => setToastMessage(null), 3000);
    });
  };

  const toggleTimestampMenu = (target: 'toolbar' | 'overview', e: React.MouseEvent) => {
    e.stopPropagation();
    setCopyTimestampMenuTarget(prev => prev === target ? null : target);
  };

  const renderTimestampFormatMenu = (target: 'toolbar' | 'overview', align: 'left' | 'right' = 'right') => {
    const totalCount = result?.clips?.length || 0;
    const markedCount = (result?.clips || []).filter(
      clip => !!markedClips[`${clip.start_time}_${clip.end_time}`]
    ).length;
    const currentScopeCount = copyTimestampScope === 'marked' ? markedCount : totalCount;

    return (
      <div
        id={`timestamp-format-menu-${target}`}
        className="timestamp-dropdown-menu"
        role="dialog"
        aria-label={t.results.timestampMenuAccessibleName}
        onClick={(e) => e.stopPropagation()}
        style={{ [align]: 0 }}
      >
        {/* Scope Picker: All Clips vs Marked Only */}
        <div className="timestamp-scope-selector">
          <button
            type="button"
            className={`timestamp-scope-btn ${copyTimestampScope === 'all' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setCopyTimestampScope('all');
            }}
          >
            <span> {t.results.copyScopeAll}</span>
            <span className="timestamp-scope-count">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`timestamp-scope-btn scope-marked ${copyTimestampScope === 'marked' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setCopyTimestampScope('marked');
            }}
          >
            <span> {t.results.copyScopeMarked}</span>
            <span className="timestamp-scope-count">{markedCount}</span>
          </button>
        </div>

        {/* Empty notice if marked is selected but no clips are marked */}
        {copyTimestampScope === 'marked' && markedCount === 0 && (
          <div className="timestamp-menu-empty-notice">
             {t.results.noMarkedClipsNotice}
          </div>
        )}

        <div style={{ padding: '0.2rem 0.6rem 0.15rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t.results.copyScopeHeader(copyTimestampScope, currentScopeCount)}
        </div>

        <button
          type="button"
          className="timestamp-menu-item"
          onClick={(e) => handleCopyTimestampsFormat('only', copyTimestampScope, e)}
          disabled={copyTimestampScope === 'marked' && markedCount === 0}
          style={copyTimestampScope === 'marked' && markedCount === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {t.results.copyFormatOnlyTimestamps}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter' }}>
            {t.results.copyFormatOnlyTimestampsDesc}
          </span>
        </button>

        <button
          type="button"
          className="timestamp-menu-item"
          onClick={(e) => handleCopyTimestampsFormat('with_title', copyTimestampScope, e)}
          disabled={copyTimestampScope === 'marked' && markedCount === 0}
          style={copyTimestampScope === 'marked' && markedCount === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {t.results.copyFormatWithTitles}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter' }}>
            {t.results.copyFormatWithTitlesDesc}
          </span>
        </button>

        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.07)', margin: '0.15rem 0' }} />

        <button
          type="button"
          className="timestamp-menu-item"
          onClick={(e) => handleCopyTimestampsFormat('youtube', copyTimestampScope, e)}
          disabled={copyTimestampScope === 'marked' && markedCount === 0}
          style={copyTimestampScope === 'marked' && markedCount === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {t.results.copyFormatYoutube}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter' }}>
            {t.results.copyFormatYoutubeDesc}
          </span>
        </button>
      </div>
    );
  };

  const sortModelVersions = (models: string[]) => [...models].sort((a, b) => {
    if (a === b) return 0;
    if (a === 'gemini-2.5-flash') return -1;
    if (b === 'gemini-2.5-flash') return 1;
    const versionOf = (model: string) => model.match(/^gemini-(\d+(?:\.\d+)?)/i)?.[1];
    const aVersion = versionOf(a);
    const bVersion = versionOf(b);
    if (aVersion && bVersion) return Number(bVersion) - Number(aVersion);
    if (aVersion) return -1;
    if (bVersion) return 1;
    return a.localeCompare(b);
  });

  const modelGroups = [
    { label: t.results.modelFlashGroup, models: sortModelVersions(availableModels.filter(model => model.toLowerCase().includes('flash'))) },
    { label: t.results.modelProGroup, models: sortModelVersions(availableModels.filter(model => model.toLowerCase().includes('pro'))) },
    { label: t.results.modelOtherGroup, models: availableModels.filter(model => !model.toLowerCase().includes('flash') && !model.toLowerCase().includes('pro')) },
  ].filter(group => group.models.length > 0);

  const handleExportJSON = () => {
    if (!result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result.clips, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `eclipse_${result.video_id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setToastMessage(t.results.downloadedJsonToast);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportSRT = () => {
    if (!result || !result.transcript) {
      setToastMessage(t.results.noTranscriptToExport);
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    const formatSRTTime = (secs: number): string => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };

    let srtText = '';
    result.transcript.forEach((line, index) => {
      srtText += `${index + 1}\n`;
      srtText += `${formatSRTTime(line.start)} --> ${formatSRTTime(line.end)}\n`;
      srtText += `${line.text}\n\n`;
    });

    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(srtText);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `eclipse_${result.video_id}.srt`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setToastMessage(t.results.downloadedSrtToast);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyAllMarkdown = () => {
    if (!result) return;
    let md = `# Viral Clips from "${result.title}"\n\n`;
    md += `**Overall Summary**: ${result.summary}\n\n`;
    result.clips.forEach((clip, index) => {
      md += `## ${index + 1}. ${clip.title} (${clip.virality_score}% Virality)\n`;
      md += `- **Timestamp**: ${formatSeconds(clip.start_time)} - ${formatSeconds(clip.end_time)} (Duration: ${formatSeconds(clip.end_time - clip.start_time)})\n`;
      if (clip.key_quotes && clip.key_quotes.length > 0) {
        md += `- **Key Quotes**:\n`;
        clip.key_quotes.forEach(q => md += `  - *"${q}"*\n`);
      }
      if (clip.title_suggestion) {
        md += `- **Title Suggestion**: ${clip.title_suggestion}\n`;
      }
      if (clip.caption_suggestion) {
        const captionText = (() => {
          const lowercaseHashtags = (clip.hashtag_suggestion || '').toLowerCase();
          if (!lowercaseHashtags) return clip.caption_suggestion;
          if (clip.caption_suggestion.toLowerCase().includes(lowercaseHashtags)) return clip.caption_suggestion;
          return `${clip.caption_suggestion} ${lowercaseHashtags}`;
        })();
        md += `- **Caption Suggestion**: ${captionText}\n`;
      }
      md += `- **Transcript**:\n  > ${clip.transcript.replace(/\n/g, '\n  > ')}\n\n`;
    });

    navigator.clipboard.writeText(md).then(() => {
      setToastMessage(t.results.copiedMarkdownToast);
      setTimeout(() => setToastMessage(null), 3000);
    });
  };

  // Filter clips based on query and virality filters
  const filteredClips = useMemo(() => {
    if (!result?.clips) return [];
    return result.clips.filter(clip => {
      const matchesSearch = searchQuery.trim() === '' ||
        clip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clip.transcript.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesVirality = viralityFilter === 'all' ||
        (viralityFilter === 'high' && clip.virality_score >= 90) ||
        (viralityFilter === 'medium' && clip.virality_score < 90) ||
        (viralityFilter === 'marked' && !!markedClips[`${clip.start_time}_${clip.end_time}`]);

      return matchesSearch && matchesVirality;
    });
  }, [result?.clips, searchQuery, viralityFilter, markedClips]);

  // Sort the filtered clips based on selected sortBy
  const sortedClips = useMemo(() => {
    return [...filteredClips].sort((a, b) => {
      if (sortBy === 'virality') {
        return b.virality_score - a.virality_score;
      } else if (sortBy === 'time') {
        return a.start_time - b.start_time;
      } else if (sortBy === 'duration') {
        return (b.end_time - b.start_time) - (a.end_time - a.start_time);
      } else if (sortBy === 'marked') {
        const aMarked = !!markedClips[`${a.start_time}_${a.end_time}`];
        const bMarked = !!markedClips[`${b.start_time}_${b.end_time}`];
        if (aMarked && !bMarked) return -1;
        if (!aMarked && bMarked) return 1;
        return b.virality_score - a.virality_score;
      }
      return 0;
    });
  }, [filteredClips, sortBy, markedClips]);

  // Filter history entries based on query (matches video title, url, id, summary, clip titles, and quotes)
  const filteredHistory = useMemo(() => {
    if (!historySearchQuery.trim()) return history;
    const q = historySearchQuery.trim().toLowerCase();
    return history.filter(entry => {
      const matchesVideoTitle = (entry.title || '').toLowerCase().includes(q);
      const matchesUrl = (entry.url || '').toLowerCase().includes(q) || (entry.video_id || '').toLowerCase().includes(q);
      const matchesDuration = (entry.duration_pref || '').toLowerCase().includes(q);
      const matchesSummary = (entry.summary || '').toLowerCase().includes(q);
      const matchesClips = (entry.clip_titles || []).some(t => t.toLowerCase().includes(q));
      const matchesQuotes = (entry.key_quotes || []).some(k => k.toLowerCase().includes(q));

      return matchesVideoTitle || matchesUrl || matchesDuration || matchesSummary || matchesClips || matchesQuotes;
    });
  }, [history, historySearchQuery]);

  // Smooth scroll active clip card into view in the sidebar list ONLY when activeClip changes
  const prevActiveClipKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeClip) return;
    const clipKey = `${activeClip.start_time}_${activeClip.end_time}`;
    if (prevActiveClipKeyRef.current === clipKey) return;
    prevActiveClipKeyRef.current = clipKey;

    if (sortedClips) {
      const index = sortedClips.findIndex(
        c => c.start_time === activeClip.start_time && c.end_time === activeClip.end_time
      );
      if (index !== -1) {
        const element = document.getElementById(`clip-card-${index}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
  }, [activeClip]);

  // Find current subtitle line with slight gap tolerance to prevent jitter
  const currentSubtitle = result?.transcript?.find(
    line => currentTime >= (line.start - 0.05) && currentTime <= (line.end + 0.25)
  );

  return (
    <div className={`app-container${isStudioWorkspaceOpen ? ' studio-workspace-open' : ''}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-msg" role="status" aria-live="polite">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span className="toast-text">{toastMessage}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToastMessage(null)}
            title={t.errors.dismissNotification}
            aria-label={t.errors.dismissNotification}
          >

          </button>
        </div>
      )}

      {/* Header Area */}
      <header className="app-header">
        <div className="header-logo">
          <h1 className="eclipse-brand-heading">
            <img className="eclipse-main-logo" src="/eclipse-logo-main.png" alt="ECLIPSE — Dema Digital Asia" />
          </h1>
        </div>
        <div className="header-nav">
          <div className="header-nav-primary">
            <button
              type="button"
              className="header-nav-action"
              onClick={() => setIsUserGuideOpen(true)}
              aria-haspopup="dialog"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 5.5A2.75 2.75 0 0 1 7.5 2.75h11.75v17H7.5a2.75 2.75 0 0 0-2.75 2.75zm0 0v17M8 6h7m-7 4h7m-7 4h5" /></svg>
              <span>{t.guide.buttonLabel}</span>
            </button>
            <button
              type="button"
              className="header-nav-action"
              onClick={() => setIsSettingsModalOpen(true)}
              title={t.header.settingsTooltip}
              aria-haspopup="dialog"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M9 14v6" /></svg>
              <span>{t.header.settingsBtn}</span>
            </button>
          </div>
          <div className="header-nav-secondary">
            <div className="header-more-wrap" ref={headerMoreRef}>
              <button
                type="button"
                className="header-more-trigger"
                onClick={() => setIsHeaderMoreOpen(open => !open)}
                aria-label={t.header.moreActionsBtn}
                aria-expanded={isHeaderMoreOpen}
                aria-controls="header-more-panel"
                title={t.header.moreActionsTooltip}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.35" /><circle cx="12" cy="12" r="1.35" /><circle cx="19" cy="12" r="1.35" /></svg>
              </button>
              {isHeaderMoreOpen && (
                <div id="header-more-panel" className="header-more-panel" role="group" aria-label={t.header.moreActionsBtn}>
                  <p className="header-more-heading">{t.header.maintenanceHeading}</p>
                  <button
                    type="button"
                    className="header-more-item"
                    onClick={() => {
                      setIsHeaderMoreOpen(false);
                      setIsCookiesModalOpen(true);
                    }}
                    title={hasCookies ? t.header.cookiesTooltipActive : t.header.cookiesTooltipSetup}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.75A2.75 2.75 0 0 1 7.75 2H20v16H7.75A2.75 2.75 0 0 0 5 20.75zM5 4.75v16M8.5 6.5h8M8.5 10h8" /></svg>
                    <span className="header-more-item-copy">
                      <strong>{t.header.cookiesBtn}</strong>
                      <small>{hasCookies ? t.header.cookiesStatusActive : t.header.cookiesStatusSetup}</small>
                    </span>
                    <span className={`header-more-status-dot${hasCookies ? ' is-ready' : ''}`} aria-hidden="true" />
                  </button>
                  <div className="header-more-separator" />
                  <button
                    type="button"
                    className="header-more-item is-destructive"
                    onClick={() => {
                      setIsHeaderMoreOpen(false);
                      setShowGlobalClearModal(true);
                    }}
                    disabled={isClearingGlobalTemp}
                    title={t.header.clearTempTooltip}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" /></svg>
                    <span className="header-more-item-copy">
                      <strong>{isClearingGlobalTemp ? t.header.clearingTempBtn : t.header.clearTempBtn}</strong>
                      <small>{t.header.clearTempTooltip}</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main Form controls panel */}
      <section className="glass-panel analysis-setup-panel">
        <div className="dema-intro">
          <div className="dema-intro-copy">
            <span className="dema-eyebrow"><span className="dema-eyebrow-rule" />{t.header.heroEyebrow}</span>
            <h2>{t.header.heroTitle}</h2>
            <p>{t.header.heroBody}</p>
          </div>
          <div className="dema-eclipse-art-wrap" aria-hidden="true">
            <img className="dema-eclipse-art" src="/eclipse-hero-art.png" alt="" />
          </div>
        </div>
        <form onSubmit={handleAnalyze} className="analysis-setup-form">
          {/* Source Selector Tabs: YouTube vs Google Drive vs Upload Video File */}
          <div className="source-tabs" role="group" aria-label={t.form.sourceSelectionLabel}>
            {/* YouTube Tab */}
            <button
              type="button"
              id="source-mode-youtube"
              className={`source-tab-btn ${sourceMode === 'youtube' ? 'active' : ''}`}
              aria-pressed={sourceMode === 'youtube'}
              onClick={() => {
                setSourceMode('youtube');
                setError(null);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0033" aria-hidden="true" focusable="false">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              {t.form.tabYoutube}
            </button>

            {/* Google Drive Tab */}
            <button
              type="button"
              id="source-mode-gdrive"
              className={`source-tab-btn ${sourceMode === 'gdrive' ? 'active' : ''}`}
              aria-pressed={sourceMode === 'gdrive'}
              onClick={() => {
                setSourceMode('gdrive');
                setError(null);
              }}
            >
              <svg width="17" height="17" viewBox="0 0 87.3 78" fill="none">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#00832D"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00AC47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.1z" fill="#0066DA"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#FFBA00"/>
                <path d="m59.8 53h27.5c0-1.55-.4-3.1-1.2-4.5l-25.4-44c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8z" fill="#2684FC"/>
                <path d="m73.55 76.8c1.35 0 2.9-.4 4.25-1.2l-14.1-22.6H27.5l13.75 23.8h32.3z" fill="#FFBA00"/>
              </svg>
              {t.form.tabGdrive}
            </button>

            {/* Upload Video File Tab */}
            <button
              type="button"
              id="source-mode-upload"
              className={`source-tab-btn ${sourceMode === 'upload' ? 'active' : ''}`}
              aria-pressed={sourceMode === 'upload'}
              onClick={() => {
                setSourceMode('upload');
                setError(null);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M12 15V3" />
                <path d="m7 8 5-5 5 5" />
                <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
              </svg>
              {t.form.tabUpload}
            </button>
          </div>

          {/* YouTube input mode */}
          {sourceMode === 'youtube' && (
            <div className="form-main-input-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label htmlFor="youtube-url-input" className="setup-field-label">{t.form.urlLabel}</label>
                <input
                  id="youtube-url-input"
                  type="text"
                  className="form-input source-url-input setup-control"
                  placeholder={t.form.urlPlaceholder}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  required={sourceMode === 'youtube'}
                />
              </div>
            </div>
          )}

          {/* Google Drive input mode */}
          {sourceMode === 'gdrive' && (
            <div className="form-main-input-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label htmlFor="gdrive-url-input" className="setup-field-label">{t.form.gdriveUrlLabel}</label>
                <input
                  id="gdrive-url-input"
                  type="text"
                  className="form-input source-url-input setup-control"
                  placeholder={t.form.gdriveUrlPlaceholder}
                  value={gdriveUrl}
                  onChange={(e) => setGdriveUrl(e.target.value)}
                  disabled={loading}
                  required={sourceMode === 'gdrive'}
                />
                <span className="setup-helper-text">
                   {t.form.gdriveNotice}
                </span>
              </div>
            </div>
          )}

          {/* Upload Local Video mode */}
          {sourceMode === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="file"
                ref={videoFileInputRef}
                accept=".mp4,.mov,.mkv,.webm,.avi,.m4v,.flv,.wmv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setUploadedVideoFile(file);
                    setUploadedVideoInfo(null);
                    setError(null);
                  }
                }}
              />

              {!uploadedVideoFile && !uploadedVideoInfo ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t.form.dropVideoTitle}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverVideo(true);
                  }}
                  onDragLeave={() => setIsDragOverVideo(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverVideo(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      setUploadedVideoFile(file);
                      setUploadedVideoInfo(null);
                      setError(null);
                    }
                  }}
                  onClick={() => videoFileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      videoFileInputRef.current?.click();
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.85rem',
                    padding: '2.5rem 1.5rem',
                    borderRadius: '14px',
                    border: isDragOverVideo ? '2px dashed #858585' : '2px dashed rgba(255, 255, 255, 0.15)',
                    background: isDragOverVideo ? 'rgba(133, 133, 133, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease'
                  }}
                >
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'rgba(133, 133, 133, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a2a2a2'
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7"></polygon>
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                    </svg>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      {t.form.dropVideoTitle}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {t.form.dropVideoSubtitle}
                    </div>
                  </div>
                  <span
                    className="action-link-btn"
                    style={{
                      marginTop: '0.25rem',
                      padding: '0.45rem 1.2rem',
                      borderRadius: '8px',
                      background: 'rgba(133, 133, 133, 0.2)',
                      border: '1px solid rgba(133, 133, 133, 0.4)',
                      color: '#c1c1c1',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {t.form.chooseVideoFile}
                  </span>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem 1.5rem',
                  borderRadius: '12px',
                  background: 'rgba(133, 133, 133, 0.08)',
                  border: '1px solid rgba(133, 133, 133, 0.25)',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: 'rgba(133, 133, 133, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#a2a2a2',
                      flexShrink: 0
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7"></polygon>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {uploadedVideoFile?.name || uploadedVideoInfo?.filename}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', alignItems: 'center' }}>
                        {uploadedVideoFile && (
                          <span> {(uploadedVideoFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                        )}
                        {uploadedVideoInfo && uploadedVideoInfo.duration > 0 && (
                          <span> {Math.round(uploadedVideoInfo.duration)}s</span>
                        )}
                        <span>•</span>
                        <span style={{ color: '#a3a3a3', fontWeight: 600 }}> Whisper AI Auto-Transcribe</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedVideoFile(null);
                        setUploadedVideoInfo(null);
                        if (videoFileInputRef.current) videoFileInputRef.current.value = '';
                      }}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {t.form.changeVideo}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="form-settings-grid setup-settings-grid">
            {/* Card 1: AI Engine Configuration */}
            <div className="setup-settings-card">
              <h3 className="setup-settings-title">
                 {t.form.aiSettingsTitle}
              </h3>

              {/* API Key input — required */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label htmlFor="gemini-key-input" className="setup-field-label">
                    {t.form.apiKeyLabel}
                    <span className="setup-required-badge">{t.form.apiKeyRequired}</span>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href="https://aistudio.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, transition: 'var(--transition-smooth)' }}
                      className="action-link-btn"
                    >
                       {t.form.getFreeKey}
                    </a>
                    <span className="setup-action-separator">|</span>
                    <button
                      type="button"
                      aria-controls="gemini-key-input"
                      aria-pressed={showApiKey}
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="setup-text-action"
                    >
                      {showApiKey ? t.form.hideKey : t.form.showKey}
                    </button>
                  </div>
                </div>
                <input
                  id="gemini-key-input"
                  type={showApiKey ? 'text' : 'password'}
                  aria-required="true"
                  className={`form-input setup-control${!apiKey.trim() ? ' input-error-highlight' : ''}`}
                  placeholder={t.form.apiKeyPlaceholder}
                  value={apiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setApiKey(val);
                    localStorage.setItem('cheat_clip_gemini_api_key', val);
                    if (val.trim()) setError(null);
                  }}
                  disabled={loading}
                />
                {!apiKey.trim() && (
                  <span className="setup-error-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    {t.form.apiKeyErrorHint}
                  </span>
                )}
              </div>

              {/* AI Model Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label htmlFor="gemini-model-input" className="setup-field-label setup-model-label">
                  <span>{t.form.aiModelLabel}</span>
                  {loadingModels && (
                    <span className="setup-loading-hint">
                       {t.form.fetchingModels}
                    </span>
                  )}
                </label>
                <select
                  id="gemini-model-input"
                  className="form-input setup-control setup-select"
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    localStorage.setItem('cheat_clip_selected_model', e.target.value);
                  }}
                  disabled={loading}
                >
                  {availableModels.length > 0 ? (
                    modelGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.models.map((m) => (
                          <option key={m} value={m}>
                            {m}{m === 'gemini-2.5-flash' ? ` · ${t.results.recommendedOptionLabel}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    <>
                      <optgroup label={t.results.modelFlashGroup}>
                        <option value="gemini-2.5-flash">gemini-2.5-flash · {t.results.recommendedOptionLabel}</option>
                        <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                      </optgroup>
                      <optgroup label={t.results.modelProGroup}>
                        <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                      </optgroup>
                    </>
                  )}
                </select>
                <span className="setup-helper-text">
                   {t.results.recommendedModelHelp}
                </span>
                <span className="setup-helper-text">
                   <strong>{t.form.resilienceTip}</strong> {t.form.resilienceDesc}
                </span>
              </div>
            </div>

            {/* Card 2: Clip Parameters & Focus */}
            <div className="setup-settings-card">
              <h3 className="setup-settings-title">
                 {t.form.clipCustomizationTitle}
              </h3>

              {/* Preferred Duration Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span id="target-duration-label" className="setup-field-label">{t.form.targetDuration}</span>
                <div className="duration-selector" id="duration-selector-group" role="group" aria-labelledby="target-duration-label">
                  <button
                    type="button"
                    className={`duration-btn ${durationPref === '15s' ? 'active' : ''}`}
                    aria-pressed={durationPref === '15s'}
                    onClick={() => {
                      setDurationPref('15s');
                      localStorage.setItem('cheat_clip_duration_pref', '15s');
                    }}
                    disabled={loading}
                  >
                    {t.form.dur15s}
                  </button>
                  <button
                    type="button"
                    className={`duration-btn ${durationPref === '30s' ? 'active' : ''}`}
                    aria-pressed={durationPref === '30s'}
                    onClick={() => {
                      setDurationPref('30s');
                      localStorage.setItem('cheat_clip_duration_pref', '30s');
                    }}
                    disabled={loading}
                  >
                    {t.form.dur30s}
                  </button>
                  <button
                    type="button"
                    className={`duration-btn ${durationPref === '60s' ? 'active' : ''}`}
                    aria-pressed={durationPref === '60s'}
                    onClick={() => {
                      setDurationPref('60s');
                      localStorage.setItem('cheat_clip_duration_pref', '60s');
                    }}
                    disabled={loading}
                  >
                    {t.form.dur60s}
                  </button>
                  <button
                    type="button"
                    className={`duration-btn ${durationPref === 'auto' ? 'active' : ''}`}
                    aria-pressed={durationPref === 'auto'}
                    onClick={() => {
                      setDurationPref('auto');
                      localStorage.setItem('cheat_clip_duration_pref', 'auto');
                    }}
                    disabled={loading}
                  >
                    {t.form.durAuto}
                  </button>
                </div>
                {durationPref === 'auto' && (
                  <span className="setup-helper-text">
                     {t.form.durAutoTip}
                  </span>
                )}
              </div>

              {/* Focus Prompt Search Keyword */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label htmlFor="specific-moments-input" className="setup-field-label">
                  {t.form.findSpecificMoments} <span className="setup-optional">{t.form.optional}</span>
                </label>
                <input
                  id="specific-moments-input"
                  type="text"
                  className="form-input setup-control"
                  placeholder={t.form.promptPlaceholder}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* Target Clip Count Selector & Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span id="target-clip-count-label" className="setup-field-label">
                    {t.form.targetClipCount}
                  </span>
                  <span className="setup-count-badge">
                    {clipCountMode === 'auto' ? t.form.clipCountAutoBadge : t.form.approxClips(targetClipCount)}
                  </span>
                </div>

                {/* Auto vs Custom Count Option Buttons */}
                <div className="duration-selector" id="clip-count-mode-group" role="group" aria-labelledby="target-clip-count-label">
                  <button
                    type="button"
                    className={`duration-btn ${clipCountMode === 'auto' ? 'active' : ''}`}
                    aria-pressed={clipCountMode === 'auto'}
                    onClick={() => {
                      setClipCountMode('auto');
                      localStorage.setItem('cheat_clip_clip_count_mode', 'auto');
                    }}
                    disabled={loading}
                  >
                    {t.form.clipCountAuto}
                  </button>
                  <button
                    type="button"
                    className={`duration-btn ${clipCountMode === 'custom' ? 'active' : ''}`}
                    aria-pressed={clipCountMode === 'custom'}
                    onClick={() => {
                      setClipCountMode('custom');
                      localStorage.setItem('cheat_clip_clip_count_mode', 'custom');
                    }}
                    disabled={loading}
                  >
                    {t.form.clipCountCustom}
                  </button>
                </div>

                {clipCountMode === 'custom' ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '10px' }}>1</span>
                      <input
                        aria-label={`${t.form.targetClipCount}: ${targetClipCount}`}
                        type="range"
                        min="1"
                        max="50"
                        value={targetClipCount}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTargetClipCount(val);
                          localStorage.setItem('cheat_clip_target_clip_count', String(val));
                        }}
                        disabled={loading}
                        className="setup-range-slider"
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '20px', textAlign: 'right' }}>50</span>
                    </div>
                    <span className="setup-helper-text">
                       {t.form.clipCountTip(targetClipCount, targetClipCount <= 5 ? `${Math.max(1, targetClipCount - 1)}-${targetClipCount + 2}` : targetClipCount <= 10 ? `${Math.max(1, targetClipCount - 2)}-${targetClipCount + 3}` : `${targetClipCount - 5}-${targetClipCount + 5}`)}
                    </span>
                  </>
                ) : (
                  <span className="setup-helper-text">
                     {t.form.clipCountAutoTip}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subtitles Source Section */}
          <div className="setup-option-section">
            <span id="subtitles-source-label" className="setup-field-label">{t.form.subtitlesSource}</span>
            <div className="setup-choice-group" role="group" aria-labelledby="subtitles-source-label">
              <label className="setup-choice-label">
                <input
                  type="radio"
                  name="subtitlesSource"
                  checked={subtitlesSource === 'youtube'}
                  onChange={() => setSubtitlesSource('youtube')}
                  className="setup-radio"
                  disabled={loading}
                />
                {sourceMode === 'youtube' ? t.form.autoFetchYoutube : t.form.autoTranscript}
              </label>
              <label className="setup-choice-label">
                <input
                  type="radio"
                  name="subtitlesSource"
                  checked={subtitlesSource === 'manual'}
                  onChange={() => setSubtitlesSource('manual')}
                  className="setup-radio"
                  disabled={loading}
                />
                {t.form.uploadCustomSubtitles}
              </label>

              {subtitlesSource === 'manual' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="file"
                    accept=".srt,.txt"
                    id="manual-subtitle-file"
                    style={{ display: 'none' }}
                    disabled={loading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setManualSubtitlesFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const text = evt.target?.result as string;
                        setManualSubtitlesContent(text);
                        setToastMessage(t.form.subtitlesLoaded(file.name));
                        setTimeout(() => setToastMessage(null), 3000);
                      };
                      reader.readAsText(file);
                    }}
                  />
                  <label
                    htmlFor="manual-subtitle-file"
                    className="setup-file-picker"
                  >
                    {t.form.chooseSrtTxt}
                  </label>
                  {manualSubtitlesFileName && (
                  <span className="setup-selected-file-name">
                       {manualSubtitlesFileName}
                    </span>
                  )}
                </div>
              )}
            </div>

            {subtitlesSource === 'youtube' && (
              <span className="setup-helper-text setup-subtitle-tip">
                 <strong>{t.form.subtitlesTipTitle}</strong> {t.form.subtitlesTipDesc} <a className="setup-help-link" href="https://downsub.com/" target="_blank" rel="noopener noreferrer">downsub.com</a> {t.form.andUploadOption}
              </span>
            )}
          </div>

          {/* Custom Search Range Section */}
          <div className="setup-option-section">
            <span id="analysis-range-label" className="setup-field-label">{t.form.analysisRange}</span>
            <div className="setup-choice-group" role="group" aria-labelledby="analysis-range-label">
              <label className="setup-choice-label">
                <input
                  type="radio"
                  name="rangeType"
                  checked={rangeType === 'entire'}
                  onChange={() => setRangeType('entire')}
                  className="setup-radio"
                  disabled={loading}
                />
                {t.form.entireVideo}
              </label>
              <label className="setup-choice-label">
                <input
                  type="radio"
                  name="rangeType"
                  checked={rangeType === 'custom'}
                  onChange={() => setRangeType('custom')}
                  className="setup-radio"
                  disabled={loading}
                />
                {t.form.customRange}
              </label>

              {rangeType === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    aria-label={t.form.startPlaceholder}
                    type="text"
                    className="form-input setup-control setup-range-field"
                    placeholder={t.form.startPlaceholder}
                    value={customRangeStart}
                    onChange={(e) => setCustomRangeStart(e.target.value)}
                    disabled={loading}
                  />
                  <span className="setup-range-separator">{t.form.to}</span>
                  <input
                    aria-label={t.form.endPlaceholder}
                    type="text"
                    className="form-input setup-control setup-range-field"
                    placeholder={t.form.endPlaceholder}
                    value={customRangeEnd}
                    onChange={(e) => setCustomRangeEnd(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}
            </div>
            {rangeType === 'custom' && (
              <span className="setup-helper-text">
                {t.form.rangeFormatHint}
              </span>
            )}
          </div>

          <div className="analysis-submit-footer">
            <div className="analysis-submit-guidance" role="status" aria-live="polite">
              {!apiKey.trim() ? t.errors.apiKeyRequired : t.form.analysisSubmitHint}
            </div>
            <button
              id="analyze-btn"
              type="submit"
              className="glowing-btn analysis-submit-btn"
              disabled={loading || isUploadingVideo || !canAnalyzeCurrentSource}
            >
              {loading ? (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="spinner-icon" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"></circle>
                  </svg>
                  {isUploadingVideo ? t.form.uploadingVideo : t.form.processing}
                </>
              ) : (
                t.form.hackClips
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Detached & Highlighted Previous Analyses Section */}
      {history.length > 0 && (
        <section
          className="history-highlight-panel"
          aria-label={t.form.previouslyAnalyzed}
        >
          {/* Header Row */}
          <div className="history-panel-header">
            <div className="history-heading">
              <div className="history-title-row">
                <h3 className="history-panel-title">{t.form.previouslyAnalyzed}</h3>
                <span className="history-count-badge">{history.length}</span>
              </div>
              <p className="history-panel-subtitle">{t.form.historySubtitle}</p>
            </div>

            {/* Actions: Search bar, Clear All, Collapse Toggle */}
            <div className="history-panel-actions">
              {/* Search Bar */}
              <div className="history-search-wrap">
                <svg className="history-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <circle cx="10.8" cy="10.8" r="6.3" />
                  <path d="m16 16 4 4" />
                </svg>
                <input
                  type="text"
                  className="history-search-input"
                  aria-label={t.form.searchHistoryPlaceholder}
                  placeholder={t.form.searchHistoryPlaceholder}
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                />
                {historySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setHistorySearchQuery('')}
                    className="history-clear-search"
                    aria-label={t.form.clearSearch}
                  >
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                      <path d="m5 5 10 10M15 5 5 15" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Clear all with confirmation */}
              {confirmClearAll ? (
                <div className="history-clear-confirm" role="group" aria-label={t.form.areYouSure}>
                  <span>{t.form.areYouSure}</span>
                  <button
                    type="button"
                    className="history-clear-confirm-action"
                    onClick={() => {
                      clearAllHistory();
                      setConfirmClearAll(false);
                    }}
                  >
                    {t.form.confirmClear}
                  </button>
                  <button
                    type="button"
                    className="history-clear-cancel"
                    onClick={() => setConfirmClearAll(false)}
                  >
                    {t.form.cancel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="history-clear-all-button"
                  onClick={() => setConfirmClearAll(true)}
                >
                  {t.form.clearAll}
                </button>
              )}

              {/* Toggle button */}
              <button
                type="button"
                onClick={() => setShowHistory(h => !h)}
                className="history-toggle-button"
                aria-expanded={showHistory}
                aria-controls="history-list-region"
                aria-label={showHistory ? t.form.collapseHistory : t.form.expandHistory}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                  <path d={showHistory ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} />
                </svg>
              </button>
            </div>
          </div>

          {/* Expanded content */}
          <div id="history-list-region" className="history-content" hidden={!showHistory}>
              {historySearchQuery.trim() && (
                <div className="history-filter-count">
                  <span>{t.form.showingHistoryCount(filteredHistory.length, history.length)}</span>
                  <button
                    type="button"
                    onClick={() => setHistorySearchQuery('')}
                    className="history-inline-clear"
                  >
                    {t.form.clearSearch}
                  </button>
                </div>
              )}

              {filteredHistory.length === 0 ? (
                <div className="history-empty-state">
                  <p>
                    {t.form.noHistoryMatch}
                  </p>
                  {historySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHistorySearchQuery('')}
                      className="history-inline-clear"
                    >
                      {t.form.clearSearch}
                    </button>
                  )}
                </div>
              ) : (
                <div className="history-list">
                  {filteredHistory.map((entry) => {
                    const q = historySearchQuery.trim().toLowerCase();
                    const matchedClip = q ? entry.clip_titles?.find(t => t.toLowerCase().includes(q)) : null;
                    const matchedQuote = (!matchedClip && q) ? entry.key_quotes?.find(k => k.toLowerCase().includes(q)) : null;

                    return (
                      <article
                        key={`${entry.video_id}_${entry.duration_pref}_${entry.range_suffix || ''}`}
                        className="history-entry-card"
                      >
                        {/* Thumbnail with overlay duration badge */}
                        <div className="history-entry-thumbnail-wrap">
                          <img
                            src={entry.thumbnail}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="84" height="48" viewBox="0 0 84 48"><rect width="84" height="48" fill="%231e1e2d"/><polygon points="36,18 52,24 36,30" fill="%236366f1"/></svg>';
                            }}
                            className="history-entry-thumbnail"
                          />
                          <span className="history-duration-badge">
                            {entry.duration_pref === 'auto' ? 'Auto' : entry.duration_pref}
                          </span>
                        </div>

                        {/* Title and details */}
                        <div className="history-entry-content">
                          <div className="history-entry-title">
                            {entry.title}
                          </div>
                          <div className="history-entry-meta">
                            <span className="history-entry-clip-count">{t.form.clipsCountMeta(entry.clip_count)}</span>
                            <span className="history-meta-separator">•</span>
                            <span>{entry.duration_pref === 'auto' ? 'Auto' : entry.duration_pref}</span>
                            <span className="history-meta-separator">•</span>
                            <span>{formatRelativeTime(entry.analyzed_at)}</span>
                            <span className="history-meta-separator">•</span>
                            {entry.source_type === 'gdrive' ? (
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="history-source-link"
                              >
                                 Google Drive
                              </a>
                            ) : entry.source_type === 'upload' ? (
                              <span className="history-source-label">
                                 Local Video
                              </span>
                            ) : (
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="history-source-link"
                              >
                                 YouTube
                              </a>
                            )}
                          </div>

                          {/* Matched clip/quote search preview */}
                          {matchedClip && (
                            <div className="history-entry-match">
                              <span className="history-entry-match-label">{t.form.matchedClipLabel}:</span>
                              <span className="history-entry-match-value">"{matchedClip}"</span>
                            </div>
                          )}
                          {matchedQuote && (
                            <div className="history-entry-match">
                              <span className="history-entry-match-label">{t.form.matchedQuoteLabel}:</span>
                              <span className="history-entry-match-value">"{matchedQuote}"</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="history-entry-actions">
                          <button
                            type="button"
                            onClick={() => loadFromHistory(entry)}
                            className="history-load-button"
                          >
                            {t.form.loadVideo}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => deleteHistoryEntry(entry, e)}
                            className="history-remove-button"
                            aria-label={t.form.removeFromHistory}
                            title={t.form.removeFromHistory}
                          >
                            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                              <path d="M3.5 5.5h13M8 5.5V3.8h4v1.7m-6.5 0 .8 10.7h7.4l.8-10.7M8.2 8.5v5M11.8 8.5v5" />
                            </svg>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
        </section>
      )}

      {/* Error state */}
      {error && (
        <section className="glass-panel" style={{ borderColor: 'rgba(132, 132, 132, 0.3)', background: 'rgba(132, 132, 132, 0.05)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.5rem', color: '#848484', lineHeight: 1, marginTop: '2px' }}></span>
            <div style={{ flex: 1 }}>
              <h4 style={{ color: '#848484', margin: 0, fontSize: '1rem', fontWeight: 700 }}>{t.errors.analysisFailed}</h4>
              {/* Subtitle failure actions */}
              {(error.toLowerCase().includes("subtitle") || error.toLowerCase().includes("transcript")) ? (
                <>
                  <div style={{
                    fontSize: '0.825rem',
                    color: 'var(--text-secondary)',
                    marginTop: '0.5rem',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(0, 0, 0, 0.25)',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontFamily: 'Inter',
                    maxHeight: '260px',
                    overflowY: 'auto'
                  }}>
                    {error}
                  </div>
                  <div style={{ marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="glowing-btn"
                      onClick={() => handleAnalyze()}
                      disabled={loading}
                      style={{
                        padding: '0.45rem 1.15rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        cursor: 'pointer'
                      }}
                    >
                      <span className={loading ? "spinner-icon" : ""}></span>
                      {t.errors.tryAgain}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSubtitlesSource('manual');
                        const fileInput = document.getElementById('manual-subtitle-file');
                        if (fileInput) fileInput.click();
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: 'var(--text-primary)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                       {t.form.uploadCustomSubtitles}
                    </button>
                  </div>
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', borderLeft: '3px solid #b1b1b1', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                     <strong>{t.form.subtitlesTipTitle}</strong> {t.errors.noSubtitlesTip}
                  </div>
                </>
              ) : (
                /* Non-subtitle errors (e.g. Gemini API Key, quota, general errors) */
                <>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{error}</p>
                  {(error.toLowerCase().includes("api key") || error.toLowerCase().includes("quota") || error.toLowerCase().includes("flash model") || error.toLowerCase().includes("aistudio") || error.toLowerCase().includes("rate limit")) && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const keyInput = document.getElementById('gemini-key-input') as HTMLInputElement | null;
                          if (keyInput) {
                            keyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            keyInput.focus();
                            keyInput.select();
                          }
                        }}
                        style={{
                          background: 'rgba(132, 132, 132, 0.15)',
                          border: '1px solid rgba(132, 132, 132, 0.4)',
                          color: '#bcbcbc',
                          borderRadius: '8px',
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                         {t.errors.changeApiKeyAction}
                      </button>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: 'var(--primary)',
                          fontSize: '0.8rem',
                          textDecoration: 'underline',
                          fontWeight: 500
                        }}
                      >
                        {t.errors.getNewKeyLink}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Loading Steps state with Real Progress Bars & Cognitive AI Diagnostics */}
      {loading && (
        <section
          ref={loadingSectionRef}
          id="loading-progress-section"
          className="glass-panel loading-progress-panel"
        >
          <div className="loading-progress-inner">
            <div className="loading-panel-heading">
              <h3 className="text-gradient">
                {t.loading.decodingEngagement}
              </h3>
              <p>
                {t.loading.decodingSubtitle}
              </p>
            </div>

            {/* Master Progress Bar */}
            <div className="loading-overall-progress">
              <div className="loading-overall-progress-header">
                <span>
                  {t.loading.pipelineCompletion}
                </span>
                <span className="loading-overall-progress-value">
                  {overallProgress}%
                </span>
              </div>
              <div className="loading-overall-progress-track" role="progressbar" aria-label={t.loading.pipelineCompletion} aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallProgress}>
                <div
                  className="loading-overall-progress-fill"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* Stepper with Individual Progress Bars */}
            <div className="stepper-container">
              {/* Step 1 */}
              <div className={`step-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > 1 ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg> : '1'}</div>
                <div className="step-content">
                  <div className="step-header-row">
                    <span className="step-label">{t.loading.step1Label}</span>
                    <span className="step-percentage">
                      {currentStep > 1 ? '100%' : `${stepProgress[1] || 0}%`}
                    </span>
                  </div>
                  <div className="step-mini-bar-track">
                    <div
                      className="step-mini-bar-fill"
                      style={{ width: `${currentStep > 1 ? 100 : (stepProgress[1] || 0)}%` }}
                    />
                  </div>
                  {currentStep === 1 && (
                    <span className="step-subtext">{t.loading.step1Subtext}</span>
                  )}
                </div>
              </div>

              {/* Step 2 */}
              <div className={`step-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > 2 ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg> : '2'}</div>
                <div className="step-content">
                  <div className="step-header-row">
                    <span className="step-label">{t.loading.step2Label}</span>
                    <span className="step-percentage">
                      {currentStep > 2 ? '100%' : currentStep === 2 ? `${stepProgress[2] || 0}%` : '0%'}
                    </span>
                  </div>
                  <div className="step-mini-bar-track">
                    <div
                      className="step-mini-bar-fill"
                      style={{ width: `${currentStep > 2 ? 100 : currentStep === 2 ? (stepProgress[2] || 0) : 0}%` }}
                    />
                  </div>
                  {currentStep === 2 && (
                    <span className="step-subtext">{t.loading.step2Subtext}</span>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div className={`step-item ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > 3 ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg> : '3'}</div>
                <div className="step-content">
                  <div className="step-header-row">
                    <span className="step-label">{t.loading.step3Label}</span>
                    <span className="step-percentage">
                      {currentStep > 3 ? '100%' : currentStep === 3 ? `${stepProgress[3] || 0}%` : '0%'}
                    </span>
                  </div>
                  <div className="step-mini-bar-track">
                    <div
                      className="step-mini-bar-fill"
                      style={{ width: `${currentStep > 3 ? 100 : currentStep === 3 ? (stepProgress[3] || 0) : 0}%` }}
                    />
                  </div>
                  {currentStep === 3 && (
                    <div style={{ marginTop: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.2rem 0.6rem',
                        background: 'rgba(133, 133, 133, 0.12)',
                        border: '1px solid rgba(133, 133, 133, 0.25)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#a2a2a2',
                        fontWeight: 600,
                        width: 'fit-content'
                      }}>
                        <span className="spinner-icon" style={{ fontSize: '0.75rem' }}></span>
                        <span>{aiStage || t.loading.step3Label}</span>
                      </div>
                      <span className="step-subtext" style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {aiDetail || loadingDetails || t.loading.step3Subtext}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 4 */}
              <div className={`step-item ${currentStep === 4 ? 'active' : currentStep > 4 ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > 4 ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg> : '4'}</div>
                <div className="step-content">
                  <div className="step-header-row">
                    <span className="step-label">{t.loading.step4Label}</span>
                    <span className="step-percentage">
                      {currentStep === 4 ? `${stepProgress[4] || 0}%` : '0%'}
                    </span>
                  </div>
                  <div className="step-mini-bar-track">
                    <div
                      className="step-mini-bar-fill"
                      style={{ width: `${currentStep === 4 ? (stepProgress[4] || 0) : 0}%` }}
                    />
                  </div>

                  {currentStep === 4 && (
                    <div className="ai-activity-card">
                      <div className="ai-activity-topbar">
                        <div className="ai-engine-badge">
                          <span style={{ fontSize: '0.85rem' }}></span>
                          <span>{t.loading.aiEngineBadge}</span>
                          {activeProcessingModel && (
                            <span style={{ opacity: 0.85, fontWeight: 500 }}>({activeProcessingModel})</span>
                          )}
                        </div>
                        <div className="ai-timer-badge">
                          <span>{t.loading.timeElapsed(loadingElapsedTime)}</span>
                        </div>
                      </div>

                      <div>
                        <div className="ai-stage-title">
                          <span style={{ animation: 'spin 2.5s linear infinite', display: 'inline-block' }}></span>
                          <span>{aiStage || t.loading.synthesizingHighlights}</span>
                        </div>
                      </div>

                      <div className="ai-stage-detail">
                        {aiDetail || loadingDetails || t.loading.evaluatingGradients}
                      </div>

                      {/* 4 Micro-phase progress pills */}
                      <div className="ai-subphases-row">
                        <div className={`ai-subphase-pill ${(stepProgress[4] || 0) >= 25 ? 'completed' : (stepProgress[4] || 0) >= 5 ? 'active' : ''}`}>
                          {t.loading.subphase1}
                        </div>
                        <div className={`ai-subphase-pill ${(stepProgress[4] || 0) >= 55 ? 'completed' : (stepProgress[4] || 0) >= 25 ? 'active' : ''}`}>
                          {t.loading.subphase2}
                        </div>
                        <div className={`ai-subphase-pill ${(stepProgress[4] || 0) >= 80 ? 'completed' : (stepProgress[4] || 0) >= 55 ? 'active' : ''}`}>
                          {t.loading.subphase3}
                        </div>
                        <div className={`ai-subphase-pill ${(stepProgress[4] || 0) >= 95 ? 'completed' : (stepProgress[4] || 0) >= 80 ? 'active' : ''}`}>
                          {t.loading.subphase4}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="loading-progress-live-detail" aria-live="polite">
              <span className="pulsing-text"> {loadingDetails}</span>
            </div>
          </div>
        </section>
      )}

      {/* Dashboard Section - Video Player, Timeline, and Clip list */}
      {result && (
        <main className="dashboard-grid">
          {/* Left panel: Player + Heatmap */}
          <div className="sticky-player-panel" ref={leftPanelRef}>
            <div className="glass-panel player-heatmap-panel">
              <h2 className="player-video-title">{result.title}</h2>

              <div className="video-wrapper" style={{ position: 'relative' }}>
                {(result.video_url || result.source_type === 'upload' || result.source_type === 'gdrive' || result.video_id?.startsWith('upload_') || result.video_id?.startsWith('gdrive_')) ? (
                  <video
                    key={`direct-player-${result.video_id}`}
                    ref={directVideoPlayerRef}
                    src={result.video_url ? encodeURI(result.video_url) : `/api/video/${encodeURIComponent(result.video_id)}`}
                    controls
                    playsInline
                    preload="auto"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: '8px',
                      objectFit: 'contain',
                      background: '#000000',
                      zIndex: 2
                    }}
                    onTimeUpdate={(e) => {
                      setCurrentTime(e.currentTarget.currentTime);
                    }}
                    onPlay={() => startTracking()}
                    onPause={() => stopTracking()}
                  />
                ) : (
                  <div id="youtube-player-container" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                    <div id="youtube-player"></div>
                  </div>
                )}
                {subtitlesSource === 'manual' && currentSubtitle && (
                  <div className="video-subtitle-overlay">
                    <span>{currentSubtitle.text}</span>
                  </div>
                )}
              </div>

              {/* Refresh Player control */}
              {/* Player control buttons: Refresh Player & Download Raw Video */}
              <div className="player-action-row">
                <button
                  type="button"
                  className="player-action-button player-action-secondary"
                  onClick={handleRefreshPlayer}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" /></svg>
                  {t.results.refreshPlayer}
                </button>

                <button
                  type="button"
                  className="player-action-button player-action-primary"
                  onClick={handleDownloadRawVideo}
                  disabled={isDownloadingRaw}
                  title={t.results.downloadRawVideo}
                >
                  {!isDownloadingRaw && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 16v4h14v-4" /></svg>}
                  {isDownloadingRaw ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="spinner-icon" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"></circle>
                      </svg>
                      {t.results.downloadingRawVideo}
                    </>
                  ) : (
                    <>{t.results.downloadRawVideo}</>
                  )}
                </button>
              </div>

              {/* Raw Video Download Real-time Progress Bar */}
              {rawDownloadProgress && (
                <div className="raw-download-progress-card">
                  <div className="progress-card-header">
                    <span className="progress-card-title">
                      {rawDownloadProgress.status === 'ready' ? (
                        <span style={{ color: '#c4c4c4' }}> {t.rawDownload.readyBadge}</span>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="spinner-icon">
                            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"></circle>
                          </svg>
                          <span>{t.rawDownload.downloadingTitle(rawDownloadProgress.percent.toFixed(1))}</span>
                        </>
                      )}
                    </span>
                    {rawDownloadProgress.eta && rawDownloadProgress.status !== 'ready' && (
                      <span className="progress-card-eta">{t.rawDownload.eta(rawDownloadProgress.eta)}</span>
                    )}
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill-bar"
                      style={{
                        width: `${Math.min(100, Math.max(0, rawDownloadProgress.percent))}%`,
                        background: rawDownloadProgress.status === 'ready' ? 'linear-gradient(90deg, #acacac 0%, #c4c4c4 100%)' : undefined
                      }}
                    />
                  </div>
                  <div className="progress-card-meta">
                    <span>
                      {rawDownloadProgress.downloaded || t.rawDownload.connecting} {rawDownloadProgress.total ? `/ ${rawDownloadProgress.total}` : ''}
                    </span>
                    <span>{rawDownloadProgress.speed || ''}</span>
                  </div>
                </div>
              )}

              {/* Heatmap Timeline component */}
              <HeatmapTimeline
                duration={result.duration}
                heatmap={result.heatmap}
                currentTime={currentTime}
                onSeek={handleSeek}
                activeClip={activeClip}
              />
            </div>

            {/* AI Summary card */}
            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.results.videoSummary}</h3>
                {(() => {
                  const { text, hashtags } = extractHashtagsAndText(result.summary);
                  return (
                    <>
                      {hashtags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                          {hashtags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="summary-hashtag-highlight"
                              style={{
                                color: 'var(--accent)',
                                fontWeight: '600',
                                background: 'rgba(163, 163, 163, 0.1)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(163, 163, 163, 0.2)',
                                fontSize: '0.75rem',
                                display: 'inline-block'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</p>
                    </>
                  );
                })()}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.05rem', color: 'var(--secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t.results.generatedClipsOverview(result.clips.length)}
                  </h3>
                  <div className="overview-actions">
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      type="button"
                      onClick={(e) => toggleTimestampMenu('overview', e)}
                      aria-haspopup="dialog"
                      aria-expanded={copyTimestampMenuTarget === 'overview'}
                      aria-controls={copyTimestampMenuTarget === 'overview' ? 'timestamp-format-menu-overview' : undefined}
                      title={t.results.copyAllTimestampsTooltip}
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.55rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        borderRadius: '6px',
                        background: copyTimestampMenuTarget === 'overview' ? 'rgba(148, 148, 148, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${copyTimestampMenuTarget === 'overview' ? 'rgba(148, 148, 148, 0.5)' : 'var(--border-color)'}`,
                        color: copyTimestampMenuTarget === 'overview' ? 'var(--secondary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'var(--transition-smooth)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(148, 148, 148, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(148, 148, 148, 0.4)';
                        e.currentTarget.style.color = 'var(--secondary)';
                      }}
                      onMouseLeave={(e) => {
                        if (copyTimestampMenuTarget !== 'overview') {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                      }}
                    >
                      {t.results.copyAllTimestamps} ▾
                    </button>
                    {copyTimestampMenuTarget === 'overview' && renderTimestampFormatMenu('overview', 'right')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {result.clips.map((clip, idx) => {
                    const isSelected = activeClip?.start_time === clip.start_time && activeClip?.end_time === clip.end_time;
                    const clipKey = `${clip.start_time}_${clip.end_time}`;
                    const isMarked = !!markedClips[clipKey];
                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveClip(clip)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.8rem',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          background: isSelected
                            ? 'var(--accent-purple-soft)'
                            : 'rgba(255, 255, 255, 0.02)',
                          border: isSelected
                            ? '1px solid var(--accent-purple-border)'
                            : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)',
                          opacity: 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, overflow: 'hidden' }}>
                          <input
                            type="checkbox"
                            checked={isMarked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleMarkedClip(clipKey);
                            }}
                            style={{
                              width: '14px',
                              height: '14px',
                              cursor: 'pointer',
                              accentColor: 'var(--accent-purple)'
                            }}
                          />
                          <span style={{
                            fontWeight: isSelected ? 700 : 500,
                            color: isMarked
                              ? 'var(--accent-purple-text)'
                              : (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {idx + 1}. {clip.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: clip.virality_score >= 90 ? '#6020a0' : '#725095',
                            background: clip.virality_score >= 90 ? '#f2e8ff' : '#f8f4fc',
                            border: `1px solid ${clip.virality_score >= 90 ? '#d9b8fc' : '#e9ddf5'}`,
                            borderRadius: '4px',
                            padding: '0.05rem 0.35rem',
                            whiteSpace: 'nowrap'
                          }}>
                             {clip.virality_score}%
                          </span>
                          <span
                            onClick={(e) => handleCopyTimestamp(clip, e)}
                            title={t.results.copyTimestampTooltip}
                            style={{
                              color: 'var(--text-muted)',
                              fontFamily: 'Inter',
                              fontSize: '0.68rem',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--secondary)';
                              e.currentTarget.style.background = 'rgba(148, 148, 148, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-muted)';
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                             {formatSeconds(clip.start_time)} – {formatSeconds(clip.end_time)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Suggested Clips scrollable list */}
          <div className="results-recommendations-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: leftPanelHeight ? `${leftPanelHeight}px` : '80vh' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
              <div className="results-heading-row">
                <h2 className="results-panel-title">{t.results.recommendedClips}</h2>
              </div>
              <div className="results-studio-next-step">
                <span className="results-studio-step-number" aria-hidden="true">2</span>
                <div className="results-studio-step-copy">
                  <strong>{t.results.studioNextStepLabel}</strong>
                  <span>{t.results.studioWorkflowHint}</span>
                </div>
                <button
                  type="button"
                  className="studio-open-workspace-btn"
                  onClick={() => setIsStudioWorkspaceOpen(true)}
                >
                  {t.studio.openWorkspace}
                  <span>{markedClipsList.length}</span>
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Analysis Metadata Info Bar */}
              <div className="results-model-summary">
                <div className="results-model-summary-item">
                  <span>{t.results.aiModelBadge}</span>
                  <strong>
                    {result.model || selectedModel}
                  </strong>
                </div>
                <div className="results-model-summary-item">
                  <span>{t.results.generatedClipsBadge}</span>
                  <strong>
                    {result.clips.length}
                  </strong>
                </div>
                <div className="results-model-summary-item">
                  <span>{t.results.markedClipsBadge}</span>
                  <strong>
                    {result.clips.filter(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`]).length}
                  </strong>
                </div>
              </div>

              {/* Search & Filter Controls */}
              <div className="filter-controls-bar">
                <input
                  type="text"
                  className="form-input search-filter-input"
                  placeholder={t.results.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '0.6rem 1rem', fontSize: '0.875rem' }}
                />

                <select
                  className="form-input virality-filter-select"
                  aria-label={t.results.scoreFilterAccessibleName}
                  value={viralityFilter}
                  onChange={(e) => setViralityFilter(e.target.value as any)}
                  style={{ width: 'auto', cursor: 'pointer' }}
                >
                  <option value="all">{t.results.filterAllScores}</option>
                  <option value="high">{t.results.filterHigh}</option>
                  <option value="medium">{t.results.filterMidLow}</option>
                  <option value="marked">{t.results.filterMarkedOnly}</option>
                </select>

                <select
                  className="form-input virality-filter-select"
                  aria-label={t.results.clipSortAccessibleName}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  style={{ width: 'auto', cursor: 'pointer' }}
                >
                  <option value="virality">{t.results.sortVirality}</option>
                  <option value="time">{t.results.sortTime}</option>
                  <option value="duration">{t.results.sortDuration}</option>
                  <option value="marked">{t.results.sortMarked}</option>
                </select>
              </div>

              {/* Stats and Exports */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span>{t.results.showingClipsCount(sortedClips.length, result.clips.length)}</span>
                  {result.clips && result.clips.length > 0 && (
                    <button
                      type="button"
                      className="action-link-btn mark-all-clips-btn"
                      onClick={() => toggleAllMarkedClips()}
                      title={result.clips.every(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`]) ? t.results.unmarkAllClips : t.results.markAllClips}
                      style={{
                        background: result.clips.every(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`]) ? '#f8f4fc' : 'var(--accent-purple-soft)',
                        border: result.clips.every(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`]) ? '1px solid #e9ddf5' : '1px solid var(--accent-purple-border)',
                        color: result.clips.every(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`]) ? '#725095' : 'var(--accent-purple-text)',
                        borderRadius: '5px',
                        padding: '0.2rem 0.55rem',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      {result.clips.every(clip => !!markedClips[`${clip.start_time}_${clip.end_time}`])
                        ? t.results.unmarkAllClips
                        : t.results.markAllClips}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      type="button"
                      className="action-link-btn"
                      onClick={(e) => toggleTimestampMenu('toolbar', e)}
                      aria-haspopup="dialog"
                      aria-expanded={copyTimestampMenuTarget === 'toolbar'}
                      aria-controls={copyTimestampMenuTarget === 'toolbar' ? 'timestamp-format-menu-toolbar' : undefined}
                      title={t.results.copyAllTimestampsTooltip}
                      style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      {t.results.copyAllTimestamps} ▾
                    </button>
                    {copyTimestampMenuTarget === 'toolbar' && renderTimestampFormatMenu('toolbar', 'left')}
                  </div>
                  <span style={{ color: 'var(--border-color)' }}>|</span>
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={handleCopyAllMarkdown}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                  >
                    {t.results.copyAllMd}
                  </button>
                  <span style={{ color: 'var(--border-color)' }}>|</span>
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={handleExportJSON}
                    style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                  >
                    {t.results.downloadJson}
                  </button>
                  {result.transcript && (
                    <>
                      <span style={{ color: 'var(--border-color)' }}>|</span>
                      <button
                        type="button"
                        className="action-link-btn"
                        onClick={handleExportSRT}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                      >
                        {t.results.downloadSrt}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="clips-list" style={{ maxHeight: 'none', flex: 1 }}>
              {sortedClips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {t.results.noClipsMatch}
                </div>
              ) : (
                sortedClips.map((clip, index) => {
                  const clipKey = `${clip.start_time}_${clip.end_time}`;
                  const isActive = activeClip?.start_time === clip.start_time && activeClip?.end_time === clip.end_time;
                  const isExpanded = expandedClipIndex === index;
                  const isDetailsOpen = selectedClipDetailKey === clipKey;

                  return (
                    <div
                      key={index}
                      id={`clip-card-${index}`}
                      className={`clip-card ${isActive ? 'active' : ''} ${markedClips[clipKey] ? 'marked' : ''} ${isDetailsOpen ? 'details-open' : ''}`}
                      onClick={() => {
                        setActiveClip(clip);
                        if (!isDetailsOpen) setSelectedClipDetailKey(clipKey);
                      }}
                    >
                      {/* Header */}
                      <div className="clip-header">
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={!!markedClips[`${clip.start_time}_${clip.end_time}`]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleMarkedClip(`${clip.start_time}_${clip.end_time}`);
                            }}
                            style={{
                              width: '18px',
                              height: '18px',
                              cursor: 'pointer',
                              accentColor: 'var(--accent-purple)'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                          <div className="clip-title-row">
                            <span className="clip-title" style={{ color: !!markedClips[`${clip.start_time}_${clip.end_time}`] ? 'var(--accent-purple-text)' : 'var(--text-primary)', opacity: 1 }}>
                              {clip.title}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(clip.title, 'Title');
                              }}
                              className="clip-copy-title"
                              title={t.results.copyTitleTooltip}
                            >
                               {t.results.copyMini}
                            </button>
                          </div>
                          <div className="score-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span
                              className="timestamp-pill"
                              onClick={(e) => handleCopyTimestamp(clip, e)}
                              title={t.results.copyTimestampTooltip}
                            >
                               {formatSeconds(clip.start_time)} - {formatSeconds(clip.end_time)}
                            </span>
                            <span>{t.results.durationLabel(formatSeconds(clip.end_time - clip.start_time))}</span>
                            {clip.hook_time !== undefined && (
                              <span
                                className="clip-hook-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSeek(clip.hook_time!);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontSize: '0.72rem',
                                  fontWeight: 'bold',
                                  color: 'var(--accent-purple-text)',
                                  background: 'var(--accent-purple-soft)',
                                  border: '1px solid var(--accent-purple-border)',
                                  borderRadius: '4px',
                                  padding: '0.05rem 0.35rem',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                                title={t.results.hookClickHint}
                              >
                                {t.results.hookLabel(formatSeconds(clip.hook_time))}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                          <div className={`score-badge ${clip.virality_score >= 90 ? 'score-high' : 'score-medium'}`}>
                            <span></span>
                            <span>{t.results.viralityBadge(clip.virality_score)}</span>
                          </div>
                          {!!markedClips[`${clip.start_time}_${clip.end_time}`] && (
                            <div className="clip-marked-badge" style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.65rem',
                              fontWeight: 'bold',
                              color: 'var(--accent-purple-text)',
                              background: '#f2e8ff',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              border: '1px solid #d9b8fc'
                            }}>
                              {t.results.markedBadge}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="clip-detail-toggle-label"
                        aria-expanded={isDetailsOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveClip(clip);
                          setSelectedClipDetailKey(isDetailsOpen ? null : clipKey);
                        }}
                      >
                        {isDetailsOpen ? t.results.hideClipDetails : t.results.showClipDetails}
                      </button>

                      {/* Full details appear only for the selected clip */}
                      {clip.key_quotes && clip.key_quotes.length > 0 && (
                        <div className="clip-quotes">
                          {clip.key_quotes.map((quote, qIdx) => (
                            <div key={qIdx} className="quote-item">“{quote}”</div>
                          ))}
                        </div>
                      )}

                      {/* Suggestions: Title, Caption */}
                      {(clip.title_suggestion || clip.caption_suggestion) && (
                        <div className="clip-suggestions">
                          {clip.title_suggestion && (
                            <div className="suggestion-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <span className="suggestion-label">{t.results.titlePrefix}</span>{' '}
                                <span className="suggestion-value">{clip.title_suggestion}</span>
                              </div>
                              <button
                                type="button"
                                className="copy-mini-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyText(clip.title_suggestion!, 'Title');
                                }}
                                title={t.results.copyTitleTooltip}
                              >

                              </button>
                            </div>
                          )}
                          {clip.caption_suggestion && (
                            <div className="suggestion-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <span className="suggestion-label">{t.results.captionPrefix}</span>{' '}
                                <span className="suggestion-value">
                                  {(() => {
                                    const lowercaseHashtags = (clip.hashtag_suggestion || '').toLowerCase();
                                    if (!lowercaseHashtags) return clip.caption_suggestion;
                                    if (clip.caption_suggestion.toLowerCase().includes(lowercaseHashtags)) return clip.caption_suggestion;
                                    return `${clip.caption_suggestion} ${lowercaseHashtags}`;
                                  })()}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="copy-mini-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const captionText = (() => {
                                    const caption = clip.caption_suggestion || '';
                                    const lowercaseHashtags = (clip.hashtag_suggestion || '').toLowerCase();
                                    if (!lowercaseHashtags) return caption;
                                    if (caption.toLowerCase().includes(lowercaseHashtags)) return caption;
                                    return `${caption} ${lowercaseHashtags}`;
                                  })();
                                  handleCopyText(captionText, 'Caption');
                                }}
                                title={t.results.copyCaptionTooltip}
                              >

                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Row 1: Primary Actions (Preview Clip on Left, Download Clip on Right) */}
                      <div className="clip-primary-actions">
                        <button
                          type="button"
                          className="glowing-btn"
                          style={{ padding: '0.4rem 0.9rem', fontSize: '0.78rem', borderRadius: '8px', boxShadow: 'none', whiteSpace: 'nowrap' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            playClip(clip);
                          }}
                        >
                          {t.results.previewClip}
                        </button>

                        {(() => {
                          const clipKey = `${clip.start_time}_${clip.end_time}`;
                          const clipDlState = clipDownloadStates[clipKey];
                          const isDl = clipDlState?.status === 'downloading';
                          const isReady = clipDlState?.status === 'ready';

                          return (
                            <button
                              type="button"
                              className="form-input"
                              disabled={isDl}
                              style={{
                                width: 'auto',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.78rem',
                                borderRadius: '8px',
                                whiteSpace: 'nowrap',
                                cursor: isDl ? 'not-allowed' : 'pointer',
                                background: isReady
                                  ? 'rgba(172, 172, 172, 0.15)'
                                  : 'rgba(133, 133, 133, 0.12)',
                                border: isReady
                                  ? '1px solid rgba(172, 172, 172, 0.4)'
                                  : '1px solid rgba(133, 133, 133, 0.35)',
                                color: isReady
                                  ? '#c4c4c4'
                                  : '#555555',
                                fontWeight: 600,
                                transition: 'var(--transition-smooth)'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrimmerClip(clip);
                              }}
                              title={t.results.downloadRawClipTooltip}
                            >
                              {isDl ? (
                                <>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="spinner-icon" style={{ animation: 'spin 1s linear infinite' }}>
                                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8"></circle>
                                  </svg>
                                  <span>{t.results.downloadingRawClip}</span>
                                </>
                              ) : isReady ? (
                                <>
                                  <span> {t.results.downloadedRawClip}</span>
                                </>
                              ) : (
                                <>
                                  <span> {t.results.downloadRawClip}</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </div>

                      {/* Row 2: Secondary Utilities (Copy Timestamp, Copy Details, Show Transcript) */}
                      <div className="clip-secondary-actions">
                        <button
                          type="button"
                          className="form-input"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.76rem', width: 'auto', borderRadius: '7px', cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap' }}
                          onClick={(e) => handleCopyTimestamp(clip, e)}
                          title={t.results.copyTimestampTooltip}
                        >
                          {t.results.copyTimestamp}
                        </button>
                        <button
                          type="button"
                          className="form-input"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.76rem', width: 'auto', borderRadius: '7px', cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap' }}
                          onClick={(e) => handleCopyClip(clip, e)}
                        >
                          {t.results.copyDetails}
                        </button>
                        <button
                          type="button"
                          className="clip-transcript-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedClipIndex(isExpanded ? null : index);
                          }}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? t.results.hideTranscript : t.results.showTranscript}
                        </button>
                      </div>

                      {/* Expandable transcript text block */}
                      {isExpanded && (
                        <div
                          className="transcript-box"
                          onClick={(e) => e.stopPropagation()} /* Prevents collapse */
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>{t.results.transcriptTitle}</div>
                          {clip.transcript}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      )}

      {/* Global CSS spinner keyframe animation injection */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        .spinner-icon {
          animation: spin 1s linear infinite;
        }
        .pulsing-text {
          animation: pulse 2s infinite ease-in-out;
        }
        .nav-link:hover {
          color: var(--primary) !important;
        }
      `}</style>
      {/* Embedded Clip Studio Section with side inline batch progress */}
      {result && (
        <ClipStudioSection
          videoUrl={currentResultVideoUrl}
          videoId={result.video_id}
          allClips={result.clips}
          transcript={result.transcript}
          markedClips={markedClipsList}
          activeClip={activeClip}
          onStartRender={handleStartBatchRender}
          isRendering={isLaunchingRender}
          onToggleMarkClip={(clip) => toggleMarkedClip(`${clip.start_time}_${clip.end_time}`)}
          onToggleAllClips={toggleAllMarkedClips}
          batchProgress={batchProgress}
          isWorkspaceOpen={isStudioWorkspaceOpen}
          onExitWorkspace={() => setIsStudioWorkspaceOpen(false)}
          onDismissProgress={() => {
            if (batchEventSourceRef.current) {
              batchEventSourceRef.current.close();
              batchEventSourceRef.current = null;
            }
            setBatchProgress(null);
          }}
          onRetryClip={handleRetryBatchClip}
        />
      )}

      {/* YouTube Cookies Modal */}
      {isUserGuideOpen && <UserGuideModal onClose={() => setIsUserGuideOpen(false)} />}

      <CookiesModal
        isOpen={isCookiesModalOpen}
        onClose={() => setIsCookiesModalOpen(false)}
        onCookieStatusChange={setHasCookies}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* App Update & Restart Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />

      {/* Clip Trimmer & Context Editor Modal */}
      <ClipTrimmerModal
        isOpen={Boolean(trimmerClip)}
        clip={trimmerClip}
        videoId={result?.video_id || ''}
        videoUrl={result?.video_url}
        sourceType={result?.source_type}
        videoTitle={result?.title}
        videoDuration={result?.duration || 0}
        transcript={result?.transcript}
        onClose={() => setTrimmerClip(null)}
        onDownload={async (adjustedClip) => {
          handleApplyAdjustedClipToResults(adjustedClip);
          await handleDownloadRawClip(adjustedClip);
        }}
      />

      {/* Global Fancy Clear Temp Confirmation Modal */}
      {showGlobalClearModal && (
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
                <strong>{t.header.confirmModalCookieNotice}</strong>
              </div>
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-confirm-cancel"
                onClick={() => setShowGlobalClearModal(false)}
                disabled={isClearingGlobalTemp}
              >
                {t.studio.cancelBtn}
              </button>
              <button
                type="button"
                className="btn-confirm-purge"
                onClick={executeGlobalClearTemp}
                disabled={isClearingGlobalTemp}
              >
                {isClearingGlobalTemp ? t.studio.purgingBtn : t.studio.purgeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
      <footer className="dema-footer">
        <span className="dema-footer-copy">{t.header.developerCredit}</span>
        <a href="https://demadigitalasia.com" target="_blank" rel="noopener noreferrer">
          Dema Digital Asia
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9 2h5v5M14 2 7 9" /><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" /></svg>
        </a>
        <span className="dema-footer-period" aria-hidden="true">.</span>
      </footer>
    </div>
  );
}
