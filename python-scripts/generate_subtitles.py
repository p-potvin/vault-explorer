"""Generate Subtitles — transcribe speech to SRT sidecars.

Backs the "Generate Subtitles" context-menu action and nothing else.

The important property is what it *doesn't* do: no Demucs, no video re-encode,
no enhanced copy. Previously this menu item ran the entire audio pipeline just to
reach the ASR step at the end, which meant asking for subtitles cost a full GPU
encode of the file.

Transcription goes through `vw better-subtitles` (via
scripts/pwsh/Start-Subtitles.ps1) with the --separator chosen in Settings > AI
(default rnnoise), so the cues match the ones the CLI produces.

--language is the language to translate *to*, not the spoken one: Parakeet
identifies the spoken language by itself, and Riva translates the finished
cues (`vw better-subtitles -TranslateTo`). The transcript is written as the
default `<video>.srt` track, the translation as `<video>.<lang>.srt`. An
English target skips Riva: the transcript is also written as `<video>.en.srt`.
Riva only translates from English, so other targets assume English audio. Projects that receive this file through sync-vw-media.ps1 have
no vw CLI; they, and any vw failure, fall back to decoding a 16 kHz mono WAV and
running vw_media.asr directly. VW_SUBTITLES_ENGINE=native forces the fallback.

    python generate_subtitles.py <video|folder> [vault_root] [--language en]
                                 [--output PATH] [--skip-existing]
"""

import os
import shutil
import subprocess
import sys
import tempfile

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, ".."))
for _path in (_SCRIPT_DIR, _PROJECT_ROOT):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from vw_media import asr, cli, enhanced, media, state, subtitles     # noqa: E402
from vw_media.progress import ScaledProgress, emit_status, log, report_progress  # noqa: E402

try:
    from vaultwares_adk.telemetry import ModelRun
except ImportError:
    try:
        _adk_dir = os.path.join(_PROJECT_ROOT, "vaultwares-adk")
        if _adk_dir not in sys.path:
            sys.path.insert(0, _adk_dir)
        from vaultwares_adk.telemetry import ModelRun
    except Exception:
        ModelRun = None

ACTION = "subtitles"


def resolve_srt_targets(video_path, args, language=None):
    """Where the SRT files go: the default track when *language* is None,
    otherwise the `<video>.<language>.srt` track.

    Without ``--output`` we write beside the original and beside the enhanced
    copy (when one exists), so subtitles are found whichever version plays.
    """
    base = os.path.splitext(os.path.basename(video_path))[0]
    if args.output:
        out = os.path.abspath(os.path.expanduser(args.output))
        if os.path.isdir(out) or args.output.endswith((os.sep, '/')):
            os.makedirs(out, exist_ok=True)
            name = f"{base}.{subtitles.external_code(language)}.srt" if language else f"{base}.srt"
            return [os.path.join(out, name)]
        os.makedirs(os.path.dirname(out), exist_ok=True)
        return [out]

    existing = state.load(video_path).get('enhancedPath')
    if not existing or not os.path.exists(existing):
        existing = None
    if language:
        return subtitles.sidecar_targets(video_path, existing, language, include_default=False)
    bases = [os.path.splitext(video_path)[0]]
    if existing and os.path.abspath(existing) != os.path.abspath(video_path):
        bases.append(os.path.splitext(existing)[0])
    return [f"{b}.srt" for b in bases]


VW_ENGINE = "vw better-subtitles"
NATIVE_ENGINE = "vw_media.asr"

# Start-BetterSubtitles.ps1 stage markers -> progress percent.
_VW_STAGES = (("[ASR]", 30, "Transcribing (vw better-subtitles)..."),
              ("[SRT]", 80, "Transcript ready"),
              ("[TRANS]", 84, "Translating (Riva)..."))


def find_subtitles_delegator():
    """scripts/pwsh/Start-Subtitles.ps1, or None outside vault-explorer."""
    path = os.path.join(_PROJECT_ROOT, "scripts", "pwsh", "Start-Subtitles.ps1")
    return path if os.path.isfile(path) else None


SEPARATORS = ("rnnoise", "mel_band_roformer", "bs_roformer", "htdemucs", "none")


def transcribe_via_vw(video_path, translate_to, work_dir, separator="rnnoise"):
    """Run `vw better-subtitles -Separator <separator> [-TranslateTo <lang>]`.

    Returns ``(transcript, translation)`` segment lists (translation is None
    when none was requested or Riva failed), or None when the vw CLI is
    unavailable or produced no transcript. Start-BetterSubtitles.ps1 reports
    per-file failures but still exits 0, so the SRTs on disk are the only
    reliable success signal.
    """
    delegator = find_subtitles_delegator()
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not delegator or not shell:
        return None

    cmd = [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", delegator,
           "-Target", video_path, "-OutputDir", work_dir, "-Separator", separator]
    if translate_to:
        cmd += ["-TranslateTo", translate_to]
    model = os.environ.get("VW_ASR_MODEL")
    if model:
        cmd += ["-Model", model]

    tail = []
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace")
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            tail = (tail + [line])[-5:]
            for marker, percent, label in _VW_STAGES:
                if marker in line:
                    report_progress(percent, label)
        proc.wait()
    except OSError as err:
        # A shell that cannot be launched is the same as no vw CLI: fall back.
        log(ACTION, f"vw better-subtitles could not be started: {err}")
        return None
    returncode = proc.returncode

    stem = os.path.splitext(os.path.basename(video_path))[0]
    transcript_srt = os.path.join(work_dir, f"{stem}.srt")
    if not os.path.isfile(transcript_srt):
        log(ACTION, f"vw better-subtitles produced no SRT (exit {returncode}): "
                    + " | ".join(tail))
        return None
    translation = None
    if translate_to:
        translated_srt = os.path.join(work_dir, f"{stem}.{translate_to}.srt")
        if os.path.isfile(translated_srt):
            translation = subtitles.read_srt(translated_srt) or None
            transcript = subtitles.read_srt(transcript_srt)
            # Riva hands text back unchanged when the pair it was given is a
            # no-op (e.g. -TranslateTo en with vw's default source of en on
            # French audio). Writing that as <video>.en.srt would label the
            # untranslated transcript as English.
            if translation and [c["text"] for c in translation] == [c["text"] for c in transcript]:
                log(ACTION, f"Riva returned the transcript unchanged for '{translate_to}'; "
                            "not writing it as a translated track")
                translation = None
        else:
            log(ACTION, f"Riva produced no '{translate_to}' track: " + " | ".join(tail))
    return subtitles.read_srt(transcript_srt), translation


def transcribe_native(video_path, duration, work_dir):
    wav_path = os.path.join(work_dir, "audio.wav")
    media.extract_audio(
        video_path, wav_path,
        on_progress=ScaledProgress(14, 20, "Extracting audio"),
        duration=duration)
    report_progress(22, "Loading speech recognition model...")
    return asr.transcribe(
        wav_path, status_callback=lambda msg: report_progress(26, msg))


def transcribe(video_path, translate_to, duration, work_dir, separator="rnnoise"):
    """Returns (transcript, translation, engine)."""
    if os.environ.get("VW_SUBTITLES_ENGINE", "").lower() != "native":
        report_progress(10, f"Starting vw better-subtitles ({separator})...")
        result = transcribe_via_vw(video_path, translate_to, work_dir, separator)
        if result is not None:
            transcript, translation = result
            return transcript, translation, VW_ENGINE
        report_progress(12, "vw better-subtitles unavailable, using built-in ASR...")
    # The built-in path has no translator; it produces the transcript only.
    return transcribe_native(video_path, duration, work_dir), None, NATIVE_ENGINE


def process_one(video_path, args, _output_path):
    media.require_streams(video_path, need_video=False, need_audio=True)

    # Translation target. `qc` is a UI label; Riva gets the ISO code.
    translate_to = subtitles.source_code(args.language)
    if translate_to in ("", "und", "original", "none"):
        translate_to = None
    # English subtitles skip Riva entirely: the transcript is the English track.
    # Riva only translates from English (known limitation), so any other target
    # assumes English audio.
    riva_target = None if translate_to == "en" else translate_to
    duration = media.get_video_duration(video_path)

    emit_status("STARTING", path=video_path)
    report_progress(2, "Preparing transcription...")

    work_dir = tempfile.mkdtemp(prefix="vw_subs_")

    try:
        if ModelRun:
            # model= is required; without it every run died here before transcribing.
            with ModelRun(provider="local", runtime="nemo-speech",
                          model=os.environ.get("VW_ASR_MODEL") or asr.NEMO_SPEECH_MODEL,
                          task="audio-asr", project="vault-explorer") as run:
                segments, translation, engine = transcribe(
                    video_path, riva_target, duration, work_dir, args.separator)
                run.set(engine=engine, separator=args.separator)
                if segments:
                    run.set(audio_seconds=duration, completion_chars=sum(len(s.get("text", "")) for s in segments))
        else:
            segments, translation, engine = transcribe(
                video_path, riva_target, duration, work_dir, args.separator)
        log(ACTION, f"Transcribed with {engine}")

        if not segments:
            raise RuntimeError("No speech was recognised in this file")

        if riva_target and translation is None:
            log(ACTION, f"No '{riva_target}' translation available; wrote the transcript only")
        if translate_to == "en":
            translation = segments

        report_progress(88, "Writing subtitle tracks...")
        written = []
        tracks = [(None, segments)]
        if translation:
            tracks.append((translate_to, translation))
        if args.output and not (os.path.isdir(args.output) or args.output.endswith((os.sep, '/'))):
            tracks = tracks[-1:]  # one explicit file: the best track
        for lang, segs in tracks:
            for target in resolve_srt_targets(video_path, args, lang):
                subtitles.write_srt(target, segs)
                written.append(target)
                log(ACTION, f"Wrote {target}")

        report_progress(96, "Recording enhancement state...")
        state.mark(video_path, ACTION,
                   languages=[subtitles.external_code(translate_to)] if translation else [],
                   params={"translate_to": translate_to,
                           "translated": bool(riva_target and translation),
                           "segments": len(segments), "engine": engine,
                           "separator": args.separator},
                   outputs=written)

        report_progress(100, f"Subtitles generated ({len(segments)} cues)")
        emit_status("SUCCESS", path=written[0] if written else video_path,
                    segments=len(segments))
    finally:
        enhanced.discard_temp(work_dir)


def main():
    parser = cli.build_parser(
        "Generate subtitles: transcribe speech to SRT sidecars", ACTION)
    parser.add_argument("--language", default="en",
                        help="Language to translate the subtitles to with Riva; the spoken "
                             "language is identified by Parakeet (default: en)")
    parser.add_argument("--separator", default="rnnoise", choices=SEPARATORS,
                        help="Audio cleanup before transcription, passed to vw better-subtitles "
                             "-Separator (default: rnnoise)")
    args = parser.parse_args()
    try:
        return cli.run(args, ACTION, process_one, needs_output=False)
    finally:
        asr.release()


if __name__ == '__main__':
    sys.exit(main())
