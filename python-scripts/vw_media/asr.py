"""Lazy ASR model access.

Two rules matter here and both come from the live-subs daemon, which is the
best-behaved torch process in the stack:

1. **Never import torch/NeMo until transcription is actually requested.** The
   monolith imported the Parakeet wrapper at module scope, so *every* action paid
   the multi-second import even when it only needed ffmpeg. Splitting the scripts
   is pointless if the import cost is unconditional.
2. **Load the model once per process and release it deterministically.** Batch
   runs reuse a single instance; :func:`release` drops the reference and hands
   the memory back so RAM does not creep across a long queue.

The wrapper lives in a differently-named package in each repo, so we probe.
"""

import gc
import importlib
import os
import time

from .progress import log

# Host packages that may provide parakeet_wrapper, in preference order.
_HOST_PACKAGES = (
    "vault_explorer",
    "vault_streaming",
    "vaultwares_media_processing",
    "vaultwares_realtime",
    "vw_cli",
)

_model = None
_model_name = None


def _import_wrapper():
    errors = []
    for pkg in _HOST_PACKAGES:
        try:
            module = importlib.import_module(f"{pkg}.parakeet_wrapper")
            return getattr(module, "ParakeetV3Wrapper")
        except Exception as err:
            errors.append(f"{pkg}: {err}")
    raise ImportError(
        "Could not locate parakeet_wrapper in any known host package.\n  "
        + "\n  ".join(errors)
    )


def get_model(model_name=None, status_callback=None):
    """Return the shared ASR model, loading it on first use."""
    global _model, _model_name

    requested = model_name or os.environ.get("VW_ASR_MODEL") or None
    if _model is not None and (requested is None or requested == _model_name):
        return _model

    if _model is not None:
        # A different model was asked for; free the old one before loading.
        release()

    wrapper_cls = _import_wrapper()
    started = time.perf_counter()
    _model = wrapper_cls(**({"model_name": requested} if requested else {}),
                         status_callback=status_callback)
    _model_name = requested
    log("asr", f"Model ready in {time.perf_counter() - started:.1f}s")
    return _model


def release():
    """Drop the model and return its memory.

    Mirrors the live-subs teardown: clear the reference, collect, then empty the
    CUDA allocator cache so the next process (or the next model) starts clean.
    """
    global _model, _model_name
    if _model is None:
        return
    _model = None
    _model_name = None
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass


def transcribe(wav_path, language="en", model=None, status_callback=None):
    """Transcribe *wav_path*, returning segment dicts.

    Returns ``[{"start": float, "end": float, "text": str}, ...]``. An empty list
    means the model ran but found no speech — callers must treat that as a real
    result, not as a reason to substitute placeholder text.
    """
    engine = model or get_model(status_callback=status_callback)
    segments = engine.transcribe_file(wav_path, language=language) or []
    return [
        {"start": float(seg.start), "end": float(seg.end), "text": str(seg.text)}
        for seg in segments
    ]
