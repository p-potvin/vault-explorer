"""SRT sidecar writing and subtitle language-code normalisation.

Self-contained on purpose: the monolith imported ``vault_explorer.utils`` for
``write_srt``, which is exactly the kind of host coupling that stops this
directory from being copied into the other repos as-is.
"""

import os
import re

# `qc` is a user-facing label only. Every code written to a filename, a sidecar
# or a backend request must be the ISO code.
_FRENCH_ALIASES = {'qc', 'fr-ca', 'ca-fr'}


def external_code(language):
    """Map an internal language tag to the code players expect in a filename.

    Quebec French has no distinct subtitle code — it ships as ``fr``.
    """
    code = str(language or '').strip().lower()
    return 'fr' if code in _FRENCH_ALIASES else code


def source_code(language):
    """Map an internal tag to the code the translation backend expects."""
    code = str(language or '').strip().lower()
    return 'fr' if code in _FRENCH_ALIASES else code


# Language of a finished transcript. parakeet-tdt-0.6b-v3 picks the spoken
# language itself but never reports it (NeMo-Speech.cpp only surfaces the
# <lang> token that prompt-conditioned nemotron models emit), so the text it
# wrote is the only evidence of its choice.
#
# High-frequency function words, with the ones shared across languages left
# out (de, en, que, se, il, on, ...) so they cannot split the vote. Covers the
# main languages parakeet-tdt-v3 transcribes; anything else keeps the caller's tag.
_STOPWORDS = {
    'en': "the and is are was were of to that it you this with for have not but what they be at",
    'fr': "le la les des est et une qui pas dans pour sur avec ce cette mais nous vous ils c'est",
    'es': "el los las del es y una por para con pero muy está como yo tú nosotros ellos",
    'it': "gli della che è una non per con sono questo anche come io noi loro",
    'pt': "os das dos é uma não em com mas muito está como eu você nós eles",
    'de': "der die das und ist nicht ein eine ich wir sie mit auf für aber auch sich zu den",
    'nl': "het een niet ik wij zij met op voor maar ook zijn dat van",
    'pl': "w nie się na że jest to jak ale co tak już jestem jesteś",
    'ru': "и в не на что я он она это как с по но мы вы они так же",
    'uk': "і в не на що я він вона це як з по але ми ви вони так також",
}
_STOPWORD_SETS = {lang: set(words.split()) for lang, words in _STOPWORDS.items()}
_WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)


def detect_language(text, min_words=20, min_hits=8, margin=2.0):
    """ISO code of the language *text* is written in, or None if unsure.

    The winner needs *min_hits* stopword hits and *margin* times the runner-up,
    so short or mixed transcripts keep the caller's tag instead of getting a
    confident wrong one. Never returns ``qc``.
    """
    words = [w.lower() for w in _WORD_RE.findall(text or '')]
    if len(words) < min_words:
        return None
    scores = sorted(((sum(1 for w in words if w in stop), lang)
                     for lang, stop in _STOPWORD_SETS.items()), reverse=True)
    (best, lang), (second, _) = scores[0], scores[1]
    if best < min_hits or best < margin * second:
        return None
    return lang


def format_timestamp(seconds):
    if seconds is None or seconds < 0:
        seconds = 0.0
    ms = int(round((seconds - int(seconds)) * 1000))
    total = int(seconds)
    hours, total = divmod(total, 3600)
    minutes, secs = divmod(total, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_srt(output_path, segments):
    """Write *segments* (dicts with start/end/text) as an SRT file."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as fh:
        index = 0
        for seg in segments:
            text = str(seg.get('text', '')).strip()
            if not text:
                continue
            index += 1
            fh.write(
                f"{index}\n"
                f"{format_timestamp(seg.get('start', 0.0))} --> {format_timestamp(seg.get('end', 0.0))}\n"
                f"{text}\n\n"
            )
    return output_path


def read_srt(path):
    """Parse an SRT back into segment dicts, or return [] if unreadable.

    Used so translation can reuse subtitles that were already generated instead
    of paying for a second ASR pass.
    """
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            raw = fh.read()
    except Exception:
        return []

    segments = []
    for block in raw.replace('\r\n', '\n').split('\n\n'):
        lines = [l for l in block.split('\n') if l.strip()]
        if len(lines) < 2:
            continue
        timing = next((l for l in lines if '-->' in l), None)
        if not timing:
            continue
        try:
            start_raw, end_raw = [p.strip() for p in timing.split('-->')[:2]]
            text = ' '.join(lines[lines.index(timing) + 1:]).strip()
            if text:
                segments.append({
                    'start': _parse_timestamp(start_raw),
                    'end': _parse_timestamp(end_raw),
                    'text': text,
                })
        except Exception:
            continue
    return segments


def _parse_timestamp(value):
    value = value.replace(',', '.')
    hours, minutes, secs = value.split(':')
    return int(hours) * 3600 + int(minutes) * 60 + float(secs)


def sidecar_targets(video_path, enhanced_path, language, include_default=False):
    """Every SRT path a given language should be written to.

    Both the original and the enhanced copy get a sidecar so subtitles show up
    whichever version the user plays.

    *include_default* additionally writes the extension-less ``<base>.srt`` that
    players load when no language is chosen. Only the transcription pass sets it
    — a translation must never clobber the source-language default track.
    """
    code = external_code(language)
    bases = [os.path.splitext(video_path)[0]]
    if enhanced_path and os.path.abspath(enhanced_path) != os.path.abspath(video_path):
        bases.append(os.path.splitext(enhanced_path)[0])

    targets = []
    for base in bases:
        targets.append(f"{base}.{code}.srt")
        if include_default:
            targets.append(f"{base}.srt")
    return targets
