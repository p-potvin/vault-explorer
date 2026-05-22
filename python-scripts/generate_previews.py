import os
import sys
import math
import random
import subprocess
import shutil
import tempfile
import time

SUPPORTED_EXTENSIONS = ('.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv')

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

def generate_thumb_and_preview(video_path, vault_root):
    # Compute relative path and unique base matching the Node.js implementation
    rel_path = os.path.relpath(video_path, vault_root)
    # Replaces all non-alphanumeric chars with '_'
    unique_base = "".join([c if c.isalnum() else '_' for c in rel_path])
    
    thumbs_dir = os.path.join(vault_root, '.thumbs')
    if not os.path.exists(thumbs_dir):
        os.makedirs(thumbs_dir, exist_ok=True)
        
    thumb_path = os.path.join(thumbs_dir, f"{unique_base}.jpg")
    webm_path = os.path.join(thumbs_dir, f"{unique_base}.webm")
    
    duration = get_video_duration(video_path)
    if duration <= 0:
        print(f"Skipping {video_path}: invalid duration.")
        return
        
    # 1. Generate Thumbnail (min(20, duration))
    if not os.path.exists(thumb_path):
        thumb_time = min(20.0, duration) if duration > 0 else 5.0
        print(f"  -> Generating thumbnail at {thumb_time:.2f}s...")
        cmd = [
            'ffmpeg', '-y',
            '-ss', f"{thumb_time:.2f}",
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '2',
            thumb_path,
            '-loglevel', 'error'
        ]
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            print(f"  [ERROR] Failed to generate thumbnail: {e}")
            
    # 2. Generate WebM Preview
    if not os.path.exists(webm_path):
        print(f"  -> Generating WebM preview (duration: {duration:.2f}s)...")
        if duration <= 100.0:
            # Transcode full video
            print("  -> Short video (<=100s). Transcoding full preview...")
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-c:v', 'libvpx-vp9',
                '-b:v', '1M',
                '-deadline', 'realtime',
                '-cpu-used', '8',
                '-c:a', 'libopus',
                '-b:a', '64k',
                webm_path,
                '-loglevel', 'error'
            ]
            try:
                subprocess.run(cmd, check=True)
            except subprocess.CalledProcessError as e:
                print(f"  [ERROR] Full transcode failed: {e}")
        else:
            # 12 clips of 5 seconds each
            num_clips = 12
            interval = duration / num_clips
            clip_dur = 5.0
            temp_clips = []
            
            temp_dir = tempfile.gettempdir()
            print("  -> Extracting 12 sub-clips...")
            try:
                for i in range(num_clips):
                    seek_time = interval * i
                    temp_clip = os.path.join(temp_dir, f"py-clip-{int(time.time())}-{i}.webm")
                    temp_clips.append(temp_clip)
                    
                    cmd = [
                        'ffmpeg', '-y',
                        '-ss', f"{seek_time:.2f}",
                        '-i', video_path,
                        '-t', f"{clip_dur:.2f}",
                        '-c:v', 'libvpx-vp9',
                        '-b:v', '1M',
                        '-deadline', 'realtime',
                        '-cpu-used', '8',
                        '-c:a', 'libopus',
                        '-b:a', '64k',
                        temp_clip,
                        '-loglevel', 'error'
                    ]
                    subprocess.run(cmd, check=True)
                
                # Concat the clips
                print("  -> Concatenating clips...")
                concat_txt = os.path.join(temp_dir, f"py-concat-{int(time.time())}.txt")
                with open(concat_txt, 'w', encoding='utf-8') as f:
                    for clip in temp_clips:
                        # ffmpeg concat protocol wants single quotes escaped
                        escaped_path = clip.replace('\\', '/').replace("'", "'\\''")
                        f.write(f"file '{escaped_path}'\n")
                        
                concat_cmd = [
                    'ffmpeg', '-y',
                    '-safe', '0',
                    '-f', 'concat',
                    '-i', concat_txt,
                    '-c', 'copy',
                    webm_path,
                    '-loglevel', 'error'
                ]
                subprocess.run(concat_cmd, check=True)
                
                # Cleanup temp files
                for clip in temp_clips:
                    try: os.remove(clip)
                    except Exception: pass
                try: os.remove(concat_txt)
                except Exception: pass
                print(f"  [SUCCESS] Preview saved to {webm_path}")
            except Exception as e:
                print(f"  [ERROR] Segment/Concat failed: {e}")
                # Cleanup
                for clip in temp_clips:
                    try: os.remove(clip)
                    except Exception: pass
                try: os.remove(concat_txt)
                except Exception: pass

def main():
    if len(sys.argv) > 1:
        scan_dir = sys.argv[1]
    else:
        # Default to F:\ if available, else current drive root
        scan_dir = 'F:\\' if os.path.exists('F:\\') else os.path.abspath(os.sep)
        
    print(f"==================================================")
    print(f"Vault Previews Background Generator starting")
    print(f"Scanning target: {scan_dir}")
    print(f"Started at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"==================================================")
    
    if not os.path.exists(scan_dir):
        print(f"Target directory {scan_dir} does not exist. Exiting.")
        sys.exit(1)
        
    # Gather files
    video_files = []
    for root, dirs, files in os.walk(scan_dir):
        # Skip existing .thumbs directories
        if '.thumbs' in dirs:
            dirs.remove('.thumbs')
            
        for file in files:
            if file.lower().endswith(SUPPORTED_EXTENSIONS):
                # Ensure we don't process preview clips
                if '_p.mp4' in file or '-preview.mp4' in file:
                    continue
                video_files.append(os.path.join(root, file))
                
    total_files = len(video_files)
    print(f"Found {total_files} video files to check.")
    
    for idx, video_path in enumerate(video_files):
        print(f"[{idx+1}/{total_files}] Processing: {video_path}")
        try:
            generate_thumb_and_preview(video_path, scan_dir)
        except Exception as e:
            print(f"  [CRITICAL ERROR] Failed processing {video_path}: {e}")
            
    print(f"\n==================================================")
    print(f"Processing finished successfully!")
    print(f"Ended at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"==================================================")

if __name__ == '__main__':
    main()
