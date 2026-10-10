"""Transkrip + kandidat baseline B3 (nyata, bukan mock).

- ASR: faster-whisper (CPU int8), bahasa auto-detect, VAD on.
- Kandidat: heuristik baseline transparan (densitas ucapan, confidence,
  kecocokan prompt, kepadatan hook awal). Skor adalah bantuan editorial,
  bukan jaminan performa. Baseline ini yang kelak dibandingkan dengan
  faster-whisper lanjutan/JEV (dok 01).
"""
import json
import html
import os
import re
import subprocess
import tempfile
import threading
import wave

_MODEL = None
_MODEL_LOCK = threading.Lock()
MODEL_NAME = "small"


def get_model():
    global _MODEL
    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                from faster_whisper import WhisperModel

                _MODEL = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
    return _MODEL


def transcript_path(job_path: str) -> str:
    return os.path.join(job_path, "transcript.json")


def save_transcript(job_path: str, payload: dict) -> None:
    with open(transcript_path(job_path), "w", encoding="utf-8") as out:
        json.dump(payload, out, ensure_ascii=False)


def candidates_path(job_path: str) -> str:
    return os.path.join(job_path, "candidates.json")


def _decode_audio_ffmpeg(media_path: str):
    """Decode ke float32 mono 16k via FFmpeg (bypass bug kwarg PyAV).

    faster-whisper menerima ndarray langsung; wave dibaca dengan stdlib.
    """
    import numpy as np

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        proc = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", media_path,
             "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav_path],
            capture_output=True, text=True, timeout=1800,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Decode audio gagal: {(proc.stderr or '').strip()[:200]}")
        with wave.open(wav_path, "rb") as wav:
            frames = wav.readframes(wav.getnframes())
        return (np.frombuffer(frames, dtype=np.int16).astype("float32") / 32768.0)
    finally:
        try:
            os.remove(wav_path)
        except OSError:
            pass


def transcribe_file(media_path: str, job_path: str, progress_callback=None) -> dict:
    """Jalankan ASR nyata; simpan transcript.json. Kembalikan dict-nya."""
    model = get_model()
    audio = _decode_audio_ffmpeg(media_path)
    segments, info = model.transcribe(
        audio, language=None, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    lines = []
    duration = float(info.duration or 0)
    last_reported = -1.0
    for segment in segments:
        text = segment.text.strip()
        if text:
            lines.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": text,
                "confidence": round(max(0.0, min(1.0, (segment.avg_logprob + 1.5) / 1.5)), 3),
            })
        if progress_callback and duration > 0:
            percent = min(99.0, max(0.0, float(segment.end) / duration * 100))
            if percent - last_reported >= 1.0:
                progress_callback(percent)
                last_reported = percent
    if progress_callback:
        progress_callback(100.0)
    result = {
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 2),
        "engine": f"faster-whisper-{MODEL_NAME}",
        "segments": lines,
    }
    with open(transcript_path(job_path), "w") as out:
        json.dump(result, out)
    return result


_SUBTITLE_TIME = re.compile(
    r"(?P<start>(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s+-->\s+"
    r"(?P<end>(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})"
)


def _subtitle_seconds(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    seconds = float(parts[-1])
    minutes = int(parts[-2])
    hours = int(parts[-3]) if len(parts) == 3 else 0
    return hours * 3600 + minutes * 60 + seconds


def parse_subtitle_text(content: str, duration: float) -> dict:
    """Convert SRT/VTT or plain TXT subtitles into timed transcript segments."""
    clean = html.unescape(content.replace("\ufeff", "")).replace("\r\n", "\n").replace("\r", "\n")
    segments: list[dict] = []
    for block in re.split(r"\n\s*\n", clean):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        timing_index = next((i for i, line in enumerate(lines) if _SUBTITLE_TIME.search(line)), None)
        if timing_index is None:
            continue
        match = _SUBTITLE_TIME.search(lines[timing_index])
        assert match is not None
        text = " ".join(lines[timing_index + 1:])
        text = re.sub(r"<[^>]*>", "", text)
        text = re.sub(r"\{\\[^}]*}", "", text).strip()
        if not text:
            continue
        try:
            start = max(0.0, min(duration, _subtitle_seconds(match.group("start"))))
            end = max(start, min(duration, _subtitle_seconds(match.group("end"))))
        except (ValueError, IndexError):
            continue
        if end > start:
            segments.append({"start": start, "end": end, "text": text, "confidence": 0.75})

    if not segments:
        # Plain TXT has no timing information. Spread sentence-sized cues over
        # the video so candidate timestamps remain usable, and keep this caveat
        # visible in the UI.
        text = re.sub(r"<[^>]*>", "", clean)
        lines = [line.strip() for line in text.splitlines() if line.strip() and line.strip().upper() != "WEBVTT"]
        plain = " ".join(line for line in lines if not re.fullmatch(r"\d+", line))
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", plain) if part.strip()]
        chunks: list[str] = []
        for sentence in sentences:
            words = sentence.split()
            chunks.extend(" ".join(words[i:i + 14]) for i in range(0, len(words), 14))
        total_words = sum(len(chunk.split()) for chunk in chunks)
        if duration > 0 and total_words:
            elapsed_words = 0
            for chunk in chunks:
                word_count = len(chunk.split())
                start = duration * elapsed_words / total_words
                elapsed_words += word_count
                end = duration * elapsed_words / total_words
                if end > start:
                    segments.append({"start": start, "end": end, "text": chunk, "confidence": 0.6})

    return {
        "language": "manual",
        "language_probability": 1.0,
        "duration": duration,
        "engine": "manual-subtitles",
        "segments": segments,
    }


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def score_window(text: str, confidence: float, prompt_words: set[str], is_first: bool) -> float:
    """Heuristik baseline 60–99. Transparan; lihat ringkasan kandidat."""
    density = min(1.0, len(_words(text)) / 45.0)
    overlap = 0.0
    if prompt_words:
        hits = len(prompt_words.intersection(_words(text)))
        overlap = min(1.0, hits / max(1, len(prompt_words)))
    score = 60 + 18 * density + 12 * confidence + 6 * overlap + (3 if is_first else 0)
    return round(min(99.0, max(60.0, score)), 1)


def build_candidates(
    transcript: dict, duration_pref: str, count: int, prompt: str, target_seconds: int
) -> dict:
    segments = transcript.get("segments", [])
    if not segments:
        return {"clips": [], "summary": "Tidak ada ucapan terdeteksi; kandidat kosong.", "heatmap": []}
    prompt_words = set(_words(prompt)) if prompt.strip() else set()
    windows: list[dict] = []
    i = 0
    while i < len(segments):
        start = segments[i]["start"]
        end_limit = start + target_seconds
        j = i
        text_parts: list[str] = []
        confs: list[float] = []
        while j < len(segments) and segments[j]["start"] < end_limit:
            text_parts.append(segments[j]["text"])
            confs.append(segments[j].get("confidence", 0.5))
            j += 1
        text = " ".join(text_parts)
        avg_conf = sum(confs) / max(1, len(confs))
        windows.append({
            "start": round(start, 2),
            "end": round(segments[j - 1]["end"], 2),
            "text": text,
            "confidence": round(avg_conf, 3),
        })
        i = j if j > i else i + 1
    for k, window in enumerate(windows):
        window["score"] = score_window(window["text"], window["confidence"], prompt_words, k == 0)
    windows.sort(key=lambda w: w["score"], reverse=True)
    chosen = windows[: max(1, count)]
    clips = [
        {
            "title": f"Kandidat {k + 1} — {w['text'][:60]}",
            "start_time": w["start"],
            "end_time": w["end"],
            "hook_time": round(w["start"] + 2, 2),
            "virality_score": w["score"],
            "transcript": w["text"],
            "caption": "Tonton sampai habis!",
            "evidence": f"confidence {w['confidence']}, {len(_words(w['text']))} kata",
        }
        for k, w in enumerate(chosen)
    ]
    # Heatmap kepadatan ucapan: jumlah kata yang tersebar pada rentang waktu
    # segmen. Confidence bukan sinyal yang tepat karena sering konstan.
    buckets = [0.0] * 100
    total = max(1.0, transcript.get("duration") or segments[-1]["end"])
    for seg in segments:
        start = max(0.0, min(total, float(seg.get("start", 0))))
        end = max(start + 0.25, min(total, float(seg.get("end", start + 1))))
        first = min(99, int(start / total * 100))
        last = min(99, int(end / total * 100))
        words = max(1, len(_words(seg.get("text", ""))))
        span = max(0.25, end - start)
        for idx in range(first, last + 1):
            bucket_start = idx / 100 * total
            bucket_end = (idx + 1) / 100 * total
            overlap = max(0.0, min(end, bucket_end) - max(start, bucket_start))
            buckets[idx] += words * overlap / span
    smooth = [
        (buckets[max(0, idx - 1)] * 0.2 + buckets[idx] * 0.6 + buckets[min(99, idx + 1)] * 0.2)
        for idx in range(100)
    ]
    peak = max(smooth, default=0.0)
    heatmap = [
        {"time": round(k / 99 * total, 2), "value": round(smooth[k] / peak, 3) if peak else 0.0}
        for k in range(100)
    ]
    summary = (
        f"Baseline nyata: {len(segments)} segmen ucapan "
        f"(bahasa {transcript.get('language')}, engine {transcript.get('engine')}). "
        f"Skor heuristik densitas+confidence+prompt; bukan jaminan performa."
    )
    return {"clips": clips, "summary": summary, "heatmap": heatmap, "duration_pref": duration_pref}


def save_candidates(job_path: str, payload: dict) -> None:
    with open(candidates_path(job_path), "w") as out:
        json.dump(payload, out)
