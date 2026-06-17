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
    // RTX VSR Video Upscale (permanent enhancement → .thumbs folder)
    ipcMain.handle('upscale-video', async (event, filePath) => {
        console.log('[media.ipc:upscale] RTX VSR requested for:', filePath);
        if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }

        const ext = path.extname(filePath);
        const dir = path.dirname(filePath);
        const name = path.basename(filePath);
        const baseName = path.basename(filePath, ext);
        const thumbsDir = path.join(dir, '.thumbs');
        const outputPath = path.join(thumbsDir, `${baseName}_enhanced${ext}`);
        const metaPath = filePath + '.meta.json';

        // Ensure .thumbs directory exists
        if (!fs.existsSync(thumbsDir)) {
            fs.mkdirSync(thumbsDir, { recursive: true });
        }

        // Skip redundant enhancement: check sidecar metadata
        if (fs.existsSync(metaPath) && fs.existsSync(outputPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (meta.enhancements && meta.enhancements.video === true) {
                    console.log('[media.ipc:upscale] Skipping redundant enhancement (already in .thumbs):', filePath);
                    return { success: true, path: outputPath, skipped: true };
                }
            } catch (e) {}
        }

        const pythonPath = process.platform === 'win32'
            ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
            : path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
        const scriptPath = path.join(__dirname, '..', '..', 'python-scripts', 'rtx_vsr_stream.py');

        return new Promise((resolve) => {
            const args = [
                scriptPath,
                'enhance',
                filePath,
                outputPath,
                '--quality', 'HIGH',
            ];

            console.log(`[media.ipc:upscale] Spawning: ${pythonPath} ${args.join(' ')}`);
            const proc = child_process.spawn(pythonPath, args, { windowsHide: true });

            let errorData = '';
            let stdoutBuffer = '';
            let stderrBuffer = '';

            proc.stdout.on('data', (data) => {
                const str = data.toString();
                stdoutBuffer += str;
                let lines = stdoutBuffer.split(/\r?\n/);
                stdoutBuffer = lines.pop();
                for (const line of lines) {
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
                    console.log(`[media.ipc:upscale:stderr] ${line.trim()}`);
                }
            });

            proc.on('close', (code) => {
                if (stdoutBuffer.trim()) console.log(`[media.ipc:upscale:stdout] ${stdoutBuffer.trim()}`);
                if (stderrBuffer.trim()) console.log(`[media.ipc:upscale:stderr] ${stderrBuffer.trim()}`);
                console.log(`[media.ipc:upscale] Finished with code ${code}`);

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    try {
                        let meta = {};
                        if (fs.existsSync(metaPath)) {
                            try {
                                meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                            } catch (e) {}
                        }
                        if (!meta.enhancements) {
                            meta.enhancements = { audio: false, video: false, subtitles: [], translation: [] };
                        }
                        meta.enhancements.video = true;
                        meta.enhancedPath = outputPath;
                        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
                    } catch (e) {}
                    resolve({ success: true, path: outputPath });
                } else {
                    resolve({ success: false, error: errorData.trim() || `RTX VSR exited with code ${code}` });
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
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const enhancedFile = path.join(dir, '.thumbs', `${baseName}_enhanced${ext}`);
        const metaPath = filePath + '.meta.json';

        try {
            if (fs.existsSync(enhancedFile)) {
                fs.unlinkSync(enhancedFile);
            }
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    meta.enhancements = { audio: false, video: false, subtitles: [], translation: [] };
                    delete meta.enhancedPath;
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

    // Streaming Upscale (Real-time AI upscaling with MediaSource)
    let upscaleStreamProcess = null;
    let upscaleStreamEvent = null;

    ipcMain.handle('upscale-stream-start', async (event, { videoPath, startTime }) => {
        console.log('[media.ipc:upscale-stream] Starting RTX VSR real-time stream for:', videoPath, 'from time:', startTime);

        // Kill any existing process
        if (upscaleStreamProcess) {
            try { upscaleStreamProcess.kill('SIGKILL'); } catch(e) {}
            upscaleStreamProcess = null;
        }
        upscaleStreamEvent = event;

        if (typeof videoPath !== 'string' || !fs.existsSync(videoPath)) {
            return { success: false, error: 'File not found' };
        }

        const pythonPath = process.platform === 'win32'
            ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
            : path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
        const scriptPath = path.join(__dirname, '..', '..', 'python-scripts', 'rtx_vsr_stream.py');

        const args = [
            scriptPath,
            'stream',
            videoPath,
            '--start-time', String(startTime || 0),
            '--quality', 'HIGH',
        ];

        console.log(`[media.ipc:upscale-stream] Spawning: ${pythonPath} ${args.join(' ')}`);

        try {
            const proc = child_process.spawn(pythonPath, args, {
                windowsHide: true,
                // Ensure binary stdout is not mangled
                env: { ...process.env, PYTHONUNBUFFERED: '1' },
            });
            upscaleStreamProcess = proc;

            const sendStatus = (type, data = {}) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('upscale-status', { type, ...data });
                }
            };

            // Send initial status with source dimensions
            const probe = await getFullProbeMetadata(videoPath);
            let srcW = 0, srcH = 0;
            if (probe && Array.isArray(probe.streams)) {
                const vStream = probe.streams.find(s => s.codec_type === 'video');
                if (vStream) {
                    srcW = vStream.width || 0;
                    srcH = vStream.height || 0;
                }
            }
            sendStatus('init', {
                width: srcW,
                height: srcH,
                fps: probe && probe.streams ? 30 : 0,
                label: 'RTX VSR initializing…',
            });

            let frameCount = 0;

            // Forward MP4 chunks from Python stdout to renderer
            proc.stdout.on('data', (data) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    frameCount++;
                    // Send the chunk as a Node Buffer (will be serialized to ArrayBuffer)
                    event.sender.send('upscale-chunk', {
                        chunk: frameCount,
                        buffer: data,
                    });
                }
            });

            let stderrBuffer = '';
            proc.stderr.on('data', (data) => {
                const str = data.toString();
                stderrBuffer += str;
                // Log VSR progress lines to console
                const lines = str.split(/\r?\n/);
                for (const line of lines) {
                    if (line.trim()) {
                        console.log(`[rtx-vsr] ${line.trim()}`);
                    }
                }
                // Report processing status based on frame count in stderr
                const match = str.match(/Processed (\d+) frames/);
                if (match) {
                    const frames = parseInt(match[1], 10);
                    sendStatus('processing', { chunk: frames, label: `RTX VSR · ${frames} frames` });
                }
            });

            proc.on('close', (code) => {
                console.log(`[media.ipc:upscale-stream] RTX VSR stream exited with code ${code}`);
                upscaleStreamProcess = null;
                upscaleStreamEvent = null;
                if (code === 0 || code === null) {
                    sendStatus('done');
                } else {
                    sendStatus('chunk-error', { error: stderrBuffer.trim() || `RTX VSR exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                console.error('[media.ipc:upscale-stream] Process error:', err);
                sendStatus('chunk-error', { error: err.message });
            });

            return { success: true };
        } catch (err) {
            console.error('[media.ipc:upscale-stream] Failed to start:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('upscale-stream-stop', async () => {
        console.log('[media.ipc:upscale-stream] Stopping RTX VSR stream...');

        if (upscaleStreamProcess) {
            try {
                // On Windows SIGKILL doesn't exist; use kill() which terminates the tree
                upscaleStreamProcess.kill('SIGKILL');
            } catch(e) {
                try { upscaleStreamProcess.kill(); } catch(e2) {}
            }
            upscaleStreamProcess = null;
            upscaleStreamEvent = null;
        }

        return { success: true };
    });

}

module.exports = {
    registerMediaIpc
};
