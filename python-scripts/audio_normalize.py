import os
import sys
import shutil
import subprocess
import time
import tempfile
import threading
import math
import json
import argparse

# Ensure parent and media processing repo paths are in sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(script_dir, ".."))
media_processing_root = os.path.abspath(os.path.join(project_root, "..", "vaultwares-media-processing"))
sys.path.insert(0, media_processing_root)

# Import/Warm-load Parakeet as requested (off by default, but imported and available)
try:
    from vaultwares_media_processing.parakeet_wrapper import ParakeetV3Wrapper
    print("ASR Engine: Parakeet V3 imported successfully.")
except Exception as e:
    print(f"Parakeet import note: {e}")

def get_video_duration(path):
    cmd = [
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', path
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        return 0.0

def report_progress(percent, label):
    data = {"percent": percent, "label": label}
    print(f"PROGRESS_UPDATE:{json.dumps(data)}")
    sys.stdout.flush()

def run_command_with_progress(cmd, desc, start_pct, scale, duration):
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        encoding='utf-8',
        errors='replace'
    )
    
    def reader():
        for line in process.stdout:
            # Parse FFmpeg style progress
            if "out_time_ms=" in line:
                try:
                    time_ms = int(line.split("=")[1].strip())
                    if duration > 0:
                        pct = min(100, int((time_ms / 1000000) / duration * scale) + start_pct)
                        report_progress(pct, f"{desc}... {pct-start_pct}%")
                except Exception:
                    pass
            # Parse Demucs style progress (tqdm)
            elif "%|" in line:
                try:
                    pct_str = line.split("%")[0].strip().split()[-1]
                    pct = int(pct_str)
                    scaled_pct = start_pct + int(pct * (scale / 100.0))
                    report_progress(scaled_pct, f"{desc}... {pct}%")
                except Exception:
                    pass

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    process.wait()
    t.join()
    
    if process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, cmd)

def main():
    parser = argparse.ArgumentParser(description="Real-time Demucs + FFmpeg dynaudnorm audio normalization")
    parser.add_argument("video_path", help="Path to video file")
    parser.add_argument("vault_root", nargs="?", default=None, help="Root vault path")
    parser.add_argument("--transcribe", action="store_true", default=False, help="Enable automatic speech transcription and translation using Parakeet & isolated vocals")
    
    args = parser.parse_args()
    
    video_path = os.path.abspath(args.video_path)
    vault_root = os.path.abspath(args.vault_root) if args.vault_root else os.path.dirname(video_path)
    
    if not os.path.exists(video_path):
        print(f"Error: Video file {video_path} does not exist.")
        sys.exit(1)
        
    rel_path = os.path.relpath(video_path, vault_root)
    unique_base = "".join([c if c.isalnum() else '_' for c in rel_path])
    
    normalized_dir = os.path.join(vault_root, '.normalized')
    os.makedirs(normalized_dir, exist_ok=True)
    
    _, ext = os.path.splitext(video_path)
    output_path = os.path.join(normalized_dir, f"{unique_base}{ext}")
    
    if os.path.exists(output_path):
        print(f"JSON_STATUS:{json.dumps({'status': 'EXISTS', 'path': output_path})}")
        sys.exit(0)
        
    print(f"JSON_STATUS:{json.dumps({'status': 'STARTING', 'path': output_path})}")
    sys.stdout.flush()
    
    duration = get_video_duration(video_path)
    temp_dir = os.path.join(os.path.dirname(output_path), f"temp_norm_{unique_base}")
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        # Step 1: Vocal Separation using Demucs (No temporary wav written BEFORE demucs)
        report_progress(5, "Initializing vocal isolation (Demucs)...")
        
        # Determine the python executable inside the media-processing venv
        venv_python = os.path.join(media_processing_root, ".venv", "Scripts", "python.exe")
        if not os.path.exists(venv_python):
            venv_python = sys.executable
            
        demucs_cmd = [
            venv_python, "-m", "demucs.separate",
            "-n", "htdemucs", "-d", "cuda", "--two-stems=vocals",
            "--shifts=1", "--overlap=0.25", "-o", temp_dir,
            "--filename", "{stem}.{ext}", video_path
        ]
        
        try:
            run_command_with_progress(demucs_cmd, "Separating Vocals (GPU)", 10, 40, duration)
        except Exception:
            # Fallback to CPU
            report_progress(15, "Demucs GPU separation failed. Retrying on CPU...")
            if "-d" in demucs_cmd:
                demucs_cmd.remove("-d")
                demucs_cmd.remove("cuda")
            run_command_with_progress(demucs_cmd, "Separating Vocals (CPU)", 15, 35, duration)
            
        vocals_path = os.path.join(temp_dir, "htdemucs", "vocals.wav")
        if not os.path.exists(vocals_path):
            raise RuntimeError(f"Vocal separation failed: output WAV not found at {vocals_path}")
            
        # Step 2: Dynamic Normalization and Mixing
        report_progress(55, "Applying dynamic normalization & vocal mixing...")
        
        # mixing filter: normalizes background track, isolates vocals with highpass and normalizes, mixes them
        bg_volume = "-20dB"
        filter_complex = (
            f"[0:a]dynaudnorm=f=250:g=31:p=0.95:m=100[bg_norm];"
            f"[bg_norm]volume={bg_volume}[bg];"
            f"[1:a]highpass=f=100,dynaudnorm=f=250:g=31:p=0.95:m=100[voc];"
            f"[bg][voc]amix=inputs=2:weights=1 1.5:duration=first:normalize=0[out_a]"
        )
        
        # Mux audio and video streams using NVENC if available (realtime processing!)
        ffmpeg_args = [
            "ffmpeg", "-y", "-hide_banner", "-err_detect", "ignore_err", "-fflags", "+genpts",
            "-i", video_path, "-i", vocals_path,
            "-filter_complex", filter_complex,
            "-map", "0:v:0",
            "-map", "[out_a]",
            "-c:v", "h264_nvenc", "-preset", "p6", "-rc", "constqp", "-qp", "26",
            "-c:a", "aac", "-b:a", "320k",
            output_path
        ]
        
        try:
            run_command_with_progress(ffmpeg_args, "Encoding Normalized Audio", 60, 30, duration)
        except Exception:
            report_progress(65, "NVENC encoding failed. Falling back to CPU (libx264)...")
            # Fallback to libx264
            idx = ffmpeg_args.index("h264_nvenc")
            ffmpeg_args[idx] = "libx264"
            for arg in ["-preset", "p6", "-rc", "constqp", "-qp", "26"]:
                if arg in ffmpeg_args:
                    ffmpeg_args.remove(arg)
            ffmpeg_args.extend(["-crf", "23"])
            run_command_with_progress(ffmpeg_args, "Encoding Normalized Audio (CPU)", 65, 25, duration)
            
        # Step 3: Transcription / Translation (using the already isolated vocals_path)
        if args.transcribe:
            report_progress(91, "Warm-loading ASR Parakeet model...")
            try:
                model = ParakeetV3Wrapper()
                report_progress(93, "Transcribing isolated vocals track (Parakeet)...")
                all_segments = model.transcribe_file(vocals_path)
                
                if all_segments:
                    report_progress(96, "Generating original & English subtitles...")
                    original_base = os.path.splitext(video_path)[0]
                    normalized_base = os.path.splitext(output_path)[0]
                    
                    original_texts = [seg.text for seg in all_segments]
                    
                    from vaultwares_media_processing import utils
                    utils.write_srt(original_base + ".srt", all_segments, original_texts)
                    utils.write_srt(original_base + ".en.srt", all_segments, original_texts)
                    
                    utils.write_srt(normalized_base + ".srt", all_segments, original_texts)
                    utils.write_srt(normalized_base + ".en.srt", all_segments, original_texts)
                    
                    report_progress(98, "Performing native translation of isolated vocals to French...")
                    try:
                        translated_segments = model.transcribe_file(
                            vocals_path,
                            language="en",
                            target_language="fr"
                        )
                        translated_texts = [seg.text for seg in translated_segments]
                        
                        utils.write_srt(original_base + ".fr.srt", translated_segments, translated_texts)
                        utils.write_srt(normalized_base + ".fr.srt", translated_segments, translated_texts)
                        print("Subtitles successfully generated and translated natively!")
                    except Exception as trans_ex:
                        print(f"Translation to French skipped: {trans_ex}")
                else:
                    print("No speech detected in isolated vocals.")
            except Exception as asr_ex:
                print(f"ASR/Transcription skipped/failed: {asr_ex}")
                
        report_progress(100, "Audio normalization and AI transcription completed successfully!")
        print(f"JSON_STATUS:{json.dumps({'status': 'SUCCESS', 'path': output_path})}")
        
    except Exception as e:
        print(f"JSON_STATUS:{json.dumps({'status': 'FAILED', 'error': str(e)})}")
        sys.exit(1)
    finally:
        # Cleanup temp files
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    main()
