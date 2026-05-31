// player.js — Custom HTML5 video player core initialization, PiP/countdown widgets, seek/trickplay canvas scrubbers, and history persistence.

window.currentPlayingIndex = -1;
window.currentPlayingItem = null;
window.autoplayTimer = null;
window.autoplayCountdown = 5;
window.autoplayMode = localStorage.getItem('autoplayMode') || '5s'; // off, instant, 3s, 5s
window.autoplayEnabled = (window.autoplayMode !== 'off');

const PLAY_ICON_SVG = window.icons ? window.icons.play('', 'width:16px; height:16px; display:block;') : '';
const PAUSE_ICON_SVG = window.icons ? window.icons.pause('', 'width:16px; height:16px; display:block;') : '';

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

function updateAutoplayUI() {
    const btn = el('btn-autoplay');
    const knob = el('autoplay-knob-circle');
    if (!btn || !knob) return;
    
    if (window.autoplayMode === 'off') {
        btn.classList.remove('active');
        knob.setAttribute('cx', '8');
        btn.setAttribute('title', 'Autoplay: Off');
        btn.style.color = '';
    } else if (window.autoplayMode === 'instant') {
        btn.classList.add('active');
        knob.setAttribute('cx', '12');
        btn.setAttribute('title', 'Autoplay: Instant');
        btn.style.color = 'var(--vault-accent)';
    } else if (window.autoplayMode === '3s') {
        btn.classList.add('active');
        knob.setAttribute('cx', '16');
        btn.setAttribute('title', 'Autoplay: 3s');
        btn.style.color = '';
    } else if (window.autoplayMode === '5s') {
        btn.classList.add('active');
        knob.setAttribute('cx', '20');
        btn.setAttribute('title', 'Autoplay: 5s');
        btn.style.color = '';
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
    btnVol.innerHTML = window.icons ? window.icons.volume('', 'width:16px; height:16px; display:block;', pathContent) : '';
}

async function playItem(idx) {
    if (window.autoplayTimer) {
        clearInterval(window.autoplayTimer);
        window.autoplayTimer = null;
    }
    const endedOverlay = el('video-ended-overlay');
    if (endedOverlay) endedOverlay.style.display = 'none';

    const prevBtn = el('btn-prev');
    const nextBtn = el('btn-next');
    if (prevBtn) prevBtn.style.display = 'block';
    if (nextBtn) nextBtn.style.display = 'block';
    const pipPrevBtn = el('pip-btn-prev');
    const pipNextBtn = el('pip-btn-next');
    if (pipPrevBtn) pipPrevBtn.style.display = 'flex';
    if (pipNextBtn) pipNextBtn.style.display = 'flex';

    if (idx < 0 || idx >= window.displayedItems.length) return;
    const itm = window.displayedItems[idx];
    if (itm.type !== 'video') return;
    
    window.currentPlayingIndex = idx;
    window.currentPlayingItem = itm;
    trickFrames = [];
    vp.dataset.trickplay = itm.trickplayFolder || '';
    const activePath = itm.enhancedPath || itm.path;
    const newSrc = window.sanitizePath(activePath);
    vp.src = newSrc;
    vp.muted = false;
    if (lastScrubSrc !== newSrc) {
        scrubVideo.src = newSrc;
        lastScrubSrc = newSrc;
    }
    
    const baseTitle = itm.name.replace(/\.[^.]+$/, '');
    const titleEl = el('player-title');
    if (titleEl) {
        if (itm.enhancedPath) {
            const magicIcon = window.icons ? window.icons.magic('magic-inline-icon', 'width:12px; height:12px; display:inline-block; vertical-align:middle; margin-left:6px; color:var(--vault-gold);') : '';
            titleEl.innerHTML = `${baseTitle} ${magicIcon}`;
        } else {
            titleEl.textContent = baseTitle;
        }
    }
    const tbTitle = el('titlebar-video-title');
    if (tbTitle) {
        if (itm.enhancedPath) {
            const magicIcon = window.icons ? window.icons.magic('magic-inline-icon', 'width:10px; height:10px; display:inline-block; vertical-align:middle; margin-left:4px; color:var(--vault-gold);') : '';
            tbTitle.innerHTML = `·  Playing: ${itm.name} ${magicIcon} <span style="font-size:9.5px; opacity:0.8;">[Enhanced]</span>`;
        } else {
            tbTitle.textContent = `·  Playing: ${itm.name}`;
        }
        tbTitle.style.display = 'inline-block';
    }
    
    vp.querySelectorAll('track').forEach(t => t.remove());
    try {
        const subs = await window.electronAPI.findSubtitles(itm.path, null, true);
        if (subs && subs.length > 0) {
            subs.forEach((sub, i) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.isOpenSubtitles ? sub.label : (sub.label === 'Original' ? 'original' : `Subtitles (${sub.label})`);
                track.srclang = sub.lang;
                if (sub.isOpenSubtitles) {
                    track.dataset.opensubtitles = "true";
                    track.dataset.fileId = sub.fileId;
                    track.dataset.lang = sub.lang;
                    track.dataset.videoPath = itm.path;
                    track.dataset.downloaded = "false";
                    track.src = "";
                } else {
                    track.src = window.sanitizePath(sub.path);
                }
                vp.appendChild(track);
            });
            
            window.refreshSubtitlesList();
            
            let preferredTrackIdx = -1;
            const prefLang = (window.appSettings && window.appSettings.defaultSubLang) || 'original';
            
            if (prefLang === 'original') {
                for (let i = 0; i < vp.textTracks.length; i++) {
                    const lbl = vp.textTracks[i].label || '';
                    if (lbl.toLowerCase() === 'original') {
                        preferredTrackIdx = i;
                        break;
                    }
                }
            } else if (prefLang !== 'und') {
                for (let i = 0; i < vp.textTracks.length; i++) {
                    const tl = vp.textTracks[i].language || '';
                    const lbl = vp.textTracks[i].label || '';
                    if (tl.toLowerCase().startsWith(prefLang.toLowerCase()) || lbl.toLowerCase().includes(`(${prefLang.toLowerCase()})`)) {
                        preferredTrackIdx = i;
                        break;
                    }
                }
            }
            window.selectSubtitleTrack(preferredTrackIdx);
            if (preferredTrackIdx >= 0) {
                window.showToast(`Loaded ${subs.length} subtitle track(s) — ${vp.textTracks[preferredTrackIdx].label}`, 'success');
            } else {
                window.showToast(`Loaded ${subs.length} subtitle track(s)`, 'success');
            }
        } else {
            window.refreshSubtitlesList();
            window.selectSubtitleTrack(-1);
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

    // Enable AI upscale for local vault files
    const btnUpscale = el('btn-upscale');
    if (btnUpscale) {
        btnUpscale.disabled = false;
        btnUpscale.style.opacity = '1';
        btnUpscale.style.cursor = 'pointer';
    }

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

function saveAndSetVolume(vol) {
    const safeVol = Math.max(0, Math.min(1, vol));
    if (vp) vp.volume = safeVol;
    if (volSlider) volSlider.value = safeVol;
    updateVolumeIconUI(safeVol);
    localStorage.setItem('player-volume', safeVol);
}

function initPlayer() {
    vp = el('video-player');
    
    // Close / stop video, trailers, and livestream when app is minimized to tray
    if (window.electronAPI && typeof window.electronAPI.onAppHidden === 'function') {
        window.electronAPI.onAppHidden(() => {
            console.log('[Player] App minimized to tray. Stopping active media players...');
            const closeModalBtn = el('close-modal');
            if (closeModalBtn && el('video-modal').style.display === 'flex') {
                closeModalBtn.click();
            }
            const trailerIframe = el('movie-trailer-iframe');
            if (trailerIframe) {
                trailerIframe.src = '';
            }
            if (window.electronAPI.stopLivestream) {
                window.electronAPI.stopLivestream().catch(() => {});
            }
        });
    }

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

    // PiP overlay control buttons
    const pipPrev = el('pip-btn-prev');
    const pipPlay = el('pip-btn-play');
    const pipNext = el('pip-btn-next');
    if (pipPrev) {
        pipPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            const prevBtn = el('btn-prev');
            if (prevBtn) prevBtn.click();
        });
    }
    if (pipPlay) {
        pipPlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (vp.paused) {
                vp.play().catch(() => {});
            } else {
                vp.pause();
            }
        });
    }
    if (pipNext) {
        pipNext.addEventListener('click', (e) => {
            e.stopPropagation();
            const nextBtn = el('btn-next');
            if (nextBtn) nextBtn.click();
        });
    }

    // Restore from PiP when clicking inside the video-wrapper (but not on control buttons)
    const wrapper = document.querySelector('.video-wrapper');
    if (wrapper) {
        wrapper.addEventListener('click', (e) => {
            if (el('video-modal').classList.contains('minimized')) {
                if (e.target.closest('.pip-ctrl-btn') || e.target.closest('#pip-close-btn')) {
                    return;
                }
                e.stopPropagation();
                el('video-modal').classList.remove('minimized');
            }
        });
    }

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
        
        // Remove all track elements from video element and clear subtitle list
        vp.querySelectorAll('track').forEach(t => t.remove());
        const trackList = el('subtitle-tracks-list');
        if (trackList) trackList.innerHTML = '';
        const btnSubs = el('btn-subtitles');
        if (btnSubs) {
            btnSubs.classList.remove('active');
            btnSubs.innerHTML = `${window.icons ? window.icons.subtitles('', 'width:14px; height:14px; display:block; flex-shrink:0;') : ''}<span>CC</span> ▾`;
        }
        // Re-disable AI button
        const btnUpscale = el('btn-upscale');
        if (btnUpscale) {
            btnUpscale.disabled = true;
            btnUpscale.style.opacity = '0.5';
            btnUpscale.style.cursor = 'not-allowed';
        }
        
        // Final position save to persistent Watch History
        if (vp.duration > 0) {
            if (window.activeStreamingMedia) {
                const completed = vp.currentTime >= vp.duration - 15; // 15 seconds from end counts as finished
                if (completed) {
                    window.electronAPI.markWatched({
                        mediaType: window.activeStreamingMedia.mediaType,
                        tmdbId: window.activeStreamingMedia.tmdbId,
                        title: window.activeStreamingMedia.title,
                        season: window.activeStreamingMedia.season,
                        episode: window.activeStreamingMedia.episode,
                        poster: window.activeStreamingMedia.poster,
                        year: window.activeStreamingMedia.year
                    });
                } else {
                    window.electronAPI.setWatchProgress({
                        ...window.activeStreamingMedia,
                        positionSec: vp.currentTime,
                        durationSec: vp.duration
                    });
                }
            } else if (window.currentPlayingItem) {
                const closingItm = window.currentPlayingItem;
                if (closingItm && closingItm.path) {
                    window.appSettings.playbackPositions = window.appSettings.playbackPositions || {};
                    const completed = vp.currentTime >= vp.duration - 15;
                    if (completed) {
                        delete window.appSettings.playbackPositions[closingItm.path];
                        window.electronAPI.markWatched({
                            mediaType: 'local',
                            title: closingItm.name
                        });
                    } else {
                        window.appSettings.playbackPositions[closingItm.path] = vp.currentTime;
                        window.electronAPI.setWatchProgress({
                            mediaType: 'local',
                            title: closingItm.name,
                            positionSec: vp.currentTime,
                            durationSec: vp.duration
                        });
                    }
                    window.electronAPI.saveSettings(window.appSettings);
                }
            } else if (window.currentPlayingIndex !== -1) {
                const closingItm = window.displayedItems[window.currentPlayingIndex];
                if (closingItm && closingItm.path) {
                    window.appSettings.playbackPositions = window.appSettings.playbackPositions || {};
                    const completed = vp.currentTime >= vp.duration - 15;
                    if (completed) {
                        delete window.appSettings.playbackPositions[closingItm.path];
                        window.electronAPI.markWatched({
                            mediaType: 'local',
                            title: closingItm.name
                        });
                    } else {
                        window.appSettings.playbackPositions[closingItm.path] = vp.currentTime;
                        window.electronAPI.setWatchProgress({
                            mediaType: 'local',
                            title: closingItm.name,
                            positionSec: vp.currentTime,
                            durationSec: vp.duration
                        });
                    }
                    window.electronAPI.saveSettings(window.appSettings);
                }
            }
        }
        
        // Reset active streaming media cache
        window.activeStreamingMedia = null;

        vp.pause(); vp.src = '';
        window.currentPlayingItem = null;
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

    const savedVol = localStorage.getItem('player-volume');
    if (savedVol !== null) {
        const volFloat = parseFloat(savedVol);
        vp.volume = volFloat;
        volSlider.value = volFloat;
    } else {
        vp.volume = parseFloat(volSlider.value || '1');
    }
    updateVolumeIconUI(vp.volume);

    volSlider.addEventListener('input', (e) => {
        saveAndSetVolume(parseFloat(e.target.value));
    });

    let lastHistoryUpdate = 0;
    vp.addEventListener('timeupdate', () => {
        if (!vp.duration) return;
        const pct = vp.currentTime / vp.duration;
        seekFill.style.width = (pct * 100) + '%';
        const cur = window.formatDuration(vp.currentTime);
        const tot = window.formatDuration(vp.duration);
        el('time-display').innerText = cur + ' / ' + tot;
        const elEl = el('time-elapsed'); if (elEl) elEl.innerText = cur;
        const totEl = el('time-total'); if (totEl) totEl.innerText = tot;

        // Periodic Watch History Progress Saving (Every 5 seconds)
        const now = Date.now();
        if (now - lastHistoryUpdate > 5000) {
            lastHistoryUpdate = now;
            if (window.activeStreamingMedia) {
                window.electronAPI.setWatchProgress({
                    ...window.activeStreamingMedia,
                    positionSec: vp.currentTime,
                    durationSec: vp.duration
                });
            } else if (window.currentPlayingItem) {
                const itm = window.currentPlayingItem;
                if (itm && itm.path) {
                    window.electronAPI.setWatchProgress({
                        mediaType: 'local',
                        title: itm.name,
                        positionSec: vp.currentTime,
                        durationSec: vp.duration
                    });
                }
            } else if (window.currentPlayingIndex !== -1) {
                const itm = window.displayedItems[window.currentPlayingIndex];
                if (itm && itm.path) {
                    window.electronAPI.setWatchProgress({
                        mediaType: 'local',
                        title: itm.name,
                        positionSec: vp.currentTime,
                        durationSec: vp.duration
                    });
                }
            }
        }
    });

    vp.addEventListener('error', (e) => {
        const err = vp.error;
        let errMsg = 'Unknown playback error.';
        if (err) {
            switch (err.code) {
                case 1: errMsg = 'Playback aborted by user.'; break;
                case 2: errMsg = 'Network error occurred while loading video.'; break;
                case 3: errMsg = 'Video decoding failed or format is not supported.'; break;
                case 4: errMsg = 'Video source could not be loaded (invalid or expired link).'; break;
            }
        }
        console.error('[Video Player Error]', err || e);
        window.showToast(`Playback Error: ${errMsg}`, 'error');
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
        // Mark as completed on ended
        if (window.activeStreamingMedia) {
            window.electronAPI.markWatched({
                mediaType: window.activeStreamingMedia.mediaType,
                tmdbId: window.activeStreamingMedia.tmdbId,
                title: window.activeStreamingMedia.title,
                season: window.activeStreamingMedia.season,
                episode: window.activeStreamingMedia.episode,
                poster: window.activeStreamingMedia.poster,
                year: window.activeStreamingMedia.year
            });
        } else if (window.currentPlayingItem) {
            const itm = window.currentPlayingItem;
            if (itm && itm.path) {
                window.electronAPI.markWatched({
                    mediaType: 'local',
                    title: itm.name
                });
            }
        } else if (window.currentPlayingIndex !== -1) {
            const itm = window.displayedItems[window.currentPlayingIndex];
            if (itm && itm.path) {
                window.electronAPI.markWatched({
                    mediaType: 'local',
                    title: itm.name
                });
            }
        }

        let currentIdx = parseInt(window.currentPlayingIndex, 10);
        let nextIdx = currentIdx + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        
        const overlay = el('video-ended-overlay');
        if (!overlay) return;
        
        const countdownEl = el('ended-countdown');
        if (nextIdx < window.displayedItems.length) {
            if (window.autoplayMode !== 'off') {
                if (window.autoplayMode === 'instant') {
                    playItem(nextIdx);
                    return;
                }
                
                window.autoplayCountdown = (window.autoplayMode === '3s') ? 3 : 5;
                countdownEl.innerText = `Next video in ${window.autoplayCountdown} seconds... (Click to play now)`;
                countdownEl.style.cursor = 'pointer';
                overlay.style.display = 'flex';
                
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
                overlay.style.display = 'flex';
                countdownEl.innerText = "Autoplay is off. Click here to play the next video.";
                countdownEl.style.cursor = 'pointer';
            }
        } else {
            overlay.style.display = 'flex';
            countdownEl.innerText = "End of playlist. Click Replay to start over.";
            countdownEl.style.cursor = 'default';
        }
    });

    el('ended-play-btn').addEventListener('click', () => {
        if (window.autoplayTimer) clearInterval(window.autoplayTimer);
        let currentIdx = parseInt(window.currentPlayingIndex, 10);
        let nextIdx = currentIdx + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        if (nextIdx < window.displayedItems.length) {
            el('video-ended-overlay').style.display = 'none';
            playItem(nextIdx);
        } else {
            // Replay the current video if we are at the end of the playlist
            el('video-ended-overlay').style.display = 'none';
            vp.currentTime = 0;
            vp.play().catch(() => {});
            btnPlay.innerHTML = PAUSE_ICON_SVG;
        }
    });

    el('ended-replay-btn').addEventListener('click', () => {
        if (window.autoplayTimer) clearInterval(window.autoplayTimer);
        el('video-ended-overlay').style.display = 'none';
        vp.currentTime = 0;
        vp.play().catch(() => {});
        btnPlay.innerHTML = PAUSE_ICON_SVG;
    });

    el('ended-countdown').addEventListener('click', () => {
        let currentIdx = parseInt(window.currentPlayingIndex, 10);
        let nextIdx = currentIdx + 1;
        while (nextIdx < window.displayedItems.length && window.displayedItems[nextIdx].type !== 'video') nextIdx++;
        if (nextIdx < window.displayedItems.length) {
            if (window.autoplayTimer) { clearInterval(window.autoplayTimer); window.autoplayTimer = null; }
            el('video-ended-overlay').style.display = 'none';
            playItem(nextIdx);
        } else {
            // Replay if clicked at the end of playlist
            if (window.autoplayTimer) { clearInterval(window.autoplayTimer); window.autoplayTimer = null; }
            el('video-ended-overlay').style.display = 'none';
            vp.currentTime = 0;
            vp.play().catch(() => {});
            btnPlay.innerHTML = PAUSE_ICON_SVG;
        }
    });

    vp.addEventListener('play', () => {
        btnPlay.innerHTML = PAUSE_ICON_SVG;
        const pipPlayBtn = el('pip-btn-play');
        if (pipPlayBtn) pipPlayBtn.textContent = '⏸';
    });
    vp.addEventListener('pause', () => {
        btnPlay.innerHTML = PLAY_ICON_SVG;
        const pipPlayBtn = el('pip-btn-play');
        if (pipPlayBtn) pipPlayBtn.textContent = '▶';
    });

    btnPlay.addEventListener('click', () => {
        if (vp.paused) {
            vp.play().catch(() => {});
        } else {
            vp.pause();
        }
    });
    
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
            if (window.autoplayMode === '5s') {
                window.autoplayMode = 'off';
            } else if (window.autoplayMode === 'off') {
                window.autoplayMode = 'instant';
            } else if (window.autoplayMode === 'instant') {
                window.autoplayMode = '3s';
            } else if (window.autoplayMode === '3s') {
                window.autoplayMode = '5s';
            }
            window.autoplayEnabled = (window.autoplayMode !== 'off');
            localStorage.setItem('autoplayMode', window.autoplayMode);
            updateAutoplayUI();
            
            let label = 'Disabled';
            if (window.autoplayMode === 'instant') label = 'Instant';
            else if (window.autoplayMode === '3s') label = '3 Seconds';
            else if (window.autoplayMode === '5s') label = '5 Seconds';
            
            window.showToast(`Autoplay: ${label}`, 'success');
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
                o.style.fontWeight = 'normal';
            });
            opt.classList.add('active');
            opt.style.color = 'var(--vault-accent)';
            opt.style.fontWeight = '600';
            
            el('speed-menu').style.display = 'none';
            window.showToast(`Playback Speed: ${val}×`, 'success');
        });
    });

    // Subtitle setup and upscale setup
    if (typeof window.initSubtitleListeners === 'function') {
        window.initSubtitleListeners();
    }
    if (typeof window.initUpscaleListeners === 'function') {
        window.initUpscaleListeners();
    }

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
                    saveAndSetVolume(vp.volume + 0.05);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    saveAndSetVolume(vp.volume - 0.05);
                    break;
                case 'f':
                    e.preventDefault();
                    if (!document.fullscreenElement) vp.parentElement.requestFullscreen();
                    else document.exitFullscreen();
                    break;
                case 'escape':
                    if (e.ctrlKey || e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        el('video-modal').classList.toggle('minimized');
                    }
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
        
        const tooltip = el('seek-time-tooltip');
        if (tooltip) {
            tooltip.style.display = 'block';
            tooltip.style.left = (percent * 100) + '%';
            if (vp.duration) {
                tooltip.innerText = window.formatDuration(percent * vp.duration);
            }
        }

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

    seekArea.addEventListener('mouseleave', () => { 
        seekPreview.style.display = 'none'; 
        const tooltip = el('seek-time-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });

    // Dismiss speed and subtitles menus
    document.addEventListener('click', (e) => {
        const sm = el('speed-menu');
        if (sm && !e.target.closest('.speed-dropdown-container')) sm.style.display = 'none';
        const sbm = el('subtitles-menu');
        if (sbm && !e.target.closest('.subtitle-dropdown-container')) sbm.style.display = 'none';
    });

    // Handle ESC to close the video modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && el('video-modal').style.display === 'flex') {
            el('close-modal').click();
        }
    });

    // Auto-hide controls when cursor hovers the app titlebar (above the player)
    const titlebarEl = document.querySelector('.titlebar');
    if (titlebarEl) {
        titlebarEl.addEventListener('mouseenter', () => document.body.classList.add('titlebar-hovered'));
        titlebarEl.addEventListener('mouseleave', () => document.body.classList.remove('titlebar-hovered'));
    }

    // Enable double-click to rename the active local video while playing
    const titleEl = el('player-title');
    if (titleEl) {
        titleEl.style.cursor = 'pointer';
        titleEl.addEventListener('dblclick', () => {
            let itm = null;
            if (window.currentPlayingItem) {
                itm = window.currentPlayingItem;
            } else if (window.currentPlayingIndex !== -1) {
                itm = window.displayedItems[window.currentPlayingIndex];
            }
            if (!itm || !itm.path) return;
            
            // Prevent multiple input boxes
            if (titleEl.querySelector('input')) return;
            
            const oldName = itm.name;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldName;
            input.style.background = 'var(--vault-bg)';
            input.style.color = 'var(--vault-text)';
            input.style.border = '1px solid var(--vault-accent)';
            input.style.borderRadius = '4px';
            input.style.padding = '2px 8px';
            input.style.fontSize = '14px';
            input.style.fontFamily = 'var(--font-mono)';
            input.style.outline = 'none';
            input.style.width = '350px';
            input.style.textAlign = 'center';
            
            titleEl.textContent = '';
            titleEl.appendChild(input);
            input.focus();
            input.select();
            
            const saveRename = async () => {
                const newName = input.value.trim();
                if (!newName || newName === oldName) {
                    const baseTitle = oldName.replace(/\.[^.]+$/, '');
                    if (itm.enhancedPath) {
                        const magicIcon = window.icons ? window.icons.magic('magic-inline-icon', 'width:12px; height:12px; display:inline-block; vertical-align:middle; margin-left:6px; color:var(--vault-gold);') : '';
                        titleEl.innerHTML = `${baseTitle} ${magicIcon}`;
                    } else {
                        titleEl.textContent = baseTitle;
                    }
                    return;
                }
                
                const res = await window.electronAPI.renameFile(itm.path, newName);
                if (res.success) {
                    const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
                    window.showToast((t.renamedTo || 'Renamed to ') + `"${newName}"`, 'success');
                    
                    const oldPath = itm.path;
                    const newPath = res.newPath || (itm.path.substring(0, itm.path.lastIndexOf('\\') + 1) + newName);
                    
                    itm.name = newName;
                    itm.path = newPath;
                    
                    const baseTitle = newName.replace(/\.[^.]+$/, '');
                    if (itm.enhancedPath) {
                        const magicIcon = window.icons ? window.icons.magic('magic-inline-icon', 'width:12px; height:12px; display:inline-block; vertical-align:middle; margin-left:6px; color:var(--vault-gold);') : '';
                        titleEl.innerHTML = `${baseTitle} ${magicIcon}`;
                    } else {
                        titleEl.textContent = baseTitle;
                    }
                    
                    const tbTitle = el('titlebar-video-title');
                    if (tbTitle) {
                        if (itm.enhancedPath) {
                            const magicIcon = window.icons ? window.icons.magic('magic-inline-icon', 'width:10px; height:10px; display:inline-block; vertical-align:middle; margin-left:4px; color:var(--vault-gold);') : '';
                            tbTitle.innerHTML = `·  Playing: ${newName} ${magicIcon} <span style="font-size:9.5px; opacity:0.8;">[Enhanced]</span>`;
                        } else {
                            tbTitle.textContent = `·  Playing: ${newName}`;
                        }
                    }
                    
                    // Update corresponding card element in layout if open
                    const card = document.querySelector(`.file-card[data-index="${window.currentPlayingIndex}"]`);
                    if (card) {
                        card.dataset.path = newPath;
                        const fn = card.querySelector('.filename');
                        if (fn) fn.innerText = newName;
                        const rInp = card.querySelector('.rename-input');
                        if (rInp) rInp.value = newName;
                    }
                    
                    // Update items list silently to preserve file-grid integrity
                    window.loadDirectory(window.currentNavPath, window.currentRealPath, true);
                } else {
                    window.showToast((window.translations[window.currentLang === 'fr' ? 'fr' : 'en'].renameFailed || 'Rename failed: ') + res.error, 'error');
                    const baseTitle = oldName.replace(/\.[^.]+$/, '');
                    if (itm.enhancedPath) {
                        const magicIcon = window.icons ? window.icons.magic('magic-inline-icon', 'width:12px; height:12px; display:inline-block; vertical-align:middle; margin-left:6px; color:var(--vault-gold);') : '';
                        titleEl.innerHTML = `${baseTitle} ${magicIcon}`;
                    } else {
                        titleEl.textContent = baseTitle;
                    }
                }
            };
            
            input.addEventListener('blur', saveRename);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    input.value = oldName;
                    input.blur();
                }
            });
        });
    }
}

async function playStream(url, title) {
    if (window.autoplayTimer) {
        clearInterval(window.autoplayTimer);
        window.autoplayTimer = null;
    }
    const endedOverlay = el('video-ended-overlay');
    if (endedOverlay) endedOverlay.style.display = 'none';

    const prevBtn = el('btn-prev');
    const nextBtn = el('btn-next');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    const pipPrevBtn = el('pip-btn-prev');
    const pipNextBtn = el('pip-btn-next');
    if (pipPrevBtn) pipPrevBtn.style.display = 'none';
    if (pipNextBtn) pipNextBtn.style.display = 'none';

    window.currentPlayingIndex = -1;
    trickFrames = [];
    vp.dataset.trickplay = '';
    vp.src = url;
    vp.muted = false;
    if (lastScrubSrc !== url) {
        scrubVideo.src = url;
        lastScrubSrc = url;
    }
    
    const titleEl = el('player-title');
    if (titleEl) titleEl.textContent = `⚡ RD Stream: ${title}`;
    const tbTitle = el('titlebar-video-title');
    if (tbTitle) {
        tbTitle.textContent = `·  RD Streaming: ${title}`;
        tbTitle.style.display = 'inline-block';
    }

    if (window.activeStreamingMedia) {
        window.activeStreamingMedia.streamUrl = url;
        window.activeStreamingMedia.streamTitle = title;
    }

    // Fetch watch progress early
    let prog = null;
    if (window.activeStreamingMedia) {
        try {
            prog = await window.electronAPI.getWatchProgress({
                mediaType: window.activeStreamingMedia.mediaType,
                tmdbId: window.activeStreamingMedia.tmdbId,
                title: window.activeStreamingMedia.title,
                season: window.activeStreamingMedia.season,
                episode: window.activeStreamingMedia.episode
            });
        } catch (e) {
            console.error('[Player] Failed to fetch watch progress:', e);
        }
    }
    
    vp.querySelectorAll('track').forEach(t => t.remove());
    try {
        const subs = await window.electronAPI.findSubtitles(url, title);
        if (subs && subs.length > 0) {
            subs.forEach((sub) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.isOpenSubtitles ? sub.label : (sub.label === 'Original' ? 'original' : `Subtitles (${sub.label})`);
                track.srclang = sub.lang;
                if (sub.isOpenSubtitles) {
                    track.dataset.opensubtitles = "true";
                    track.dataset.fileId = sub.fileId;
                    track.dataset.lang = sub.lang;
                    track.dataset.videoPath = url;
                    track.dataset.downloaded = "false";
                    track.src = "";
                } else {
                    track.src = window.sanitizePath(sub.path);
                }
                vp.appendChild(track);
            });
            
            window.refreshSubtitlesList();
            
            let preferredTrackIdx = -1;

            if (prog && prog.selectedSubtitleTrackIdx !== undefined) {
                let trackIdx = -1;
                if (prog.selectedSubtitleLabel) {
                    for (let i = 0; i < vp.textTracks.length; i++) {
                        if (vp.textTracks[i].label === prog.selectedSubtitleLabel) {
                            trackIdx = i;
                            break;
                        }
                    }
                }
                if (trackIdx === -1 && prog.selectedSubtitleLang) {
                    for (let i = 0; i < vp.textTracks.length; i++) {
                        if (vp.textTracks[i].language === prog.selectedSubtitleLang) {
                            trackIdx = i;
                            break;
                        }
                    }
                }
                if (trackIdx === -1) {
                    trackIdx = prog.selectedSubtitleTrackIdx;
                }
                if (trackIdx >= 0 && trackIdx < vp.textTracks.length) {
                    preferredTrackIdx = trackIdx;
                }
            } else {
                const prefLang = (window.appSettings && window.appSettings.defaultSubLang) || 'original';
                if (prefLang === 'original') {
                    for (let i = 0; i < vp.textTracks.length; i++) {
                        const lbl = vp.textTracks[i].label || '';
                        if (lbl.toLowerCase() === 'original') {
                            preferredTrackIdx = i;
                            break;
                        }
                    }
                } else if (prefLang !== 'und') {
                    for (let i = 0; i < vp.textTracks.length; i++) {
                        const tl = vp.textTracks[i].language || '';
                        const lbl = vp.textTracks[i].label || '';
                        if (tl.toLowerCase().startsWith(prefLang.toLowerCase()) || lbl.toLowerCase().includes(`(${prefLang.toLowerCase()})`)) {
                            preferredTrackIdx = i;
                            break;
                        }
                    }
                }
            }

            window.selectSubtitleTrack(preferredTrackIdx);
            if (preferredTrackIdx >= 0) {
                window.showToast(`Loaded ${subs.length} subtitle track(s) — ${vp.textTracks[preferredTrackIdx].label}`, 'success');
            } else {
                window.showToast(`Loaded ${subs.length} subtitle track(s)`, 'success');
            }
        } else {
            window.refreshSubtitlesList();
            window.selectSubtitleTrack(-1);
        }
    } catch (err) {
        console.error("Auto subtitle loading error:", err);
    }
    
    // Restore stream playback progress
    if (prog && prog.positionSec > 0 && prog.durationSec > 0 && !prog.completed) {
        const restoreOnce = () => {
            if (prog.positionSec < vp.duration - 15) {
                vp.currentTime = prog.positionSec;
                window.showToast(`Resumed from ${window.formatDuration(prog.positionSec)}`, 'success');
            }
            vp.removeEventListener('loadedmetadata', restoreOnce);
        };
        vp.addEventListener('loadedmetadata', restoreOnce);
    }

    el('video-modal').classList.remove('minimized');
    btnPlay.innerHTML = PAUSE_ICON_SVG;
    el('video-modal').style.display = 'flex';
    el('video-modal').focus();

    vp.play().catch(e => console.log("Stream playback start prevented or failed:", e));
}

// Bind globals
window.playItem = playItem;
window.initPlayer = initPlayer;
window.playStream = playStream;
