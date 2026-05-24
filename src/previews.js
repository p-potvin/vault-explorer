const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { execFile } = child_process;
const { BrowserWindow } = require('electron');
const utils = require('./utils');

let totalBatchCount = 0;
let completedBatchCount = 0;

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
    const activeWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const finalSender = sender || (activeWindow ? activeWindow.webContents : null);
    
    if (finalSender && !finalSender.isDestroyed()) {
        finalSender.send('generate-webm-progress', {
            videoPath,
            percent: 5,
            label: `Initiating preview...`
        });
    }

    const duration = await utils.getVideoDuration(videoPath);
    const hasAudio = await utils.checkAudioStream(videoPath);
    
    const bothExist = fs.existsSync(thumbPath) && fs.existsSync(hoverWebmPath);
    if (bothExist) {
        console.log(`[main:preview] Skipping: both thumbnail and preview exist for ${videoPath}`);
        if (finalSender && !finalSender.isDestroyed()) {
            finalSender.send('generate-webm-progress', {
                videoPath,
                percent: 100,
                label: `Completed!`,
                thumbnail: thumbPath,
                hoverWebm: hoverWebmPath
            });
        }
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
        if (!fs.existsSync(thumbPath)) {
            console.log(`[main:preview] Keyframe select produced no file, falling back to simple frame capture at ${middleTime}`);
            await utils.runLowPriorityProcess('ffmpeg', [
                '-y',
                '-ss', middleTime,
                '-i', videoPath,
                '-vframes', '1',
                '-q:v', '2',
                thumbPath,
                '-loglevel', 'error'
            ]);
        }
        thumbTimeMs = Date.now() - thumbStart;
    } catch (e) {
        console.error("Failed to generate keyframe thumbnail:", e.message);
        try {
            await utils.runLowPriorityProcess('ffmpeg', [
                '-y',
                '-ss', middleTime,
                '-i', videoPath,
                '-vframes', '1',
                '-q:v', '2',
                thumbPath,
                '-loglevel', 'error'
            ]);
            thumbTimeMs = Date.now() - thumbStart;
        } catch(err) {
            console.error("Fallback thumbnail generation also failed:", err.message);
        }
    }

    let webmStart = Date.now();
    let webmTimeMs = null;
    try {
        console.log(`[main:webm-preview] Generating preview: ${path.basename(videoPath)}`);

        const runFfmpegPromise = (args) => {
            return new Promise((res, rej) => {
                execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                    if (err) return rej(err);
                    res();
                });
            });
        };

        if (duration <= 100) {
            if (finalSender && !finalSender.isDestroyed()) {
                finalSender.send('generate-webm-progress', {
                    videoPath,
                    percent: 50,
                    label: `Creating preview...`
                });
            }
            let success = false;
            if (hasAudio) {
                try {
                    await runFfmpegPromise([
                        '-y',
                        '-i', videoPath,
                        '-c:v', 'libvpx',
                        '-b:v', '1M',
                        '-speed', '4',
                        '-c:a', 'libvorbis',
                        '-b:a', '64k',
                        hoverWebmPath,
                        '-loglevel', 'error'
                    ]);
                    success = true;
                } catch (e) {
                    console.warn(`[main:webm-preview] VP8 + Vorbis failed, falling back to silent VP8:`, e.message);
                }
            }
            if (!success) {
                await runFfmpegPromise([
                    '-y',
                    '-i', videoPath,
                    '-c:v', 'libvpx',
                    '-b:v', '1M',
                    '-speed', '4',
                    '-an',
                    hoverWebmPath,
                    '-loglevel', 'error'
                ]);
            }
        } else {
            const numClips = 8; // 8 clips for compact size & faster processing
            const interval = duration / numClips;
            const clipDuration = 3.0; // 3 seconds each, total 24s preview
            
            if (finalSender && !finalSender.isDestroyed()) {
                finalSender.send('generate-webm-progress', {
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
            }
            
            filterStr += `concat=n=${numClips}:v=1:a=0[outv]`;
            
            args.push('-filter_complex', filterStr);
            args.push('-map', '[outv]');
            
            args.push(
                '-c:v', 'libvpx',
                '-b:v', '1M',
                '-speed', '4',
                '-an'
            );
            args.push(hoverWebmPath, '-loglevel', 'error');
            
            await runFfmpegPromise(args);
        }
        
        webmTimeMs = Date.now() - webmStart;
        
        if (finalSender && !finalSender.isDestroyed()) {
            finalSender.send('generate-webm-progress', {
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
            completedBatchCount++;
            if (completedBatchCount >= totalBatchCount) {
                totalBatchCount = 0;
                completedBatchCount = 0;
            }
            const activeWin = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (activeWin && !activeWin.webContents.isDestroyed()) {
                activeWin.webContents.send('generate-webm-progress', {
                    isBatchProgress: true,
                    total: totalBatchCount,
                    completed: completedBatchCount
                });
            }
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
        let added = 0;
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
                if (!fs.existsSync(thumbPath) || !fs.existsSync(webmPath)) {
                    if (!activeQueuePaths.has(item.path)) {
                        added++;
                        schedulePreviewGeneration(item.path, thumbPath, webmPath);
                    }
                }
            }
        }
        if (added > 0) {
            totalBatchCount += added;
            const activeWin = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (activeWin && !activeWin.webContents.isDestroyed()) {
                activeWin.webContents.send('generate-webm-progress', {
                    isBatchStart: true,
                    total: totalBatchCount,
                    completed: completedBatchCount
                });
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
