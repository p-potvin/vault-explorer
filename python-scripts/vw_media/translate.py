"""Subtitle text translation.

Uses local NVIDIA Riva-Translate-4B GGUF via CUDA when available, with
graceful fallback to deep_translator if the model is absent.
"""

import os
import sys
from .progress import log
from .subtitles import source_code


def _find_riva_model():
    candidates = [
        os.environ.get("VW_RIVA_MODEL"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "audio.cpp", "models", "Riva-Translate-4B-Instruct.i1-Q4_K_M.gguf"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    return None


class Translator:
    """Lazy Neural / Google Translator with per-session text cache."""

    def __init__(self, target, source="en"):
        self.target = source_code(target)
        self.source = source_code(source) if source else "en"
        self._impl = None
        self._engine_type = None
        self._cache = {}
        self._failed = False

    def _ensure(self):
        if self._impl is None:
            riva_path = _find_riva_model()
            if riva_path:
                try:
                    cacophony_dir = os.path.dirname(os.path.dirname(os.path.dirname(riva_path)))
                    scripts_dir = os.path.join(cacophony_dir, "scripts")
                    if scripts_dir not in sys.path:
                        sys.path.insert(0, scripts_dir)
                    from riva_engine import RivaEngine
                    self._impl = RivaEngine(model_path=riva_path)
                    self._engine_type = "riva"
                    log("translate", f"Loaded local NVIDIA Riva-Translate-4B on CUDA ({os.path.basename(riva_path)})")
                    return self._impl
                except Exception as e:
                    log("translate", f"Failed to load RivaEngine ({e}); falling back to GoogleTranslator")

            # Fallback to GoogleTranslator
            try:
                from deep_translator import GoogleTranslator
                self._impl = GoogleTranslator(source=self.source or "auto", target=self.target)
                self._engine_type = "google"
                log("translate", "Using GoogleTranslator fallback")
            except Exception as e:
                log("translate", f"GoogleTranslator init failed: {e}")
        return self._impl

    def translate(self, text):
        """Translate *text*, falling back to the source string on failure."""
        if not text or not text.strip():
            return text
        if text in self._cache:
            return self._cache[text]

        try:
            self._ensure()
            if self._engine_type == "riva":
                result = self._impl.translate(text, target_lang=self.target, source_lang=self.source) or text
            elif self._engine_type == "google":
                result = self._impl.translate(text) or text
            else:
                result = text
        except Exception as err:
            if not self._failed:
                log("translate", f"Translation failed ({err}); keeping source text")
                self._failed = True
            result = text

        self._cache[text] = result
        return result

    def translate_segments(self, segments, on_progress=None):
        """Translate a list of segment dicts, preserving timings."""
        out = []
        total = max(1, len(segments))
        for idx, seg in enumerate(segments):
            out.append({
                'start': seg.get('start', 0.0),
                'end': seg.get('end', 0.0),
                'text': self.translate(seg.get('text', '')),
            })
            if on_progress:
                on_progress((idx + 1) / total * 100.0)
        return out

    @property
    def degraded(self):
        """True if any translation call fell back to the source text."""
        return self._failed
