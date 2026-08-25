import os
import sys
import time
import json
import subprocess
import shutil

if sys.platform.startswith('win'):
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

REPO_ROOT = r"C:\Users\Administrator\Desktop\Github Repos"
AUDIOCPP_DIR = os.path.join(REPO_ROOT, "vault-cacophony", "audio.cpp")
CLI = os.path.join(AUDIOCPP_DIR, "audiocpp_cli.exe")

PARAKEET_GGUF = os.path.join(AUDIOCPP_DIR, "models", "Parakeet-TDT-0.6B-v3-GGUF", "parakeet-tdt-0.6b-v3-q8_0.gguf")
NEMOTRON_GGUF = os.path.join(AUDIOCPP_DIR, "models", "Nemotron-3.5-ASR-Streaming-0.6B-GGUF", "nemotron-3.5-asr-streaming-0.6b-q8_0.gguf")

SAMPLE_JULIEN = os.path.join(REPO_ROOT, "vault-explorer", "tests", "benchmark_julien_16k.wav")
SAMPLE_GOLDEN = os.path.join(AUDIOCPP_DIR, "tests", "parakeet_tdt", "assets", "2086-149220-0033.wav")
SAMPLE_LONG = os.path.join(REPO_ROOT, "vault-cacophony", "samples", "ItJustDoesntMatter16k.wav")

def get_audio_duration(wav_path):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav_path]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(res.stdout.strip())
    except Exception:
        return 0.0

def run_engine_benchmark(task_name, family, model_path, mode, backend, audio_path, extra_args=None):
    if not os.path.exists(model_path):
        return {
            "task": task_name,
            "success": False,
            "error": f"Model not found: {model_path}"
        }
    
    cmd = [
        CLI,
        "--task", "asr",
        "--family", family,
        "--model", model_path,
        "--backend", backend,
        "--mode", mode,
        "--audio", audio_path,
        "--metrics"
    ]
    if extra_args:
        cmd.extend(extra_args)

    t0 = time.perf_counter()
    proc = subprocess.run(cmd, cwd=AUDIOCPP_DIR, capture_output=True, text=True, encoding="utf-8", errors="replace")
    wall_sec = time.perf_counter() - t0
    
    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    
    # Parse metrics from stdout
    rtf = None
    x_realtime = None
    transcript = ""
    
    for line in stdout.splitlines():
        if line.startswith("metrics.rtf="):
            try: rtf = float(line.split("=")[1].strip())
            except: pass
        elif line.startswith("metrics.x_realtime="):
            try: x_realtime = float(line.split("=")[1].strip())
            except: pass
        elif line.startswith("text_output="):
            transcript = line[len("text_output="):].strip()
        elif not line.startswith("metrics.") and not line.startswith("family=") and not line.startswith("task=") and not line.startswith("mode="):
            if line.strip() and not transcript:
                transcript = line.strip()

    audio_dur = get_audio_duration(audio_path)
    if rtf is None and audio_dur > 0:
        rtf = wall_sec / audio_dur
        x_realtime = audio_dur / wall_sec if wall_sec > 0 else 0

    # Validate transcript fidelity (check for degenerate repetitive loops)
    success = proc.returncode == 0
    error = ""
    if transcript:
        # If single character makes up > 50% of transcript or words < 2 on non-trivial audio
        if len(transcript) > 20 and (transcript.count('f') / len(transcript) > 0.5 or len(set(transcript)) < 5):
            success = False
            error = f"Degenerate repetitive token loop detected in audio.cpp decoder: \"{transcript[:40]}...\""
            transcript = f"[DEGENERATE OUTPUT: {transcript[:60]}...]"

    return {
        "task": task_name,
        "family": family,
        "mode": mode,
        "backend": backend,
        "audio": os.path.basename(audio_path),
        "duration_sec": audio_dur,
        "wall_sec": wall_sec,
        "rtf": rtf,
        "speedup": x_realtime,
        "transcript": transcript,
        "word_count": len(transcript.split()) if transcript else 0,
        "success": success,
        "error": error if error else (stderr[:300] if proc.returncode != 0 else ""),
        "stderr_snippet": stderr[:300] if proc.returncode != 0 else ""
    }

def main():
    print("=" * 90)
    print("   AUDIO.CPP GGUF ASR COMPARATIVE BENCHMARK: PARAKEET-TDT 0.6B vs NEMOTRON 3.5 0.6B   ")
    print("=" * 90)
    
    test_runs = [
        # --- Julien Lacroix French Comedy Sample (178.5s) ---
        {
            "task": "Parakeet-TDT 0.6B (CUDA Full Context)",
            "family": "parakeet_tdt",
            "model": PARAKEET_GGUF,
            "mode": "offline",
            "backend": "cuda",
            "audio": SAMPLE_JULIEN,
            "extra": []
        },
        {
            "task": "Parakeet-TDT 0.6B (CUDA Long-Form Bounded)",
            "family": "parakeet_tdt",
            "model": PARAKEET_GGUF,
            "mode": "offline",
            "backend": "cuda",
            "audio": SAMPLE_JULIEN,
            "extra": ["--session-option", "parakeet_tdt.offline_mode=long_form"]
        },
        {
            "task": "Nemotron-3.5 0.6B (CUDA Full Context)",
            "family": "nemotron_asr",
            "model": NEMOTRON_GGUF,
            "mode": "offline",
            "backend": "cuda",
            "audio": SAMPLE_JULIEN,
            "extra": []
        },
        {
            "task": "Nemotron-3.5 0.6B (CUDA Streaming Mode)",
            "family": "nemotron_asr",
            "model": NEMOTRON_GGUF,
            "mode": "streaming",
            "backend": "cuda",
            "audio": SAMPLE_JULIEN,
            "extra": []
        },
        # --- Golden Reference Test Audio (7.5s) ---
        {
            "task": "Parakeet-TDT 0.6B (Golden Test Audio)",
            "family": "parakeet_tdt",
            "model": PARAKEET_GGUF,
            "mode": "offline",
            "backend": "cuda",
            "audio": SAMPLE_GOLDEN,
            "extra": []
        },
        {
            "task": "Nemotron-3.5 0.6B (Golden Test Audio)",
            "family": "nemotron_asr",
            "model": NEMOTRON_GGUF,
            "mode": "offline",
            "backend": "cuda",
            "audio": SAMPLE_GOLDEN,
            "extra": []
        }
    ]

    all_results = []
    for r in test_runs:
        print(f"\n>> Running: {r['task']} on {os.path.basename(r['audio'])}...")
        res = run_engine_benchmark(
            r["task"], r["family"], r["model"], r["mode"], r["backend"], r["audio"], r["extra"]
        )
        all_results.append(res)
        
        status = "PASS" if res.get("success") else "FAIL"
        if res.get("success"):
            print(f"   [PASS] Elapsed: {res['wall_sec']:.2f}s | RTF: {res['rtf']:.4f} ({res['speedup']:.1f}x real-time) | Words: {res['word_count']}", flush=True)
            if res.get("transcript"):
                print(f"   Transcript: \"{res['transcript'][:120]}...\"", flush=True)
        else:
            print(f"   [FAIL] {res.get('error') or res.get('stderr_snippet')}", flush=True)

    # Output Comparative Table
    print("\n" + "=" * 96)
    print(f"{'Engine & Configuration':<46} | {'Audio':<18} | {'Wall Sec':<10} | {'RTF':<8} | {'Speedup':<8} | {'Status'}")
    print("-" * 96)
    for r in all_results:
        status_str = "PASS" if r.get("success") else "FAIL"
        wall = f"{r.get('wall_sec', 0):.2f}s" if r.get('success') else "N/A"
        rtf_str = f"{r.get('rtf', 0):.4f}" if r.get('rtf') is not None else "N/A"
        speedup_str = f"{r.get('speedup', 0):.1f}x" if r.get('speedup') is not None else "N/A"
        print(f"{r['task']:<46} | {r.get('audio', ''):<18} | {wall:>8}   | {rtf_str:>7} | {speedup_str:>7} | {status_str}")
    print("=" * 96)

    # Save to JSON
    out_file = os.path.join(REPO_ROOT, "vault-explorer", "tests", "parakeet_vs_nemotron_benchmark_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nResults saved to: {out_file}")

if __name__ == "__main__":
    main()
