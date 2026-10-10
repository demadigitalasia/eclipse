"""Skema Pydantic backend — cermin kontrak handoff `07-PAKET-HANDOFF-GATE-A.md`.

Backend menegakkan batas di sini; frontend hanya validasi awal.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from backend.core.limits import ACCEPTED_EXTENSIONS, MAX_CLIPS_PER_ANALYZE

SourceMode = Literal["youtube", "drive", "upload"]
DurationPref = Literal["15s", "30s", "60s"]


def is_accepted_file(name: str) -> bool:
    lowered = name.lower()
    return any(lowered.endswith(ext) for ext in ACCEPTED_EXTENSIONS)


class IngestYoutubeBody(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class IngestDriveBody(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class JobAnalyzeBody(BaseModel):
    consent: bool = Field(description="Persetujuan eksplisit (B0); wajib true")
    duration: DurationPref = "30s"
    countMode: Literal["auto", "custom"] = Field(default="custom", alias="countMode")
    count: int = Field(default=6, ge=1, le=MAX_CLIPS_PER_ANALYZE)
    prompt: str = Field(default="", max_length=500)
    model: str = Field(default="gemini-3.8-flash", max_length=120)
    subtitle_source: Literal["youtube", "manual", "transcribe"] = Field(default="transcribe", alias="subtitleSource")
    manual_subtitle_text: Optional[str] = Field(default=None, alias="manualSubtitleText", max_length=512_000)

    model_config = {"populate_by_name": True}

    @field_validator("consent")
    @classmethod
    def _consent_required(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("consent wajib true (persetujuan pemrosesan B0)")
        return value


class JobRenderBody(BaseModel):
    clip_start: float = Field(alias="clipStart", ge=0)
    clip_end: float = Field(alias="clipEnd", gt=0)
    title_text: str = Field(default="", alias="titleText", max_length=120)
    with_subtitles: bool = Field(default=True, alias="withSubtitles")

    model_config = {"populate_by_name": True}


class RenderSubtitleSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("end")
    @classmethod
    def _valid_order(cls, value: float, info):
        start = info.data.get("start")
        if start is not None and value <= start:
            raise ValueError("Waktu akhir subtitle harus setelah waktu mulai.")
        return value

    @field_validator("text")
    @classmethod
    def _nonblank_text(cls, value: str):
        if not value.strip():
            raise ValueError("Teks subtitle tidak boleh kosong.")
        return value


class RenderClipBody(BaseModel):
    clip_key: str = Field(alias="clipKey", min_length=1, max_length=200)
    clip_start: float = Field(alias="clipStart", ge=0)
    clip_end: float = Field(alias="clipEnd", gt=0)
    hook_time: float = Field(default=0, alias="hookTime", ge=0)
    title: str = Field(default="", max_length=160)
    focal_x: Optional[int] = Field(default=None, alias="focalX", ge=0, le=100)
    focal_y: Optional[int] = Field(default=None, alias="focalY", ge=0, le=100)
    auto_focus: Optional[bool] = Field(default=None, alias="autoFocus")
    focus_anchor: Optional[Literal["left", "center", "right"]] = Field(default=None, alias="focusAnchor")
    segments: Optional[list[RenderSubtitleSegment]] = Field(default=None, max_length=300)

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _valid_clip_and_subtitles(self):
        if self.clip_end <= self.clip_start:
            raise ValueError("Waktu akhir klip harus setelah waktu mulai.")
        for segment in self.segments or []:
            if segment.start < self.clip_start or segment.end > self.clip_end:
                raise ValueError("Waktu subtitle harus berada di dalam rentang klip.")
        return self


class JobRenderBatchBody(BaseModel):
    client_job_id: Optional[str] = Field(default=None, alias="clientJobId", pattern=r"^render-[0-9a-f]{32}$")
    clips: list[RenderClipBody] = Field(min_length=1, max_length=5)
    title_text: str = Field(default="", alias="titleText", max_length=120)
    with_subtitles: bool = Field(default=True, alias="withSubtitles")
    aspect: Literal["9:16", "1:1", "4:3", "16:9", "16:9-landscape"] = "9:16"
    caption: Literal["viral_pop", "beast_punch", "cyber_violet", "fire_crimson", "electric_cyan", "golden_aura", "clean_minimal", "off"] = "viral_pop"
    title_font: Literal["inter", "montserrat"] = Field(default="inter", alias="titleFont")
    title_size: int = Field(default=75, alias="titleSize", ge=36, le=120)
    title_case: Literal["upper", "title", "lower"] = Field(default="upper", alias="titleCase")
    title_color: str = Field(default="#fff4e6", alias="titleColor", pattern=r"^#[0-9a-fA-F]{6}$")
    title_effect_color: str = Field(default="#100c08", alias="titleEffectColor", pattern=r"^#[0-9a-fA-F]{6}$")
    title_x: int = Field(default=50, alias="titleX", ge=0, le=100)
    title_y: int = Field(default=12, alias="titleY", ge=0, le=100)
    title_effect: Literal["shadow", "outline", "box", "glow"] = Field(default="shadow", alias="titleEffect")
    title_animation: Literal["none", "fade", "slide_up"] = Field(default="none", alias="titleAnimation")
    title_animation_duration_ms: int = Field(default=360, alias="titleAnimationDurationMs", ge=100, le=1500)
    caption_size: int = Field(default=75, alias="captionSize", ge=36, le=120)
    caption_font: Literal["inter", "montserrat"] = Field(default="montserrat", alias="captionFont")
    caption_color: str = Field(default="#ffd230", alias="captionColor", pattern=r"^#[0-9a-fA-F]{6}$")
    caption_effect_color: str = Field(default="#17100a", alias="captionEffectColor", pattern=r"^#[0-9a-fA-F]{6}$")
    caption_x: int = Field(default=50, alias="captionX", ge=0, le=100)
    caption_y: int = Field(default=21, alias="captionY", ge=0, le=100)
    caption_effect: Literal["outline", "box", "shadow"] = Field(default="outline", alias="captionEffect")
    caption_animation: Literal["none", "fade", "slide_up", "slide_left", "slide_right", "pop", "typewriter", "wipe", "karaoke"] = Field(default="none", alias="captionAnimation")
    caption_animation_duration_ms: int = Field(default=280, alias="captionAnimationDurationMs", ge=100, le=1500)
    caption_karaoke_color: str = Field(default="#ffffff", alias="captionKaraokeColor", pattern=r"^#[0-9a-fA-F]{6}$")
    bgm_asset: Optional[str] = Field(default=None, alias="bgmAsset", max_length=80)
    sfx_asset: Optional[str] = Field(default=None, alias="sfxAsset", max_length=80)
    source_volume: int = Field(default=100, alias="sourceVolume", ge=0, le=200)
    bgm_volume: int = Field(default=25, alias="bgmVolume", ge=0, le=100)
    sfx_volume: int = Field(default=80, alias="sfxVolume", ge=0, le=200)
    bgm_ducking: bool = Field(default=True, alias="bgmDucking")
    bgm_fade_in_ms: int = Field(default=400, alias="bgmFadeInMs", ge=0, le=5000)
    bgm_fade_out_ms: int = Field(default=700, alias="bgmFadeOutMs", ge=0, le=5000)
    bgm_start_ms: int = Field(default=0, alias="bgmStartMs", ge=0, le=15000)
    sfx_offset_ms: int = Field(default=0, alias="sfxOffsetMs", ge=-5000, le=5000)
    watermark_text: Optional[str] = Field(default=None, alias="watermarkText", max_length=60)
    watermark_asset: Optional[str] = Field(default=None, alias="watermarkAsset", max_length=100)
    watermark_size: int = Field(default=20, alias="watermarkSize", ge=5, le=40)
    watermark_opacity: int = Field(default=80, alias="watermarkOpacity", ge=0, le=100)
    watermark_x: int = Field(default=88, alias="watermarkX", ge=0, le=100)
    watermark_y: int = Field(default=8, alias="watermarkY", ge=0, le=100)
    filename_prefix: str = Field(default="", alias="filenamePrefix", max_length=40)
    filename_suffix: str = Field(default="", alias="filenameSuffix", max_length=40)
    encoder: Literal["auto", "nvenc", "amf", "qsv", "cpu"] = "auto"
    focal_x: int = Field(default=50, alias="focalX", ge=0, le=100)
    focal_y: int = Field(default=50, alias="focalY", ge=0, le=100)
    auto_focus: bool = Field(default=True, alias="autoFocus")
    focus_anchor: Literal["left", "center", "right"] = Field(default="center", alias="focusAnchor")

    model_config = {"populate_by_name": True}


class FocusPreviewBody(BaseModel):
    clip_start: float = Field(alias="clipStart", ge=0)
    clip_end: float = Field(alias="clipEnd", gt=0)
    aspect: Literal["9:16", "1:1", "4:3", "16:9", "16:9-landscape"] = "9:16"
    focus_anchor: Literal["left", "center", "right"] = Field(default="center", alias="focusAnchor")

    @field_validator("clip_end")
    @classmethod
    def _valid_clip_range(cls, value: float, info):
        start = info.data.get("clip_start")
        if start is not None and value <= start:
            raise ValueError("Waktu akhir klip harus setelah waktu mulai.")
        if start is not None and value - start > 300:
            raise ValueError("Rentang klip maksimal 300 detik.")
        return value

    model_config = {"populate_by_name": True}


class GeminiKeyCreate(BaseModel):
    alias: str = Field(min_length=1, max_length=120)
    project: str = Field(min_length=1, max_length=200)
    apiKey: str = Field(min_length=20, max_length=500)


class GeminiKeyUpdate(BaseModel):
    enabled: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=0, le=1000)
