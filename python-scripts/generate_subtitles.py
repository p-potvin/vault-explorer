"""Generate Subtitles — transcribe speech to SRT sidecars.

Backs the "Generate Subtitles" context-menu action and nothing else.

The important property is what it *doesn't* do: no Demucs, no video re-encode,
no enhanced copy. Previously this menu item ran the entire audio pipeline just to
reach the ASR step at the end, which meant asking for subtitles cost a full GPU
encode of the file.

Transcription goes through `vw better-subtitles` (via
scripts/pwsh/Start-Subtitles.ps1) with -NoSeparate, so the cues match the ones
the CLI produces. Projects that receive this file through sync-vw-media.ps1 have
no vw CLI; they, and any vw failure, fall back to decoding a 16 kHz mono WAV and
running vw_media.asr directly. VW_SUBTITLES_ENGINE=native forces the fallback.

    python generate_subtitles.py <video|folder> [vault_root] [--language en]
                                 [--output PATH] [--skip-existing]
"""

import glob
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


def resolve_srt_targets(video_path, args, language):
    """Where the SRT files for *language* should be written.

    Without ``--output`` we write beside the original and beside the enhanced
    copy (when one exists), so subtitles are found whichever version plays.
    """
    if args.output:
        out = os.path.abspath(os.path.expanduser(args.output))
        if os.path.isdir(out) or args.output.endswith((os.sep, '/')):
            base = os.path.splitext(os.path.basename(video_path))[0]
            os.makedirs(out, exist_ok=True)
            return [os.path.join(out, f"{base}.{subtitles.external_code(language)}.srt")]
        os.makedirs(os.path.dirname(out), exist_ok=True)
        return [out]

    existing = state.load(video_path).get('enhancedPath')
    if not existing or not os.path.exists(existing):
        existing = None
    return subtitles.sidecar_targets(video_path, existing, language, include_default=True)


VW_ENGINE = "vw better-subtitles"
NATIVE_ENGINE = "vw_media.asr"

# Start-BetterSubtitles.ps1 stage markers -> progress percent.
_VW_STAGES = (("[ASR]", 30, "Transcribing (vw better-subtitles)..."),
              ("[SRT]", 85, "Transcript ready"))


def find_subtitles_delegator():
    """scripts/pwsh/Start-Subtitles.ps1, or None outside vault-explorer."""
    path = os.path.join(_PROJECT_ROOT, "scripts", "pwsh", "Start-Subtitles.ps1")
    return path if os.path.isfile(path) else None


def transcribe_via_vw(video_path, language, work_dir):
    """Run `vw better-subtitles -NoSeparate` on *video_path*.

    Returns segment dicts, or None when the vw CLI is unavailable or produced
    no SRT. Start-BetterSubtitles.ps1 reports per-file failures but still exits
    0, so the SRT on disk is the only reliable success signal.
    """
    delegator = find_subtitles_delegator()
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not delegator or not shell:
        return None

    cmd = [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", delegator,
           "-Target", video_path, "-OutputDir", work_dir, "-NoSeparate"]
    model = os.environ.get("VW_ASR_MODEL")
    if model:
        cmd += ["-Model", model]
        # Only the nemotron models take a language prompt.
        if model.startswith("nemotron") and language:
            cmd += ["-Language", language]

    tail = []
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

    produced = glob.glob(os.path.join(work_dir, "*.srt"))
    if not produced:
        log(ACTION, f"vw better-subtitles produced no SRT (exit {proc.returncode}): "
                    + " | ".join(tail))
        return None
    return subtitles.read_srt(produced[0])


def transcribe_native(video_path, language, duration, work_dir):
    wav_path = os.path.join(work_dir, "audio.wav")
    media.extract_audio(
        video_path, wav_path,
        on_progress=ScaledProgress(14, 20, "Extracting audio"),
        duration=duration)
    report_progress(22, "Loading speech recognition model...")
    return asr.transcribe(
        wav_path, language=language,
        status_callback=lambda msg: report_progress(26, msg))


def transcribe(video_path, language, duration, work_dir):
    """Returns (segments, engine)."""
    if os.environ.get("VW_SUBTITLES_ENGINE", "").lower() != "native":
        report_progress(10, "Starting vw better-subtitles...")
        segments = transcribe_via_vw(video_path, language, work_dir)
        if segments is not None:
            return segments, VW_ENGINE
        report_progress(12, "vw better-subtitles unavailable, using built-in ASR...")
    return transcribe_native(video_path, language, duration, work_dir), NATIVE_ENGINE


def process_one(video_path, args, _output_path):
    media.require_streams(video_path, need_video=False, need_audio=True)

    language = subtitles.source_code(args.language)
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
                segments, engine = transcribe(video_path, language, duration, work_dir)
                run.set(engine=engine)
                if segments:
                    run.set(audio_seconds=duration, completion_chars=sum(len(s.get("text", "")) for s in segments))
        else:
            segments, engine = transcribe(video_path, language, duration, work_dir)
        log(ACTION, f"Transcribed with {engine}")

        if not segments:
            raise RuntimeError("No speech was recognised in this file")

        # --language is what the user picked, not what was spoken: Parakeet
        # transcribes whatever language it hears and ignores the tag. Label the
        # track with the language of the text it actually produced.
        detected = subtitles.detect_language(" ".join(s.get("text", "") for s in segments))
        spoken = detected or language
        if detected and detected != language:
            log(ACTION, f"Requested '{language}' but transcript is '{detected}'; tagging as '{detected}'")

        report_progress(88, "Writing subtitle tracks...")
        written = []
        for target in resolve_srt_targets(video_path, args, spoken):
            subtitles.write_srt(target, segments)
            written.append(target)
            log(ACTION, f"Wrote {target}")

        report_progress(96, "Recording enhancement state...")
        state.mark(video_path, ACTION,
                   languages=[subtitles.external_code(spoken)],
                   params={"language": spoken, "requested_language": language,
                           "detected": bool(detected), "segments": len(segments),
                           "engine": engine},
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
                        help="Fallback language tag, used only when the transcript's "
                             "language cannot be detected (default: en)")
    args = parser.parse_args()
    try:
        return cli.run(args, ACTION, process_one, needs_output=False)
    finally:
        asr.release()


if __name__ == '__main__':
    sys.exit(main())
