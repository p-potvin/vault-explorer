// media.ipc.js — handles VSR upscaling subprocess wrappers, enhancements tracking, and ffprobe stream introspection.

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const child_process = require('child_process');

function getFullProbeMetadata(filePath) {
    return new Promise((resolve) => {
        child_process.execFile('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath], (err, stdout) => {
            if (err) {
                console.error('[media.ipc:ffprobe] Failed to probe:', err);
                resolve(null);
            } else {
                try {
                    resolve(JSON.parse(stdout.trim()));
                } catch (e) {
                    resolve(null);
                }
            }
        });
    });
}

function registerMediaIpc(ipcMain) {
    // ESRGAN Super-Resolution Video Upscale
    ipcMain.handle('upscale-video', async (event, filePath) => {
        console.log('[media.ipc:upscale] RealESRGAN requested for:', filePath);
        if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }

        const ext = path.extname(filePath);
        const dir = path.dirname(filePath);
        const name = path.basename(filePath);
        const enhancedDir = path.join(dir, '.enhanced');
        if (!fs.existsSync(enhancedDir)) {
            fs.mkdirSync(enhancedDir, { recursive: true });
        }
        const outputPath = path.join(enhancedDir, name);

        let sourcePath = filePath;
        let tempSourceFile = null;
        if (fs.existsSync(outputPath)) {
            const tempDir = path.join(enhancedDir, 'temp_upscale');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            tempSourceFile = path.join(tempDir, 'temp_src_' + name);
            try {
                fs.copyFileSync(outputPath, tempSourceFile);
                sourcePath = tempSourceFile;
            } catch (copyErr) {
                console.error('[media.ipc:upscale] Failed to create temp copy of existing enhanced file:', copyErr.message);
            }
        }

        const realesrganPath = path.join(__dirname, '..', '..', 'tools', 'realesrgan-ncnn-vulkan.exe');
        const modelsPath = path.join(__dirname, '..', '..', 'tools', 'models');

        if (!fs.existsSync(realesrganPath)) {
            if (tempSourceFile && fs.existsSync(tempSourceFile)) {
                try { fs.unlinkSync(tempSourceFile); } catch (e) {}
            }
            return { success: false, error: 'RealESRGAN executable not found in tools/' };
        }

        return new Promise((resolve) => {
            const args = [
                '-i', sourcePath,
                '-o', outputPath,
                '-n', 'realesr-animevideov3-x2',
                '-m', modelsPath
            ];

            console.log(`[media.ipc:upscale] Spawning: ${realesrganPath} ${args.join(' ')}`);
            const proc = child_process.spawn(realesrganPath, args, { windowsHide: true });

            let errorData = '';
            let stdoutBuffer = '';
            let stderrBuffer = '';

            const handleLine = (line) => {
                const match = line.match(/(\d+(?:\.\d+)?)%/);
                if (match) {
                    const percent = Math.round(parseFloat(match[1]));
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('upscale-progress', { videoPath: filePath, percent, label: `Upscaling... ${percent}%` });
                    }
                }
            };

            proc.stdout.on('data', (data) => {
                const str = data.toString();
                stdoutBuffer += str;
                let lines = stdoutBuffer.split(/\r?\n/);
                stdoutBuffer = lines.pop();
                for (const line of lines) {
                    handleLine(line);
                    console.log(`[media.ipc:upscale:stdout] ${line.trim()}`);
                }
            });

            proc.stderr.on('data', (data) => {
                const str = data.toString();
                errorData += str;
                stderrBuffer += str;
                let lines = stderrBuffer.split(/\r?\n/);
                stderrBuffer = lines.pop();
                for (const line of lines) {
                    handleLine(line);
                    console.log(`[media.ipc:upscale:stderr] ${line.trim()}`);
                }
            });

            proc.on('close', (code) => {
                if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
                if (stderrBuffer.trim()) handleLine(stderrBuffer);
                console.log(`[media.ipc:upscale] Finished with code ${code}`);

                if (tempSourceFile && fs.existsSync(tempSourceFile)) {
                    try { fs.unlinkSync(tempSourceFile); } catch (e) {}
                }

                if (code === 0 && fs.existsSync(outputPath)) {
                    const metaPath = filePath + '.meta.json';
                    if (fs.existsSync(metaPath)) {
                        try {
                            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                            if (!meta.enhancements) {
                                meta.enhancements = { audio: false, video: false, subtitles: [], translation: [] };
                            }
                            meta.enhancements.video = true;
                            meta.enhancedPath = outputPath;
                            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
                        } catch (e) {}
                    }
                    resolve({ success: true, path: outputPath });
                } else {
                    resolve({ success: false, error: errorData.trim() || `RealESRGAN process exited with code ${code}` });
                }
            });
        });
    });

    // Revert Enhancements
    ipcMain.handle('revert-enhancements', async (_event, filePath) => {
        if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }
        const dir = path.dirname(filePath);
        const name = path.basename(filePath);
        const enhancedFile = path.join(dir, '.enhanced', name);
        const metaPath = filePath + '.meta.json';

        try {
            if (fs.existsSync(enhancedFile)) {
                fs.unlinkSync(enhancedFile);
            }
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    meta.enhancements = { audio: false, video: false, subtitles: [], translation: [] };
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
                } catch (e) {}
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // Get File Properties
    ipcMain.handle('get-file-properties', async (_event, filePath) => {
        if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }
        const metaPath = filePath + '.meta.json';
        try {
            const stats = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();

            // 1. Check if sidecar metadata already exists
            if (fs.existsSync(metaPath)) {
                try {
                    const cached = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    // Refresh size and mod times
                    cached.size = stats.size;
                    cached.modified = stats.mtime;
                    return { success: true, properties: cached };
                } catch (cacheErr) {
                    console.error('[media.ipc:properties] Cache read error, re-probing:', cacheErr.message);
                }
            }

            // 2. Fetch fresh properties
            const baseProps = {
                name: path.basename(filePath),
                path: filePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                type: ext,
                width: null,
                height: null,
                duration: null,
                codec: null,
                bitrate: null,
                audioCodec: null,
                channels: null,
                sampleRate: null,
                fps: null,
                hasAudio: false,
                hasVideo: false,
                enhancements: { audio: false, video: false, subtitles: [], translation: [] }
            };

            if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) {
                const probeData = await getFullProbeMetadata(filePath);
                if (probeData) {
                    if (probeData.format) {
                        baseProps.duration = parseFloat(probeData.format.duration) || null;
                        baseProps.bitrate = parseInt(probeData.format.bit_rate) || null;
                    }
                    if (Array.isArray(probeData.streams)) {
                        const videoStream = probeData.streams.find(s => s.codec_type === 'video');
                        baseProps.hasVideo = !!videoStream;
                        if (videoStream) {
                            baseProps.width = videoStream.width || null;
                            baseProps.height = videoStream.height || null;
                            baseProps.codec = videoStream.codec_name || null;
                            if (videoStream.r_frame_rate) {
                                const parts = videoStream.r_frame_rate.split('/');
                                if (parts.length === 2 && parseFloat(parts[1]) > 0) {
                                    baseProps.fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
                                } else {
                                    baseProps.fps = parseFloat(videoStream.r_frame_rate) || null;
                                }
                            }
                        }
                        const audioStream = probeData.streams.find(s => s.codec_type === 'audio');
                        baseProps.hasAudio = !!audioStream;
                        if (audioStream) {
                            baseProps.audioCodec = audioStream.codec_name || null;
                            baseProps.channels = audioStream.channels || null;
                            baseProps.sampleRate = parseInt(audioStream.sample_rate) || null;
                        }
                    }

                    // Save sidecar metadata
                    try {
                        fs.writeFileSync(metaPath, JSON.stringify(baseProps, null, 2), 'utf8');
                        console.log('[media.ipc:properties] Saved sidecar metadata:', metaPath);
                    } catch (saveErr) {
                        console.error('[media.ipc:properties] Failed to save sidecar metadata:', saveErr.message);
                    }
                }
            }

            return { success: true, properties: baseProps };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
}

module.exports = {
    registerMediaIpc
};
