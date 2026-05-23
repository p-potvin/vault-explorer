// player.js - Custom HTML5 video player logic, Autoplay, Subtitles, and AI Upscaling source buffers

window.currentPlayingIndex = -1;
window.autoplayTimer = null;
window.autoplayCountdown = 5;
window.autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false';

const PLAY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; display:block;"><path d="M 8 5 L 19 12 L 8 19 Z" /></svg>`;
const PAUSE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; display:block;"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>`;

let vp = null;
let seekArea = null;
let seekFill = null;
let seekPreview = null;
let btnPlay = null;
let btnPrev = null;
let btnNext = null;
let volSlider = null;
let trickFrames = [];
let navHoverPreview = null;

// Hidden scrubber video + canvas for seek preview
let scrubVideo = null;
let seekCanvas = null;
let seekCtx = null;
let seekDebounceTimer = null;
let lastScrubSrc = '';

// ESRGAN states
let upscaleActive   = false;
let upscaleMS       = null;
let upscaleSB       = null;
let upscaleQueue    = [];
let upscaleAppending = false;
let upscaleOrigSrc  = '';
let upscaleOrigTime = 0;
let upscaleChunkCount = 0;

function updateAutoplayUI() {
    const btn = el('btn-autoplay');
    const knob = el('autoplay-knob-circle');
    if (!btn || !knob) return;
    if (window.autoplayEnabled) {
        btn.classList.add('active');
        knob.setAttribute('cx', '16');
    } else {
        btn.classList.remove('active');
        knob.setAttribute('cx', '8');
    }
}

function updateVolumeIconUI(vol) {
    const btnVol = el('btn-volume-icon');
    if (!btnVol) return;
    let pathContent = '';
    if (vol === 0) {
        pathContent = `<path d="M 7 11 L 7 9 L 11 9 L 15 5 L 15 19 L 11 15 L 7 15 L 7 13" /><line x1="18" y1="9" x2="22" y2="13" /><line x1="18" y1="13" x2="21" y2="10" />`;
    } else if (vol < 0.5) {
        pathContent = `<path d="M 7 11 L 7 9 L 11 9 L 15 5 L 15 19 L 11 15 L 7 15 L 7 13" /><path d="M 18 9 A 3 3 0 0 1 18 15" />`;
    } else {
        pathContent = `<path d="M 7 11 L 7 9 L 11 9 L 15 5 L 15 19 L 11 15 L 7 15 L 7 13" /><path d="M 18 9 A 3 3 0 0 1 18 15" /><path d="M 21 7 A 6 6 0 0 1 21 17" />`;
    }
    btnVol.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; display:block;">${pathContent}</svg>`;
}

function selectSubtitleTrack(trackIdx) {
    if (!vp) return;
    for (let i = 0; i < vp.textTracks.length; i++) {
        vp.textTracks[i].mode = 'disabled';
    }
    
    if (trackIdx >= 0 && vp.textTracks[trackIdx]) {
        vp.textTracks[trackIdx].mode = 'showing';
        el('btn-subtitles').classList.add('active');
        el('btn-subtitles').textContent = `${vp.textTracks[trackIdx].label.replace('Subtitles (', '').replace(')', '')} ▾`;
    } else {
        el('btn-subtitles').classList.remove('active');
        el('btn-subtitles').textContent = 'CC ▾';
    }

    const options = el('subtitles-menu').querySelectorAll('.subtitle-option');
    options.forEach(opt => {
        const idx = parseInt(opt.dataset.idx);
        if (idx === trackIdx) {
            opt.classList.add('active');
            opt.style.color = 'var(--vault-accent)';
            opt.style.fontWeight = '600';
        } else {
            opt.classList.remove('active');
            opt.style.color = 'var(--vault-text)';
            opt.style.fontWeight = 'normal';
        }
    });
}

function refreshSubtitlesList() {
    const listContainer = el('subtitle-tracks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    for (let i = 0; i < vp.textTracks.length; i++) {
        const track = vp.textTracks[i];
        const opt = document.createElement('div');
        opt.className = 'subtitle-option';
        opt.dataset.idx = i;
        opt.style.cssText = 'padding:6px 12px; cursor:pointer; text-align:left; font-family:var(--font-body); font-size:12px; color:var(--vault-text); transition:background 0.2s;';
        opt.textContent = track.label || `Track ${i + 1}`;
        
        if (track.mode === 'showing') {
            opt.classList.add('active');
            opt.style.color = 'var(--vault-accent)';
            opt.style.fontWeight = '600';
        }
        
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            selectSubtitleTrack(i);
            el('subtitles-menu').style.display = 'none';
        });
        listContainer.appendChild(opt);
    }
    
    const offOption = el('subtitles-menu').querySelector('.subtitle-option[data-idx="-1"]');
    if (offOption) {
        offOption.onclick = (e) => {
            e.stopPropagation();
            selectSubtitleTrack(-1);
            el('subtitles-menu').style.display = 'none';
        };
    }
}

async function playItem(idx) {
    if (window.autoplayTimer) {
        clearInterval(window.autoplayTimer);
        window.autoplayTimer = null;
    }
    const endedOverlay = el('video-ended-overlay');
    if (endedOverlay) endedOverlay.style.display = 'none';

    if (idx < 0 || idx >= window.displayedItems.length) return;
    const itm = window.displayedItems[idx];
    if (itm.type !== 'video') return;
    
    window.currentPlayingIndex = idx;
    trickFrames = [];
    vp.dataset.trickplay = itm.trickplayFolder || '';
    const newSrc = window.sanitizePath(itm.path);
    vp.src = newSrc;
    if (lastScrubSrc !== newSrc) {
        scrubVideo.src = newSrc;
        lastScrubSrc = newSrc;
    }
    
    const baseTitle = itm.name.replace(/\.[^.]+$/, '');
    const titleEl = el('player-title');
    if (titleEl) titleEl.textContent = baseTitle;
    const tbTitle = el('titlebar-video-title');
    if (tbTitle) {
        tbTitle.textContent = `·  Playing: ${itm.name}`;
        tbTitle.style.display = 'inline-block';
    }
    
    vp.querySelectorAll('track').forEach(t => t.remove());
    try {
        const subs = await window.electronAPI.findSubtitles(itm.path);
        if (subs && subs.length > 0) {
            subs.forEach((sub, i) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.label === 'Default' ? 'Default Track' : `Subtitles (${sub.label})`;
                track.srclang = sub.lang;
                track.src = window.sanitizePath(sub.path);
                vp.appendChild(track);
            });
            
            refreshSubtitlesList();
            
            const prefLang = (window.appSettings && window.appSettings.defaultSubLang) || 'und';
            let preferredTrackIdx = -1;
            if (prefLang !== 'und') {
                for (let i = 0; i < vp.textTracks.length; i++) {
                    const tl = vp.textTracks[i].language || '';
                    if (tl.toLowerCase().startsWith(prefLang.toLowerCase())) {
                        preferredTrackIdx = i;
                        break;
                    }
                }
            }
            selectSubtitleTrack(preferredTrackIdx);
            if (preferredTrackIdx >= 0) {
                window.showToast(`Loaded ${subs.length} subtitle track(s) — ${vp.textTracks[preferredTrackIdx].label}`, 'success');
            } else {
                window.showToast(`Loaded ${subs.length} subtitle track(s)`, 'success');
            }
        } else {
            refreshSubtitlesList();
            selectSubtitleTrack(-1);
        }
    } catch (err) {
        console.error("Auto subtitle loading error:", err);
    }

    const savedPos = (window.appSettings && window.appSettings.rememberPosition !== false &&
        window.appSettings.playbackPositions && window.appSettings.playbackPositions[itm.path]) || 0;
    if (savedPos > 0) {
        const restoreOnce = () => {
            if (savedPos < vp.duration - 3) {
                vp.currentTime = savedPos;
                window.showToast(`Resumed from ${window.formatDuration(savedPos)}`, 'success');
            }
            vp.removeEventListener('loadedmetadata', restoreOnce);
        };
        vp.addEventListener('loadedmetadata', restoreOnce);
    }

    el('video-modal').classList.remove('minimized');
    btnPlay.innerHTML = PAUSE_ICON_SVG;
    el('video-modal').style.display = 'flex';
    el('video-modal').focus();

    vp.play().catch(e => console.log("Playback start prevented or failed:", e));
}

function updateNavHover(idx, btnEl) {
    if (idx < 0 || idx >= window.displayedItems.length) {
        navHoverPreview.style.display = 'none';
        return;
    }
    let itm = window.displayedItems[idx];
    const rect = btnEl.getBoundingClientRect();
    
    let thumbUrl = window.sanitizePath(itm.thumbnail || '');
    if(thumbUrl) {
        navHoverPreview.style.backgroundImage = `url('${thumbUrl}')`;
        navHoverPreview.innerText = itm.name;
        navHoverPreview.style.left = (rect.left + (rect.width/2)) + 'px';
        navHoverPreview.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        navHoverPreview.style.display = 'flex';
    } else {
        navHoverPreview.style.display = 'none';
    }
}

// ── ESRGAN Real-time Streaming ───────────────────────────────────────────
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
    window.electronAPI.stopUpscaleStream();
    window.electronAPI.offUpscaleChunk();
    window.electronAPI.offUpscaleStatus();
    if (upscaleMS) {
        try { upscaleMS.endOfStream(); } catch(_) {}
    }
    upscaleMS   = null;
    upscaleSB   = null;
    upscaleQueue = [];

    if (upscaleOrigSrc) {
        vp.src = upscaleOrigSrc;
        vp.currentTime = upscaleOrigTime;
        vp.play().catch(() => {});
    }
    const badge = el('upscale-badge');
    if (badge) badge.remove();
}

function initPlayer() {
    vp = el('video-player');
    seekArea = el('seek-area');
    seekFill = el('seek-fill');
    seekPreview = el('seek-hover-preview');
    btnPlay = el('btn-playpause');
    btnPrev = el('btn-prev');
    btnNext = el('btn-next');
    volSlider = el('volume-slider');

    // Scrubber elements setup
    scrubVideo = document.createElement('video');
    scrubVideo.muted = true;
    scrubVideo.preload = 'metadata';
    scrubVideo.style.display = 'none';
    document.body.appendChild(scrubVideo);
    
    seekCanvas = seekPreview;
    seekCtx = seekCanvas.getContext('2d');
    seekCanvas.width = 320;
    seekCanvas.height = 180;

    navHoverPreview = document.createElement('div');
    navHoverPreview.className = 'nav-hover-preview';
    document.body.appendChild(navHoverPreview);

    scrubVideo.addEventListener('seeked', () => {
        seekCtx.drawImage(scrubVideo, 0, 0, seekCanvas.width, seekCanvas.height);
    });

    // Close on PiP or Modal Close
    el('minimize-modal').addEventListener('click', (e) => {
        e.stopPropagation();
        el('video-modal').classList.toggle('minimized');
    });

    el('pip-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        el('close-modal').click();
    });

    el('close-modal').addEventListener('click', (e) => {
        e.stopPropagation();
        el('video-modal').style.display = 'none';
        el('video-modal').classList.remove('minimized');
        el('video-ended-overlay').style.display = 'none';
        if (el('titlebar-video-title')) el('titlebar-video-title').style.display = 'none';
        if (window.autoplayTimer) { clearInterval(window.autoplayTimer); window.autoplayTimer = null; }
        
        if (window.appSettings && window.appSettings.rememberPosition !== false && window.currentPlayingIndex !== -1) {
            const closingItm = window.displayedItems[window.currentPlayingIndex];
            if (closingItm && closingItm.path && vp.duration > 0) {
                window.appSettings.playbackPositions = window.appSettings.playbackPositions || {};
                if (vp.currentTime >= vp.duration - 3) {
                    delete window.appSettings.playbackPositions[closingItm.path];
                } else {
                    window.appSettings.playbackPositions[closingItm.path] = vp.currentTime;
                }
                window.electronAPI.saveSettings(window.appSettings);
            }
        }
        vp.pause(); vp.src = '';
        if (window.currentPlayingIndex !== -1) {
            const card = document.querySelector(`.file-card[data-index="${window.currentPlayingIndex}"]`);
            if (card) card.focus();
        }
    });

    btnPrev.addEventListener('mouseenter', () => {
        let prevIdx = window.currentPlayingIndex - 1;
        while (prevIdx >= 0 && window.displayedItems[prevIdx].type !== 'video') prevIdx--;
        updateNavHover(prevIdx, btnPrev);
    });
    btnPrev.addEventListener('mouseleave', () => navHoverPreview.style.display = 'none');

    btnNext.addEventListener('mouseenter', () => {
        let nextIdx = window.currentPlayingIndex + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        updateNavHover(nextIdx, btnNext);
    });
    btnNext.addEventListener('mouseleave', () => navHoverPreview.style.display = 'none');

    btnPrev.addEventListener('click', () => {
        let prevIdx = window.currentPlayingIndex - 1;
        while (prevIdx >= 0 && window.displayedItems[prevIdx].type !== 'video') prevIdx--;
        if (prevIdx >= 0) playItem(prevIdx);
    });

    btnNext.addEventListener('click', () => {
        let nextIdx = window.currentPlayingIndex + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        if (nextIdx < window.displayedItems.length) playItem(nextIdx);
    });

    vp.volume = volSlider.value;
    updateVolumeIconUI(vp.volume);
    volSlider.addEventListener('input', (e) => {
        vp.volume = parseFloat(e.target.value);
        updateVolumeIconUI(vp.volume);
    });

    vp.addEventListener('timeupdate', () => {
        if (!vp.duration) return;
        const pct = vp.currentTime / vp.duration;
        seekFill.style.width = (pct * 100) + '%';
        const cur = window.formatDuration(vp.currentTime);
        const tot = window.formatDuration(vp.duration);
        el('time-display').innerText = cur + ' / ' + tot;
        const elEl = el('time-elapsed'); if (elEl) elEl.innerText = cur;
        const totEl = el('time-total'); if (totEl) totEl.innerText = tot;
    });

    vp.addEventListener('loadedmetadata', () => {
        const totEl = el('time-total');
        if (totEl && vp.duration) totEl.innerText = window.formatDuration(vp.duration);
    });

    vp.addEventListener('click', (e) => {
        if (el('video-modal').classList.contains('minimized')) { el('video-modal').classList.remove('minimized'); e.stopPropagation(); return; }
        if (vp.paused) { vp.play().catch(() => {}); btnPlay.innerHTML = PAUSE_ICON_SVG; }
        else { vp.pause(); btnPlay.innerHTML = PLAY_ICON_SVG; }
    });

    vp.addEventListener('ended', () => {
        let nextIdx = window.currentPlayingIndex + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        
        const overlay = el('video-ended-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        
        const countdownEl = el('ended-countdown');
        if (nextIdx < window.displayedItems.length) {
            if (window.autoplayEnabled) {
                window.autoplayCountdown = 5;
                countdownEl.innerText = `Next video in ${window.autoplayCountdown} seconds... (Click to play now)`;
                countdownEl.style.cursor = 'pointer';
                
                if (window.autoplayTimer) clearInterval(window.autoplayTimer);
                window.autoplayTimer = setInterval(() => {
                    window.autoplayCountdown--;
                    if (window.autoplayCountdown <= 0) {
                        clearInterval(window.autoplayTimer);
                        overlay.style.display = 'none';
                        playItem(nextIdx);
                    } else {
                        countdownEl.innerText = `Next video in ${window.autoplayCountdown} seconds... (Click to play now)`;
                    }
                }, 1000);
            } else {
                countdownEl.innerText = "Autoplay is off. Click here to play the next video.";
                countdownEl.style.cursor = 'pointer';
            }
        } else {
            countdownEl.innerText = "End of playlist. Click Replay to start over.";
            countdownEl.style.cursor = 'default';
        }
    });

    el('ended-play-btn').addEventListener('click', () => {
        if (window.autoplayTimer) clearInterval(window.autoplayTimer);
        el('video-ended-overlay').style.display = 'none';
        vp.currentTime = 0;
        vp.play().catch(() => {});
        btnPlay.innerHTML = PAUSE_ICON_SVG;
    });

    el('ended-countdown').addEventListener('click', () => {
        let nextIdx = window.currentPlayingIndex + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        if (nextIdx < window.displayedItems.length) {
            if (window.autoplayTimer) { clearInterval(window.autoplayTimer); window.autoplayTimer = null; }
            el('video-ended-overlay').style.display = 'none';
            playItem(nextIdx);
        }
    });

    btnPlay.addEventListener('click', () => { if (vp.paused) { vp.play().catch(() => {}); btnPlay.innerHTML = PAUSE_ICON_SVG; } else { vp.pause(); btnPlay.innerHTML = PLAY_ICON_SVG; } });
    
    el('btn-fullscreen').addEventListener('click', () => { 
        if (!document.fullscreenElement) {
            vp.parentElement.requestFullscreen(); 
        } else {
            document.exitFullscreen();
        }
    });

    // ── Autoplay toggle Switch ──────────────────────────────
    if (el('btn-autoplay')) {
        el('btn-autoplay').addEventListener('click', (e) => {
            window.autoplayEnabled = !window.autoplayEnabled;
            localStorage.setItem('autoplayEnabled', window.autoplayEnabled);
            updateAutoplayUI();
            window.showToast(window.autoplayEnabled ? 'Autoplay: Enabled' : 'Autoplay: Disabled', 'success');
        });
        updateAutoplayUI();
    }

    // ── Playback Speed Dropdown ──────────────────────────────
    el('btn-speed').addEventListener('click', (e) => {
        e.stopPropagation();
        el('subtitles-menu').style.display = 'none';
        const menu = el('speed-menu');
        const isHidden = menu.style.display === 'none';
        menu.style.display = isHidden ? 'block' : 'none';
    });

    document.querySelectorAll('.speed-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = parseFloat(opt.dataset.val);
            vp.playbackRate = val;
            el('btn-speed').textContent = val === 1 ? '1.0× ▾' : `${val}× ▾`;
            el('btn-speed').classList.toggle('active', val !== 1);
            
            document.querySelectorAll('.speed-option').forEach(o => {
                o.classList.remove('active');
                o.style.color = 'var(--vault-text)';
                o.style.fontWeight = 'normal';
            });
            opt.classList.add('active');
            opt.style.color = 'var(--vault-accent)';
            opt.style.fontWeight = '600';
            
            el('speed-menu').style.display = 'none';
            window.showToast(`Playback Speed: ${val}×`, 'success');
        });
    });

    // ── Subtitles Dropdown ───────────────────────────────────
    el('btn-subtitles').addEventListener('click', (e) => {
        e.stopPropagation();
        el('speed-menu').style.display = 'none';
        const menu = el('subtitles-menu');
        const isHidden = menu.style.display === 'none';
        menu.style.display = isHidden ? 'block' : 'none';
    });

    el('opt-upload-subtitle').addEventListener('click', (e) => {
        e.stopPropagation();
        el('subtitles-menu').style.display = 'none';
        el('subtitle-file-input').click();
    });

    el('subtitle-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = file.name;
        track.srclang = 'und';
        track.src = URL.createObjectURL(file);
        
        vp.appendChild(track);
        refreshSubtitlesList();
        
        const trackIdx = vp.textTracks.length - 1;
        selectSubtitleTrack(trackIdx);
        
        window.showToast('Subtitles loaded: ' + file.name, 'success');
        e.target.value = '';
    });

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

    // Video Shortcut Keys
    document.addEventListener('keydown', (e) => {
        if (el('video-modal').style.display === 'flex') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    if (vp.paused) { vp.play().catch(() => {}); btnPlay.innerHTML = PAUSE_ICON_SVG; } 
                    else { vp.pause(); btnPlay.innerHTML = PLAY_ICON_SVG; }
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    vp.currentTime = Math.max(0, vp.currentTime - 5);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    vp.currentTime = Math.min(vp.duration, vp.currentTime + 5);
                    break;
                case 'arrowup':
                    e.preventDefault();
                    vp.volume = Math.min(1, vp.volume + 0.05);
                    volSlider.value = vp.volume;
                    updateVolumeIconUI(vp.volume);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    vp.volume = Math.max(0, vp.volume - 0.05);
                    volSlider.value = vp.volume;
                    updateVolumeIconUI(vp.volume);
                    break;
                case 'f':
                    e.preventDefault();
                    if (!document.fullscreenElement) vp.parentElement.requestFullscreen();
                    else document.exitFullscreen();
                    break;
            }
        }
    });

    seekArea.addEventListener('click', (e) => {
        const rect = seekArea.getBoundingClientRect();
        vp.currentTime = ((e.clientX - rect.left) / rect.width) * vp.duration;
    });

    seekArea.addEventListener('mousemove', async (e) => {
        const rect = seekArea.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        if (percent < 0) percent = 0; if (percent > 1) percent = 1;

        seekPreview.style.display = 'block';
        seekPreview.style.left = (percent * 100) + '%';

        const tpFolder = vp.dataset.trickplay;
        let usedTrickplay = false;
        if (tpFolder) {
            if (trickFrames.length === 0) trickFrames = await window.electronAPI.getTrickplaySprites(tpFolder);
            if (trickFrames.length > 0) {
                usedTrickplay = true;
                const idx = Math.min(Math.floor(percent * trickFrames.length), trickFrames.length - 1);
                const img = new Image();
                img.onload = () => seekCtx.drawImage(img, 0, 0, seekCanvas.width, seekCanvas.height);
                img.src = window.sanitizePath(trickFrames[idx]);
            }
        }
        if (!usedTrickplay && vp.duration && scrubVideo.src) {
            const targetTime = percent * vp.duration;
            clearTimeout(seekDebounceTimer);
            seekDebounceTimer = setTimeout(() => {
                scrubVideo.currentTime = targetTime;
            }, 60);
        }
    });

    seekArea.addEventListener('mouseleave', () => { seekPreview.style.display = 'none'; });

    // Dismiss speed and subtitles menus
    document.addEventListener('click', (e) => {
        const sm = el('speed-menu');
        if (sm && !e.target.closest('.speed-dropdown-container')) sm.style.display = 'none';
        const sbm = el('subtitles-menu');
        if (sbm && !e.target.closest('.subtitle-dropdown-container')) sbm.style.display = 'none';
    });

    // Handle ESC to close the video modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el('video-modal').style.display === 'flex') {
            el('close-modal').click();
        }
    });
}

// Bind player APIs globally
window.playItem = playItem;
window.initPlayer = initPlayer;
window.stopUpscaleMode = stopUpscaleMode;
