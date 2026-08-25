// upscale.js — coordinates real-time AI upscaling with MediaSource buffer stitching.

let upscaleActive = false;
let upscaleMS = null;
let upscaleSB = null;
let upscaleQueue = [];
let upscaleQueueBytes = 0;
let upscaleAppending = false;
let upscaleOrigSrc = '';
let upscaleOrigTime = 0;
let upscaleChunkCount = 0;
let upscaleMsUrl = '';
let upscaleVpErrorHandler = null;
let upscaleRunId = 0;

const MAX_UPSCALE_QUEUE_BYTES = 32 * 1024 * 1024;

function isUpscaleActive() {
    return upscaleActive;
}

function setUpscaleActive(value) {
    upscaleActive = Boolean(value);
}

function upscaleSetStatus(text, color) {
    const badge = el('upscale-badge');
    if (!badge) return;
    const arrow = window.icons && window.icons.arrowUp
        ? window.icons.arrowUp('', 'width:11px;height:11px;vertical-align:middle;margin-right:4px;')
        : '';
    const safeText = window.escapeHtml ? window.escapeHtml(String(text)) : String(text);
    badge.innerHTML = arrow + safeText;
    badge.style.background = color || 'rgba(0,0,0,0.65)';
}

function toArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    if (value && Array.isArray(value.data)) return new Uint8Array(value.data).buffer;
    throw new TypeError('Unsupported upscale chunk payload');
}

function upscaleFlushQueue() {
    if (upscaleAppending || !upscaleSB || upscaleSB.updating || upscaleQueue.length === 0) return;
    const next = upscaleQueue.shift();
    upscaleQueueBytes -= next.byteLength;
    upscaleAppending = true;
    try {
        upscaleSB.appendBuffer(next);
    } catch (error) {
        upscaleAppending = false;
        console.error('[upscale] appendBuffer failed:', error);
        endUpscaleWithError('AI upscaling could not buffer the enhanced video.');
    }
}

function endUpscaleWithError(message) {
    window.showToast(message, 'error');
    stopUpscaleMode();
    upscaleActive = false;
    const button = el('btn-upscale');
    if (button) button.classList.remove('active');
}

function createUpscaleBadge() {
    let badge = el('upscale-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'upscale-badge';
        badge.style.cssText = 'position:absolute;top:52px;left:12px;z-index:210;padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-body);font-weight:700;letter-spacing:0.06em;color:#fff;pointer-events:none;background:rgba(0,0,0,0.65);';
        el('video-modal').appendChild(badge);
    }
    return badge;
}

function sourcePathFromFileUrl(source) {
    let rawPath = decodeURIComponent(String(source || '').replace(/^file:\/\//i, ''));
    if (/^\/[A-Za-z]:/.test(rawPath)) rawPath = rawPath.slice(1);
    return rawPath.replace(/\//g, '\\');
}

async function startUpscaleMode() {
    const vp = el('video-player');
    if (!vp || !vp.src || !vp.src.startsWith('file://')) {
        window.showToast('AI upscaling requires a local video file.', 'error');
        return false;
    }

    const runId = ++upscaleRunId;
    upscaleOrigSrc = vp.src;
    upscaleOrigTime = vp.currentTime || 0;
    upscaleChunkCount = 0;
    upscaleQueue = [];
    upscaleQueueBytes = 0;
    upscaleAppending = false;
    createUpscaleBadge();
    upscaleSetStatus('RTX VSR · initializing…', '#1a1a2e');

    const rawPath = sourcePathFromFileUrl(upscaleOrigSrc);
    window.electronAPI.offUpscaleChunk();
    window.electronAPI.offUpscaleStatus();

    window.electronAPI.onUpscaleStatus((status) => {
        if (runId !== upscaleRunId) return;
        const { type, chunk, width, height, error } = status || {};
        if (type === 'init') upscaleSetStatus(`RTX VSR · ${width}×${height} → ${width * 2}×${height * 2} · buffering…`, '#0d1117');
        else if (type === 'processing') upscaleSetStatus(`RTX VSR · ${chunk} frames · buffering…`, '#0d1117');
        else if (type === 'done') {
            if (upscaleChunkCount === 0) {
                endUpscaleWithError('AI upscaler produced no video.');
                return;
            }
            upscaleSetStatus('RTX VSR · complete', '#155724');
            if (upscaleMS && upscaleMS.readyState === 'open') {
                try { upscaleMS.endOfStream(); } catch (_) { }
            }
            setTimeout(() => { const badge = el('upscale-badge'); if (badge) badge.remove(); }, 4000);
        } else if (type === 'chunk-error') {
            const detail = error ? String(error).split(/\r?\n/).filter(Boolean).pop() : 'unknown';
            endUpscaleWithError(`RTX VSR failed: ${detail}`);
        }
    });

    upscaleVpErrorHandler = () => {
        if (upscaleActive && runId === upscaleRunId) endUpscaleWithError('Playback failed while buffering the enhanced video.');
    };
    vp.addEventListener('error', upscaleVpErrorHandler);

    window.electronAPI.onUpscaleChunk(({ buffer }) => {
        if (runId !== upscaleRunId) return;
        try {
            const chunk = toArrayBuffer(buffer);
            upscaleChunkCount++;
            upscaleQueueBytes += chunk.byteLength;
            if (upscaleQueueBytes > MAX_UPSCALE_QUEUE_BYTES) {
                endUpscaleWithError('AI upscaling could not keep up with the enhanced stream.');
                return;
            }
            upscaleSetStatus(`RTX VSR · buf ${upscaleChunkCount} chunk(s)`, '#0d3349');
            upscaleQueue.push(chunk);
            upscaleFlushQueue();
        } catch (error) {
            endUpscaleWithError(`AI upscaling returned an invalid video chunk: ${error.message}`);
        }
    });

    upscaleMS = new MediaSource();
    upscaleMsUrl = URL.createObjectURL(upscaleMS);
    upscaleMS.addEventListener('sourceopen', () => {
        if (runId !== upscaleRunId || !upscaleMS) return;
        const codecs = [
            'video/mp4; codecs="avc1.640033"',
            'video/mp4; codecs="avc1.4d401f"',
            'video/mp4; codecs="avc1.42E01E"',
        ];
        const codec = codecs.find(candidate => MediaSource.isTypeSupported(candidate));
        if (!codec) {
            endUpscaleWithError('This system cannot play the AI-enhanced video codec.');
            return;
        }
        try {
            upscaleSB = upscaleMS.addSourceBuffer(codec);
            upscaleSB.mode = 'sequence';
            upscaleSB.addEventListener('updateend', () => {
                upscaleAppending = false;
                upscaleFlushQueue();
            });
            upscaleSB.addEventListener('error', () => endUpscaleWithError('The AI-enhanced video buffer failed.'));
            upscaleFlushQueue();
        } catch (error) {
            console.error('[upscale] addSourceBuffer failed:', error.message);
            endUpscaleWithError('This system cannot buffer the AI-enhanced video.');
        }
    }, { once: true });

    vp.src = upscaleMsUrl;
    vp.play().catch(() => { });

    const result = await window.electronAPI.startUpscaleStream({
        videoPath: rawPath,
        startTime: upscaleOrigTime,
        quality: (window.appSettings && window.appSettings.vsrQuality) || 'HIGH',
        scale: (window.appSettings && window.appSettings.vsrScale) || '2',
        bitrate: (window.appSettings && window.appSettings.vsrBitrate) || '12M',
        chroma: (window.appSettings && window.appSettings.vsrChroma) || 'yuv420p',
    });
    if (runId !== upscaleRunId) return false;
    if (!result || !result.success) {
        endUpscaleWithError(`AI upscale failed: ${(result && result.error) || 'unknown error'}`);
        return false;
    }
    return true;
}

function stopUpscaleMode() {
    ++upscaleRunId;
    const vp = el('video-player');
    try { window.electronAPI.stopUpscaleStream(); } catch (_) { }
    window.electronAPI.offUpscaleChunk();
    window.electronAPI.offUpscaleStatus();
    if (vp && upscaleVpErrorHandler) vp.removeEventListener('error', upscaleVpErrorHandler);
    upscaleVpErrorHandler = null;

    if (upscaleMS && upscaleMS.readyState === 'open' && upscaleChunkCount > 0) {
        try { upscaleMS.endOfStream(); } catch (_) { }
    }
    if (upscaleMsUrl) {
        try { URL.revokeObjectURL(upscaleMsUrl); } catch (_) { }
    }
    upscaleMsUrl = '';
    upscaleMS = null;
    upscaleSB = null;
    upscaleQueue = [];
    upscaleQueueBytes = 0;
    upscaleAppending = false;

    if (upscaleOrigSrc && vp && vp.src !== upscaleOrigSrc) {
        vp.src = upscaleOrigSrc;
        const restoreTime = upscaleOrigTime;
        const restore = () => {
            if (Number.isFinite(restoreTime) && restoreTime > 0 && restoreTime < vp.duration) vp.currentTime = restoreTime;
            vp.play().catch(() => { });
            vp.removeEventListener('loadedmetadata', restore);
        };
        vp.addEventListener('loadedmetadata', restore, { once: true });
    }
    const badge = el('upscale-badge');
    if (badge) badge.remove();
}

function initUpscaleListeners() {
    const button = el('btn-upscale');
    if (!button) return;
    button.addEventListener('click', async (e) => {
        if (typeof window.openVideoEnhancerModal === 'function') {
            const vp = el('video-player');
            const path = window.currentPlayingItem ? window.currentPlayingItem.path : (vp ? sourcePathFromFileUrl(vp.src) : null);
            window.openVideoEnhancerModal(path);
            return;
        }
        if (upscaleActive) {
            upscaleActive = false;
            button.classList.remove('active');
            window.showToast('AI upscaling stopped.', 'info');
            stopUpscaleMode();
            return;
        }
        upscaleActive = true;
        button.classList.add('active');
        window.showToast('Starting AI upscaling…', 'info');
        const started = await startUpscaleMode();
        if (!started) {
            upscaleActive = false;
            button.classList.remove('active');
        }
    });
}

window.startUpscaleMode = startUpscaleMode;
window.stopUpscaleMode = stopUpscaleMode;
window.isUpscaleActive = isUpscaleActive;
window.setUpscaleActive = setUpscaleActive;
window.initUpscaleListeners = initUpscaleListeners;
