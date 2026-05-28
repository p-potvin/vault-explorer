// upscale.js — coordinates real-time AI upscale mode (Real-ESRGAN/CUDA) with MediaSource buffer stitching.

let upscaleActive   = false;
let upscaleMS       = null;
let upscaleSB       = null;
let upscaleQueue    = [];
let upscaleAppending = false;
let upscaleOrigSrc  = '';
let upscaleOrigTime = 0;
let upscaleChunkCount = 0;

function isUpscaleActive() {
    return upscaleActive;
}

function setUpscaleActive(val) {
    upscaleActive = val;
}

function upscaleFlushQueue() {
    if (upscaleAppending || upscaleQueue.length === 0 || !upscaleSB) return;
    if (upscaleSB.updating) return;
    upscaleAppending = true;
    try {
        upscaleSB.appendBuffer(upscaleQueue.shift());
    } catch(e) {
        upscaleAppending = false;
    }
}

function upscaleSetStatus(txt, color) {
    const badge = el('upscale-badge');
    if (badge) { badge.textContent = txt; badge.style.background = color || 'rgba(0,0,0,0.65)'; }
}

async function startUpscaleMode() {
    const vp = el('video-player');
    if (!vp) return;
    if (!vp.src || !vp.src.startsWith('file://')) {
        window.showToast('Upscaling requires a local video file', 'error'); return;
    }
    upscaleOrigSrc  = vp.src;
    upscaleOrigTime = vp.currentTime;
    upscaleChunkCount = 0;
    upscaleQueue    = [];
    upscaleAppending = false;

    let badge = el('upscale-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'upscale-badge';
        badge.style.cssText = 'position:absolute;top:52px;left:12px;z-index:210;padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-body);font-weight:700;letter-spacing:0.06em;color:#fff;pointer-events:none;background:rgba(0,0,0,0.65);';
        el('video-modal').appendChild(badge);
    }
    upscaleSetStatus('⬆ AI  ·  initializing…', '#1a1a2e');

    let rawPath = decodeURIComponent(upscaleOrigSrc.replace(/^file:\/\/\//, '').replace(/\//g, '\\'));
    rawPath = rawPath.replace(/^([A-Za-z])%3A/, '$1:');

    window.electronAPI.offUpscaleChunk();
    window.electronAPI.offUpscaleStatus();

    window.electronAPI.onUpscaleStatus(({ type, chunk, chunkStart, fps, width, height, duration }) => {
        if (type === 'init') {
            upscaleSetStatus(`⬆ AI  ·  ${width}×${height}→${width*2}×${height*2}  ·  buffering…`, '#0d1117');
        } else if (type === 'processing') {
            upscaleSetStatus(`⬆ AI  ·  chunk ${chunk+1}  processing…`, '#0d1117');
        } else if (type === 'done') {
            upscaleSetStatus('⬆ AI  ·  complete', '#155724');
            if (upscaleMS && upscaleMS.readyState === 'open') {
                try { upscaleMS.endOfStream(); } catch(_) {}
            }
        } else if (type === 'chunk-error') {
            console.warn('[upscale] chunk error on chunk', chunk);
        }
    });

    window.electronAPI.onUpscaleChunk(({ chunk, buffer }) => {
        upscaleChunkCount++;
        upscaleSetStatus(`⬆ AI  ·  buf ${upscaleChunkCount} chunk(s)`, '#0d3349');
        const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer || Buffer.from(buffer).buffer;
        upscaleQueue.push(ab);
        upscaleFlushQueue();
    });

    upscaleMS = new MediaSource();
    const msUrl = URL.createObjectURL(upscaleMS);

    upscaleMS.addEventListener('sourceopen', () => {
        try {
            upscaleSB = upscaleMS.addSourceBuffer('video/mp4; codecs="avc1.640033"');
            upscaleSB.mode = 'sequence';
            upscaleSB.addEventListener('updateend', () => {
                upscaleAppending = false;
                upscaleFlushQueue();
            });
            upscaleSB.addEventListener('error', (e) => {
                console.error('[upscale] SourceBuffer error', e);
                upscaleAppending = false;
            });
        } catch(e) {
            console.error('[upscale] addSourceBuffer failed:', e.message);
            upscaleSetStatus('⬆ AI  ·  codec error', '#721c24');
        }
    });

    vp.src = msUrl;
    vp.play().catch(() => {});

    const result = await window.electronAPI.startUpscaleStream({
        videoPath: rawPath,
        startTime: upscaleOrigTime
    });
    if (!result.success) {
        window.showToast('Upscale failed: ' + result.error, 'error');
        stopUpscaleMode();
    }
}

function stopUpscaleMode() {
    const vp = el('video-player');
    window.electronAPI.stopUpscaleStream();
    window.electronAPI.offUpscaleChunk();
    window.electronAPI.offUpscaleStatus();
    if (upscaleMS) {
        try { upscaleMS.endOfStream(); } catch(_) {}
    }
    upscaleMS   = null;
    upscaleSB   = null;
    upscaleQueue = [];

    if (upscaleOrigSrc && vp) {
        vp.src = upscaleOrigSrc;
        vp.currentTime = upscaleOrigTime;
        vp.play().catch(() => {});
    }
    const badge = el('upscale-badge');
    if (badge) badge.remove();
}

function initUpscaleListeners() {
    el('btn-upscale').addEventListener('click', async () => {
        upscaleActive = !upscaleActive;
        el('btn-upscale').classList.toggle('active', upscaleActive);
        if (upscaleActive) {
            window.showToast('Starting real-time upscaling…', 'success');
            await startUpscaleMode();
        } else {
            window.showToast('Upscaling stopped', 'success');
            stopUpscaleMode();
        }
    });
}

// Bind to globals
window.startUpscaleMode = startUpscaleMode;
window.stopUpscaleMode = stopUpscaleMode;
window.isUpscaleActive = isUpscaleActive;
window.setUpscaleActive = setUpscaleActive;
window.initUpscaleListeners = initUpscaleListeners;
