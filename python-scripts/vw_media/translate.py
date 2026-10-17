"""Subtitle text translation.

Uses local NVIDIA Riva-Translate-4B GGUF via CUDA when available, with
graceful fallback to deep_translator if the model is absent.
"""

import os
import re
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
    """Lazy Neural (HF 111B / Riva) or Google Translator with per-session text cache."""

    def __init__(self, target, source="en", engine=None):
        self.target = source_code(target)
        self.source = source_code(source) if source else "en"
        self._requested_engine = engine or os.environ.get("VW_TRANSLATE_ENGINE", "hf")
        self._impl = None
        self._engine_type = None
        self._cache = {}
        self._failed = False

    def _ensure(self):
        if self._impl is None:
            pref = (self._requested_engine or "hf").lower()
            if pref in ("hf", "command-a"):
                try:
                    from huggingface_hub import InferenceClient
                    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
                    self._impl = InferenceClient(token=token, timeout=90.0)
                    self._engine_type = "hf"
                    log("translate", "Using HF Inference Providers (CohereLabs/command-a-translate-08-2025)")
                    return self._impl
                except Exception as e:
                    log("translate", f"HF InferenceClient init failed ({e}); checking local Riva/Google")

            riva_path = _find_riva_model()
            if riva_path and pref in ("riva", "auto", "hf", "command-a"):
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

    def _translate_hf(self, text):
        prompt = (
            f"Translate the following text from {self.source} into {self.target}. "
            "Output ONLY the translated text without explanations, greetings, or formatting:\n\n"
            f"{text.strip()}"
        )
        res = self._impl.chat_completion(
            model=os.environ.get("VW_HF_TRANSLATE_MODEL", "CohereLabs/command-a-translate-08-2025"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=min(1024, max(64, len(text) * 3)),
        )
        raw = (res.choices[0].message.content or "").strip()
        if raw.startswith('"') and raw.endswith('"') and len(raw) > 2:
            raw = raw[1:-1].strip()
        return raw or text

    def _translate_batch_hf(self, texts):
        model = os.environ.get("VW_HF_TRANSLATE_MODEL", "CohereLabs/command-a-translate-08-2025")
        numbered = "\n".join(f"{i+1}. {t.strip()}" for i, t in enumerate(texts))
        prompt = (
            f"Translate the following numbered subtitle lines from {self.source} into {self.target}.\n"
            "Maintain the exact same line numbering (1., 2., etc.) and order.\n"
            "Do NOT combine or skip lines. Output ONLY the numbered translations without notes or explanations:\n\n"
            f"{numbered}"
        )
        res = self._impl.chat_completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=min(4096, max(256, sum(len(t) for t in texts) * 3)),
        )
        raw = (res.choices[0].message.content or "").strip()
        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        line_map = {}
        for line in lines:
            m = re.match(r"^(\d+)[\.\:\-\)]\s*(.*)$", line)
            if m:
                idx = int(m.group(1)) - 1
                line_map[idx] = m.group(2).strip()
        out = []
        for i, original in enumerate(texts):
            translated = line_map.get(i) or original
            out.append(translated)
        return out

    def translate(self, text):
        """Translate *text*, falling back to the source string on failure."""
        if not text or not text.strip():
            return text
        if text in self._cache:
            return self._cache[text]

        try:
            self._ensure()
            if self._engine_type == "hf":
                result = self._translate_hf(text)
            elif self._engine_type == "riva":
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
        self._ensure()
        total = max(1, len(segments))

        if self._engine_type == "hf" and len(segments) > 1:
            try:
                out = []
                batch_size = 50
                for start_idx in range(0, len(segments), batch_size):
                    chunk = segments[start_idx:start_idx + batch_size]
                    chunk_texts = [s.get('text', '') for s in chunk]
                    translated_chunk = self._translate_batch_hf(chunk_texts)
                    for seg, trans_text in zip(chunk, translated_chunk):
                        out.append({
                            'start': seg.get('start', 0.0),
                            'end': seg.get('end', 0.0),
                            'text': trans_text,
                        })
                    if on_progress:
                        on_progress(min(100.0, (start_idx + len(chunk)) / total * 100.0))
                return out
            except Exception as e:
                log("translate", f"HF batch translation failed ({e}); falling back to line-by-line")

        out = []
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
