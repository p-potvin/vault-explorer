// generateThumbAndPreview must keep a good thumbnail when every WebM encode
// fails, and must cap the encode when the duration probe returns 0.
// Drives the real function with ffmpeg and probing stubbed out.
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
        return { BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const utils = require('../src/utils');
const ffmpegCalls = [];
let probedDuration = 600;
utils.getVideoMetadata = async () => ({ hasAudio: false, hasVideo: true, duration: probedDuration });
utils.getVideoDuration = async () => probedDuration;
utils.validateVideoSamples = async () => ({ isValid: true, reason: null, sampleTime: 1, samplesChecked: 1 });
utils.runFfmpegWithNvidiaFallback = async (args) => {
    ffmpegCalls.push(args);
    const out = args[args.indexOf('-f') + 2];
    if (args.includes('image2')) {
        fs.writeFileSync(out, 'jpeg-bytes');
        return;
    }
    throw new Error('simulated libvpx failure');
};

const { generateThumbAndPreview } = require('../src/previews');

async function run() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-preview-'));
    try {
        // 1) Long video, every WebM path fails: thumbnail must survive.
        const video = path.join(dir, 'movie.mp4');
        fs.writeFileSync(video, 'not-really-a-video');
        const thumb = path.join(dir, '.thumbs', 'movie.jpg');
        const webm = path.join(dir, '.thumbs', 'movie.webm');

        await generateThumbAndPreview(video, thumb, webm, null, true, true);
        assert.ok(fs.existsSync(thumb), 'Thumbnail was discarded after the WebM encode failed');
        assert.ok(!fs.existsSync(webm), 'No WebM should exist after a failed encode');
        assert.ok(!fs.existsSync(thumb + '.tmp') && !fs.existsSync(webm + '.tmp'), 'Orphan .tmp files left behind');

        // 2) Duration probe returned 0: the short-clip encode must be capped.
        probedDuration = 0;
        ffmpegCalls.length = 0;
        const video2 = path.join(dir, 'unknown.mp4');
        fs.writeFileSync(video2, 'not-really-a-video');
        await generateThumbAndPreview(video2, path.join(dir, '.thumbs', 'unknown.jpg'),
            path.join(dir, '.thumbs', 'unknown.webm'), null, true, true);
        const webmCalls = ffmpegCalls.filter(a => a.includes('webm'));
        assert.ok(webmCalls.length > 0, 'Expected a WebM encode attempt');
        for (const args of webmCalls) {
            const t = args.indexOf('-t');
            assert.ok(t !== -1 && t < args.indexOf('-i'), `WebM encode has no input duration cap: ${args.join(' ')}`);
            assert.ok(Number(args[t + 1]) > 0 && Number(args[t + 1]) <= 100, `Bad cap ${args[t + 1]}`);
        }

        console.log('Preview thumbnail survival and duration cap passed.');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
