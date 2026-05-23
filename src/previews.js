const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { execFile } = child_process;
const utils = require('./utils');

const backgroundFfmpegQueue = new utils.PriorityQueue();
const activeQueuePaths = new Set();
const benchmarkPath = path.join(__dirname, '..', 'BENCHMARKS.md');

function writeBenchmark(entry) {
    const header = `| Timestamp | Video Name | Size | Duration | Thumb Time | WebM Time | Status \n| --- | --- | --- | --- | --- | --- | --- |`;
    if (!fs.existsSync(benchmarkPath)) {
        fs.writeFileSync(benchmarkPath, header, 'utf8');
    }
    const row = `\n| ${new Date().toISOString()} | ${entry.name} | ${entry.size} | ${entry.duration.toFixed(1)}s | ${entry.thumbTime ? entry.thumbTime.toFixed(0) + 'ms' : 'N/A'} | ${entry.webmTime ? entry.webmTime.toFixed(0) + 'ms' : 'N/A'} | ${entry.status} |`;
    fs.appendFileSync(benchmarkPath, row, 'utf8');
}

async function generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath, sender = null) {
    const duration = await utils.getVideoDuration(videoPath);
    const hasAudio = await utils.checkAudioStream(videoPath);
    
    const bothExist = fs.existsSync(thumbPath) && fs.existsSync(hoverWebmPath);
    if (bothExist) {
        console.log(`[main:preview] Skipping: both thumbnail and preview exist for ${videoPath}`);
        return;
    }
    
    // Clean partials to force clean recreation
    try { if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath); } catch(e) {}
    try { if (fs.existsSync(hoverWebmPath)) fs.unlinkSync(hoverWebmPath); } catch(e) {}
    
    let thumbStart = Date.now();
    let thumbTimeMs = null;
    const middleTime = duration > 0 ? (duration / 2).toFixed(2) : '5.00';
    try {
        await utils.runLowPriorityProcess('ffmpeg', [
            '-y',
            '-ss', middleTime,
            '-i', videoPath,
            '-vf', "select='eq(pict_type,I)'",
            '-vframes', '1',
            '-q:v', '2',
            thumbPath,
            '-loglevel', 'error'
        ]);
        thumbTimeMs = Date.now() - thumbStart;
    } catch (e) {
        console.error("Failed to generate keyframe thumbnail:", e.message);
    }

    let webmStart = Date.now();
    let webmTimeMs = null;
    try {
        console.log(`[main:webm-preview] Generating preview: ${path.basename(videoPath)}`);

        if (duration <= 100) {
            if (sender && !sender.isDestroyed()) {
                sender.send('generate-webm-progress', {
                    videoPath,
                    percent: 50,
                    label: `Creating preview...`
                });
            }
            await new Promise((res, rej) => {
                const args = [
                    '-y',
                    '-i', videoPath,
                    '-c:v', 'libvpx-vp9',
                    '-b:v', '1M',
                    '-deadline', 'realtime',
                    '-cpu-used', '8'
                ];
                if (hasAudio) {
                    args.push('-c:a', 'libopus', '-b:a', '64k');
                } else {
                    args.push('-an');
                }
                args.push(hoverWebmPath, '-loglevel', 'error');
                
                execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                    if (err) return rej(err);
                    res();
                });
            });
        } else {
            const numClips = 12;
            const interval = duration / numClips;
            const clipDuration = 5.0; // 5 seconds each, total 60s
            
            if (sender && !sender.isDestroyed()) {
                sender.send('generate-webm-progress', {
                    videoPath,
                    percent: 40,
                    label: `Compiling preview...`
                });
            }

            const args = ['-y'];
            let filterStr = '';
            for (let i = 0; i < numClips; i++) {
                const seekTime = interval * i;
                args.push('-ss', seekTime.toFixed(2), '-t', clipDuration.toFixed(2), '-i', videoPath);
                filterStr += `[${i}:v]`;
                if (hasAudio) {
                    filterStr += `[${i}:a]`;
                }
            }
            
            filterStr += `concat=n=${numClips}:v=1:a=${hasAudio ? 1 : 0}[outv]`;
            if (hasAudio) {
                filterStr += `[outa]`;
            }
            
            args.push('-filter_complex', filterStr);
            args.push('-map', '[outv]');
            if (hasAudio) {
                args.push('-map', '[outa]');
            }
            
            args.push(
                '-c:v', 'libvpx-vp9',
                '-b:v', '1M',
                '-deadline', 'realtime',
                '-cpu-used', '8'
            );
            if (hasAudio) {
                args.push('-c:a', 'libopus', '-b:a', '64k');
            } else {
                args.push('-an');
            }
            args.push(hoverWebmPath, '-loglevel', 'error');
            
            await new Promise((res, rej) => {
                execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                    if (err) return rej(err);
                    res();
                });
            });
        }
        
        webmTimeMs = Date.now() - webmStart;
        
        if (sender && !sender.isDestroyed()) {
            sender.send('generate-webm-progress', {
                videoPath,
                percent: 100,
                label: `Preview completed!`,
                thumbnail: thumbPath,
                hoverWebm: hoverWebmPath
            });
        }
        
        try {
            writeBenchmark({
                name: path.basename(videoPath),
                size: utils.formatBytes(fs.statSync(videoPath).size),
                duration,
                thumbTime: thumbTimeMs,
                webmTime: webmTimeMs,
                status: 'SUCCESS'
            });
        } catch(e) {}
    } catch (e) {
        console.error("Failed to generate WebM preview:", e.message);
        try {
            writeBenchmark({
                name: path.basename(videoPath),
                size: utils.formatBytes(fs.statSync(videoPath).size),
                duration,
                thumbTime: thumbTimeMs,
                webmTime: webmTimeMs,
                status: 'FAILED'
            });
        } catch(e) {}
    }
}

function schedulePreviewGeneration(videoPath, thumbPath, hoverWebmPath) {
    if (activeQueuePaths.has(videoPath)) return;
    activeQueuePaths.add(videoPath);
    
    backgroundFfmpegQueue.push(async () => {
        try {
            await generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath);
        } catch (e) {
            console.error(`Preview generation failed for ${videoPath}:`, e.message);
        } finally {
            activeQueuePaths.delete(videoPath);
        }
    });
}

function convertLegacyMp4Previews(thumbsDir) {
    if (!thumbsDir || !fs.existsSync(thumbsDir)) return;
    try {
        const files = fs.readdirSync(thumbsDir);
        for (const f of files) {
            if (f.toLowerCase().endsWith('.mp4')) {
                const mp4Path = path.join(thumbsDir, f);
                const webmPath = path.join(thumbsDir, path.basename(f, '.mp4') + '.webm');
                
                if (fs.existsSync(webmPath)) {
                    try { fs.unlinkSync(mp4Path); } catch (e) {}
                    continue;
                }
                
                if (activeQueuePaths.has(mp4Path)) continue;
                activeQueuePaths.add(mp4Path);
                
                backgroundFfmpegQueue.push(async () => {
                    try {
                        const hasVideo = await new Promise((resolveCheck) => {
                            execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', mp4Path], (err, stdout) => {
                                resolveCheck(!!stdout.trim());
                            });
                        });
                        if (!hasVideo) {
                            try { fs.unlinkSync(mp4Path); } catch (e) {}
                            return;
                        }
                        const hasAudio = await utils.checkAudioStream(mp4Path);
                        const args = [
                            '-y',
                            '-i', mp4Path,
                            '-threads', '2',
                            '-c:v', 'libvpx-vp9',
                            '-deadline', 'realtime',
                            '-cpu-used', '8',
                            '-b:v', '1M',
                        ];
                        if (hasAudio) {
                            args.push('-c:a', 'libvorbis', '-b:a', '64k');
                        } else {
                            args.push('-an');
                        }
                        args.push(webmPath, '-loglevel', 'error');
                        
                        await utils.runLowPriorityProcess('ffmpeg', args);
                        try { fs.unlinkSync(mp4Path); } catch (e) {}
                    } catch (e) {
                        console.error('Failed to convert legacy preview:', mp4Path, e.message);
                        try { fs.unlinkSync(mp4Path); } catch (err) {}
                    } finally {
                        activeQueuePaths.delete(mp4Path);
                    }
                });
            }
        }
    } catch (e) {
        console.error("Error converting legacy previews:", e.message);
    }
}

function registerPreviewHandlers(ipcMain) {
    ipcMain.handle('generate-webm', async (event, videoPath, vaultRoot) => {
        const ext = path.extname(videoPath);
        const base = path.basename(videoPath, ext);
        const thumbsDir = path.join(path.dirname(videoPath), '.thumbs');
        if (!fs.existsSync(thumbsDir)) {
            fs.mkdirSync(thumbsDir, { recursive: true });
        }
        const thumbPath = path.join(thumbsDir, `${base}.jpg`);
        const webmPath = path.join(thumbsDir, `${base}.webm`);
        
        console.log(`[main:generate-webm] Manual extraction requested for: ${base}`);
        try {
            await generateThumbAndPreview(videoPath, thumbPath, webmPath, event.sender);
            const success = fs.existsSync(thumbPath) && fs.existsSync(webmPath);
            if (success) {
                return { success: true, thumbnail: thumbPath, hoverWebm: webmPath };
            } else {
                return { success: false, error: 'FFmpeg failed to create thumbnail or preview webm.' };
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('schedule-idle-previews', (event, items) => {
        for (const item of items) {
            if (item.type === 'video') {
                const ext = path.extname(item.path);
                const base = path.basename(item.path, ext);
                const thumbsDir = path.join(path.dirname(item.path), '.thumbs');
                if (!fs.existsSync(thumbsDir)) {
                    try { fs.mkdirSync(thumbsDir, { recursive: true }); } catch(e) {}
                }
                const thumbPath = path.join(thumbsDir, `${base}.jpg`);
                const webmPath = path.join(thumbsDir, `${base}.webm`);
                schedulePreviewGeneration(item.path, thumbPath, webmPath);
            }
        }
        return true;
    });
}

module.exports = {
    generateThumbAndPreview,
    schedulePreviewGeneration,
    convertLegacyMp4Previews,
    registerPreviewHandlers
};
