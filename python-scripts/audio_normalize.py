"""Deprecated shim — audio_normalize.py has been split into four scripts.

This file used to be the single entrypoint behind four different menu items,
which is why asking for subtitles ran Demucs and a full GPU re-encode. Each
action now has its own script and runs only its own work:

    Enhance Audio         -> enhance_audio.py
    Generate Subtitles    -> generate_subtitles.py
    Translate this video  -> translate_video.py
    Enhance Video         -> enhance_video.py

The shim is kept so existing callers (older PowerShell scripts, saved commands)
keep working. It maps the legacy flags onto the new scripts and runs them in
sequence, but each invocation only starts the work its flags actually ask for.

Prefer calling the individual scripts directly; this shim will be removed.
"""

import os
import subprocess
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, ".."))
for _path in (_SCRIPT_DIR, _PROJECT_ROOT):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from vw_media.progress import log  # noqa: E402


def _run(script, argv):
    cmd = [sys.executable, "-u", os.path.join(_SCRIPT_DIR, script)] + argv
    log("audio_normalize", f"Delegating to {script}")
    return subprocess.call(cmd)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Deprecated. Use enhance_audio.py / generate_subtitles.py / "
                    "translate_video.py / enhance_video.py instead.")
    parser.add_argument("video_path")
    parser.add_argument("vault_root", nargs="?", default=None)
    parser.add_argument("--transcribe", action="store_true", default=False)
    parser.add_argument("--translate-to", dest="translate_to", default=None)
    parser.add_argument("--volume-boost", type=float, default=1.5)
    parser.add_argument("--skip-existing", action="store_true", default=False)
    parser.add_argument("--output", "-o", default=None)
    parser.add_argument("--no-audio", action="store_true", default=False,
                        help="Skip the audio enhancement pass (subtitles/translation only)")
    args = parser.parse_args()

    log("audio_normalize",
        "DEPRECATED: this entrypoint now delegates to the split scripts. "
        "Call enhance_audio.py / generate_subtitles.py / translate_video.py directly.")

    common = [args.video_path]
    if args.vault_root:
        common.append(args.vault_root)
    if args.skip_existing:
        common.append("--skip-existing")

    # Audio enhancement is the historical default of this entrypoint.
    if not args.no_audio:
        argv = list(common) + ["--volume-boost", str(args.volume_boost)]
        if args.output:
            argv += ["--output", args.output]
        code = _run("enhance_audio.py", argv)
        if code != 0:
            return code

    if args.transcribe:
        code = _run("generate_subtitles.py", list(common))
        if code != 0:
            return code

    if args.translate_to:
        code = _run("translate_video.py", list(common) + ["--to", args.translate_to])
        if code != 0:
            return code

    return 0


if __name__ == '__main__':
    sys.exit(main())
