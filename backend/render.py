"""Render klip 9:16 B4 (nyata via FFmpeg).

- Crop tengah 9:16 + scale 1080x1920, H.264 + AAC, MP4.
- Subtitle dari segmen transkrip pada rentang klip (filter subtitles/libass).
- Judul overlay via drawtext bila font sistem tersedia; tanpanya klip
  tetap dirender (judul dicatat di nama file/metadata).
"""
import os
import re
import math
import importlib.util
from pathlib import Path
import shlex
import subprocess
import uuid

FONT_CANDIDATES = {
    "inter": [
        "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
    "montserrat": [
        "/usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
}


_FILTER_CACHE: dict[str, bool] = {}
_ENCODER_CACHE: dict[str, bool] | None = None
FOCUS_MODEL_DIR = Path(__file__).resolve().parent / "models" / "focus"
FACE_MODEL_PATH = FOCUS_MODEL_DIR / "blaze_face_short_range.tflite"
PERSON_MODEL_PATH = FOCUS_MODEL_DIR / "efficientdet_lite0.tflite"


def get_encoder_capabilities() -> dict:
    global _ENCODER_CACHE
    if _ENCODER_CACHE is None:
        try:
            proc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=30)
            output = f"{proc.stdout}\n{proc.stderr}"
            _ENCODER_CACHE = {
                "nvenc": bool(re.search(r"\bh264_nvenc\b", output)),
                "amf": bool(re.search(r"\bh264_amf\b", output)),
                "qsv": bool(re.search(r"\bh264_qsv\b", output)),
                "cpu": bool(re.search(r"\blibx264\b", output)),
            }
        except (FileNotFoundError, subprocess.TimeoutExpired):
            _ENCODER_CACHE = {"nvenc": False, "amf": False, "qsv": False, "cpu": False}
    recommended = next((name for name in ("nvenc", "amf", "qsv", "cpu") if _ENCODER_CACHE[name]), "cpu")
    return {"encoders": dict(_ENCODER_CACHE), "recommended": recommended}


def face_detection_available() -> bool:
    return importlib.util.find_spec("mediapipe") is not None and FACE_MODEL_PATH.is_file()


def person_detection_available() -> bool:
    return importlib.util.find_spec("mediapipe") is not None and PERSON_MODEL_PATH.is_file()


def ai_focus_available() -> bool:
    return face_detection_available() and person_detection_available()


def auto_focus_available() -> bool:
    """True when OpenCV can sample frames and calculate a motion focus fallback."""
    if importlib.util.find_spec("cv2") is None or importlib.util.find_spec("numpy") is None:
        return False
    try:
        import cv2
        import numpy
        return all(callable(getattr(cv2, name, None)) for name in ("VideoCapture", "resize", "cvtColor", "absdiff")) and hasattr(cv2, "CAP_PROP_FPS")
    except ImportError:
        return False


def has_filter(name: str) -> bool:
    """Cek ketersediaan filter FFmpeg (mis. drawtext tak ada di semua build)."""
    if name not in _FILTER_CACHE:
        try:
            proc = subprocess.run(
                ["ffmpeg", "-hide_banner", "-filters"],
                capture_output=True, text=True, timeout=60,
            )
            _FILTER_CACHE[name] = f" {name} " in f" {proc.stdout} ".replace("\n", " ")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            _FILTER_CACHE[name] = False
    return _FILTER_CACHE[name]


def find_font(family: str = "inter") -> str | None:
    for path in FONT_CANDIDATES.get(family, FONT_CANDIDATES["inter"]):
        if os.path.exists(path):
            return path
    return None


def _has_audio(path: str) -> bool:
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=30,
        )
        return probe.returncode == 0 and bool(probe.stdout.strip())
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _smooth_focus_track(track: list[tuple[float, float, float]]) -> list[tuple[float, float, float]]:
    """Reduce detector jitter while keeping faster subject movement responsive (One Euro filter)."""
    points = sorted(track, key=lambda point: point[0])
    if len(points) < 2:
        return points

    def alpha(dt: float, cutoff: float) -> float:
        tau = 1 / (2 * math.pi * cutoff)
        return 1 / (1 + tau / max(dt, 1e-3))

    filtered = [points[0]]
    previous_raw_x, previous_raw_y = points[0][1], points[0][2]
    filtered_x, filtered_y = previous_raw_x, previous_raw_y
    filtered_dx = filtered_dy = 0.0
    previous_time = points[0][0]
    min_cutoff = 0.9
    beta = 0.025

    for timestamp, raw_x, raw_y in points[1:]:
        dt = max(1e-3, timestamp - previous_time)
        derivative_alpha = alpha(dt, 1.0)
        raw_dx = (raw_x - previous_raw_x) / dt
        raw_dy = (raw_y - previous_raw_y) / dt
        filtered_dx += derivative_alpha * (raw_dx - filtered_dx)
        filtered_dy += derivative_alpha * (raw_dy - filtered_dy)
        filtered_x += alpha(dt, min_cutoff + beta * abs(filtered_dx)) * (raw_x - filtered_x)
        filtered_y += alpha(dt, min_cutoff + beta * abs(filtered_dy)) * (raw_y - filtered_y)
        filtered.append((timestamp, filtered_x, filtered_y))
        previous_raw_x, previous_raw_y = raw_x, raw_y
        previous_time = timestamp

    return filtered


def detect_auto_focus(path: str, start: float, end: float, aspect: str, focus_anchor: str = "center") -> dict | None:
    """Detect a persistent face/person with local MediaPipe models, then fall back to motion."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        return None
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    duration = max(0.1, end - start)
    # More frequent samples give the crop track enough points to follow natural movement.
    sample_count = max(8, min(60, int(np.ceil(duration * 3.0))))
    times = [start + duration * (0.04 + 0.92 * index / max(1, sample_count - 1)) for index in range(sample_count)]
    anchor_x = {"left": 0.35, "center": 0.5, "right": 0.65}.get(focus_anchor, 0.5)
    times = [float(value) for value in times]
    frames: list = []
    sampled: list = []
    sampled_times: list[float] = []
    width = height = 0
    for timestamp in times:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(timestamp * fps))
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        height, width = frame.shape[:2]
        scale = min(1.0, 640 / width)
        small = cv2.resize(frame, (int(width * scale), int(height * scale))) if scale < 1 else frame
        gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        frames.append(small)
        sampled.append(gray)
        sampled_times.append(timestamp)
    capture.release()
    if not width or not height:
        return None

    face_observations: list[tuple[float, float, float, int, float]] = []
    person_observations: list[tuple[float, float, float, int, float]] = []
    mediapipe_available = importlib.util.find_spec("mediapipe") is not None
    if mediapipe_available and frames:
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision

            face_detector = None
            person_detector = None
            if FACE_MODEL_PATH.is_file():
                face_options = vision.FaceDetectorOptions(
                    base_options=python.BaseOptions(model_asset_path=str(FACE_MODEL_PATH)),
                    running_mode=vision.RunningMode.VIDEO,
                    min_detection_confidence=0.45,
                )
                face_detector = vision.FaceDetector.create_from_options(face_options)
            if PERSON_MODEL_PATH.is_file():
                person_options = vision.ObjectDetectorOptions(
                    base_options=python.BaseOptions(model_asset_path=str(PERSON_MODEL_PATH)),
                    running_mode=vision.RunningMode.VIDEO,
                    max_results=8,
                    score_threshold=0.35,
                    category_allowlist=["person"],
                )
                person_detector = vision.ObjectDetector.create_from_options(person_options)

            last_timestamp_ms = -1
            for sample_index, (frame, timestamp) in enumerate(zip(frames, sampled_times)):
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                timestamp_ms = max(last_timestamp_ms + 1, int(round((timestamp - start) * 1000)))
                last_timestamp_ms = timestamp_ms
                if face_detector:
                    result = face_detector.detect_for_video(image, timestamp_ms)
                    for detection in result.detections:
                        box = detection.bounding_box
                        box_w, box_h = box.width / frame.shape[1], box.height / frame.shape[0]
                        if box_w <= 0 or box_h <= 0:
                            continue
                        center_x = (box.origin_x + box.width / 2) / frame.shape[1]
                        center_y = (box.origin_y + box.height / 2) / frame.shape[0]
                        score = max((category.score for category in detection.categories), default=0.5)
                        face_observations.append((center_x, center_y, box_w * box_h, sample_index, float(score)))
                if person_detector:
                    result = person_detector.detect_for_video(image, timestamp_ms)
                    for detection in result.detections:
                        box = detection.bounding_box
                        box_w, box_h = box.width / frame.shape[1], box.height / frame.shape[0]
                        if box_w <= 0 or box_h <= 0:
                            continue
                        center_x = (box.origin_x + box.width / 2) / frame.shape[1]
                        center_y = (box.origin_y + box.height / 2) / frame.shape[0]
                        score = max((category.score for category in detection.categories), default=0.5)
                        person_observations.append((center_x, center_y, box_w * box_h, sample_index, float(score)))
            if face_detector:
                face_detector.close()
            if person_detector:
                person_detector.close()
        except Exception:
            # Preserve the established motion fallback if a model cannot initialize on this server.
            face_observations.clear()
            person_observations.clear()

    def choose_stable_target(observations: list[tuple[float, float, float, int, float]]):
        clusters: list[list[tuple[float, float, float, int, float]]] = []
        for observation in observations:
            center_x, center_y = observation[0], observation[1]
            cluster = next((candidate for candidate in clusters if (
                (sum(item[0] for item in candidate) / len(candidate) - center_x) ** 2
                + (sum(item[1] for item in candidate) / len(candidate) - center_y) ** 2
            ) ** 0.5 < 0.28), None)
            if cluster is None:
                clusters.append([observation])
            else:
                cluster.append(observation)
        if not clusters:
            return None
        stable = [candidate for candidate in clusters if len({item[3] for item in candidate}) >= min(2, len(frames))]
        candidates = stable or clusters
        return max(candidates, key=lambda candidate: (
            len({item[3] for item in candidate})
            * (sum(item[4] for item in candidate) / len(candidate))
            * (0.7 + (sum(item[2] for item in candidate) / len(candidate)) ** 0.5)
        ))

    face_target = choose_stable_target(face_observations)
    person_target = choose_stable_target(person_observations)
    if face_target and len({item[3] for item in face_target}) >= min(2, len(frames)):
        subject_target = face_target
        mode = "face"
    elif person_target:
        subject_target = person_target
        mode = "person"
    elif face_target:
        subject_target = face_target
        mode = "face"
    else:
        subject_target = None
        mode = "motion"

    if subject_target:
        observations_by_sample: dict[int, list[tuple[float, float, float, int, float]]] = {}
        for observation in subject_target:
            observations_by_sample.setdefault(observation[3], []).append(observation)
        track: list[tuple[float, float, float]] = []
        for sample_index in sorted(observations_by_sample):
            detections = observations_by_sample[sample_index]
            track.append((
                sampled_times[sample_index] - start,
                sum(item[0] for item in detections) / len(detections),
                sum(item[1] for item in detections) / len(detections),
            ))
        matching_samples = len(observations_by_sample)
        confidence = sum(item[4] for item in subject_target) / len(subject_target)
        focus_x = sum(point[1] for point in track) / len(track)
        focus_y = sum(point[2] for point in track) / len(track)
    else:
        cascade = None
        cascade_classifier = getattr(cv2, "CascadeClassifier", None)
        cascade_data = getattr(getattr(cv2, "data", None), "haarcascades", None)
        if callable(cascade_classifier) and cascade_data:
            candidate = cascade_classifier(os.path.join(cascade_data, "haarcascade_frontalface_default.xml"))
            if not candidate.empty():
                cascade = candidate
        legacy_faces: list[tuple[float, float, float, int]] = []
        if cascade:
            for sample_index, gray in enumerate(sampled):
                boxes = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(36, 36))
                for x, y, box_w, box_h in boxes:
                    legacy_faces.append(((x + box_w / 2) / gray.shape[1], (y + box_h / 2) / gray.shape[0], (box_w * box_h) / (gray.shape[0] * gray.shape[1]), sample_index))
        if legacy_faces:
            clusters: list[list[tuple[float, float, float, int]]] = []
            for face in legacy_faces:
                cluster = next((candidate for candidate in clusters if (
                    (sum(item[0] for item in candidate) / len(candidate) - face[0]) ** 2
                    + (sum(item[1] for item in candidate) / len(candidate) - face[1]) ** 2
                ) ** 0.5 < 0.32), None)
                if cluster is None:
                    clusters.append([face])
                else:
                    cluster.append(face)
            subject_target = max(clusters, key=len)
            mode = "face-legacy"
            track = [(sampled_times[item[3]] - start, item[0], item[1]) for item in subject_target]
            matching_samples = len({item[3] for item in subject_target})
            confidence = 0.0
            focus_x = sum(item[0] for item in subject_target) / len(subject_target)
            focus_y = sum(item[1] for item in subject_target) / len(subject_target)
        else:
            focus_x = focus_y = None
            track = []
            matching_samples = 0
            confidence = 0.0

    if focus_x is None and len(sampled) >= 2:
        motion_points: list[tuple[float, float, float]] = []
        for index, (previous, current) in enumerate(zip(sampled, sampled[1:])):
            motion = cv2.absdiff(previous, current)
            # Large whole-frame differences are often cuts or camera movement; do not treat them as a subject.
            if float(np.mean(motion)) >= 35:
                continue
            threshold = float(np.percentile(motion, 88))
            ys, xs = np.where(motion >= max(10.0, threshold))
            if len(xs) < 20 or len(xs) > motion.size * 0.3:
                continue
            motion_points.append(((sampled_times[index] + sampled_times[index + 1]) / 2 - start, float(xs.mean() / motion.shape[1]), float(ys.mean() / motion.shape[0])))
        if motion_points:
            # A short moving average limits jitter from noisy frame differences.
            for index, (timestamp, _, _) in enumerate(motion_points):
                neighborhood = motion_points[max(0, index - 1): min(len(motion_points), index + 2)]
                track.append((timestamp, sum(point[1] for point in neighborhood) / len(neighborhood), sum(point[2] for point in neighborhood) / len(neighborhood)))
            focus_x = sum(point[1] for point in motion_points) / len(motion_points)
            focus_y = sum(point[2] for point in motion_points) / len(motion_points)
            mode = "motion"

    if focus_x is None:
        return {"found": False, "mode": "center", "focal_x": 50, "focal_y": 50, "sampled_frames": len(sampled)}
    output_ratio = {"9:16": 9 / 16, "1:1": 1.0, "4:3": 4 / 3, "16:9": 9 / 16, "16:9-landscape": 16 / 9}.get(aspect, 9 / 16)
    crop_width_fraction = min(1.0, (height * output_ratio) / width)
    crop_height_fraction = min(1.0, (width / output_ratio) / height)

    # Keep the target on a deliberate output-side anchor rather than conflating it with the source crop slider.
    def crop_position(subject_x: float, subject_y: float) -> tuple[float, float]:
        left = 0.5 if crop_width_fraction >= 1 else (subject_x - crop_width_fraction * anchor_x) / (1 - crop_width_fraction)
        top = 0.5 if crop_height_fraction >= 1 else (subject_y - crop_height_fraction * 0.5) / (1 - crop_height_fraction)
        return round(max(0, min(1, left)) * 100, 3), round(max(0, min(1, top)) * 100, 3)

    focal_x, focal_y = crop_position(focus_x, focus_y)
    keyframes = []
    crop_track = _smooth_focus_track([
        (timestamp, *crop_position(subject_x, subject_y))
        for timestamp, subject_x, subject_y in track
    ])
    for timestamp, point_x, point_y in crop_track:
        keyframes.append({"time": round(max(0, timestamp), 3), "focal_x": round(point_x, 2), "focal_y": round(point_y, 2)})
    if not keyframes:
        keyframes = [{"time": 0.0, "focal_x": focal_x, "focal_y": focal_y}]
    return {
        "found": True, "mode": mode,
        "focal_x": focal_x,
        "focal_y": focal_y,
        "sampled_frames": len(sampled),
        **({"matching_samples": matching_samples} if mode in {"face", "person", "face-legacy"} else {}),
        **({"confidence": round(confidence, 3)} if confidence else {}),
        "target_anchor": focus_anchor if focus_anchor in {"left", "center", "right"} else "center",
        "keyframes": keyframes,
    }


def focus_expression(keyframes: list[dict], axis: str, duration: float) -> str:
    """Build a bounded, linearly interpolated FFmpeg crop expression from clip-relative keyframes."""
    points = sorted(
        (max(0.0, min(duration, float(point.get("time", 0)))), max(0.0, min(100.0, float(point.get(axis, 50)))))
        for point in keyframes
    )
    if not points:
        return "50"
    compact: list[tuple[float, float]] = []
    for timestamp, value in points:
        if compact and timestamp <= compact[-1][0]:
            compact[-1] = (timestamp, value)
        else:
            compact.append((timestamp, value))
    if len(compact) == 1:
        return f"{compact[0][1]:.3f}"
    expression = f"{compact[-1][1]:.3f}"
    for index in range(len(compact) - 2, -1, -1):
        first_time, first_value = compact[index]
        next_time, next_value = compact[index + 1]
        if next_time <= first_time:
            expression = f"{next_value:.3f}"
            continue
        linear = f"{first_value:.3f}+({next_value:.3f}-{first_value:.3f})*(t-{first_time:.3f})/{next_time - first_time:.3f}"
        expression = f"if(lt(t,{next_time:.3f}),{linear},{expression})"
    return f"if(lt(t,{compact[0][0]:.3f}),{compact[0][1]:.3f},{expression})"


def create_title_overlay(title: str, path: str, width: int, height: int, font_size: int, x_percent: int, y_percent: int, font_family: str, effect: str = "shadow", text_color: str = "#fff4e6", effect_color: str = "#100c08") -> None:
    """Render a real transparent title layer when FFmpeg lacks drawtext."""
    from PIL import Image, ImageDraw, ImageFont

    font_path = find_font(font_family)
    if not font_path:
        raise RuntimeError("Font server tidak tersedia untuk membuat overlay judul.")
    font = ImageFont.truetype(font_path, font_size)
    def rgb(color: str, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color or ""):
            return fallback
        return tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))
    fill_rgb = rgb(text_color, (255, 244, 230))
    effect_rgb = rgb(effect_color, (16, 12, 8))
    text = title.strip()[:120]
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and (len(candidate) > 30 or draw.textbbox((0, 0), candidate, font=font)[2] > width * 0.84):
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    lines = lines[:3]
    boxes = [draw.textbbox((0, 0), line, font=font, stroke_width=1) for line in lines]
    line_height = max((box[3] - box[1] for box in boxes), default=58) + 14
    block_height = len(lines) * line_height
    top = int(height * y_percent / 100)
    center_x = max(0, min(width, width * x_percent / 100))
    block_width = int(width * 0.84)
    side = max(0, min(width - block_width, int(center_x - block_width / 2)))
    if effect == "box":
        draw.rounded_rectangle((side, top - 28, side + block_width, top + block_height + 18), radius=max(12, int(width * 0.022)), fill=(*effect_rgb, 210))
    for index, line in enumerate(lines):
        box = boxes[index]
        x = center_x - (box[2] - box[0]) / 2
        y = top + index * line_height
        if effect == "glow":
            for blur in (8, 5, 2):
                draw.text((x, y), line, font=font, fill=(*fill_rgb, 255), stroke_width=blur, stroke_fill=(*effect_rgb, 110))
        elif effect == "shadow":
            draw.text((x + 3, y + 4), line, font=font, fill=(*effect_rgb, 190), stroke_width=2, stroke_fill=(*effect_rgb, 190))
        draw.text((x, y), line, font=font, fill=(*fill_rgb, 255), stroke_width=5 if effect == "outline" else 1, stroke_fill=(*effect_rgb, 255))
    image.save(path)


def _srt_time(sec: float) -> str:
    sec = max(0.0, sec)
    hours = int(sec // 3600)
    minutes = int((sec % 3600) // 60)
    seconds = int(sec % 60)
    millis = int(round((sec - int(sec)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def write_srt(segments: list[dict], start: float, end: float, path: str) -> int:
    """Tulis subtitle segmen yang beririsan rentang klip. Kembalikan jumlah baris."""
    rows = [s for s in segments if s["end"] > start and s["start"] < end]
    with open(path, "w") as out:
        for i, seg in enumerate(rows, 1):
            local_start = max(0.0, float(seg["start"]) - start)
            local_end = min(end - start, float(seg["end"]) - start)
            if local_end <= local_start:
                continue
            out.write(f"{i}\n{_srt_time(local_start)} --> {_srt_time(local_end)}\n{seg['text']}\n\n")
    return len(rows)


def _hex_to_ass(color: str, alpha: int = 0) -> str:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color or ""):
        color = "#ffd230"
    red, green, blue = (int(color[index:index + 2], 16) for index in (1, 3, 5))
    return f"&H{max(0, min(255, alpha)):02X}{blue:02X}{green:02X}{red:02X}"


def write_ass_positions(srt_path: str, ass_path: str, width: int, height: int, x_percent: int, y_percent: int, font_size: int, primary: str, outline: str, border: int, bold: bool, effect: str = "outline", animation: str = "none", font_name: str = "Inter", effect_color: str = "#17100a", animation_duration_ms: int = 280, karaoke_color: str = "#ffffff") -> None:
    """Convert generated SRT rows to ASS so burned captions can follow the preview position."""
    def ass_time(value: str) -> str:
        hours, minutes, seconds = value.replace(",", ".").split(":")
        centiseconds = int(float(seconds) * 100) % 100
        return f"{int(hours)}:{minutes}:{int(float(seconds)):02d}.{centiseconds:02d}"

    def timestamp_seconds(value: str) -> float:
        hours, minutes, seconds = value.replace(",", ".").split(":")
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)

    def ass_centiseconds(value: float) -> str:
        total = max(0, round(value * 100))
        hours, remainder = divmod(total, 360000)
        minutes, remainder = divmod(remainder, 6000)
        seconds, centiseconds = divmod(remainder, 100)
        return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"

    def escape_ass(value: str) -> str:
        return value.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")

    def progressive_text(raw_lines: list[str], total_cs: int, by_word: bool) -> str:
        """Build ASS karaoke syllables, weighted by word or character count."""
        if not by_word:
            characters = [(line_index, character) for line_index, line in enumerate(raw_lines) for character in line]
            if not characters:
                return r"\N".join(escape_ass(line) for line in raw_lines)
            total_ms = max(1, total_cs * 10)
            output_text: list[str] = []
            character_index = 0
            for line_index, line in enumerate(raw_lines):
                if line_index:
                    output_text.append(r"\N")
                for character in line:
                    start_ms = round(total_ms * character_index / len(characters))
                    end_ms = max(start_ms + 1, round(total_ms * (character_index + 1) / len(characters)))
                    output_text.append(f"{{\\alpha&HFF&\\t({start_ms},{end_ms},\\alpha&H00&)}}{escape_ass(character)}")
                    character_index += 1
            return "".join(output_text)
        tokens: list[tuple[str, bool]] = []
        for line_index, raw_line in enumerate(raw_lines):
            if line_index:
                tokens.append((r"\N", False))
            if by_word:
                tokens.extend((token, not token.isspace()) for token in re.findall(r"\s+|[^\s]+", raw_line))
            else:
                tokens.extend((character, True) for character in raw_line)
        timed_indexes = [index for index, (token, timed) in enumerate(tokens) if timed and token != r"\N"]
        total_weight = sum(max(1, len(tokens[index][0].strip())) for index in timed_indexes)
        if not timed_indexes or total_weight == 0:
            return r"\N".join(escape_ass(line) for line in raw_lines)
        result: list[str] = []
        elapsed_weight = 0
        previous_cs = 0
        durations: dict[int, int] = {}
        for index in timed_indexes:
            elapsed_weight += max(1, len(tokens[index][0].strip()))
            boundary_cs = round(total_cs * elapsed_weight / total_weight)
            durations[index] = max(0, boundary_cs - previous_cs)
            previous_cs = boundary_cs
        for index, (token, timed) in enumerate(tokens):
            if index in durations:
                result.append(f"{{\\k{durations[index]}}}")
            result.append(token if token == r"\N" else escape_ass(token))
        return "".join(result)

    outline_size = 0 if effect == "box" else 5 if effect == "outline" else 2
    shadow_size = 3 if effect == "shadow" else 0
    border_style = 3 if effect == "box" else 1
    base_primary = _hex_to_ass(primary)
    karaoke = _hex_to_ass(karaoke_color)
    if animation == "karaoke":
        primary, secondary = karaoke, base_primary
    elif animation == "typewriter":
        primary, secondary = base_primary, _hex_to_ass(primary, 0xFF)
    else:
        primary, secondary = base_primary, karaoke
    outline = _hex_to_ass(effect_color)
    back = _hex_to_ass(effect_color, 0x80)
    duration_cs = max(10, min(150, round(animation_duration_ms / 10)))
    with open(srt_path, "r", encoding="utf-8") as source:
        blocks = source.read().strip().split("\n\n")
    x = round(width * max(0, min(100, x_percent)) / 100)
    y = round(height * (100 - max(0, min(100, y_percent))) / 100)
    with open(ass_path, "w", encoding="utf-8") as output:
        output.write(
            f"[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
            f"Style: Default,{font_name},{font_size},{primary},{secondary},{outline},{back},{-1 if bold else 0},0,{border_style},{outline_size},{shadow_size},2,20,20,20,1\n\n"
            "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n"
        )
        for block in blocks:
            lines = block.splitlines()
            if len(lines) < 3 or " --> " not in lines[1]:
                continue
            start_time, end_time = lines[1].split(" --> ", 1)
            raw_text_lines = lines[2:]
            text = r"\N".join(escape_ass(line) for line in raw_text_lines)
            start_seconds = timestamp_seconds(start_time)
            end_seconds = timestamp_seconds(end_time)
            line_duration = max(0.01, end_seconds - start_seconds)
            line_animation_cs = min(duration_cs, max(10, round(line_duration * 50)))
            tags = f"\\an2\\pos({x},{y})"
            if animation in {"typewriter", "karaoke"}:
                progressive_cs = max(1, min(round(line_duration * 100), duration_cs)) if animation == "typewriter" else max(1, round(line_duration * 100))
                progressive = progressive_text(raw_text_lines, progressive_cs, animation == "karaoke")
                output.write(f"Dialogue: 0,{ass_time(start_time)},{ass_time(end_time)},Default,,0,0,0,,{{{tags}}}{progressive}\n")
            elif animation == "wipe":
                reveal_ms = max(100, min(animation_duration_ms, round(line_duration * 1000)))
                tags = f"\\an2\\pos({x},{y})\\clip(0,0,0,{height})\\t(0,{reveal_ms},\\clip(0,0,{width},{height}))"
                output.write(f"Dialogue: 0,{ass_time(start_time)},{ass_time(end_time)},Default,,0,0,0,,{{{tags}}}{text}\n")
            elif animation == "pop":
                pop_ms = max(100, min(animation_duration_ms, round(line_duration * 500)))
                tags = f"\\an2\\pos({x},{y})\\fscx78\\fscy78\\alpha&HFF&\\t(0,{pop_ms},\\fscx100\\fscy100\\alpha&H00&)"
                output.write(f"Dialogue: 0,{ass_time(start_time)},{ass_time(end_time)},Default,,0,0,0,,{{{tags}}}{text}\n")
            elif animation == "fade":
                tags += f"\\fad({line_animation_cs},{line_animation_cs})"
                output.write(f"Dialogue: 0,{ass_time(start_time)},{ass_time(end_time)},Default,,0,0,0,,{{{tags}}}{text}\n")
            elif animation in {"slide_up", "slide_left", "slide_right"}:
                distance = max(12, round(height * 0.035))
                animation_seconds = line_animation_cs / 100
                if line_duration > animation_seconds * 2:
                    enter_end = start_seconds + animation_seconds
                    exit_start = end_seconds - animation_seconds
                    dx = distance if animation == "slide_left" else -distance if animation == "slide_right" else 0
                    dy = distance if animation == "slide_up" else 0
                    enter_tags = f"\\an2\\move({x + dx},{y + dy},{x},{y},0,{line_animation_cs * 10})\\fad({max(1, line_animation_cs // 2)},0)"
                    exit_tags = f"\\an2\\move({x},{y},{x - dx},{y - dy},0,{line_animation_cs * 10})\\fad(0,{max(1, line_animation_cs // 2)})"
                    static_tags = f"\\an2\\pos({x},{y})"
                    output.write(f"Dialogue: 0,{ass_centiseconds(start_seconds)},{ass_centiseconds(enter_end)},Default,,0,0,0,,{{{enter_tags}}}{text}\n")
                    if exit_start > enter_end:
                        output.write(f"Dialogue: 0,{ass_centiseconds(enter_end)},{ass_centiseconds(exit_start)},Default,,0,0,0,,{{{static_tags}}}{text}\n")
                    output.write(f"Dialogue: 0,{ass_centiseconds(exit_start)},{ass_centiseconds(end_seconds)},Default,,0,0,0,,{{{exit_tags}}}{text}\n")
                else:
                    tags = f"\\an2\\pos({x},{y})\\fad({line_animation_cs},{line_animation_cs})"
                    output.write(f"Dialogue: 0,{ass_time(start_time)},{ass_time(end_time)},Default,,0,0,0,,{{{tags}}}{text}\n")
            else:
                output.write(f"Dialogue: 0,{ass_time(start_time)},{ass_time(end_time)},Default,,0,0,0,,{{{tags}}}{text}\n")


def render_clip(
    source_path: str, job_path: str, start: float, end: float,
    title_text: str, with_subtitles: bool, segments: list[dict], caption_style: str = "viral_pop",
    aspect: str = "9:16", title_size: int = 75, title_case: str = "upper", title_y: int = 12,
    caption_size: int = 75, caption_y: int = 21, title_font: str = "inter",
    bgm_path: str | None = None, sfx_path: str | None = None, hook_offset: float = 0,
    source_volume: int = 100, bgm_volume: int = 25, sfx_volume: int = 80, bgm_ducking: bool = True,
    bgm_fade_in_ms: int = 400, bgm_fade_out_ms: int = 700, watermark_text: str | None = None,
    encoder: str = "auto", filename_prefix: str = "", filename_suffix: str = "",
    focal_x: int = 50, focal_y: int = 50, watermark_image_path: str | None = None,
    watermark_size: int = 20, watermark_opacity: int = 80, watermark_x: int = 88, watermark_y: int = 8,
    title_x: int = 50, caption_x: int = 50,
    title_effect: str = "shadow", title_animation: str = "none", caption_effect: str = "outline", caption_animation: str = "none",
    bgm_start_ms: int = 0, sfx_offset_ms: int = 0, focus_track: list[dict] | None = None,
    title_color: str = "#fff4e6", title_effect_color: str = "#100c08", title_animation_duration_ms: int = 360,
    caption_font: str = "montserrat", caption_color: str = "#ffd230", caption_effect_color: str = "#17100a", caption_animation_duration_ms: int = 280, caption_karaoke_color: str = "#ffffff",
) -> dict:
    if end <= start:
        raise ValueError("Rentang klip tidak valid (akhir harus > awal).")
    if end - start > 300:
        raise ValueError("Klip maksimal 5 menit pada MVP.")
    clip_id = uuid.uuid4().hex[:8]
    def filename_part(value: str) -> str:
        return re.sub(r"[^\w.-]+", "-", value, flags=re.UNICODE).strip("-._")[:40]
    base = filename_part(title_text) or f"clip_{int(start)}_{int(end)}"
    prefix, suffix = filename_part(filename_prefix), filename_part(filename_suffix)
    out_name = "_".join(part for part in (prefix, base, suffix, clip_id) if part) + ".mp4"
    out_path = os.path.join(job_path, out_name)
    srt_path = os.path.join(job_path, f"clip_{clip_id}.srt")
    title_path = os.path.join(job_path, f"clip_{clip_id}_title.png")
    output_size = {
        "9:16": (1080, 1920), "1:1": (1080, 1080), "4:3": (1440, 1080),
        "16:9": (1080, 1920), "16:9-landscape": (1920, 1080),
    }.get(aspect, (1080, 1920))
    width, height = output_size
    if aspect == "16:9":
        filters = ["scale=1080:608:force_original_aspect_ratio=decrease", "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"]
    else:
        ratio = {"9:16": "0.5625", "1:1": "1", "4:3": "1.3333333", "16:9-landscape": "1.7777778"}.get(aspect, "0.5625")
        if focus_track and len(focus_track) > 1:
            x_focus = focus_expression(focus_track, "focal_x", end - start)
            y_focus = focus_expression(focus_track, "focal_y", end - start)
        else:
            x_focus, y_focus = str(focal_x), str(focal_y)
        filters = [f"crop=w='min(iw,ih*{ratio})':h='min(ih,iw/{ratio})':x='(iw-ow)*({x_focus})/100':y='(ih-oh)*({y_focus})/100',scale={width}:{height}"]
    sub_count = 0
    subtitle_mode = "none"
    if with_subtitles and segments:
        sub_count = write_srt(segments, start, end, srt_path)
        if sub_count:
            subtitle_mode = "track"
            if has_filter("subtitles"):
                escaped = srt_path.replace("'", r"'\''")
                # libass colors are AABBGGRR. Keep high-contrast outlines for mobile playback.
                style = {
                    "viral_pop": ("&H0000D7FF", "&H00101010", 1),
                    "beast_punch": ("&H0000FF70", "&H00101010", 1),
                    "cyber_violet": ("&H00FF66D9", "&H00101010", 1),
                    "fire_crimson": ("&H003333FF", "&H00101010", 1),
                    "electric_cyan": ("&H00FFFF00", "&H00101010", 1),
                    "golden_aura": ("&H0000CFFF", "&H00101010", 1),
                    "clean_minimal": ("&H00FFFFFF", "&H80000000", 3),
                    "off": ("&H00FFFFFF", "&H00101010", 1),
                }.get(caption_style, ("&H0000D7FF", "&H00101010", 1))
                primary, outline, border = style
                caption_font_size = max(18, int(caption_size * (width / 1080) * 0.75))
                margin_v = max(40, int(height * caption_y / 100))
                caption_outline = 0 if caption_effect == "box" else 5 if caption_effect == "outline" else 2
                caption_shadow = 3 if caption_effect == "shadow" else 0
                caption_border = 3 if caption_effect == "box" else 1
                caption_font_name = "Montserrat" if caption_font == "montserrat" else "Inter"
                primary = _hex_to_ass(caption_color)
                secondary = _hex_to_ass(caption_karaoke_color)
                if caption_animation == "karaoke":
                    primary, secondary = secondary, primary
                elif caption_animation == "typewriter":
                    secondary = _hex_to_ass(caption_color, 0xFF)
                outline = _hex_to_ass(caption_effect_color)
                back = _hex_to_ass(caption_effect_color, 0x80)
                style_value = f"FontName={caption_font_name},FontSize={caption_font_size},PrimaryColour={primary},SecondaryColour={secondary},OutlineColour={outline},BackColour={back},BorderStyle={caption_border},Outline={caption_outline},Shadow={caption_shadow},Bold=1,Alignment=2,MarginV={margin_v}"
                if caption_style == "clean_minimal":
                    style_value = style_value.replace(",Bold=1", ",Bold=0")
                ass_path = os.path.join(job_path, f"clip_{clip_id}.ass")
                write_ass_positions(srt_path, ass_path, width, height, caption_x, caption_y, caption_font_size, caption_color, outline, border, caption_style != "clean_minimal", caption_effect, caption_animation, caption_font_name, caption_effect_color, caption_animation_duration_ms, caption_karaoke_color)
                escaped = ass_path.replace("'", r"'\''")
                force_style = f":force_style='{style_value}'" if style_value else ""
                filters.append(f"subtitles='{escaped}'{force_style}")
                subtitle_mode = "burned"
            elif caption_x != 50 or caption_y != 21:
                raise RuntimeError("Posisi subtitle kustom memerlukan filter FFmpeg subtitles/libass pada server.")
        else:
            os.remove(srt_path)
    font = find_font(title_font)
    title_applied = False
    title_overlay = False
    if title_text.strip():
        overlay_text = title_text.upper() if title_case == "upper" else title_text.lower() if title_case == "lower" else title_text.title()
        create_title_overlay(overlay_text, title_path, width, height, max(36, min(120, int(title_size * width / 1080))), title_x, title_y, title_font, title_effect, title_color, title_effect_color)
        title_overlay = True
        title_applied = True
    watermark_applied = bool(watermark_text and watermark_text.strip())
    if watermark_applied:
        if not has_filter("drawtext"):
            raise RuntimeError("Filter drawtext tidak tersedia; watermark teks tidak bisa dirender oleh FFmpeg server ini.")
        watermark_font = font or ""
        watermark = watermark_text.strip().replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace(",", "\\,").replace("%", "\\%")
        watermark_font_size = max(16, int(min(width, height) * 0.035 * max(5, min(40, watermark_size)) / 20))
        watermark_alpha = max(0, min(100, watermark_opacity)) / 100
        watermark_x = max(0, min(100, watermark_x))
        watermark_y = max(0, min(100, watermark_y))
        font_option = f"fontfile='{watermark_font}':" if watermark_font else ""
        filters.append(f"drawtext={font_option}text='{watermark}':fontsize={watermark_font_size}:fontcolor=white@{watermark_alpha:.2f}:x='(w-text_w)*{watermark_x}/100':y='(h-text_h)*{watermark_y}/100':box=1:boxcolor=black@{watermark_alpha * 0.44:.2f}:boxborderw=10")
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-ss", str(start), "-to", str(end), "-i", source_path,
    ]
    input_index = 1
    subtitle_input = None
    title_input = None
    if subtitle_mode == "track":
        subtitle_input = input_index
        cmd += ["-f", "srt", "-i", srt_path]
        input_index += 1
    if title_overlay:
        title_input = input_index
        cmd += ["-loop", "1", "-framerate", "30", "-i", title_path]
        input_index += 1
    bgm_input = None
    if bgm_path:
        bgm_input = input_index
        cmd += ["-stream_loop", "-1", "-i", bgm_path]
        input_index += 1
    sfx_input = None
    if sfx_path:
        sfx_input = input_index
        cmd += ["-i", sfx_path]
        input_index += 1
    watermark_input = None
    if watermark_image_path:
        watermark_input = input_index
        cmd += ["-loop", "1", "-framerate", "30", "-i", watermark_image_path]
        input_index += 1

    complex_graph = []
    video_graph = f"[0:v]{','.join(filters)}[base]"
    if title_overlay and title_input is not None:
        duration = end - start
        title_filters = "format=rgba"
        animation_seconds = max(0.1, min(1.5, title_animation_duration_ms / 1000))
        if title_animation == "fade":
            fade_out_start = max(0, duration - min(animation_seconds, duration))
            fade_duration = min(animation_seconds, duration)
            title_filters += f",fade=t=in:st=0:d={fade_duration:.3f}:alpha=1,fade=t=out:st={fade_out_start:.3f}:d={fade_duration:.3f}:alpha=1"
        overlay_position = "x=0:y=0"
        if title_animation == "slide_up":
            exit_start = max(0, duration - animation_seconds)
            slide_distance = max(1, int(height * 0.035))
            slide_expression = f"if(lt(t,{animation_seconds:.3f}),(1-t/{animation_seconds:.3f})*{slide_distance},if(gt(t,{exit_start:.3f}),(t-{exit_start:.3f})/{animation_seconds:.3f}*{slide_distance},0))"
            overlay_position = f"x=0:y='{slide_expression}'"
        video_graph += f";[{title_input}:v]{title_filters}[title];[base][title]overlay={overlay_position}[vout]"
    else:
        video_graph += ";[base]null[vout]"
    complex_graph.append(video_graph)
    final_video_label = "vout"
    if watermark_input is not None:
        watermark_width = max(1, int(width * max(5, min(40, watermark_size)) / 100))
        watermark_alpha = max(0, min(100, watermark_opacity)) / 100
        watermark_x = max(0, min(100, watermark_x))
        watermark_y = max(0, min(100, watermark_y))
        complex_graph.append(f"[{watermark_input}:v]scale={watermark_width}:-1,format=rgba,colorchannelmixer=aa={watermark_alpha:.2f}[wm]")
        complex_graph.append(f"[vout][wm]overlay=x='(main_w-overlay_w)*{watermark_x}/100':y='(main_h-overlay_h)*{watermark_y}/100':shortest=1[vmarked]")
        final_video_label = "vmarked"
    has_source_audio = _has_audio(source_path)
    audio_inputs: list[str] = []
    if has_source_audio:
        complex_graph.append(f"[0:a]volume={source_volume / 100:.2f}[source_audio]")
        audio_inputs.append("[source_audio]")
    if bgm_input is not None and bgm_volume > 0 and bgm_start_ms < (end - start) * 1000:
        duration = end - start
        fade_in = min(duration, max(0, bgm_fade_in_ms / 1000))
        fade_out = min(duration, max(0, bgm_fade_out_ms / 1000))
        bgm_delay = min(duration, max(0, bgm_start_ms / 1000))
        audio_chain = f"volume={bgm_volume / 100:.2f},atrim=duration={max(0, duration - bgm_delay):.3f},asetpts=PTS-STARTPTS,adelay={int(bgm_delay * 1000)}|{int(bgm_delay * 1000)}"
        adjusted_fades = []
        if fade_in > 0 and bgm_delay < duration:
            adjusted_fades.append(f"afade=t=in:st={bgm_delay:.3f}:d={min(fade_in, duration - bgm_delay):.3f}")
        if fade_out > 0:
            adjusted_fades.append(f"afade=t=out:st={max(bgm_delay, duration - fade_out):.3f}:d={min(fade_out, max(0.01, duration - bgm_delay)):.3f}")
        if adjusted_fades:
            audio_chain += "," + ",".join(adjusted_fades)
        complex_graph.append(f"[{bgm_input}:a]{audio_chain}[bgm_audio]")
        audio_inputs.append("[bgm_audio]")
    if sfx_input is not None:
        delay = max(0, int((hook_offset - start) * 1000) + sfx_offset_ms)
        complex_graph.append(f"[{sfx_input}:a]volume={sfx_volume / 100:.2f},atrim=duration={end - start},asetpts=PTS-STARTPTS,adelay={delay}|{delay}[sfx_audio]")
        audio_inputs.append("[sfx_audio]")
    if "[bgm_audio]" in audio_inputs and bgm_volume > 0 and bgm_ducking and has_source_audio:
        complex_graph.append("[bgm_audio][source_audio]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=350[bgm_ducked]")
        audio_inputs[audio_inputs.index("[bgm_audio]")] = "[bgm_ducked]"
    if audio_inputs:
        if len(audio_inputs) == 1:
            complex_graph.append(f"{audio_inputs[0]}alimiter=limit=0.95:level=false[aout]")
        else:
            complex_graph.append(f"{''.join(audio_inputs)}amix=inputs={len(audio_inputs)}:duration=first:dropout_transition=2,alimiter=limit=0.95:level=false[aout]")
    uses_complex = title_overlay or watermark_applied or watermark_input is not None or bool(audio_inputs)
    if uses_complex:
        cmd += ["-filter_complex", ";".join(complex_graph), "-map", f"[{final_video_label}]"]
        if audio_inputs:
            cmd += ["-map", "[aout]"]
    else:
        cmd += ["-map", "0:v:0", "-vf", ",".join(filters), "-map", "0:a?"]
    if subtitle_mode == "track" and subtitle_input is not None:
        cmd += ["-map", f"{subtitle_input}:s:0"]
    capabilities = get_encoder_capabilities()["encoders"]
    selected_encoder = get_encoder_capabilities()["recommended"] if encoder == "auto" else encoder
    if not capabilities.get(selected_encoder, False):
        raise RuntimeError(f"Encoder {selected_encoder} tidak tersedia pada FFmpeg server ini.")
    video_args = {
        "nvenc": ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"],
        "amf": ["-c:v", "h264_amf", "-quality", "speed", "-qp_i", "23", "-qp_p", "23"],
        "qsv": ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "23"],
        "cpu": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
    }[selected_encoder]
    cmd += ["-t", str(end - start), *video_args, "-c:a", "aac", "-b:a", "128k"]
    if subtitle_mode == "track":
        cmd += ["-c:s", "mov_text"]
    cmd += ["-movflags", "+faststart", out_path]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg tidak tersedia di server.") from exc
    if proc.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError(f"Render FFmpeg gagal: {(proc.stderr or '').strip()[:300]}")
    return {
        "file": out_name,
        "size_bytes": os.path.getsize(out_path),
        "subtitles": sub_count,
        "subtitle_mode": subtitle_mode,
        "title_applied": title_applied,
        "title_metadata": bool(title_text.strip() and not title_applied),
        "watermark_applied": watermark_applied,
        "watermark_image_applied": watermark_input is not None,
        "encoder": selected_encoder,
        "command": " ".join(shlex.quote(c) for c in cmd),
    }
